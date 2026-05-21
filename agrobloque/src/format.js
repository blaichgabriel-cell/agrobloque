// Utilidades compartidas de formato y parsing

// Para moneda guaraní — sin decimales
export const parsearGs = (v) => parseInt(String(v || '').replace(/\./g, ''), 10) || 0
export const fmtGs = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')

// Para kg — permite decimales
export const parsearKg = (v) => {
  const s = String(v || '').replace(/,/g, '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}
export const fmtKg = (n) => {
  const num = Number(n) || 0
  return num % 1 === 0 ? num.toLocaleString('es-PY') : num.toLocaleString('es-PY', { minimumFractionDigits:1, maximumFractionDigits:2 })
}

// Días desde una fecha
export const diasDesde = (fecha) => {
  if (!fecha) return null
  return Math.floor((new Date() - new Date(fecha)) / 86400000)
}

// CICLO_DIAS — fuente única de verdad
export const CICLO_DIAS = {
  'Morrón': 90, 'Tomate': 75, 'Pepino': 50, 'Berenjena': 80,
  'Zapalito': 55, 'Zucchini': 50, 'Lechuga': 45, 'Lechuga repollo': 50,
  'Tomate Lisa': 70,
}
