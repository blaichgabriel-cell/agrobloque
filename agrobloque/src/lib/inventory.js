import { supabase } from './supabase'

const rpcNoDisponible = (error) => {
  const texto = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return texto.includes('ajustar_stock_producto') || texto.includes('consumir_stock_valorizado') || texto.includes('schema cache') || error?.code === 'PGRST202'
}

async function aplicarAjuste({ productoId, delta, tipo = 'ajuste', modulo = '', referenciaId = '', detalle = '', stockActual = 0, plantacionId = null, bloqueId = null, fecha = null }) {
  if (Number(delta) < 0 && referenciaId && plantacionId) {
    const { data: valorizado, error: valorError } = await supabase.rpc('consumir_stock_valorizado', {
      p_producto_id:productoId, p_cantidad:Math.abs(Number(delta)), p_tipo:tipo, p_origen_id:referenciaId,
      p_plantacion_id:plantacionId, p_bloque_id:bloqueId, p_fecha:fecha, p_detalle:detalle || null,
    })
    if (!valorError) return { stock:Number(valorizado?.stock), costoTotal:Number(valorizado?.costo_total), movimientoRegistrado:true }
    if (!rpcNoDisponible(valorError)) throw valorError
  }
  const { data, error } = await supabase.rpc('ajustar_stock_producto', {
    p_producto_id: productoId,
    p_delta: Number(delta) || 0,
    p_tipo: tipo,
    p_modulo: modulo || null,
    p_referencia_id: referenciaId ? String(referenciaId) : null,
    p_detalle: detalle || null,
  })

  if (!error) return { stock: Number(data), movimientoRegistrado: true }
  if (!rpcNoDisponible(error)) throw error

  const stock = Math.max(0, Number(stockActual || 0) + Number(delta || 0))
  const { error: fallbackError } = await supabase.from('productos').update({ stock_actual:stock }).eq('id', productoId)
  if (fallbackError) throw fallbackError
  return { stock, movimientoRegistrado:false }
}

// Descuenta stock. Para el consumo de una aplicación (tipo «consumo_…») rige esta regla: el trabajo ya se hizo y debe quedar
// registrado, así que NO se bloquea si el inventario no alcanza. Se descuenta lo que hay (el stock queda en 0), el movimiento
// anota cuánto faltó y el resultado trae { faltante, pedido, disponible } para avisarle a la persona. Antes, en bloques con
// cultivo activo la base daba «Stock insuficiente» con la aplicación ya guardada a medias, y en los demás el stock bajaba a 0 en silencio.
export async function ajustarStockSeguro(parametros) {
  const { productoId, delta, tipo = 'ajuste' } = parametros
  if (!(Number(delta) < 0 && String(tipo).startsWith('consumo'))) return aplicarAjuste(parametros)

  const pedido = Math.abs(Number(delta))
  const { data: fila } = await supabase.from('productos').select('stock_actual').eq('id', productoId).maybeSingle()
  if (!fila) return aplicarAjuste(parametros)
  const disponible = Math.max(0, Number(fila.stock_actual) || 0)
  const consumir = Math.min(pedido, disponible)
  const faltante = pedido - consumir > 1e-9 ? pedido - consumir : 0
  if (!faltante) return aplicarAjuste(consumir === pedido ? parametros : { ...parametros, delta:-consumir })

  const info = { faltante, pedido, disponible }
  if (consumir <= 0) return { stock:0, movimientoRegistrado:false, ...info }
  const resultado = await aplicarAjuste({ ...parametros, delta:-consumir, detalle:[parametros.detalle, `faltaron ${Number(faltante.toFixed(3))} por stock insuficiente`].filter(Boolean).join(' · ') })
  return { ...resultado, ...info }
}

const numero = n => Number(n || 0).toLocaleString('es-PY', { maximumFractionDigits:3 })

// Junta los faltantes de una operación (por producto) y arma el aviso final. `formato(cantidad, unidad)` es opcional.
export function textoFaltantes(lista = [], formato = (cantidad, unidad) => `${numero(cantidad)}${unidad ? ` ${unidad}` : ''}`) {
  const porProducto = new Map()
  for (const item of lista) {
    const actual = porProducto.get(item.nombre)
    if (actual) actual.pedido += item.pedido
    else porProducto.set(item.nombre, { ...item })
  }
  const filas = [...porProducto.values()]
  if (!filas.length) return ''
  return `Faltó producto en el inventario: ${filas.map(f => `${f.nombre} (se usaron ${formato(f.pedido, f.unidad)} y había ${formato(f.disponible, f.unidad)})`).join('; ')}. El stock quedó en 0: registra la compra pendiente en Inventario para que el stock y los costos cuadren.`
}
