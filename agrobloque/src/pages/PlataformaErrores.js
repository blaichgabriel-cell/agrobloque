import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { MiniStat, PlataformaCabecera, numero } from '../components/PlataformaUI'
import { descartarError, listarErrores } from '../lib/plataforma'

const ORIGENES = {
  pantalla: { icono: 'ti-layout-off', texto: 'Pantalla' },
  js: { icono: 'ti-bug', texto: 'JavaScript' },
  promesa: { icono: 'ti-bolt-off', texto: 'Proceso' },
  guardado: { icono: 'ti-database-exclamation', texto: 'Guardado' },
}

const hace = (fecha) => {
  const segundos = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 1000))
  if (segundos < 60) return 'hace instantes'
  if (segundos < 3600) return `hace ${Math.round(segundos / 60)} min`
  if (segundos < 86400) return `hace ${Math.round(segundos / 3600)} h`
  return `hace ${Math.round(segundos / 86400)} d`
}

// Agrupa los renglones (un error por empresa) en un solo error con la lista de empresas afectadas.
const agrupar = (filas) => {
  const porHuella = new Map()
  for (const fila of filas) {
    const grupo = porHuella.get(fila.huella) || { huella: fila.huella, origen: fila.origen, ruta: fila.ruta, mensaje: fila.mensaje, detalle: fila.detalle, version: fila.version, agente: fila.agente, empresas: [], total: 0, ultima_vez: fila.ultima_vez, primera_vez: fila.primera_vez }
    grupo.empresas.push({ nombre: fila.empresa, repeticiones: fila.repeticiones })
    grupo.total += Number(fila.repeticiones) || 0
    if (new Date(fila.ultima_vez) > new Date(grupo.ultima_vez)) { grupo.ultima_vez = fila.ultima_vez; grupo.version = fila.version; grupo.agente = fila.agente }
    if (new Date(fila.primera_vez) < new Date(grupo.primera_vez)) grupo.primera_vez = fila.primera_vez
    porHuella.set(fila.huella, grupo)
  }
  return [...porHuella.values()].sort((a, b) => new Date(b.ultima_vez) - new Date(a.ultima_vez))
}

// Errores que les pasan a las personas en la app: qué falla, en qué empresa y cuántas veces.
export default function PlataformaErrores() {
  const [dias, setDias] = useState(14)
  const [estado, setEstado] = useState({ cargando: true, disponible: true, filas: [], error: '' })
  const [descartando, setDescartando] = useState('')

  const cargar = useCallback(async () => {
    try {
      const r = await listarErrores(dias)
      setEstado({ cargando: false, disponible: r.disponible, filas: r.errores, error: '' })
    } catch (e) { setEstado(d => ({ ...d, cargando: false, error: e.message })) }
  }, [dias])
  useEffect(() => { setEstado(d => ({ ...d, cargando: true })); cargar() }, [cargar])

  const errores = useMemo(() => agrupar(estado.filas), [estado.filas])
  const empresasAfectadas = useMemo(() => new Set(estado.filas.map(f => f.empresa)).size, [estado.filas])
  const ocurrencias = useMemo(() => errores.reduce((suma, e) => suma + e.total, 0), [errores])

  const descartar = async (huella) => {
    setDescartando(huella)
    try { await descartarError(huella); await cargar() } catch (e) { setEstado(d => ({ ...d, error: e.message })) }
    setDescartando('')
  }

  return <div className="pl-page">
    <PlataformaCabecera icono="ti-bug" eyebrow="ERRORES DE LA APP" titulo="Qué está fallando" sub="Fallos que les pasan a las personas al usar AgroBloque: pantallas que no abren, errores de JavaScript y guardados que el servidor rechazó. No incluye correos ni datos del negocio." />

    {!estado.disponible && <div className="pl-demo" role="note"><i className="ti ti-plug-off" aria-hidden="true" /><div><b>El registro de errores todavía no está activo en la base.</b> Se activa aplicando <code>registro-errores-2026-11-24.sql</code> en Supabase. Mientras tanto la app funciona igual; solo no se anotan los errores.</div></div>}
    {estado.error && <div className="pl-demo" role="alert"><i className="ti ti-alert-circle" aria-hidden="true" /><div>{estado.error}</div></div>}

    {estado.disponible && <>
      <section className="pl-minis" aria-label="Resumen">
        <MiniStat icono="ti-bug" valor={numero(errores.length)} etiqueta="errores distintos" tono={errores.length ? 'alerta' : 'bloques'} />
        <MiniStat icono="ti-repeat" valor={numero(ocurrencias)} etiqueta="veces ocurridos" tono="neutral" />
        <MiniStat icono="ti-building-community" valor={numero(empresasAfectadas)} etiqueta="empresas afectadas" tono="finanzas" />
      </section>

      <div className="pl-errores__filtros" role="group" aria-label="Período">
        {[7, 14, 30].map(d => <button type="button" key={d} className={dias === d ? 'activo' : ''} aria-pressed={dias === d} onClick={() => setDias(d)}>Últimos {d} días</button>)}
      </div>

      {estado.cargando ? <p className="pl-nota"><i className="ti ti-loader-2" aria-hidden="true" /><span>Cargando…</span></p>
        : errores.length === 0 ? <section className="pl-bloque"><p className="pl-nota"><i className="ti ti-circle-check" aria-hidden="true" /><span>No hay errores registrados en este período. Si algo falla en la app de alguien, aparecerá aquí.</span></p></section>
        : <ul className="pl-errores" aria-label="Errores">
          {errores.map(e => {
            const origen = ORIGENES[e.origen] || { icono: 'ti-alert-triangle', texto: e.origen || 'Error' }
            return <li key={e.huella} className="pl-error">
              <div className="pl-error__cabecera">
                <span className="sp-chip sp-chip--pendiente"><i className={`ti ${origen.icono}`} aria-hidden="true" />{origen.texto}</span>
                <span className="pl-error__cuando">{hace(e.ultima_vez)}</span>
              </div>
              <p className="pl-error__mensaje">{e.mensaje}</p>
              <p className="pl-error__meta">
                <span><i className="ti ti-route" aria-hidden="true" />{e.ruta || 'sin ruta'}</span>
                <span><i className="ti ti-repeat" aria-hidden="true" /><b className="numeric-data">{numero(e.total)}</b> {e.total === 1 ? 'vez' : 'veces'}</span>
                {e.version && <span><i className="ti ti-git-commit" aria-hidden="true" /><code>{e.version}</code></span>}
              </p>
              <p className="pl-error__empresas"><i className="ti ti-building-community" aria-hidden="true" />{e.empresas.map(x => `${x.nombre}${x.repeticiones > 1 ? ` (${numero(x.repeticiones)})` : ''}`).join(' · ')}</p>
              {(e.detalle || e.agente) && <details className="pl-error__detalle">
                <summary>Ver detalle técnico</summary>
                {e.detalle && <pre>{e.detalle}</pre>}
                {e.agente && <p className="pl-error__agente">{e.agente}</p>}
              </details>}
              <div className="pl-error__acciones">
                <button type="button" className="bl-btn bl-btn--ghost" disabled={descartando === e.huella} onClick={() => descartar(e.huella)}><i className="ti ti-check" aria-hidden="true" />{descartando === e.huella ? 'Descartando…' : 'Ya está resuelto'}</button>
              </div>
            </li>
          })}
        </ul>}
    </>}
  </div>
}
