import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Skeleton } from '../components/UI'
import { fmtGs } from '../format'

const fechaClave = valor => String(valor || '').slice(0, 10)
const numero = valor => Number(valor || 0).toLocaleString('es-PY', { maximumFractionDigits: 1 })
const mesClave = valor => fechaClave(valor).slice(0, 7)
const meses = cantidad => Array.from({ length:cantidad }, (_, indice) => {
  const fecha = new Date()
  fecha.setDate(1)
  fecha.setMonth(fecha.getMonth() - (cantidad - 1 - indice))
  return { key:`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`, label:fecha.toLocaleDateString('es-PY', { month:'short' }) }
})

const convertirCantidad = (cantidad, unidadUso, unidadStock) => {
  const valor = Number(String(cantidad || '').replace(',', '.')) || 0
  const uso = String(unidadUso || '').toLowerCase()
  const stock = String(unidadStock || '').toLowerCase()
  if (uso === stock || !uso || !stock) return valor
  if (stock === 'kg' && ['g', 'gr'].includes(uso)) return valor / 1000
  if (['l', 'lt', 'litro'].includes(stock) && ['ml', 'cc'].includes(uso)) return valor / 1000
  return valor
}

const costoFertilizacion = (registro, productos) => (registro.soluciones || []).flatMap(solucion => solucion.productos || []).reduce((total, producto) => {
  const inventario = productos.get(producto.producto_id)
  if (!inventario) return total
  return total + convertirCantidad(producto.cantidad, producto.unidad, inventario.unidad) * Number(inventario.precio_unitario || 0)
}, 0)

export default function Rentabilidad({ campoActivo }) {
  const [datos, setDatos] = useState({ bloques:[], plantaciones:[], ventas:[], costos:[], fumigaciones:[], fertilizaciones:[], productos:[], muertes:[], cosechas:[], consumos:[] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [preciosDisponibles, setPreciosDisponibles] = useState(true)
  const bloqueSolicitado = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('bloque') : null

  useEffect(() => {
    if (!campoActivo?.id) return
    let activo = true
    const cargar = async () => {
      setLoading(true); setError(''); setPreciosDisponibles(true)
      try {
        const { data:bloques, error:bloquesError } = await supabase.from('bloques').select('id,codigo,campo_id').eq('campo_id', campoActivo.id).order('codigo')
        if (bloquesError) throw bloquesError
        const ids = (bloques || []).map(b => b.id)
        if (!ids.length) {
          if (activo) setDatos({ bloques:[], plantaciones:[], ventas:[], costos:[], fumigaciones:[], fertilizaciones:[], productos:[], muertes:[], cosechas:[], consumos:[] })
          return
        }
        const cargarProductos = async () => {
          const conPrecio = await supabase.from('productos').select('id,unidad,precio_unitario')
          if (!conPrecio.error) return conPrecio
          if (!String(conPrecio.error.message || '').includes('precio_unitario')) return conPrecio
          if (activo) setPreciosDisponibles(false)
          return supabase.from('productos').select('id,unidad')
        }
        const cargarFumigaciones = async () => {
          const conPrecio = await supabase.from('fumigaciones').select('id,fecha,anulada,fumigacion_bloques(bloque_id),fumigacion_productos(dosis,descuento_stock,productos(precio_unitario))').eq('campo_id', campoActivo.id)
          if (!conPrecio.error) return conPrecio
          if (!String(conPrecio.error.message || '').includes('precio_unitario')) return conPrecio
          if (activo) setPreciosDisponibles(false)
          return supabase.from('fumigaciones').select('id,fecha,anulada,fumigacion_bloques(bloque_id),fumigacion_productos(dosis,descuento_stock)').eq('campo_id', campoActivo.id)
        }
        const resultados = await Promise.all([
          supabase.from('plantaciones').select('id,bloque_id,fecha_siembra,cantidad_plantas,densidad_plantas_m2,activa,cultivos(nombre)').in('bloque_id', ids),
          supabase.from('ventas').select('id,fecha,bloque_id,total,kg_total,precio_kg,monto_cobrado,estado_cobro').in('bloque_id', ids),
          supabase.from('costos').select('id,fecha,bloque_id,plantacion_id,campo_id,monto,tipo,descripcion,anulada').eq('campo_id', campoActivo.id),
          cargarFumigaciones(),
          supabase.from('fertilizaciones').select('id,fecha,bloque_id,anulada,soluciones').in('bloque_id', ids),
          cargarProductos(),
        ])
        const primerError = resultados.find(r => r.error)?.error
        if (primerError) throw primerError
        const plantaciones = resultados[0].data || []
        const plantacionIds = plantaciones.map(p => p.id)
        const muertesResultado = plantacionIds.length
          ? await supabase.from('muertes_plantas').select('plantacion_id,cantidad').in('plantacion_id', plantacionIds)
          : { data:[], error:null }
        if (muertesResultado.error) throw muertesResultado.error
        const [cosechasResultado, consumosResultado] = await Promise.all([
          supabase.from('cosechas').select('id,plantacion_id,bloque_id,fecha,kg_total,anulada').in('bloque_id', ids),
          plantacionIds.length ? supabase.from('consumos_valorizados').select('id,plantacion_id,bloque_id,fecha,costo_total,origen_tipo,anulado').in('plantacion_id', plantacionIds) : Promise.resolve({ data:[], error:null }),
        ])
        if (activo) setDatos({
          bloques:bloques || [], plantaciones, ventas:resultados[1].data || [], costos:resultados[2].data || [],
          fumigaciones:resultados[3].data || [], fertilizaciones:resultados[4].data || [], productos:resultados[5].data || [], muertes:muertesResultado.data || [],
          cosechas:cosechasResultado.data || [], consumos:consumosResultado.data || [],
        })
      } catch (e) {
        if (activo) setError('No pudimos actualizar todos los datos financieros en este momento.')
      } finally { if (activo) setLoading(false) }
    }
    cargar()
    return () => { activo = false }
  }, [campoActivo?.id, retry])

  const calculo = useMemo(() => {
    const productos = new Map(datos.productos.map(p => [p.id, p]))
    const fumigacionesPorBloque = new Map()
    datos.fumigaciones.filter(f => !f.anulada).forEach(f => {
      const destinos = (f.fumigacion_bloques || []).map(item => item.bloque_id).filter(Boolean)
      const costo = (f.fumigacion_productos || []).reduce((suma, item) => suma + Number(item.descuento_stock ?? item.dosis ?? 0) * Number(item.productos?.precio_unitario || 0), 0)
      destinos.forEach(id => {
        const lista = fumigacionesPorBloque.get(id) || []
        lista.push({ fecha:f.fecha, monto:destinos.length ? costo / destinos.length : 0 })
        fumigacionesPorBloque.set(id, lista)
      })
    })

    const filas = datos.bloques.map(bloque => {
      const plantacion = datos.plantaciones.find(p => p.bloque_id === bloque.id)
      if (!plantacion) return null
      const desde = fechaClave(plantacion.fecha_siembra) || '0000-00-00'
      const iniciales = Number(plantacion.cantidad_plantas ?? plantacion.densidad_plantas_m2 ?? 0)
      const bajas = datos.muertes.filter(m => m.plantacion_id === plantacion.id).reduce((s, m) => s + Number(m.cantidad || 0), 0)
      const vivas = Math.max(0, iniciales - bajas)
      const manuales = datos.costos.filter(c => !c.anulada && (c.plantacion_id === plantacion.id || (!c.plantacion_id && c.bloque_id === bloque.id && fechaClave(c.fecha) >= desde))).reduce((s, c) => s + Number(c.monto || 0), 0)
      const consumosPlantacion = datos.consumos.filter(c => !c.anulado && c.plantacion_id === plantacion.id)
      const consumoValorizado = consumosPlantacion.reduce((s,c) => s + Number(c.costo_total || 0), 0)
      const fumigacion = consumosPlantacion.length ? 0 : (fumigacionesPorBloque.get(bloque.id) || []).filter(c => fechaClave(c.fecha) >= desde).reduce((s, c) => s + c.monto, 0)
      const fertilizacion = consumosPlantacion.length ? 0 : datos.fertilizaciones.filter(f => !f.anulada && f.bloque_id === bloque.id && fechaClave(f.fecha) >= desde).reduce((s, f) => s + costoFertilizacion(f, productos), 0)
      const kilos = datos.cosechas.filter(c => !c.anulada && (c.plantacion_id === plantacion.id || (!c.plantacion_id && c.bloque_id === bloque.id && fechaClave(c.fecha) >= desde))).reduce((s,c) => s + Number(c.kg_total || 0), 0)
      const ventas = datos.ventas.filter(v => v.bloque_id === bloque.id && fechaClave(v.fecha) >= desde)
      const facturado = ventas.reduce((s, v) => s + Number(v.total || (Number(v.kg_total || 0) * Number(v.precio_kg || 0))), 0)
      const cobrado = ventas.reduce((s, v) => s + Number(v.monto_cobrado || (v.estado_cobro === 'pagado' ? v.total : 0)), 0)
      const costo = manuales + consumoValorizado + fumigacion + fertilizacion
      return {
        id:plantacion.id, bloque:bloque.codigo, cultivo:plantacion.cultivos?.nombre || 'Sin cultivo', desde, iniciales, vivas,
        costo, costoPlanta:vivas > 0 ? costo / vivas : 0, kilos, costoKilo:kilos > 0 ? costo/kilos : 0, activa:plantacion.activa, facturado, cobrado, balance:cobrado - costo,
        recuperado:costo > 0 ? Math.min(100, (cobrado / costo) * 100) : 0,
      }
    }).filter(Boolean)

    const mesesGrafico = meses(6).map(mes => ({
      ...mes,
      ingresos:datos.ventas.filter(v => mesClave(v.fecha) === mes.key).reduce((s, v) => s + Number(v.total || (Number(v.kg_total || 0) * Number(v.precio_kg || 0))), 0),
      cobrado:datos.ventas.filter(v => mesClave(v.fecha) === mes.key).reduce((s, v) => s + Number(v.monto_cobrado || (v.estado_cobro === 'pagado' ? v.total : 0)), 0),
      costos:datos.costos.filter(c => mesClave(c.fecha) === mes.key).reduce((s, c) => s + Number(c.monto || 0), 0)
        + datos.fertilizaciones.filter(f => !f.anulada && mesClave(f.fecha) === mes.key).reduce((s, f) => s + costoFertilizacion(f, productos), 0)
        + datos.fumigaciones.filter(f => !f.anulada && mesClave(f.fecha) === mes.key).reduce((s, f) => s + (f.fumigacion_productos || []).reduce((t, item) => t + Number(item.descuento_stock ?? item.dosis ?? 0) * Number(item.productos?.precio_unitario || 0), 0), 0),
    })).map(mes => {
      const ingresos = Number.isFinite(mes.ingresos) ? mes.ingresos : 0
      const cobrado = Number.isFinite(mes.cobrado) ? mes.cobrado : 0
      const costos = Number.isFinite(mes.costos) ? mes.costos : 0
      return { ...mes, ingresos, cobrado, costos, resultado:ingresos - costos }
    })
    const sinAsignar = datos.costos.filter(c => !c.bloque_id).reduce((s, c) => s + Number(c.monto || 0), 0)
    return { filas, meses:mesesGrafico, sinAsignar }
  }, [datos])
  const filasVisibles = bloqueSolicitado ? calculo.filas.filter(fila => datos.plantaciones.find(p => p.id === fila.id)?.bloque_id === bloqueSolicitado) : calculo.filas

  return <div className="ag-page profitability-page">
    <div className="profitability-header">
      <div><small>Finanzas de producción</small><h1 className="ag-page-title">Rentabilidad</h1><p>Ingresos, costos y recuperación de cada plantación activa.</p></div>
      <div className="profitability-field"><i className="ti ti-map-pin" /><span>{campoActivo?.nombre || 'Campo'}</span></div>
    </div>
    <div className="profitability-body">
      {error && <div className="profitability-soft-state" role="alert"><span><i className="ti ti-refresh-alert" /></span><div><strong>La información necesita actualizarse</strong><p>{error}</p></div><button onClick={() => setRetry(valor => valor + 1)}>Reintentar</button></div>}
      {loading ? <Skeleton rows={5} label="Calculando rentabilidad" /> : <>
        <FinancialChart data={calculo.meses} />
        {!preciosDisponibles && <div className="profitability-info"><i className="ti ti-info-circle" /><span><strong>Costos de insumos todavía no incluidos.</strong> El gráfico sí muestra ventas y costos manuales. Para sumar fertilizantes y fitosanitarios hay que habilitar el precio unitario del inventario.</span></div>}
        {calculo.sinAsignar > 0 && <div className="profitability-warning"><i className="ti ti-info-circle" /><span><strong>{fmtGs(calculo.sinAsignar)} sin asignar a un bloque.</strong> Este importe no se divide entre plantas para evitar mostrar un cálculo engañoso.</span></div>}
        <section className="profitability-section">
          <div className="profitability-section-title"><div><h2>{bloqueSolicitado ? 'Plantaciones del bloque' : 'Plantaciones actuales e históricas'}</h2><p>Los ciclos activos muestran costos acumulados hasta hoy; los finalizados conservan su resultado.</p></div><span>{filasVisibles.length}</span></div>
          {!filasVisibles.length ? <div className="empty-state"><span className="empty-state__icon"><i className="ti ti-chart-pie" /></span><div><strong>Sin plantaciones activas</strong><p>Cuando exista una plantación con ventas y costos aparecerá su rentabilidad.</p></div></div> : <div className="profitability-grid">{filasVisibles.map(fila => <PlantationProfit key={fila.id} data={fila} />)}</div>}
        </section>
      </>}
    </div>
  </div>
}

function FinancialChart({ data }) {
  const [mesSeleccionado, setMesSeleccionado] = useState(Math.max(0, data.length - 1))
  const [seriesVisibles, setSeriesVisibles] = useState({ ingresos:true, cobrado:true, costos:true, resultado:true })
  const maximoIngresos = Math.max(1, ...data.flatMap(item => [item.ingresos, item.cobrado, item.resultado]))
  const minimoIngresos = Math.min(0, ...data.map(item => item.resultado))
  const maximoCostos = Math.max(1, ...data.map(item => item.costos))
  const xPunto = index => 76 + index * 92
  const yIzquierda = valor => 166 - ((valor - minimoIngresos) / (maximoIngresos - minimoIngresos || 1)) * 116
  const yCostos = valor => 166 - (valor / maximoCostos) * 116
  const puntos = (campo, escala) => data.map((item, index) => `${xPunto(index)},${escala(item[campo])}`).join(' ')
  const totalIngresos = data.reduce((s, item) => s + item.ingresos, 0)
  const totalCostos = data.reduce((s, item) => s + item.costos, 0)
  const totalCobrado = data.reduce((s, item) => s + item.cobrado, 0)
  const hayDatos = totalIngresos > 0 || totalCostos > 0
  const seleccionado = data[mesSeleccionado] || data[data.length - 1] || { label:'-', ingresos:0, costos:0 }
  const resultadoSeleccionado = seleccionado.ingresos - seleccionado.costos
  const abreviarGs = valor => {
    const numero = Number(valor) || 0
    if (numero >= 1000000000) return `${(numero / 1000000000).toLocaleString('es-PY', { maximumFractionDigits:1 })} mil M`
    if (numero >= 1000000) return `${(numero / 1000000).toLocaleString('es-PY', { maximumFractionDigits:1 })} M`
    if (numero >= 1000) return `${(numero / 1000).toLocaleString('es-PY', { maximumFractionDigits:0 })} mil`
    return fmtGs(numero)
  }
  const niveles = [1, .66, .33, 0]
  const alternarSerie = serie => setSeriesVisibles(actual => ({ ...actual, [serie]:!actual[serie] }))
  return <section className="profitability-chart-card">
    <div className="profitability-chart-head"><div><small>ÚLTIMOS 6 MESES</small><h2>Ingresos y costos</h2></div><div className="profitability-chart-summary"><span><i className="income" />Ventas <strong>{fmtGs(totalIngresos)}</strong></span><span><i className="collected" />Cobrado <strong>{fmtGs(totalCobrado)}</strong></span><span><i className="cost" />Costos <strong>{fmtGs(totalCostos)}</strong></span><span className={totalIngresos - totalCostos >= 0 ? 'positive' : 'negative'}>Resultado <strong>{fmtGs(totalIngresos - totalCostos)}</strong></span></div></div>
    <div className="profitability-month-focus" aria-live="polite"><div><small>MES SELECCIONADO</small><strong>{seleccionado.label}</strong></div><span><small>Ventas generadas</small><strong>Gs. {fmtGs(seleccionado.ingresos)}</strong></span><span><small>Dinero cobrado</small><strong>Gs. {fmtGs(seleccionado.cobrado)}</strong></span><span><small>Costos</small><strong>Gs. {fmtGs(seleccionado.costos)}</strong></span><span className={resultadoSeleccionado >= 0 ? 'positive' : 'negative'}><small>{resultadoSeleccionado >= 0 ? 'Ganancia' : 'Pérdida'}</small><strong>Gs. {fmtGs(Math.abs(resultadoSeleccionado))}</strong></span></div>
    <div className="profitability-series-picker" aria-label="Líneas visibles">{[
      ['ingresos','income','Ventas generadas'],['cobrado','collected','Dinero cobrado'],['costos','cost','Costos'],['resultado','result','Resultado'],
    ].map(([serie,clase,etiqueta]) => <button type="button" className={seriesVisibles[serie] ? 'is-active' : ''} aria-pressed={seriesVisibles[serie]} key={serie} onClick={() => alternarSerie(serie)}><i className={clase} />{etiqueta}</button>)}</div>
    <div className="profitability-scale-note"><span>Ventas, cobros y resultado · escala izquierda</span><span>Costos · escala derecha</span></div>
    <div className={`profitability-chart-wrap ${hayDatos ? '' : 'is-empty'}`}><svg viewBox="0 0 620 210" role="img" aria-label="Ingresos y costos mensuales con escalas separadas">
      {niveles.map((nivel, index) => { const y=50 + index * 38.66; const valorIzquierda=minimoIngresos+(maximoIngresos-minimoIngresos)*nivel; return <g key={nivel}><line x1="70" x2="550" y1={y} y2={y} className="profit-grid-line" /><text x="62" y={y+4} textAnchor="end" className="profit-axis income">{abreviarGs(valorIzquierda)}</text><text x="558" y={y+4} textAnchor="start" className="profit-axis cost">{abreviarGs(maximoCostos*nivel)}</text></g> })}
      <line x1={xPunto(mesSeleccionado)} x2={xPunto(mesSeleccionado)} y1="43" y2="171" className="profit-selection-line" />
      {seriesVisibles.ingresos && <polyline points={puntos('ingresos', yIzquierda)} className="profit-line income" />}
      {seriesVisibles.cobrado && <polyline points={puntos('cobrado', yIzquierda)} className="profit-line collected" />}
      {seriesVisibles.costos && <polyline points={puntos('costos', yCostos)} className="profit-line cost" />}
      {seriesVisibles.resultado && <polyline points={puntos('resultado', yIzquierda)} className="profit-line result" />}
      {data.map((item, index) => <g className={`profit-month-point ${index === mesSeleccionado ? 'is-selected' : ''}`} key={item.key} role="button" tabIndex="0" aria-label={`${item.label}: ventas ${fmtGs(item.ingresos)}, cobrado ${fmtGs(item.cobrado)}, costos ${fmtGs(item.costos)}, resultado ${fmtGs(item.resultado)}`} onClick={() => setMesSeleccionado(index)} onKeyDown={evento => { if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); setMesSeleccionado(index) } }}>{seriesVisibles.ingresos && <circle cx={xPunto(index)} cy={yIzquierda(item.ingresos)} r={index === mesSeleccionado ? 6 : 4} className="profit-dot income" />}{seriesVisibles.cobrado && <circle cx={xPunto(index)} cy={yIzquierda(item.cobrado)} r={index === mesSeleccionado ? 6 : 4} className="profit-dot collected" />}{seriesVisibles.costos && <circle cx={xPunto(index)} cy={yCostos(item.costos)} r={index === mesSeleccionado ? 6 : 4} className="profit-dot cost" />}{seriesVisibles.resultado && <circle cx={xPunto(index)} cy={yIzquierda(item.resultado)} r={index === mesSeleccionado ? 6 : 4} className="profit-dot result" />}<text x={xPunto(index)} y="198" textAnchor="middle">{item.label}</text><rect x={xPunto(index)-30} y="36" width="60" height="166" fill="transparent" /></g>)}
    </svg>{!hayDatos && <div className="profitability-chart-empty"><i className="ti ti-chart-line" /><strong>El gráfico está listo</strong><span>Aparecerá cuando registres una venta o un costo.</span></div>}</div>
    <div className="profitability-month-table" role="table" aria-label="Resumen mensual de rentabilidad"><div className="profitability-month-table__head" role="row"><span>Mes</span><span>Ventas</span><span>Cobrado</span><span>Costos</span><span>Resultado</span></div>{data.map((item,index) => <button type="button" role="row" className={index === mesSeleccionado ? 'is-selected' : ''} key={item.key} onClick={() => setMesSeleccionado(index)}><strong>{item.label}</strong><span>Gs. {fmtGs(item.ingresos)}</span><span>Gs. {fmtGs(item.cobrado)}</span><span>Gs. {fmtGs(item.costos)}</span><span className={item.resultado >= 0 ? 'positive' : 'negative'}>Gs. {fmtGs(item.resultado)}</span></button>)}</div>
  </section>
}

function PlantationProfit({ data }) {
  return <article className="plantation-profit-card">
    <div className="plantation-profit-head"><div><small>BLOQUE {data.bloque} · {data.activa ? 'EN PRODUCCIÓN' : 'FINALIZADA'}</small><h3>{data.cultivo}</h3><span>Desde {new Date(`${data.desde}T12:00:00`).toLocaleDateString('es-PY')}</span></div><strong className={data.balance >= 0 ? 'positive' : 'negative'}>{data.balance >= 0 ? 'Ganancia' : 'Por recuperar'}<b>{fmtGs(Math.abs(data.balance))}</b></strong></div>
    <div className="plantation-profit-progress"><div><span>Inversión recuperada</span><strong>{numero(data.recuperado)}%</strong></div><progress max="100" value={data.recuperado} /></div>
    <div className="plantation-profit-metrics"><div><span>Plantas vivas</span><strong>{numero(data.vivas)}</strong><small>{data.iniciales !== data.vivas ? `${numero(data.iniciales)} iniciales` : 'registradas'}</small></div><div><span>Costo acumulado</span><strong>{fmtGs(data.costo)}</strong><small>{fmtGs(data.costoPlanta)} por planta</small></div><div><span>Kilos cosechados</span><strong>{numero(data.kilos)} kg</strong><small>{data.kilos > 0 ? `${fmtGs(data.costoKilo)} por kg ${data.activa ? 'hasta hoy' : 'final'}` : 'sin cosechas'}</small></div><div><span>Ventas generadas</span><strong>{fmtGs(data.facturado)}</strong><small>{fmtGs(data.cobrado)} cobrados</small></div></div>
  </article>
}
