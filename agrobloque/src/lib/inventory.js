import { supabase } from './supabase'

const rpcNoDisponible = (error) => {
  const texto = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return texto.includes('ajustar_stock_producto') || texto.includes('consumir_stock_valorizado') || texto.includes('schema cache') || error?.code === 'PGRST202'
}

export async function ajustarStockSeguro({ productoId, delta, tipo = 'ajuste', modulo = '', referenciaId = '', detalle = '', stockActual = 0, plantacionId = null, bloqueId = null, fecha = null }) {
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
