import { supabase } from './supabase'

// Verificación en dos pasos (TOTP: app autenticadora). Todo pasa por Supabase Auth; aquí solo se ordenan las llamadas.
// aal1 = entró con contraseña; aal2 = además verificó el código de la app.

export const textoErrorDosFactores = (error) => {
  const code = String(error?.code || '')
  const msg = String(error?.message || '').toLowerCase()
  if (code === 'mfa_verification_failed' || msg.includes('invalid totp') || msg.includes('invalid code') || msg.includes('verification failed'))
    return 'El código no es correcto. Revisa que el reloj del teléfono esté en hora y escribe el código nuevo que muestra la app.'
  if (code === 'mfa_challenge_expired' || msg.includes('expired'))
    return 'El código venció. Escribe el código nuevo que muestra la app.'
  if (code === 'over_request_rate_limit' || msg.includes('rate limit'))
    return 'Hiciste demasiados intentos seguidos. Espera un minuto y vuelve a probar.'
  if (msg.includes('fetch') || msg.includes('network'))
    return 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.'
  if (code === 'insufficient_aal' || msg.includes('aal2'))
    return 'Para hacer este cambio primero verifica tu código de la app.'
  return `No se pudo completar la verificación (${error?.message || 'error desconocido'}).`
}

// supabase-js entrega el QR como «data:image/svg+xml;utf-8,<svg…>» sin codificar. Si el SVG trae un «#» (colores como #fff) el
// navegador lo toma como inicio de fragmento y la imagen no se ve: se vuelve a codificar entero.
const PREFIJO_SVG = 'data:image/svg+xml;utf-8,'
const qrSeguro = qr => qr.startsWith(PREFIJO_SVG) ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.slice(PREFIJO_SVG.length))}` : qr

// Estado actual: si la sesión ya verificó el código, si hace falta verificarlo y si la cuenta tiene la app vinculada.
export async function estadoDosFactores() {
  const [nivel, factores] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ])
  if (nivel.error) throw nivel.error
  if (factores.error) throw factores.error
  const verificado = (factores.data?.all || []).find(f => f.factor_type === 'totp' && f.status === 'verified') || null
  return {
    actual: nivel.data?.currentLevel || 'aal1',
    siguiente: nivel.data?.nextLevel || 'aal1',
    tieneFactor: Boolean(verificado),
    factorId: verificado?.id || null,
  }
}

// Empieza la vinculación de la app. Borra intentos anteriores que nunca se confirmaron (si no, Supabase rechaza el nombre repetido).
export async function iniciarAlta() {
  const { data: lista } = await supabase.auth.mfa.listFactors()
  for (const factor of lista?.all || []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: factor.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'AgroBloque', friendlyName: 'AgroBloque' })
  if (error) throw error
  return { factorId: data.id, qr: qrSeguro(data.totp?.qr_code || ''), secreto: data.totp?.secret || '' }
}

// Confirma el código de 6 dígitos (sirve para vincular la app por primera vez y para verificar al entrar).
export async function confirmarCodigo(factorId, codigo) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: String(codigo).replace(/\D/g, '') })
  if (error) throw error
}

export async function desactivarDosFactores(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
}
