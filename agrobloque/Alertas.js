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
  const fecha = new Date().toLocaleDateString('es-PY')
  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          @page { size: A4; margin: 16mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #111; margin: 0; background: #fff; }
          .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 22px; }
          .brand { display: flex; gap: 12px; align-items: center; }
          .logo { width: 42px; height: 42px; border-radius: 10px; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px; letter-spacing: -1px; }
          .brand-title { font-weight: 800; font-size: 15px; }
          .brand-sub { color: #555; font-size: 11px; margin-top: 2px; text-transform: uppercase; letter-spacing: .8px; }
          .date { color: #555; font-size: 11px; text-align: right; }
          h1 { margin: 0 0 8px; font-size: 24px; letter-spacing: -0.5px; }
          h2 { margin: 24px 0 10px; font-size: 16px; border-left: 4px solid #176a25; padding-left: 8px; }
          .muted { color: #666; font-size: 12px; margin-bottom: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          th, td { border: 1px solid #ddd; padding: 7px 8px; text-align: left; vertical-align: top; }
          th { background: #f2f4f2; color: #222; text-transform: uppercase; font-size: 10px; letter-spacing: .3px; }
          tbody tr:nth-child(even), table tr:nth-child(even) td { background: #fafafa; }
          .right { text-align: right; }
          .total { font-weight: 700; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="report-header">
          <div class="brand">
            <div class="logo">HS</div>
            <div>
              <div class="brand-title">Horticultura El Sembrador</div>
              <div class="brand-sub">AgroBloque</div>
            </div>
          </div>
          <div class="date">Generado el ${fecha}</div>
        </div>
        ${bodyHtml}
      </body>
    </html>
  `)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 250)
}
