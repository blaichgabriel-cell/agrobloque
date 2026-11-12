import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Notice } from '../components/UI'
import { useAhora } from '../components/Soporte'
import { AvisoDemo, numero, useEmpresas } from '../components/PlataformaUI'
import {
  cancelarSolicitud, crearEmpresa, enModoDemo, entrarEmpresaPropia, entrarSoporte, estadoVisible, fechaLarga,
  horaCorta, reenviarInvitacion, solicitarSoporte, textoHace, textoRestante,
} from '../lib/plataforma'

const iniciales = nombre => String(nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
const correoValido = valor => /^[^\s@.][^\s@]*@[^\s@]+\.[^\s@]+$/.test(valor) && !/\.@|\.\./.test(valor)

export const ESTADOS = {
  sin_acceso: { icono: 'ti-lock', texto: 'Sin acceso', tono: 'neutral' },
  pendiente: { icono: 'ti-hourglass-high', texto: 'Esperando al cliente', tono: 'pendiente' },
  aprobado: { icono: 'ti-eye', texto: 'Acceso autorizado (Activo)', tono: 'activo' },
  propia: { icono: 'ti-home-check', texto: 'Empresa propia (demo)', tono: 'activo' },
  vencida: { icono: 'ti-clock-off', texto: 'Acceso vencido', tono: 'neutral' },
  revocada: { icono: 'ti-shield-off', texto: 'Acceso revocado', tono: 'neutral' },
  rechazado: { icono: 'ti-circle-x', texto: 'Solicitud rechazada', tono: 'neutral' },
  cancelado: { icono: 'ti-ban', texto: 'Solicitud cancelada', tono: 'neutral' },
}

function Kpi({ icono, valor, etiqueta, tono }) {
  return <div className="pl-kpi" data-tone={tono}><i className={`ti ${icono}`} aria-hidden="true" /><div><strong className="numeric-data">{valor}</strong><span>{etiqueta}</span></div></div>
}

function TarjetaEmpresa({ empresa, ocupado, onSolicitar, onCancelar, onEntrar, onReenviar }) {
  const lista = empresa.campos_lista || []
  const [abierto, setAbierto] = useState(false)
  const [campo, setCampo] = useState(lista[0]?.nombre || '')
  const estado = estadoVisible(empresa.soporte)
  const info = ESTADOS[estado] || ESTADOS.sin_acceso
  const s = empresa.soporte || {}
  const puedeEntrar = estado === 'aprobado' || estado === 'propia'
  const idLista = `pl-campos-${empresa.id}`

  return <article className="pl-empresa bl-card" data-estado={estado}>
    <header className="pl-empresa__head">
      <span className="pl-avatar" aria-hidden="true">{iniciales(empresa.nombre)}</span>
      <div className="pl-empresa__id"><h3 title={empresa.nombre}>{empresa.nombre}</h3><small title={empresa.admin_email}>{empresa.admin_email || 'Sin administrador'}</small></div>
      <span className={`sp-chip sp-chip--${info.tono}`}><i className={`ti ${info.icono}`} aria-hidden="true" />{info.texto}</span>
    </header>

    <dl className="pl-stats">
      <div><dt>Usuarios</dt><dd className="numeric-data">{numero(empresa.usuarios_activos)}</dd></div>
      <div><dt>Campos</dt><dd className="numeric-data">{numero(empresa.campos)}</dd></div>
      <div><dt>Bloques</dt><dd className="numeric-data">{numero(empresa.bloques)}</dd></div>
    </dl>

    {lista.length > 0 && <>
      <button type="button" className="pl-campos-toggle" aria-expanded={abierto} aria-controls={idLista} onClick={() => setAbierto(v => !v)}>
        <i className="ti ti-chevron-right" aria-hidden="true" />{abierto ? 'Ocultar campos' : `Ver los ${lista.length} campos`}
      </button>
      <div className="pl-campos" id={idLista} data-abierto={abierto}>
        <div>
          <ul>{lista.map(c => <li key={c.id}><i className="ti ti-map-2" aria-hidden="true" /><span>{c.nombre}</span><small className="numeric-data">{numero(c.bloques)} bloques</small></li>)}</ul>
          <p><i className="ti ti-lock" aria-hidden="true" />Solo nombres y cantidades. Los datos del campo se ven únicamente con acceso autorizado.</p>
        </div>
      </div>
    </>}

    <p className="pl-empresa__meta"><span><i className="ti ti-activity" aria-hidden="true" />{textoHace(empresa.ultima_actividad)}</span><span><i className="ti ti-calendar" aria-hidden="true" />Alta {fechaLarga(empresa.creada_en)}</span></p>

    {estado === 'pendiente' && s.motivo && <blockquote className="pl-empresa__motivo">“{s.motivo}”</blockquote>}
    {estado === 'aprobado' && <p className="pl-empresa__vigente"><i className="ti ti-clock" aria-hidden="true" />Hasta las {horaCorta(s.expira_en)} · quedan <b className="numeric-data">{textoRestante(s.expira_en)}</b></p>}

    {puedeEntrar && lista.length > 1 && <label className="pl-campo-select"><span>¿A qué campo quieres entrar?</span>
      <select className="bl-input" value={campo} onChange={e => setCampo(e.target.value)}>{lista.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}</select>
    </label>}

    <div className="pl-empresa__acciones">
      {puedeEntrar && <button type="button" className="bl-btn-solid pl-entrar" disabled={ocupado} onClick={() => onEntrar(empresa, campo)}>Entrar al panel del campo<i className="ti ti-arrow-right" aria-hidden="true" /></button>}
      {estado === 'pendiente' && <button type="button" className="bl-btn bl-btn--ghost" disabled={ocupado} onClick={() => onCancelar(s.acceso_id)}>Cancelar solicitud</button>}
      {!puedeEntrar && estado !== 'pendiente' && <button type="button" className="bl-btn bl-btn--ghost" disabled={ocupado} onClick={() => onSolicitar(empresa)}><i className="ti ti-key" aria-hidden="true" />Solicitar acceso</button>}
      {empresa.admin_email && <button type="button" className="bl-icon-btn" disabled={ocupado} aria-label={`Reenviar la invitación a ${empresa.admin_email}`} title="Reenviar invitación (crear contraseña)" onClick={() => onReenviar(empresa)}><i className="ti ti-mail-forward" aria-hidden="true" /></button>}
    </div>
  </article>
}

// Empresas y Campos: vista principal del Modo Plataforma.
export default function Plataforma() {
  const navigate = useNavigate()
  const { cargando, demo, empresas, error: errorCarga, recargar } = useEmpresas()
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [solicitando, setSolicitando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [creando, setCreando] = useState(false)
  const [formEmpresa, setFormEmpresa] = useState({ nombre: '', correo: '' })
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  useAhora()

  const resumen = useMemo(() => ({
    empresas: empresas.length,
    usuarios: empresas.reduce((s, e) => s + Number(e.usuarios_activos || 0), 0),
    campos: empresas.reduce((s, e) => s + Number(e.campos || 0), 0),
    bloques: empresas.reduce((s, e) => s + Number(e.bloques || 0), 0),
    activos: empresas.filter(e => ['aprobado', 'propia'].includes(estadoVisible(e.soporte))).length,
  }), [empresas])

  const visibles = useMemo(() => empresas.filter(e => {
    const texto = `${e.nombre} ${e.admin_email || ''}`.toLowerCase()
    const estado = estadoVisible(e.soporte)
    return texto.includes(busqueda.trim().toLowerCase()) && (filtro === 'todas' || (filtro === 'activos' && ['aprobado', 'propia'].includes(estado)) || (filtro === 'pendientes' && estado === 'pendiente'))
  }), [empresas, busqueda, filtro])

  const ejecutar = async (accion, mensaje) => {
    setOcupado(true); setError(''); setAviso('')
    try { const r = await accion(); if (mensaje) setAviso(mensaje); return r } catch (e) { setError(e.message || 'No se pudo completar la acción.') } finally { setOcupado(false) }
    return undefined
  }

  const enviarSolicitud = async () => {
    const ok = await ejecutar(async () => { await solicitarSoporte(solicitando.id, motivo); return true }, `Solicitud enviada a ${solicitando.nombre}. Te avisaremos cuando su administrador responda.`)
    if (ok) { setSolicitando(null); setMotivo(''); if (!enModoDemo()) recargar() }
  }
  const cancelar = async id => { await ejecutar(() => cancelarSolicitud(id), 'Solicitud cancelada.'); if (!enModoDemo()) recargar() }
  const entrar = async (empresa, campo) => {
    const s = empresa.soporte || {}
    const ok = await ejecutar(async () => { if (s.estado === 'propia') await entrarEmpresaPropia(empresa.id, campo); else await entrarSoporte(s.acceso_id, campo); return true })
    if (!ok) return
    if (enModoDemo()) navigate('/')
    else window.location.assign('/')
  }
  const reenviarA = async empresaOCorreo => {
    const correo = typeof empresaOCorreo === 'string' ? empresaOCorreo : empresaOCorreo.admin_email
    const ok = await ejecutar(async () => { await reenviarInvitacion(correo); return true }, `Enviamos un enlace nuevo a ${correo}. Debe abrirlo una sola vez y crear su contraseña.`)
    if (ok && creando) setCreando(false)
  }
  const crear = async () => {
    const nombre = formEmpresa.nombre.trim(), correo = formEmpresa.correo.trim().toLowerCase()
    if (nombre.length < 2) { setError('Escribe el nombre de la empresa.'); return }
    if (!correoValido(correo)) { setError('Escribe un correo válido para el dueño (sin punto antes de la @).'); return }
    const r = await ejecutar(() => crearEmpresa(nombre, correo))
    if (!r) return
    setAviso(r.correo_enviado === false ? 'Empresa creada, pero no se pudo enviar el correo de invitación. Reenvíalo desde la tarjeta de la empresa.' : `Empresa creada. Enviamos la invitación a ${correo}.`)
    setCreando(false); setFormEmpresa({ nombre: '', correo: '' }); recargar()
  }

  return <div className="pl-page">
    <header className="pl-hero">
      <div className="pl-hero__top">
        <div>
          <span className="pl-eyebrow"><i className="ti ti-building-community" aria-hidden="true" />PANEL DE PLATAFORMA</span>
          <h1>Todas tus empresas, <span>sin ver sus datos.</span></h1>
          <p>Ves quién usa AgroBloque y cómo va cada empresa. Para entrar a los datos de un cliente necesitas que su administrador lo autorice, y queda registrado.</p>
        </div>
        <button type="button" className="pl-hero__nuevo" onClick={() => { setError(''); setAviso(''); setCreando(true) }}><i className="ti ti-circle-plus" aria-hidden="true" />Nueva empresa</button>
      </div>
      <div className="pl-kpis" aria-busy={cargando}>
        <Kpi icono="ti-building" valor={cargando ? '—' : numero(resumen.empresas)} etiqueta="Empresas" tono="bloques" />
        <Kpi icono="ti-users" valor={cargando ? '—' : numero(resumen.usuarios)} etiqueta="Usuarios activos" tono="agua" />
        <Kpi icono="ti-map-2" valor={cargando ? '—' : numero(resumen.campos)} etiqueta="Campos" tono="bloques" />
        <Kpi icono="ti-layout-grid" valor={cargando ? '—' : numero(resumen.bloques)} etiqueta="Bloques" tono="agua" />
        <Kpi icono="ti-shield-check" valor={cargando ? '—' : numero(resumen.activos)} etiqueta="Con acceso autorizado" tono="alerta" />
      </div>
    </header>

    {demo && <AvisoDemo />}
    <Notice tone="error">{error || errorCarga}</Notice>
    <Notice>{aviso}</Notice>

    <section className="pl-toolbar">
      <label className="ab-block-search"><i className="ti ti-search" aria-hidden="true" /><input aria-label="Buscar empresa" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar empresa o correo…" /></label>
      <div className="ab-status-filters" role="group" aria-label="Filtrar empresas">
        {[['todas', 'Todas'], ['activos', 'Con acceso autorizado'], ['pendientes', 'Solicitudes pendientes']].map(([k, v]) => <button type="button" key={k} aria-pressed={filtro === k} className={filtro === k ? 'active' : ''} onClick={() => setFiltro(k)}>{v}</button>)}
      </div>
    </section>

    {cargando
      ? <div className="pl-grid" role="status" aria-label="Cargando empresas">{[0, 1, 2].map(i => <div className="pl-skeleton" key={i} />)}</div>
      : !visibles.length ? <div className="ab-empty">No hay empresas que coincidan.</div>
        : <div className="pl-grid">{visibles.map(e => <TarjetaEmpresa key={e.id} empresa={e} ocupado={ocupado}
          onSolicitar={emp => { setError(''); setMotivo(''); setSolicitando(emp) }} onCancelar={cancelar} onEntrar={entrar} onReenviar={reenviarA} />)}</div>}

    {solicitando && <Modal label={`Solicitar acceso a ${solicitando.nombre}`} busy={ocupado} className="bl-overlay" onClose={() => setSolicitando(null)} onClick={e => e.target === e.currentTarget && !ocupado && setSolicitando(null)}>
      <div className="bl-sheet pl-sheet">
        <h2>Solicitar acceso de soporte</h2>
        <p className="pl-sheet__sub">{solicitando.nombre}</p>
        <label className="bl-label" htmlFor="pl-motivo">¿Para qué necesitas entrar?</label>
        <textarea id="pl-motivo" className="bl-input pl-motivo" rows="3" maxLength="1000" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Ayudar a cargar las cosechas de la semana." />
        <ul className="pl-sheet__reglas">
          <li><i className="ti ti-eye" aria-hidden="true" />Solo lectura: no podrás cambiar nada.</li>
          <li><i className="ti ti-clock-hour-4" aria-hidden="true" />El cliente elige cuánto dura (hasta 72 horas).</li>
          <li><i className="ti ti-list-details" aria-hidden="true" />El motivo y todos tus movimientos quedan en su historial.</li>
        </ul>
        <Notice tone="error">{error}</Notice>
        <button type="button" className="bl-btn bl-btn--primary" disabled={ocupado || motivo.trim().length < 5} onClick={enviarSolicitud}>{ocupado ? 'Enviando…' : 'Enviar solicitud'}</button>
        <button type="button" className="bl-btn bl-btn--ghost" disabled={ocupado} onClick={() => setSolicitando(null)}>Cancelar</button>
      </div>
    </Modal>}

    {creando && <Modal label="Nueva empresa" busy={ocupado} className="bl-overlay" onClose={() => setCreando(false)} onClick={e => e.target === e.currentTarget && !ocupado && setCreando(false)}>
      <div className="bl-sheet pl-sheet">
        <h2>Nueva empresa cliente</h2>
        <p className="pl-sheet__sub">Crea un espacio aislado y envía al dueño un correo para definir su contraseña.</p>
        <label className="bl-label" htmlFor="pl-nombre">Nombre comercial</label>
        <input id="pl-nombre" className="bl-input" maxLength="100" value={formEmpresa.nombre} onChange={e => setFormEmpresa(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Horticultura San José" />
        <label className="bl-label" htmlFor="pl-correo">Correo del dueño</label>
        <input id="pl-correo" className="bl-input" type="email" value={formEmpresa.correo} onChange={e => setFormEmpresa(f => ({ ...f, correo: e.target.value }))} placeholder="dueno@empresa.com" />
        <ul className="pl-sheet__reglas">
          <li><i className="ti ti-shield-lock" aria-hidden="true" />La empresa no podrá ver datos de otros clientes.</li>
          <li><i className="ti ti-mail" aria-hidden="true" />Un correo pertenece a una sola empresa.</li>
        </ul>
        <Notice tone="error">{error}</Notice>
        {/pertenece/i.test(error) && correoValido(formEmpresa.correo.trim().toLowerCase()) && <button type="button" className="bl-btn bl-btn--ghost" disabled={ocupado} onClick={() => reenviarA(formEmpresa.correo.trim().toLowerCase())}><i className="ti ti-mail-forward" aria-hidden="true" />Reenviar el enlace a este correo</button>}
        <button type="button" className="bl-btn bl-btn--primary" disabled={ocupado} onClick={crear}>{ocupado ? 'Creando…' : 'Crear empresa y enviar invitación'}</button>
        <button type="button" className="bl-btn bl-btn--ghost" disabled={ocupado} onClick={() => setCreando(false)}>Cerrar</button>
      </div>
    </Modal>}
  </div>
}
