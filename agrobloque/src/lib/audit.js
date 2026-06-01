import { supabase } from './supabase'

export const registrarAuditoria = async ({ accion, modulo, tabla = '', registroId = '', detalle = '' }) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_log').insert({
      usuario_email: user?.email || null,
      accion,
      modulo,
      tabla: tabla || null,
      registro_id: registroId ? String(registroId) : null,
      detalle: detalle || null,
    })
  } catch (_e) {
    // La auditoria no debe bloquear el trabajo normal si falta ejecutar el SQL.
  }
}
