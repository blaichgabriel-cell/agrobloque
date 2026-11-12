const { createClient } = require('@supabase/supabase-js')
const nodemailer = require('nodemailer')

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://utdlehbifdfiliozxbif.supabase.co'
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZGxlaGJpZmRmaWxpb3p4YmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODI0ODgsImV4cCI6MjA5NDQ1ODQ4OH0.VX99wvuZ258SDOcEG-ijFYo64RFAlWoKpsEU7C4R92U'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' })
  if (!anonKey || !serviceKey) return res.status(500).json({ error: 'Falta configurar Supabase en Vercel.' })

  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) throw new Error('Sesión no enviada.')

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user?.id) throw new Error('Sesión inválida.')
    const { data: esPlataforma, error: plataformaError } = await userClient.rpc('is_platform_admin')
    if (plataformaError || esPlataforma !== true) throw new Error('Sin permiso.')

    const accesoId = String(req.body?.acceso_id || '')
    if (!/^[0-9a-f-]{36}$/i.test(accesoId)) throw new Error('Solicitud inválida.')
    const serviceClient = createClient(supabaseUrl, serviceKey)
    const { data: acceso, error: accesoError } = await serviceClient
      .from('soporte_accesos')
      .select('id, motivo, estado, solicitado_por, organizacion_id, correo_notificado_en, organizaciones(nombre)')
      .eq('id', accesoId)
      .maybeSingle()
    if (accesoError) throw accesoError
    if (!acceso || acceso.solicitado_por !== userData.user.id || acceso.estado !== 'pendiente') throw new Error('La solicitud no está disponible para notificar.')

    const { data: admins, error: adminsError } = await serviceClient
      .from('app_user_roles')
      .select('email')
      .eq('organizacion_id', acceso.organizacion_id)
      .eq('rol', 'admin')
      .eq('activo', true)
    if (adminsError) throw adminsError
    const destinatarios = [...new Set((admins || []).map(fila => String(fila.email || '').trim().toLowerCase()).filter(Boolean))]
    if (!destinatarios.length) return res.status(200).json({ ok: true, correo_enviado: false, motivo: 'La empresa no tiene un administrador con correo.' })

    const host = process.env.SMTP_HOST
    const port = Number(process.env.SMTP_PORT || 587)
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const from = process.env.SMTP_FROM || user
    if (!host || !user || !pass || !from) return res.status(200).json({ ok: true, correo_enviado: false, motivo: 'SMTP no está configurado en Vercel.' })

    const limiteMs = 15 * 60 * 1000
    const ultimoEnvio = acceso.correo_notificado_en ? new Date(acceso.correo_notificado_en).getTime() : 0
    if (ultimoEnvio && Date.now() - ultimoEnvio < limiteMs) {
      return res.status(429).json({ error: 'El correo de esta solicitud ya fue enviado recientemente. Espera 15 minutos.' })
    }
    const marcaEnvio = new Date().toISOString()
    let reserva = serviceClient.from('soporte_accesos').update({ correo_notificado_en: marcaEnvio }).eq('id', acceso.id).eq('estado', 'pendiente')
    reserva = acceso.correo_notificado_en ? reserva.eq('correo_notificado_en', acceso.correo_notificado_en) : reserva.is('correo_notificado_en', null)
    const { data: reservado, error: reservaError } = await reserva.select('id').maybeSingle()
    if (reservaError) throw reservaError
    if (!reservado) return res.status(429).json({ error: 'El correo de esta solicitud ya fue enviado por otra sesión.' })

    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
    const empresa = acceso.organizaciones?.nombre || 'tu empresa'
    try {
      await transporter.sendMail({
        from,
        to: destinatarios.join(','),
        subject: `Solicitud de acceso de soporte · ${empresa}`,
        text: `Soporte de AgroBloque solicitó acceso temporal de solo lectura a ${empresa}.\n\nMotivo: ${acceso.motivo}\n\nIngresa a AgroBloque para aprobar o rechazar la solicitud.`,
        html: `<p>Soporte de AgroBloque solicitó acceso temporal de <strong>solo lectura</strong> a <strong>${escapeHtml(empresa)}</strong>.</p><p><strong>Motivo:</strong> ${escapeHtml(acceso.motivo)}</p><p>Ingresa a AgroBloque para aprobar o rechazar la solicitud.</p>`,
      })
    } catch (mailError) {
      await serviceClient.from('soporte_accesos').update({ correo_notificado_en: acceso.correo_notificado_en || null }).eq('id', acceso.id).eq('correo_notificado_en', marcaEnvio)
      throw mailError
    }
    return res.status(200).json({ ok: true, correo_enviado: true })
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo enviar la notificación.' })
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}
