const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://utdlehbifdfiliozxbif.supabase.co'
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZGxlaGJpZmRmaWxpb3p4YmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODI0ODgsImV4cCI6MjA5NDQ1ODQ4OH0.VX99wvuZ258SDOcEG-ijFYo64RFAlWoKpsEU7C4R92U'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const APP_URL_POR_DEFECTO = 'https://agrobloque.vercel.app'
// Mismo rigor que Supabase Auth al enviar correos: sin punto al inicio ni al final de la parte local,
// sin puntos seguidos y con un dominio valido. Un correo como "nombre.@gmail.com" crea la cuenta pero
// despues el correo de "crear contrasena" no puede enviarse.
const emailValido = email => {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) return false
  const [local, dominio] = email.split('@')
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) && /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(dominio)
}

// El enlace del correo solo puede apuntar a la propia app: evita que alguien use esta API
// para enviar correos con un enlace a otro sitio.
const origenPermitido = origin => {
  const valor = String(origin || '')
  if (/^https:\/\/agrobloque[a-z0-9-]*\.vercel\.app$/i.test(valor)) return valor
  if (/^http:\/\/localhost:\d{2,5}$/.test(valor)) return valor
  return APP_URL_POR_DEFECTO
}

const yaRegistrado = error => /already|registered|exists|existe|registrad/i.test(error?.message || '')

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

    const body = req.body || {}
    const nombre = String(body.nombre || '').trim()
    const ownerEmail = String(body.owner_email || '').trim().toLowerCase()
    if (nombre.length < 2) throw new Error('Ingresa el nombre de la empresa.')
    if (!emailValido(ownerEmail)) throw new Error('Ingresa un email valido para el dueno (sin punto antes de la @).')

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user?.email) throw new Error('Sesion invalida.')

    // La base decide si quien llama es administrador de plataforma: la funcion corre con la sesion
    // de quien llama, rechaza a cualquier otro y no deja usar un correo que ya tenga empresa.
    const { data: provision, error: provisionError } = await userClient.rpc('provision_organization', {
      p_nombre: nombre,
      p_owner_email: ownerEmail,
    })
    if (provisionError) throw provisionError
    if (!provision?.ok || !provision?.organizacion_id) throw new Error(provision?.error || 'No se pudo crear la empresa.')
    const organizacionId = provision.organizacion_id

    const serviceClient = createClient(supabaseUrl, serviceKey)

    // Se crea la cuenta del dueno con una contrasena aleatoria que nadie conoce: entra por el
    // correo de "crear contrasena". Si la cuenta ya existia no se toca su contrasena.
    let cuentaExistente = false
    const { error: createError } = await serviceClient.auth.admin.createUser({
      email: ownerEmail,
      password: crypto.randomBytes(24).toString('base64url'),
      email_confirm: true,
      user_metadata: { nombre, rol: 'admin', organizacion_id: organizacionId },
    })
    if (createError) {
      if (!yaRegistrado(createError)) {
        // No dejar una empresa sin dueno: se deshace lo que acaba de crear esta llamada.
        await serviceClient.from('app_user_roles').delete().eq('organizacion_id', organizacionId)
        await serviceClient.from('organizaciones').delete().eq('id', organizacionId)
        throw createError
      }
      cuentaExistente = true
    }

    const redirectTo = `${origenPermitido(req.headers.origin)}/?auth_action=set-password`
    const mailClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { error: mailError } = await mailClient.auth.resetPasswordForEmail(ownerEmail, { redirectTo })

    res.status(200).json({
      ok: true,
      organizacion_id: organizacionId,
      cuenta_existente: cuentaExistente,
      correo_enviado: !mailError,
      correo_error: mailError ? (mailError.code || mailError.message || 'desconocido') : null,
      message: mailError
        ? 'Empresa creada, pero no se pudo enviar el correo. El dueno puede usar "Primera vez o olvidaste tu contrasena" en el login.'
        : 'Empresa creada. Enviamos la invitacion al dueno.',
    })
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo crear la empresa.' })
  }
}
