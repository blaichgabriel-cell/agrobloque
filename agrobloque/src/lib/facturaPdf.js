import * as pdfjs from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString()

const compactar = (value = '') => String(value).replace(/\s+/g, ' ').trim()

const montoNumero = (value = '') => {
  const limpio = String(value).replace(/[^\d.,]/g, '')
  if (!limpio) return 0
  const ultimaComa = limpio.lastIndexOf(',')
  const ultimoPunto = limpio.lastIndexOf('.')
  const separadorDecimal = Math.max(ultimaComa, ultimoPunto)
  const decimales = separadorDecimal >= 0 ? limpio.length - separadorDecimal - 1 : 0
  const normalizado = decimales === 2
    ? `${limpio.slice(0, separadorDecimal).replace(/[^\d]/g, '')}.${limpio.slice(separadorDecimal + 1)}`
    : limpio.replace(/[^\d]/g, '')
  return Math.round(Number(normalizado) || 0)
}

const fechaIso = (value = '') => {
  const match = value.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/)
  if (!match) return ''
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

const valorLuegoDe = (lineas, etiquetas) => {
  for (let i = 0; i < lineas.length; i += 1) {
    const linea = lineas[i]
    const etiqueta = etiquetas.find(item => linea.toLowerCase().includes(item))
    if (!etiqueta) continue
    const enLinea = compactar(linea.split(/:\s*/).slice(1).join(':'))
    if (enLinea) return enLinea
    if (lineas[i + 1]) return compactar(lineas[i + 1])
  }
  return ''
}

export const analizarTextoFactura = (texto = '') => {
  const lineas = texto.split(/\r?\n/).map(compactar).filter(Boolean)
  const unido = lineas.join('\n')
  const comprobante = unido.match(/\b\d{3}[-\s]\d{3}[-\s]\d{6,8}\b/)?.[0]?.replace(/\s/g, '-') || ''
  const ruc = unido.match(/\b\d{5,9}\s*[-–]\s*[0-9A-Z]\b/i)?.[0]?.replace(/\s/g, '') || ''
  const fecha = fechaIso(unido)
  const proveedor = valorLuegoDe(lineas, ['razón social', 'razon social', 'proveedor', 'emisor'])

  const candidatas = lineas
    .map((linea, indice) => ({ linea, indice, lower: linea.toLowerCase() }))
    .filter(item => /total\s*(a\s*pagar)?|importe\s*total/.test(item.lower) && !/subtotal|iva|gravada/.test(item.lower))
    .map(item => {
      const valores = item.linea.match(/[\d][\d.,\s]{2,}/g) || []
      const monto = Math.max(0, ...valores.map(montoNumero))
      return { ...item, monto }
    })
    .filter(item => item.monto > 0)

  const total = candidatas.length ? candidatas[candidatas.length - 1].monto : 0
  const encontrados = [fecha, proveedor, comprobante, ruc, total].filter(Boolean).length

  return {
    fecha,
    proveedor,
    ruc,
    comprobante,
    total,
    moneda: /\bUSD\b|D[ÓO]LAR/i.test(unido) ? 'USD' : 'PYG',
    confianza: Math.round((encontrados / 5) * 100),
    textoExtraido: texto,
  }
}

export const leerFacturaPdf = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const documento = await pdfjs.getDocument({ data: bytes }).promise
  const paginas = []

  for (let numero = 1; numero <= documento.numPages; numero += 1) {
    const pagina = await documento.getPage(numero)
    const contenido = await pagina.getTextContent()
    paginas.push(contenido.items.map(item => item.str || '').join(' '))
  }

  const texto = paginas.join('\n')
  if (compactar(texto).length < 20) {
    throw new Error('El PDF parece ser una imagen escaneada. Completa los datos manualmente.')
  }
  return analizarTextoFactura(texto)
}
