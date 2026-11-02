export const normalizeLocaleIntegerText = (value) => String(value ?? '')
  .trim()
  .replace(/[\s.,]/g, '')
  .replace(/[^0-9-]/g, '')

export const parseLocaleInteger = (value, fallback = 0) => {
  const cleaned = normalizeLocaleIntegerText(value)
  if (!cleaned || cleaned === '-') return fallback
  const parsed = Number.parseInt(cleaned, 10)
  return Number.isSafeInteger(parsed) ? parsed : fallback
}

export const formatLocaleInteger = (value) => {
  const parsed = parseLocaleInteger(value, 0)
  return parsed ? parsed.toLocaleString('es-PY') : ''
}

export const blurNumberInputOnWheel = event => event.currentTarget.blur()
