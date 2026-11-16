import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { nombreArchivo } from './exporters'

export async function descargarPdfHtml(title, bodyHtml) {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#111;padding:48px;font-family:Arial,sans-serif;z-index:-1'
  host.innerHTML = `<style>
    *{box-sizing:border-box} h1{font-size:26px;margin:0 0 10px} h2{font-size:17px;margin:26px 0 10px;border-left:4px solid #176a25;padding-left:9px}
    .report-header{display:flex;justify-content:space-between;border-bottom:2px solid #173b29;padding-bottom:14px;margin-bottom:24px}.brand-title{font-size:18px;font-weight:800;color:#124e38}.muted,.date{color:#66736b;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px}th,td{border:1px solid #dfe5e1;padding:7px;text-align:left;vertical-align:top}th{background:#edf4ef;font-size:10px}.right{text-align:right}.total{font-weight:800}
  </style><div class="report-header"><div class="brand-title">AgroBloque</div><div class="date">Generado el ${new Date().toLocaleDateString('es-PY')}</div></div>${bodyHtml}`
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

