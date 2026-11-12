import React, { useMemo, useState } from 'react'
import { AvisoDemo, MiniStat, PlataformaCabecera, numero, useEmpresas } from '../components/PlataformaUI'
import { fechaLarga } from '../lib/plataforma'

const ESTADOS_PLAN = {
  activa: { texto: 'Activa', icono: 'ti-circle-check', tono: 'activo' },
  demo: { texto: 'Demo', icono: 'ti-flask', tono: 'pendiente' },
  vencida: { texto: 'Vencida', icono: 'ti-alert-triangle', tono: 'vencido' },
}

function Medidor({ etiqueta, usado, limite }) {
  const hay = Number(limite) > 0
  const pct = hay ? Math.min(100, Math.round(Number(usado || 0) / Number(limite) * 100)) : 0
  return <div className="pl-medidor" data-nivel={!hay ? 'sin' : pct >= 100 ? 'lleno' : pct >= 85 ? 'alto' : 'ok'}>
    <div className="pl-medidor__top"><span>{etiqueta}</span><b className="numeric-data">{numero(usado)}{hay ? ` / ${numero(limite)}` : ''}</b></div>
    <div className="pl-medidor__pista" role="meter" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={hay ? Number(limite) : undefined} aria-valuenow={Number(usado || 0)}><span style={{ width: `${pct}%` }} /></div>
  </div>
}

// Planes y Estado comercial. Los planes y límites todavía no existen en la base: en la demostración son valores de ejemplo,
// y con datos reales se muestra el uso actual de cada empresa sin límites definidos.
export default function PlataformaPlanes() {
  const { cargando, demo, empresas, error } = useEmpresas()
  const [filtro, setFiltro] = useState('todos')

  const conteo = useMemo(() => ({
    activa: empresas.filter(e => e.plan?.estado === 'activa').length,
    demo: empresas.filter(e => e.plan?.estado === 'demo').length,
    vencida: empresas.filter(e => e.plan?.estado === 'vencida').length,
  }), [empresas])
  const visibles = empresas.filter(e => filtro === 'todos' || e.plan?.estado === filtro)

  return <div className="pl-page">
    <PlataformaCabecera icono="ti-credit-card" eyebrow="PLANES Y ESTADO COMERCIAL" titulo="Cómo va la suscripción de cada agrícola" sub="Estado de cada plan y cuánto de su límite de bloques, usuarios y campos están usando." />

    {demo ? <AvisoDemo /> : <div className="pl-demo" role="note"><i className="ti ti-info-circle" aria-hidden="true" /><div><b>Los planes todavía no están definidos.</b> Aquí ves el uso actual de cada empresa. Los límites y el estado de la suscripción aparecerán cuando se defina la facturación.</div></div>}
    {error && <div className="ag-feedback ag-feedback-error" role="alert"><i className="ti ti-alert-circle" aria-hidden="true" /><span>{error}</span></div>}

    {demo && <div className="pl-minis">
      <MiniStat icono="ti-circle-check" valor={cargando ? '—' : numero(conteo.activa)} etiqueta="Activas" tono="bloques" />
      <MiniStat icono="ti-flask" valor={cargando ? '—' : numero(conteo.demo)} etiqueta="En demo" tono="alerta" />
      <MiniStat icono="ti-alert-triangle" valor={cargando ? '—' : numero(conteo.vencida)} etiqueta="Vencidas" tono="neutral" />
    </div>}

    {demo && <div className="ab-status-filters pl-filtros" role="group" aria-label="Filtrar por estado del plan">
      {[['todos', 'Todas'], ['activa', 'Activas'], ['demo', 'Demo'], ['vencida', 'Vencidas']].map(([k, v]) => <button type="button" key={k} aria-pressed={filtro === k} className={filtro === k ? 'active' : ''} onClick={() => setFiltro(k)}>{v}</button>)}
    </div>}

    {cargando
      ? <div className="pl-grid" role="status" aria-label="Cargando planes">{[0, 1, 2].map(i => <div className="pl-skeleton" key={i} />)}</div>
      : <div className="pl-grid">{visibles.map(e => {
        const plan = e.plan
        const info = plan ? ESTADOS_PLAN[plan.estado] : null
        return <article className="pl-empresa bl-card pl-plan" key={e.id} data-plan={plan?.estado || 'sin'}>
          <header className="pl-empresa__head">
            <span className="pl-avatar" aria-hidden="true">{String(e.nombre).split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()}</span>
            <div className="pl-empresa__id"><h3 title={e.nombre}>{e.nombre}</h3><small>{plan ? `Plan ${plan.nombre}` : 'Plan sin definir'}</small></div>
            {info ? <span className={`sp-chip sp-chip--${info.tono}`}><i className={`ti ${info.icono}`} aria-hidden="true" />{info.texto}</span> : <span className="sp-chip sp-chip--neutral"><i className="ti ti-help-circle" aria-hidden="true" />Sin definir</span>}
          </header>
          <div className="pl-medidores">
            <Medidor etiqueta="Bloques" usado={e.bloques} limite={plan?.limite_bloques} />
            <Medidor etiqueta="Usuarios" usado={e.usuarios_activos} limite={plan?.limite_usuarios} />
            <Medidor etiqueta="Campos" usado={e.campos} limite={plan?.limite_campos} />
          </div>
          {plan && <p className="pl-empresa__meta"><span><i className="ti ti-calendar-event" aria-hidden="true" />{plan.estado === 'vencida' ? 'Venció el' : plan.estado === 'demo' ? 'La demo termina el' : 'Se renueva el'} {fechaLarga(plan.vence_en)}</span></p>}
        </article>
      })}</div>}
  </div>
}
