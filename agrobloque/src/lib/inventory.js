import { supabase } from './supabase'

const rpcNoDisponible = (error) => {
  const texto = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return texto.includes('ajustar_stock_producto') || texto.includes('schema cache') || error?.code === 'PGRST202'
}

export async function ajustarStockSeguro({ productoId, delta, tipo = 'ajuste', modulo = '', referenciaId = '', detalle = '', stockActual = 0 }) {
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
