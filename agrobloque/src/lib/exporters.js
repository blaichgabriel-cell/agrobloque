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

export const imprimirHtml = (title, bodyHtml) => {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111; margin: 32px; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          h2 { margin: 24px 0 10px; font-size: 17px; }
          .muted { color: #666; font-size: 12px; margin-bottom: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f2f4f2; }
          .right { text-align: right; }
          .total { font-weight: 700; }
          @media print { body { margin: 18mm; } }
        </style>
      </head>
      <body>
        ${bodyHtml}
      </body>
    </html>
  `)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 250)
}
