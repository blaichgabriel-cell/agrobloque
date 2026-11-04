const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://utdlehbifdfiliozxbif.supabase.co'
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZGxlaGJpZmRmaWxpb3p4YmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODI0ODgsImV4cCI6MjA5NDQ1ODQ4OH0.VX99wvuZ258SDOcEG-ijFYo64RFAlWoKpsEU7C4R92U'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo no permitido.' })
    return
  }

  if (!serviceKey || !anonKey) {
    res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel.' })
    return
  }

  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) throw new Error('Sesion no enviada.')

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const serviceClient = createClient(supabaseUrl, serviceKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user?.email) throw new Error('Sesion invalida.')

    const adminEmail = userData.user.email.toLowerCase()
    const { data: adminRole } = await serviceClient
      .from('app_user_roles')
      .select('rol, activo, organizacion_id')
      .eq('email', adminEmail)
      .maybeSingle()

    if (!adminRole || adminRole.activo === false || adminRole.rol !== 'admin') {
      throw new Error('Solo un administrador puede invitar usuarios reales.')
    }

    const body = req.body || {}
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!email || !email.includes('@')) throw new Error('Email invalido.')
    if (password.length < 8) throw new Error('La contrasena debe tener al menos 8 caracteres.')

    const rolePayload = {
      email,
      nombre: body.nombre || null,
      rol: body.rol || 'operador',
      permisos: body.permisos || null,
      acciones: body.acciones || null,
      activo: body.activo !== false,
      notas: body.notas || null,
      organizacion_id: adminRole.organizacion_id,
    }

    let authUser = null
    for (let page = 1; page <= 10 && !authUser; page += 1) {
      const { data: pageData, error: listError } = await serviceClient.auth.admin.listUsers({ page, perPage: 200 })
      if (listError) throw listError
      authUser = (pageData?.users || []).find(user => String(user.email || '').toLowerCase() === email) || null
      if ((pageData?.users || []).length < 200) break
    }

    if (authUser?.id) {
      const { error: updateAuthError } = await serviceClient.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        user_metadata: { ...authUser.user_metadata, nombre: body.nombre || '', rol: body.rol || 'operador' },
      })
      if (updateAuthError) throw updateAuthError
    } else {
      const { error: createAuthError } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre: body.nombre || '', rol: body.rol || 'operador' },
      })
      if (createAuthError) throw createAuthError
    }

    const { data: existingRole } = await serviceClient
      .from('app_user_roles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    const roleMutation = existingRole?.id
      ? serviceClient.from('app_user_roles').update(rolePayload).eq('id', existingRole.id)
      : serviceClient.from('app_user_roles').insert(rolePayload)
    const { error: roleError } = await roleMutation
    if (roleError) throw roleError

    res.status(200).json({ ok: true, message: 'Usuario habilitado. Ya puede ingresar con el correo y la contrasena definida.' })
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo invitar usuario.' })
  }
}
