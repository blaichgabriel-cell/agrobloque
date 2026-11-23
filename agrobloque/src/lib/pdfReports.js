import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { nombreArchivo } from './exporters'

export async function descargarPdfHtml(title, bodyHtml, options = {}) {
  const host = document.createElement('div')
  const elegante = options.variant === 'block-clean'
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#111;padding:${elegante ? '42px' : '48px'};font-family:Arial,sans-serif;z-index:-1`
  host.innerHTML = `<style>
    *{box-sizing:border-box} h1{font-size:26px;margin:0 0 10px} h2{font-size:17px;margin:26px 0 10px;border-left:4px solid #176a25;padding-left:9px}
    .report-header{display:flex;justify-content:space-between;border-bottom:2px solid #173b29;padding-bottom:14px;margin-bottom:24px}.brand-title{font-size:18px;font-weight:800;color:#124e38}.muted,.date{color:#66736b;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px}th,td{border:1px solid #dfe5e1;padding:7px;text-align:left;vertical-align:top}th{background:#edf4ef;font-size:10px}.right{text-align:right}.total{font-weight:800}
    .block-clean .report-header{align-items:center;border-bottom:1px solid #cad1cd;padding-bottom:17px;margin-bottom:25px}.block-clean .brand-wrap{display:flex;align-items:center;gap:10px}.block-clean .brand-mark{color:#0b7044;font-size:23px;font-weight:950;letter-spacing:-3px}.block-clean .brand-title{color:#111;font-size:18px}.block-clean .date{color:#404944;font-size:11px}
    .block-clean .report-kicker{margin:0 0 10px;color:#5e6762;font-size:15px}.block-clean .report-title-row{display:flex;align-items:center;justify-content:space-between;gap:20px}.block-clean .report-title-row h1{margin:0;color:#111;font-size:31px;line-height:1}.block-clean .status-pill{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:999px;background:#e1f4e5;color:#143f27;font-size:12px;font-weight:800;white-space:nowrap}.block-clean .status-pill:before{content:'';width:8px;height:8px;border-radius:50%;background:#169447}.block-clean .crop-title{margin:8px 0 2px;color:#111;font-size:20px;font-weight:800}.block-clean .field-name{margin:0;color:#626a66;font-size:13px}
    .block-clean .metric-row{display:grid;grid-template-columns:repeat(4,1fr);margin:25px 0 28px;padding:0 0 24px;border-bottom:1px solid #ccd2cf}.block-clean .metric{min-width:0;padding:0 20px;border-right:1px solid #d9dddb}.block-clean .metric:first-child{padding-left:0}.block-clean .metric:last-child{padding-right:0;border-right:0}.block-clean .metric span{display:block;margin-bottom:7px;color:#626a66;font-size:11px}.block-clean .metric strong{display:block;color:#111;font-size:20px;line-height:1.1}
    .block-clean h2{margin:25px 0 8px;padding-left:12px;border-left:4px solid #148342;color:#111;font-size:17px}.block-clean table{margin-top:0;font-size:10.5px}.block-clean th,.block-clean td{padding:8px 12px;border:0;border-bottom:1px solid #d8ddda;background:#fff}.block-clean th{color:#303733;font-size:10px;font-weight:500}.block-clean tbody td:first-child{font-weight:650}.block-clean tr{break-inside:avoid}.block-clean .total td{border-top:1px solid #9fa9a3;font-weight:850}
    .block-clean .state-box{display:flex;gap:16px;margin-top:10px;padding:16px 20px;border-radius:13px;background:#f1f8f2;color:#25332b;font-size:11px;line-height:1.55;white-space:pre-wrap}.block-clean .state-check{flex:0 0 auto;width:28px;height:28px;display:grid;place-items:center;border:1.5px solid #168444;border-radius:50%;color:#168444;font-size:16px;font-weight:900}.block-clean .report-footer{display:flex;justify-content:space-between;margin-top:34px;padding-top:12px;border-top:1px solid #aeb6b1;color:#56605b;font-size:10px}.block-clean .report-footer strong{color:#0b7044}
  </style><div class="${elegante ? 'block-clean' : ''}"><div class="report-header"><div class="brand-wrap">${elegante ? '<span class="brand-mark">AB</span>' : ''}<div class="brand-title">AgroBloque</div></div><div class="date">Generado: ${new Date().toLocaleDateString('es-PY')}</div></div>${bodyHtml}</div>`
  document.body.appendChild(host)
  try {
    const canvas = await html2canvas(host, { scale:1.5, backgroundColor:'#ffffff', useCORS:true, logging:false })
    const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait', compress:true })
    const pageWidth = 210
    const pageHeight = 297
    const margin = 10
    const imageWidth = pageWidth - margin * 2
    const imageHeight = canvas.height * imageWidth / canvas.width
    const pagePixels = Math.floor(canvas.width * (pageHeight - margin * 2) / imageWidth)
    let sourceY = 0
    let page = 0
    while (sourceY < canvas.height) {
      const sliceHeight = Math.min(pagePixels, canvas.height - sourceY)
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceHeight
      slice.getContext('2d').drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      if (page > 0) pdf.addPage()
      const renderedHeight = sliceHeight * imageWidth / canvas.width
      pdf.addImage(slice.toDataURL('image/jpeg', .92), 'JPEG', margin, margin, imageWidth, renderedHeight, undefined, 'FAST')
      pdf.setFontSize(8)
      pdf.setTextColor(110)
      pdf.text(`Página ${page + 1}`, pageWidth - margin, pageHeight - 4, { align:'right' })
      sourceY += sliceHeight
      page += 1
    }
    pdf.save(nombreArchivo(title, 'pdf'))
  } finally {
    host.remove()
  }
}

