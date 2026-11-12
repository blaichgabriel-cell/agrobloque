import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Notice } from '../components/UI'
import { SoporteCliente, useAhora } from '../components/Soporte'
import { AvisoDemo, MiniStat, PlataformaCabecera, numero, useEmpresas } from '../components/PlataformaUI'
import {
  apiClienteDemo, cancelarSolicitud, enModoDemo, entrarSoporte, estadoVisible, fechaHora, historialPlataforma,
  horaCorta, solicitarSoporte, suscribirPlataforma, textoHace, textoRestante,
} from '../lib/plataforma'

const EVENTOS = {
  solicitada: { icono: 'ti-send', texto: 'Solicitaste acceso', tono: 'neutral' },
  cancelada: { icono: 'ti-ban', texto: 'Cancelaste la solicitud', tono: 'neutral' },
  aprobada: { icono: 'ti-circle-check', texto: 'El cliente aprobó el acceso', tono: 'ok' },
  rechazada: { icono: 'ti-circle-x', texto: 'El cliente rechazó la solicitud', tono: 'neutral' },
  inicio: { icono: 'ti-login-2', texto: 'Entraste en modo soporte', tono: 'alerta' },
  fin: { icono: 'ti-logout-2', texto: 'Saliste del modo soporte', tono: 'neutral' },
  revocada: { icono: 'ti-shield-off', texto: 'El cliente revocó el acceso', tono: 'alerta' },
  vencida: { icono: 'ti-clock-off', texto: 'El acceso venció', tono: 'neutral' },
}

const MOTIVO_PRUEBA = 'Prueba del flujo de soporte (solicitud simulada).'

function Simulador({ empresas }) {
  const [empresaId, setEmpresaId] = useState('')
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useAhora()
  useEffect(() => { if (!empresaId && empresas.length) setEmpresaId((empresas.find(e => e.soporte?.estado === 'pendiente') || empresas.find(e => e.soporte?.estado !== 'propia') || empresas[0]).id) }, [empresas, empresaId])
  const empresa = empresas.find(e => e.id === empresaId)
  const estado = empresa ? estadoVisible(empresa.soporte) : ''
  const pendiente = estado === 'pendiente'

  const simular = async () => {
    setOcupado(true); setError(''); setAviso('')
    try { await solicitarSoporte(empresaId, MOTIVO_PRUEBA); setAviso('Solicitud enviada. Mira cómo le llega al administrador del cliente.') }
    catch (e) { setError(e.message) }
    setOcupado(false)
  }

  return <section className="pl-cliente">
    <div className="pl-cliente__head">
      <p>Prueba el recorrido completo como si fueras las dos partes: <b>envía una solicitud</b>, mira cómo le llega al administrador del cliente, <b>apruébala</b> con la duración que quieras y luego entra al campo desde <b>Empresas y Campos</b>.</p>
      <label className="pl-cliente__selector">Ver como administrador de
        <select className="bl-input" value={empresaId} onChange={e => { setEmpresaId(e.target.value); setAviso(''); setError('') }}>{empresas.filter(e => e.soporte?.estado !== 'propia').map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select>
      </label>
    </div>
    <Notice tone="error">{error}</Notice>
    <Notice>{aviso}</Notice>

    <div className="sim-marco" aria-label="Simulación de la pantalla del cliente">
      <div className="sim-barra"><span className="sim-puntos" aria-hidden="true"><i /><i /><i /></span><b>Vista del administrador · {empresa?.nombre}</b>
        {!['pendiente', 'aprobado'].includes(estado) && <button type="button" className="sim-lanzar" disabled={ocupado} onClick={simular}><i className="ti ti-bell-plus" aria-hidden="true" />Simular solicitud entrante</button>}
      </div>
      <div className="sim-cuerpo">
        {pendiente && <div className="sim-notif" role="status" key={empresa?.soporte?.acceso_id}>
          <span className="sim-notif__icono" aria-hidden="true"><i className="ti ti-bell-ringing" /></span>
          <div><b>Soporte de AgroBloque pide acceso</b><span>“{empresa?.soporte?.motivo}”</span></div>
          <small>Ahora</small>
        </div>}
        {empresaId && <SoporteCliente key={empresaId} demo api={apiClienteDemo(empresaId)} />}
      </div>
    </div>
  </section>
}

// Accesos de Soporte: solicitudes enviadas, accesos activos con cuenta regresiva y registro de auditoría.
export default function PlataformaSoporte() {
  const navigate = useNavigate()
  const { cargando, demo, empresas, error: errorCarga, recargar } = useEmpresas()
  const [vista, setVista] = useState('resumen')
  const [historial, setHistorial] = useState([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useAhora()

  const cargarHistorial = useCallback(async () => {
    try { setHistorial(await historialPlataforma()) } catch (e) { setHistorial([]); setError(e.message || 'No se pudo cargar el historial de soporte.') }
  }, [])
  useEffect(() => { cargarHistorial() }, [cargarHistorial, demo])
  useEffect(() => suscribirPlataforma(cargarHistorial), [cargarHistorial])

  const grupos = useMemo(() => {
    const por = estado => empresas.filter(e => estadoVisible(e.soporte) === estado)
    return { activos: por('aprobado'), pendientes: por('pendiente'), vencidos: empresas.filter(e => ['vencida', 'revocada'].includes(estadoVisible(e.soporte))) }
  }, [empresas])

  const accion = async (fn, mensaje) => {
    setOcupado(true); setError(''); setAviso('')
    try { const r = await fn(); if (mensaje) setAviso(mensaje); return r } catch (e) { setError(e.message || 'No se pudo completar la acción.') } finally { setOcupado(false) }
    return undefined
  }
  const entrar = async empresa => {
    const s = empresa.soporte
    const ok = await accion(async () => { await entrarSoporte(s.acceso_id, empresa.campos_lista?.[0]?.nombre || ''); return true })
    if (!ok) return
    if (enModoDemo()) navigate('/'); else window.location.assign('/')
  }
  const cancelar = async empresa => { await accion(() => cancelarSolicitud(empresa.soporte.acceso_id), 'Solicitud cancelada.'); if (!enModoDemo()) recargar() }

  return <div className="pl-page">
    <PlataformaCabecera icono="ti-shield-check" eyebrow="ACCESOS DE SOPORTE" titulo="Quién puede ver qué, y por cuánto tiempo" sub="Solo entras a los datos de un cliente si su administrador lo autoriza. Todo acceso es de solo lectura, vence solo y queda registrado." />

    {demo && <AvisoDemo />}
    <Notice tone="error">{error || errorCarga}</Notice>
    <Notice>{aviso}</Notice>

    <div className="pl-tabs" role="tablist" aria-label="Secciones de accesos de soporte">
      <button type="button" role="tab" aria-selected={vista === 'resumen'} className={vista === 'resumen' ? 'active' : ''} onClick={() => setVista('resumen')}><i className="ti ti-list-details" aria-hidden="true" />Resumen</button>
      {demo && <button type="button" role="tab" aria-selected={vista === 'simulador'} className={vista === 'simulador' ? 'active' : ''} onClick={() => setVista('simulador')}><i className="ti ti-user-shield" aria-hidden="true" />Simulador del cliente</button>}
    </div>

    {vista === 'simulador' && demo && <Simulador empresas={empresas} />}

    {vista === 'resumen' && <>
      <div className="pl-minis">
        <MiniStat icono="ti-eye" valor={cargando ? '—' : numero(grupos.activos.length)} etiqueta="Accesos activos" tono="bloques" />
        <MiniStat icono="ti-hourglass-high" valor={cargando ? '—' : numero(grupos.pendientes.length)} etiqueta="Solicitudes pendientes" tono="alerta" />
        <MiniStat icono="ti-clock-off" valor={cargando ? '—' : numero(grupos.vencidos.length)} etiqueta="Vencidos o revocados" tono="neutral" />
      </div>

      <section className="pl-bloque" aria-labelledby="pl-activos">
        <h2 id="pl-activos"><i className="ti ti-eye" aria-hidden="true" />Accesos activos</h2>
        {grupos.activos.length ? <ul className="pl-filas">{grupos.activos.map(e => <li key={e.id}>
          <span className="pl-avatar pl-avatar--chico" aria-hidden="true">{String(e.nombre).split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()}</span>
          <div><b>{e.nombre}</b><span>Hasta las {horaCorta(e.soporte.expira_en)} · quedan <b className="numeric-data">{textoRestante(e.soporte.expira_en)}</b></span></div>
          <button type="button" className="bl-btn-solid" disabled={ocupado} onClick={() => entrar(e)}>Entrar al panel del campo<i className="ti ti-arrow-right" aria-hidden="true" /></button>
        </li>)}</ul> : <p className="pl-vacio-texto">Ninguna empresa te ha autorizado entrar por ahora.</p>}
      </section>

      <section className="pl-bloque" aria-labelledby="pl-pendientes">
        <h2 id="pl-pendientes"><i className="ti ti-hourglass-high" aria-hidden="true" />Solicitudes enviadas</h2>
        {grupos.pendientes.length ? <ul className="pl-filas">{grupos.pendientes.map(e => <li key={e.id}>
          <span className="pl-avatar pl-avatar--chico" aria-hidden="true">{String(e.nombre).split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()}</span>
          <div><b>{e.nombre}</b><span>“{e.soporte.motivo}” · {textoHace(e.soporte.solicitado_en)}</span></div>
          <button type="button" className="bl-btn bl-btn--ghost" disabled={ocupado} onClick={() => cancelar(e)}>Cancelar solicitud</button>
        </li>)}</ul> : <p className="pl-vacio-texto">No tienes solicitudes esperando respuesta.</p>}
      </section>

      <section className="pl-bloque" aria-labelledby="pl-historial">
        <h2 id="pl-historial"><i className="ti ti-history" aria-hidden="true" />Registro de auditoría</h2>
        {historial.length
          ? <ol className="sp-historial">{historial.map(h => { const ev = EVENTOS[h.evento] || EVENTOS.fin; return <li key={h.id} data-tono={ev.tono}><span className="sp-historial__icono" aria-hidden="true"><i className={`ti ${ev.icono}`} /></span><div><b>{ev.texto}{h.evento === 'aprobada' && h.detalle?.horas ? ` por ${h.detalle.horas} h` : ''}{h.empresa ? ` · ${h.empresa}` : ''}</b>{h.motivo ? <span>“{h.motivo}”</span> : null}</div><time dateTime={h.ocurrido_en}>{fechaHora(h.ocurrido_en)}</time></li> })}</ol>
          : <p className="pl-vacio-texto">{demo ? 'Todavía no hay movimientos.' : 'El historial completo de tus accesos aparecerá aquí cuando la base lo entregue. Mientras tanto, cada cliente ve el suyo en Configuración.'}</p>}
      </section>

      <section className="pl-como" aria-label="Cómo funciona el acceso de soporte">
        <h2><i className="ti ti-shield-lock" aria-hidden="true" />Cómo funciona el acceso de soporte</h2>
        <ol>
          <li><span>1</span><div><b>Pides acceso</b><small>Indicas el motivo. Al cliente le llega la solicitud.</small></div></li>
          <li><span>2</span><div><b>El cliente decide</b><small>Aprueba por 1, 4, 24 o 72 horas, o la rechaza.</small></div></li>
          <li><span>3</span><div><b>Entras en solo lectura</b><small>Ves lo mismo que su administrador, sin poder cambiar nada.</small></div></li>
          <li><span>4</span><div><b>Termina solo</b><small>Vence a la hora acordada o cuando el cliente lo revoca. Todo queda en su historial.</small></div></li>
        </ol>
      </section>
    </>}
  </div>
}
