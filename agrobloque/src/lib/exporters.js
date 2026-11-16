const pad = (n) => String(n).padStart(2, '0')

export const fechaArchivo = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const nombreArchivo = (base, ext) => {
  const limpio = String(base || 'exportacion')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'exportacion'
  return `${limpio}-${fechaArchivo()}.${ext}`
}

export const descargarTexto = (filename, content, type = 'text/plain;charset=utf-8') => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const limpiarCsv = (value) => {
  if (value === null || value === undefined) return ''
  const text = String(value).replace(/\r?\n/g, ' ')
  return `"${text.replace(/"/g, '""')}"`
}

export const descargarCsv = (baseName, headers, rows) => {
  const csv = [
    headers.map(limpiarCsv).join(';'),
    ...rows.map(row => headers.map(h => limpiarCsv(row[h])).join(';')),
  ].join('\n')
  descargarTexto(nombreArchivo(baseName, 'csv'), `\ufeff${csv}`, 'text/csv;charset=utf-8')
}

export const descargarJson = (baseName, data) => {
  descargarTexto(nombreArchivo(baseName, 'json'), JSON.stringify(data, null, 2), 'application/json;charset=utf-8')
}

export const imprimirHtml = async (title, bodyHtml) => {
  const { descargarPdfHtml } = await import('./pdfReports')
  return descargarPdfHtml(title, bodyHtml)
}
