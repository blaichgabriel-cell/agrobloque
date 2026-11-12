import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Notice } from './UI'
import {
  apiCliente, contextoSoporte, enModoDemo, salirSoporte, suscribirPlataforma,
  fechaHora, horaCorta, textoHace, textoRestante,
} from '../lib/plataforma'

// Reloj para cuentas regresivas: se actualiza cada medio minuto.
export function useAhora(ms = 30000) {
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return ahora
}

const EVENTOS = {
  solicitada: { icono: 'ti-send', texto: 'Solicitó acceso de soporte', tono: 'neutral' },
  cancelada: { icono: 'ti-ban', texto: 'Canceló su solicitud', tono: 'neutral' },
  aprobada: { icono: 'ti-circle-check', texto: 'Se aprobó el acceso', tono: 'ok' },
  rechazada: { icono: 'ti-circle-x', texto: 'Se rechazó la solicitud', tono: 'neutral' },
  inicio: { icono: 'ti-login-2', texto: 'Entró en modo soporte', tono: 'alerta' },
  fin: { icono: 'ti-logout-2', texto: 'Salió del modo soporte', tono: 'neutral' },
  revocada: { icono: 'ti-shield-off', texto: 'Se revocó el acceso', tono: 'alerta' },
  vencida: { icono: 'ti-clock-off', texto: 'El acceso venció', tono: 'neutral' },
}

const DURACIONES = [[1, '1 hora'], [4, '4 horas'], [24, '24 horas'], [72, '72 horas']]

// Sección del administrador de la empresa cliente: aprobar o rechazar solicitudes, revocar accesos y ver el historial.
// `api` es apiCliente (base real) o apiClienteDemo(id) en la vista de demostración.
export function SoporteCliente({ api = apiCliente, demo = false }) {
  const [estado, setEstado] = useState(null)
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(true)
  const [horas, setHoras] = useState({})
  const [confirmando, setConfirmando] = useState('')
  const [verHistorial, setVerHistorial] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useAhora()

  const cargar = useCallback(async () => {
    const [e, h] = await Promise.all([api.estado(), api.historial()])
    setEstado(e); setHistorial(h); setCargando(false)
  }, [api])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => suscribirPlataforma(cargar), [cargar])

  const ejecutar = async (accion, mensaje) => {
    setOcupado(true); setError(''); setAviso('')
    try { await accion(); setAviso(mensaje); setConfirmando(''); await cargar() }
    catch (e) { setError(e.message || 'No se pudo completar la acción.') }
    setOcupado(false)
  }

  // Sin las funciones de la base (cliente real todavía sin el SQL), la sección no aparece.
  if (!cargando && !estado) return null
  if (cargando) return null
  const pendientes = estado.pendientes || []
  const vigentes = estado.vigentes || []

  return <section className="sp-card bl-card" aria-labelledby="sp-titulo" data-tone="alerta">
    <header className="sp-head">
      <span className="sp-icon" aria-hidden="true"><i className="ti ti-shield-check" /></span>
      <div>
        <h2 id="sp-titulo">Soporte de AgroBloque</h2>
        <p>Tú decides cuándo el equipo puede mirar tus datos. El acceso es siempre de <b>solo lectura</b>, dura el tiempo que elijas y queda registrado.</p>
      </div>
      {demo && <span className="sp-demo">Demostración</span>}
    </header>

    <Notice tone="error">{error}</Notice>
    <Notice>{aviso}</Notice>

    {pendientes.map(p => <article className="sp-solicitud" key={p.id}>
      <div className="sp-solicitud__top">
        <span className="sp-chip sp-chip--pendiente"><i className="ti ti-bell-ringing" aria-hidden="true" />Solicitud pendiente</span>
        <small>{textoHace(p.solicitado_en)}</small>
      </div>
      <p className="sp-solicitud__quien"><b>{p.solicitante || 'Soporte AgroBloque'}</b> pide entrar a tu espacio en modo solo lectura.</p>
      <blockquote>“{p.motivo}”</blockquote>
      <div className="sp-duracion" role="group" aria-label="Duración del acceso">
        <span>¿Por cuánto tiempo?</span>
        <div>{DURACIONES.map(([h, texto]) => <button type="button" key={h} aria-pressed={(horas[p.id] || 1) === h} className={(horas[p.id] || 1) === h ? 'active' : ''} onClick={() => setHoras(x => ({ ...x, [p.id]: h }))}>{texto}</button>)}</div>
      </div>
      <div className="sp-acciones">
        <button type="button" className="bl-btn bl-btn--primary" disabled={ocupado} onClick={() => ejecutar(() => api.responder(p.id, true, horas[p.id] || 1), 'Acceso aprobado. Puedes revocarlo cuando quieras.')}><i className="ti ti-check" aria-hidden="true" />Aprobar acceso</button>
        <button type="button" className="bl-btn bl-btn--ghost" disabled={ocupado} onClick={() => ejecutar(() => api.responder(p.id, false, 1), 'Solicitud rechazada.')}>Rechazar</button>
      </div>
    </article>)}

    {vigentes.map(v => <article className="sp-solicitud sp-solicitud--activo" key={v.id}>
      <div className="sp-solicitud__top">
        <span className="sp-chip sp-chip--activo"><i className="ti ti-eye" aria-hidden="true" />Acceso activo</span>
        <small>hasta las {horaCorta(v.expira_en)} · quedan {textoRestante(v.expira_en)}</small>
      </div>
      {v.motivo && <blockquote>“{v.motivo}”</blockquote>}
      <div className="sp-acciones">
        {confirmando === v.id
          ? <><button type="button" className="bl-btn bl-btn--danger" disabled={ocupado} onClick={() => ejecutar(() => api.revocar(v.id), 'Acceso revocado. Ya no pueden ver tus datos.')}>Sí, revocar ahora</button><button type="button" className="bl-btn bl-btn--ghost" onClick={() => setConfirmando('')}>Mantener</button></>
          : <button type="button" className="bl-btn bl-btn--danger" onClick={() => setConfirmando(v.id)}><i className="ti ti-shield-off" aria-hidden="true" />Revocar acceso</button>}
      </div>
    </article>)}

    {!pendientes.length && !vigentes.length && <div className="sp-vacio"><i className="ti ti-lock" aria-hidden="true" /><div><b>Nadie tiene acceso en este momento.</b><span>Si el equipo de AgroBloque necesita ayudarte, te llegará la solicitud aquí.</span></div></div>}

    <button type="button" className="sp-historial-toggle" aria-expanded={verHistorial} onClick={() => setVerHistorial(v => !v)}>
      <i className={`ti ${verHistorial ? 'ti-chevron-up' : 'ti-history'}`} aria-hidden="true" />{verHistorial ? 'Ocultar historial' : 'Ver historial de soporte'}
    </button>
    {verHistorial && (historial.length
      ? <ol className="sp-historial">{historial.map(h => { const ev = EVENTOS[h.evento] || EVENTOS.fin; return <li key={h.id} data-tono={ev.tono}><span className="sp-historial__icono" aria-hidden="true"><i className={`ti ${ev.icono}`} /></span><div><b>{ev.texto}{h.evento === 'aprobada' && h.detalle?.horas ? ` por ${h.detalle.horas} h` : ''}</b>{h.motivo ? <span>“{h.motivo}”</span> : null}</div><time dateTime={h.ocurrido_en}>{fechaHora(h.ocurrido_en)}</time></li> })}</ol>
      : <p className="sp-vacio-texto">Todavía no hay movimientos de soporte.</p>)}
  </section>
}

// Contexto de inmersión: ¿el administrador general está dentro de una empresa (soporte o demostración)?
// Con `habilitado` en falso (usuarios normales) devuelve siempre "no activo" sin consultar nada.
export function useContextoSoporte(habilitado) {
  const [estado, setEstado] = useState({ cargando: Boolean(habilitado), activo: false })
  const cargar = useCallback(async () => {
    if (!habilitado) { setEstado({ cargando: false, activo: false }); return }
    const c = await contextoSoporte()
    setEstado({ cargando: false, ...c })
  }, [habilitado])
  useEffect(() => {
    cargar()
    const off = suscribirPlataforma(cargar)
    const t = setInterval(cargar, 60000)
    return () => { off(); clearInterval(t) }
  }, [cargar])
  return estado
}

// Salir del modo soporte y volver al Panel AgroBloque (nivel global de plataforma).
export function useVolverAlPanel() {
  const navigate = useNavigate()
  const [ocupado, setOcupado] = useState(false)
  const volver = useCallback(async () => {
    setOcupado(true)
    try { await salirSoporte() } catch (e) { /* si ya no hay sesión de soporte, igual se vuelve */ }
    setOcupado(false)
    if (enModoDemo()) navigate('/plataforma')
    else window.location.assign('/plataforma')
  }, [navigate])
  return { volver, ocupado }
}

// Cápsula flotante del administrador general dentro de una empresa, y aviso para los usuarios de una empresa con soporte activo.
export function SoporteBarras({ esAdminGeneral = false, contexto = { activo: false }, campoNombre = '' }) {
  const [banner, setBanner] = useState({ activo: false })
  const [ocupado, setOcupado] = useState(false)
  const { volver, ocupado: saliendo } = useVolverAlPanel()
  useAhora()

  const cargarBanner = useCallback(async () => { if (!esAdminGeneral) setBanner(await apiCliente.banner()) }, [esAdminGeneral])
  useEffect(() => {
    cargarBanner()
    const t = setInterval(cargarBanner, 60000)
    const off = suscribirPlataforma(cargarBanner)
    return () => { clearInterval(t); off() }
  }, [cargarBanner])

  const revocar = async () => { setOcupado(true); try { await apiCliente.revocar(banner.acceso_id) } catch (e) { /* se vuelve a consultar */ } await cargarBanner(); setOcupado(false) }

  if (esAdminGeneral && contexto.activo) {
    const campo = contexto.campo_nombre || campoNombre
    return <div className="sp-capsula" role="status" aria-live="polite">
      <span className="sp-capsula__punto" aria-hidden="true" />
      <div className="sp-capsula__texto">
        <b title={`${contexto.organizacion_nombre || ''}${campo ? ' · ' + campo : ''}`}>{contexto.propia ? 'Modo demostración:' : 'Modo Soporte Activo:'} {contexto.organizacion_nombre}{campo ? ` · ${campo}` : ''}</b>
        <span>{contexto.propia ? 'Empresa propia de ejemplo' : <>Solo lectura{contexto.expira_en ? <> · quedan <b className="numeric-data">{textoRestante(contexto.expira_en)}</b></> : null}</>}</span>
      </div>
      <button type="button" className="sp-capsula__volver" onClick={volver} disabled={saliendo}><i className="ti ti-arrow-left" aria-hidden="true" /><span className="sp-largo">Volver al Panel AgroBloque</span><span className="sp-corto">Panel</span></button>
    </div>
  }
  if (!esAdminGeneral && banner.activo) {
    return <div className="sp-barra sp-barra--cliente" role="status">
      <i className="ti ti-shield-check" aria-hidden="true" />
      <div><b>Soporte de AgroBloque tiene acceso de solo lectura</b><span>hasta las {horaCorta(banner.expira_en)} · quedan <b className="numeric-data">{textoRestante(banner.expira_en)}</b></span></div>
      {banner.puede_revocar && <button type="button" onClick={revocar} disabled={ocupado}>Revocar</button>}
    </div>
  }
  return null
}
