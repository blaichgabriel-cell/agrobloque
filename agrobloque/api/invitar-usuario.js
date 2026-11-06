const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://utdlehbifdfiliozxbif.supabase.co'
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZGxlaGJpZmRmaWxpb3p4YmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODI0ODgsImV4cCI6MjA5NDQ1ODQ4OH0.VX99wvuZ258SDOcEG-ijFYo64RFAlWoKpsEU7C4R92U'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const ROLES_VALIDOS = ['admin', 'operador', 'lectura']
const ERROR_OTRA_EMPRESA = 'Ese correo ya pertenece a otra empresa y no se puede modificar desde aquí.'
const ERROR_CUENTA_SIN_EMPRESA = 'Ya existe una cuenta con ese correo que no está asociada a ninguna empresa. No se puede modificar desde aquí: pídele a soporte que la vincule.'

// `_` y `%` son comodines de ILIKE: se escapan para comparar el correo tal cual.
const escapeLike = value => value.replace(/[\\%_]/g, '\\$&')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' })
    return
  }

  if (!serviceKey || !anonKey) {
    res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel.' })
    return
  }

  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) throw new Error('Sesión no enviada.')

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const serviceClient = createClient(supabaseUrl, serviceKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user?.email) throw new Error('Sesión inválida.')

    const adminEmail = userData.user.email.toLowerCase()
    const { data: adminRole } = await serviceClient
      .from('app_user_roles')
      .select('rol, activo, organizacion_id')
      .eq('email', adminEmail)
      .maybeSingle()

    if (!adminRole || adminRole.activo === false || adminRole.rol !== 'admin') {
      throw new Error('Solo un administrador puede invitar usuarios reales.')
    }
    if (!adminRole.organizacion_id) throw new Error('Tu usuario no tiene una empresa asignada.')

    const body = req.body || {}
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const rol = body.rol || 'operador'
    if (!email || !email.includes('@')) throw new Error('Email inválido.')
    if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
    if (!ROLES_VALIDOS.includes(rol)) throw new Error('Rol inválido.')

    const rolePayload = {
      email,
      nombre: body.nombre || null,
      rol,
      permisos: body.permisos || null,
      acciones: body.acciones || null,
      activo: body.activo !== false,
      notas: body.notas || null,
      organizacion_id: adminRole.organizacion_id,
    }

    // Un administrador solo puede tocar usuarios de su propia empresa. Se mira el rol por correo
    // (sin distinguir mayusculas) y, si ya existe la cuenta, tambien por su user_id, antes de
    // cambiar la contrasena o el rol de nadie.
    const { data: rolesPorCorreo, error: rolesError } = await serviceClient
      .from('app_user_roles')
      .select('id, user_id, organizacion_id')
      .ilike('email', escapeLike(email))
    if (rolesError) throw rolesError

    // Limite conocido: solo se revisan los primeros 2000 usuarios de auth (10 paginas de 200).
    // Si la cuenta esta mas alla, authUser queda en null y createUser falla porque el correo ya
    // existe, asi que tampoco se modifica nada. Subir el limite o buscar por correo cuando
    // haya mas usuarios.
    let authUser = null
    for (let page = 1; page <= 10 && !authUser; page += 1) {
      const { data: pageData, error: listError } = await serviceClient.auth.admin.listUsers({ page, perPage: 200 })
      if (listError) throw listError
      authUser = (pageData?.users || []).find(user => String(user.email || '').toLowerCase() === email) || null
      if ((pageData?.users || []).length < 200) break
    }

    let rolesDeLaCuenta = []
    if (authUser?.id) {
      const { data: rolesPorUsuario, error: rolesUserError } = await serviceClient
        .from('app_user_roles')
        .select('id, user_id, organizacion_id')
        .eq('user_id', authUser.id)
      if (rolesUserError) throw rolesUserError
      rolesDeLaCuenta = rolesPorUsuario || []
    }

    const filasRelacionadas = [...(rolesPorCorreo || []), ...rolesDeLaCuenta]
    if (filasRelacionadas.some(fila => fila.organizacion_id && fila.organizacion_id !== adminRole.organizacion_id)) {
      throw new Error(ERROR_OTRA_EMPRESA)
    }

    // Una cuenta de acceso sin ninguna fila de rol (ni por correo ni por user_id) no se sabe de que
    // empresa es: podria ser de otra a la que se le borro el rol. No se le cambia la contrasena.
    if (authUser?.id && filasRelacionadas.length === 0) {
      throw new Error(ERROR_CUENTA_SIN_EMPRESA)
    }

    let usuarioCreadoId = null
    if (authUser?.id) {
      const { error: updateAuthError } = await serviceClient.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        user_metadata: { ...authUser.user_metadata, nombre: body.nombre || '', rol },
      })
      if (updateAuthError) throw updateAuthError
    } else {
      const { data: creado, error: createAuthError } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre: body.nombre || '', rol },
      })
      if (createAuthError) throw createAuthError
      usuarioCreadoId = creado?.user?.id || null
    }

    const existingRole = (rolesPorCorreo || [])[0] || rolesDeLaCuenta[0] || null

    const roleMutation = existingRole?.id
      ? serviceClient.from('app_user_roles').update(rolePayload).eq('id', existingRole.id)
      : serviceClient.from('app_user_roles').insert(rolePayload)
    const { error: roleError } = await roleMutation
    if (roleError) {
      // Si la cuenta se acaba de crear en esta llamada y el rol fallo, se deshace para no dejar
      // una cuenta sin empresa que la regla anterior ya no deja volver a invitar.
      if (usuarioCreadoId) await serviceClient.auth.admin.deleteUser(usuarioCreadoId).catch(() => {})
      throw roleError
    }

    res.status(200).json({ ok: true, message: 'Usuario habilitado. Ya puede ingresar con el correo y la contraseña definida.' })
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo invitar usuario.' })
  }
}
