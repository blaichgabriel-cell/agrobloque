// Compara dos respaldos fila por fila (por id) y muestra que filas desaparecieron o se agregaron.
// Uso:  node comparar-respaldos.js <carpeta-vieja> <carpeta-nueva> [tabla1 tabla2 ...]
// Ejemplo: node comparar-respaldos.js respaldo-2026-11-06-12-09 respaldo-2026-11-11-14-19 asistencia adelantos
// Solo LEE archivos locales: no se conecta a ninguna base ni modifica nada.
const fs = require('fs')
const path = require('path')
const os = require('os')

const [, , viejaArg, nuevaArg, ...tablasArg] = process.argv
if (!viejaArg || !nuevaArg) {
  console.error('Uso: node comparar-respaldos.js <carpeta-vieja> <carpeta-nueva> [tablas...]')
  process.exit(1)
}
const leer = (carpeta, tabla) => {
  const base = process.env.RESPALDOS_DIR || path.join(os.homedir(), 'Desktop', 'Respaldos AgroBloque')
  const archivo = path.join(base, carpeta, 'datos', `public.${tabla}.json`)
  if (!fs.existsSync(archivo)) throw new Error(`No existe ${archivo}`)
  return JSON.parse(fs.readFileSync(archivo, 'utf8'))
}
const tablas = tablasArg.length ? tablasArg : ['asistencia', 'adelantos']
const monto = f => Number(f.monto ?? f.importe ?? 0) || 0

let operarios = {}
try { for (const o of leer(nuevaArg, 'operarios')) operarios[o.id] = o.nombre || o.id } catch (_) {}
const nombre = id => operarios[id] || String(id || '').slice(0, 8)

for (const tabla of tablas) {
  const vieja = leer(viejaArg, tabla)
  const nueva = leer(nuevaArg, tabla)
  const idsNueva = new Set(nueva.map(f => f.id))
  const idsVieja = new Set(vieja.map(f => f.id))
  const faltan = vieja.filter(f => !idsNueva.has(f.id))
  const nuevas = nueva.filter(f => !idsVieja.has(f.id))
  console.log(`\n=== ${tabla}: ${viejaArg} (${vieja.length}) -> ${nuevaArg} (${nueva.length}) ===`)
  console.log(`Filas que ESTABAN y ya no están: ${faltan.length}   |   filas nuevas: ${nuevas.length}`)
  const resumir = (filas, titulo) => {
    if (!filas.length) return
    const porFecha = {}
    for (const f of filas) { const d = f.fecha || String(f.created_at || '').slice(0, 10) || '?'; porFecha[d] = (porFecha[d] || 0) + 1 }
    const operariosAfectados = [...new Set(filas.map(f => nombre(f.operario_id)))]
    console.log(`  ${titulo}: monto total ${filas.reduce((s, f) => s + monto(f), 0).toLocaleString('es-PY')}; operarios: ${operariosAfectados.join(', ')}`)
    console.log(`  ${titulo} por fecha: ` + Object.entries(porFecha).sort().map(([d, n]) => `${d}=${n}`).join('  '))
    const creadas = filas.map(f => f.created_at).filter(Boolean).sort()
    if (creadas.length) console.log(`  creadas entre ${creadas[0]} y ${creadas[creadas.length - 1]}`)
  }
  resumir(faltan, 'Faltan')
  resumir(nuevas, 'Nuevas')
  if (faltan.length && faltan.length <= 25) {
    console.log('  Detalle de las que faltan:')
    for (const f of faltan) console.log(`   - ${f.fecha || ''} ${nombre(f.operario_id)} monto=${monto(f).toLocaleString('es-PY')} ${f.descripcion ? '"' + String(f.descripcion).slice(0, 40) + '"' : ''} anulado=${f.anulado ?? '-'}`)
  }
}
