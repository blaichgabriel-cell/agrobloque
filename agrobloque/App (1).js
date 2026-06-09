export const explicarError = (error, contexto = {}) => {
  const message = String(error?.message || error || '').trim()
  const lower = message.toLowerCase()
  const modulo = contexto.modulo || 'Aplicacion'
  const accion = contexto.accion || 'operacion'

  let tipo = 'Error de la aplicacion'
  let consejo = 'Proba de nuevo. Si se repite, revisa Supabase o permisos.'

  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('connection')) {
    tipo = 'Problema de conexion'
    consejo = 'Revisa internet o espera unos segundos y toca Reintentar.'
  } else if (lower.includes('permission') || lower.includes('policy') || lower.includes('rls') || lower.includes('403')) {
    tipo = 'Permiso denegado'
    consejo = 'El usuario no tiene permiso para esta accion o falta ejecutar el SQL de permisos.'
  } else if (lower.includes('jwt') || lower.includes('session') || lower.includes('401')) {
    tipo = 'Sesion vencida'
    consejo = 'Cierra sesion, limpia sesion guardada e inicia de nuevo.'
  } else if (lower.includes('duplicate') || lower.includes('unique')) {
    tipo = 'Dato duplicado'
    consejo = 'Ese registro ya existe. Revisa nombre, correo o codigo.'
  } else if (lower.includes('column') || lower.includes('schema') || lower.includes('does not exist')) {
    tipo = 'Base de datos desactualizada'
    consejo = 'Falta ejecutar el SQL correspondiente en Supabase.'
  }

  return {
    tipo,
    modulo,
    accion,
    detalle: message || 'Sin detalle tecnico',
    consejo,
    codigo: `${modulo}-${accion}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  }
}

export const textoErrorProfesional = (error, contexto) => {
  const info = explicarError(error, contexto)
  return `${info.tipo} en ${info.modulo}: ${info.consejo} Codigo: ${info.codigo}. Detalle: ${info.detalle}`
}
