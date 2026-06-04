const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://utdlehbifdfiliozxbif.supabase.co'
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY
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
      .select('rol, activo')
      .eq('email', adminEmail)
      .maybeSingle()

    if (adminRole && (adminRole.activo === false || adminRole.rol !== 'admin')) {
      throw new Error('Solo un administrador puede invitar usuarios reales.')
    }

    const body = req.body || {}
    const email = String(body.email || '').trim().toLowerCase()
    if (!email || !email.includes('@')) throw new Error('Email invalido.')

    const rolePayload = {
      email,
      nombre: body.nombre || null,
      rol: body.rol || 'operador',
      permisos: body.permisos || null,
      acciones: body.acciones || null,
      activo: body.activo !== false,
      notas: body.notas || null,
    }

    const { data: existingRole } = await serviceClient
      .from('app_user_roles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingRole?.id) {
      await serviceClient.from('app_user_roles').update(rolePayload).eq('id', existingRole.id)
    } else {
      await serviceClient.from('app_user_roles').insert(rolePayload)
    }

    const redirectTo = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/`
    const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { nombre: body.nombre || '', rol: body.rol || 'operador' },
    })

    if (inviteError) throw inviteError

    res.status(200).json({ ok: true })
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo invitar usuario.' })
  }
}
