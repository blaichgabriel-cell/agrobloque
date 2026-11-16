const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

// Reenvia el correo para crear la contrasena al administrador de una empresa.
// Si su cuenta de acceso ya no existe (por ejemplo, se borro desde Supabase), la vuelve a crear
// con una contrasena aleatoria que nadie conoce y lo reconecta con su empresa.
// Solo la pueden usar los administradores generales y solo para correos que ya son
// administradores de alguna empresa: no sirve para crear cuentas a cualquiera.

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://utdlehbifdfiliozxbif.supabase.co'
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZGxlaGJpZmRmaWxpb3p4YmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODI0ODgsImV4cCI6MjA5NDQ1ODQ4OH0.VX99wvuZ258SDOcEG-ijFYo64RFAlWoKpsEU7C4R92U'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const APP_URL_POR_DEFECTO = 'https://agrobloque.vercel.app'
const emailValido = email => {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) return false
  const [local, dominio] = email.split('@')
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) && /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(dominio)
}
// El enlace del correo solo puede apuntar a la propia app.
const origenPermitido = origin => {
  const valor = String(origin || '')
  if (/^https:\/\/agrobloque[a-z0-9-]*\.vercel\.app$/i.test(valor)) return valor
  if (/^http:\/\/localhost:\d{2,5}$/.test(valor)) return valor
  return APP_URL_POR_DEFECTO
}
const yaRegistrado = error => /already|registered|exists|existe|registrad/i.test(error?.message || '')
// En ilike, "_" y "%" son comodines: se escapan para comparar el correo exacto sin importar mayusculas.
const exacto = texto => texto.replace(/[\\%_]/g, c => `\\${c}`)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido.' })
  if (!serviceKey || !anonKey) return res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel.' })

  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) throw new Error('Sesion no enviada.')
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!emailValido(email)) throw new Error('El correo no es valido.')

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user?.id) throw new Error('Sesion invalida.')
    const { data: esPlataforma, error: plataformaError } = await userClient.rpc('is_platform_admin')
    if (plataformaError || esPlataforma !== true) return res.status(403).json({ error: 'Solo un administrador general puede reenviar invitaciones.' })

    const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: roles, error: rolesError } = await serviceClient
      .from('app_user_roles')
      .select('id, organizacion_id, user_id')
      .ilike('email', exacto(email))
      .eq('rol', 'admin')
      .eq('activo', true)
    if (rolesError) throw rolesError
    if (!roles?.length) return res.status(404).json({ error: 'Ese correo no es administrador de ninguna empresa.' })

    // Si la cuenta no existe se vuelve a crear; si existe, no se toca su contrasena.
    let cuentaCreada = false
    const { data: creada, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password: crypto.randomBytes(24).toString('base64url'),
      email_confirm: true,
      user_metadata: { rol: 'admin', organizacion_id: roles[0].organizacion_id },
    })
    if (createError && !yaRegistrado(createError)) throw createError
    if (!createError && creada?.user?.id) {
      cuentaCreada = true
      // Reconecta la empresa con la cuenta nueva (la anterior pudo quedar apuntando a una cuenta borrada).
      const { error: vincularError } = await serviceClient
        .from('app_user_roles')
        .update({ user_id: creada.user.id })
        .ilike('email', exacto(email))
      if (vincularError) throw vincularError
    }

    const redirectTo = `${origenPermitido(req.headers.origin)}/?auth_action=set-password`
    const mailClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const { error: mailError } = await mailClient.auth.resetPasswordForEmail(email, { redirectTo })

    return res.status(200).json({
      ok: true,
      cuenta_creada: cuentaCreada,
      correo_enviado: !mailError,
      correo_error: mailError ? (mailError.code || mailError.message || 'desconocido') : null,
    })
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo reenviar la invitacion.' })
  }
}
