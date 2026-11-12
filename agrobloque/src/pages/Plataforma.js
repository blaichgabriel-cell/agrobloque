import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Notice } from '../components/UI'
import { SoporteCliente, useAhora } from '../components/Soporte'
import {
  apiClienteDemo, cancelarSolicitud, contextoSoporte, crearEmpresa, enModoDemo, entrarSoporte, fechaLarga,
  horaCorta, listarEmpresas, salirSoporte, solicitarSoporte, suscribirPlataforma, textoHace, textoRestante,
} from '../lib/plataforma'

const numero = valor => Number(valor || 0).toLocaleString('es-PY')
const iniciales = nombre => String(nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
const correoValido = valor => /^[^\s@.][^\s@]*@[^\s@]+\.[^\s@]+$/.test(valor) && !/\.@|\.\./.test(valor)

// El estado "aprobado" que ya pasó su hora se muestra como vencido (la base lo calcula igual).
const estadoVisible = soporte => {
  const s = soporte || { estado: 'sin_acceso' }
  if (s.estado === 'aprobado' && s.expira_en && new Date(s.expira_en) <= new Date()) return 'vencida'
  return s.estado || 'sin_acceso'
}

const ESTADOS = {
  sin_acceso: { icono: 'ti-lock', texto: 'Sin acceso', tono: 'neutral' },
  pendiente: { icono: 'ti-hourglass-high', texto: 'Esperando al cliente', tono: 'pendiente' },
  aprobado: { icono: 'ti-eye', texto: 'Acceso activo', tono: 'activo' },
  vencida: { icono: 'ti-clock-off', texto: 'Acceso vencido', tono: 'neutral' },
  revocada: { icono: 'ti-shield-off', texto: 'Acceso revocado', tono: 'neutral' },
  rechazado: { icono: 'ti-circle-x', texto: 'Solicitud rechazada', tono: 'neutral' },
  cancelado: { icono: 'ti-ban', texto: 'Solicitud cancelada', tono: 'neutral' },
}

function Kpi({ icono, valor, etiqueta, tono }) {
  return <div className="pl-kpi" data-tone={tono}><i className={`ti ${icono}`} aria-hidden="true" /><div><strong className="numeric-data">{valor}</strong><span>{etiqueta}</span></div></div>
}

function TarjetaEmpresa({ empresa, adentro, ocupado, onSolicitar, onCancelar, onEntrar, onSalir }) {
  const estado = estadoVisible(empresa.soporte)
  const info = ESTADOS[estado] || ESTADOS.sin_acceso
  const s = empresa.soporte || {}
  return <article className="pl-empresa bl-card" data-estado={estado} data-adentro={adentro || undefined}>
    <header className="pl-empresa__head">
      <span className="pl-avatar" aria-hidden="true">{iniciales(empresa.nombre)}</span>
      <div className="pl-empresa__id"><h3 title={empresa.nombre}>{empresa.nombre}</h3><small title={empresa.admin_email}>{empresa.admin_email || 'Sin administrador'}</small></div>
      <span className={`sp-chip sp-chip--${info.tono}`}><i className={`ti ${info.icono}`} aria-hidden="true" />{adentro ? 'Estás dentro' : info.texto}</span>
    </header>

    <dl className="pl-stats">
      <div><dt>Usuarios</dt><dd className="numeric-data">{numero(empresa.usuarios_activos)}</dd></div>
      <div><dt>Campos</dt><dd className="numeric-data">{numero(empresa.campos)}</dd></div>
      <div><dt>Bloques</dt><dd className="numeric-data">{numero(empresa.bloques)}</dd></div>
    </dl>

    <p className="pl-empresa__meta"><span><i className="ti ti-activity" aria-hidden="true" />{textoHace(empresa.ultima_actividad)}</span><span><i className="ti ti-calendar" aria-hidden="true" />Alta {fechaLarga(empresa.creada_en)}</span></p>

    {estado === 'pendiente' && s.motivo && <blockquote className="pl-empresa__motivo">“{s.motivo}”</blockquote>}
    {estado === 'aprobado' && <p className="pl-empresa__vigente"><i className="ti ti-clock" aria-hidden="true" />Hasta las {horaCorta(s.expira_en)} · quedan <b className="numeric-data">{textoRestante(s.expira_en)}</b></p>}

    <div className="pl-empresa__acciones">
      {estado === 'aprobado' && (adentro
        ? <button type="button" className="bl-btn bl-btn--ghost" disabled={ocupado} onClick={onSalir}><i className="ti ti-logout-2" aria-hidden="true" />Salir del modo soporte</button>
        : <button type="button" className="bl-btn-solid pl-entrar" disabled={ocupado} onClick={() => onEntrar(s.acceso_id)}><i className="ti ti-eye-shield" aria-hidden="true" />Entrar como soporte</button>)}
      {estado === 'pendiente' && <button type="button" className="bl-btn bl-btn--ghost" disabled={ocupado} onClick={() => onCancelar(s.acceso_id)}>Cancelar solicitud</button>}
      {!['aprobado', 'pendiente'].includes(estado) && <button type="button" className="bl-btn bl-btn--ghost" disabled={ocupado} onClick={() => onSolicitar(empresa)}><i className="ti ti-key" aria-hidden="true" />Solicitar acceso</button>}
    </div>
  </article>
}

export default function Plataforma() {
  const [datos, setDatos] = useState({ cargando: true, demo: false, empresas: [], error: '' })
  const [contexto, setContexto] = useState({ activo: false })
  const [vista, setVista] = useState('empresas')
  const [clienteId, setClienteId] = useState('')
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

  const cargar = useCallback(async () => {
    try {
      const r = await listarEmpresas()
      setDatos({ cargando: false, demo: r.demo, empresas: [...r.empresas], error: '' })
      setContexto(await contextoSoporte())
    } catch (e) { setDatos(d => ({ ...d, cargando: false, error: e.message })) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => suscribirPlataforma(() => { setDatos(d => ({ ...d, empresas: d.demo ? [...d.empresas] : d.empresas })); contextoSoporte().then(setContexto) }), [])
  useEffect(() => { if (!clienteId && datos.empresas.length) setClienteId((datos.empresas.find(e => e.soporte?.estado === 'pendiente') || datos.empresas[0]).id) }, [datos.empresas, clienteId])

  const resumen = useMemo(() => ({
    empresas: datos.empresas.length,
    usuarios: datos.empresas.reduce((s, e) => s + Number(e.usuarios_activos || 0), 0),
    campos: datos.empresas.reduce((s, e) => s + Number(e.campos || 0), 0),
    bloques: datos.empresas.reduce((s, e) => s + Number(e.bloques || 0), 0),
    activos: datos.empresas.filter(e => estadoVisible(e.soporte) === 'aprobado').length,
    pendientes: datos.empresas.filter(e => estadoVisible(e.soporte) === 'pendiente').length,
  }), [datos.empresas])

  const visibles = useMemo(() => datos.empresas.filter(e => {
    const texto = `${e.nombre} ${e.admin_email || ''}`.toLowerCase()
    const estado = estadoVisible(e.soporte)
    return texto.includes(busqueda.trim().toLowerCase()) && (filtro === 'todas' || (filtro === 'activos' && estado === 'aprobado') || (filtro === 'pendientes' && estado === 'pendiente'))
  }), [datos.empresas, busqueda, filtro])

  const ejecutar = async (accion, mensaje) => {
    setOcupado(true); setError(''); setAviso('')
    try { const r = await accion(); if (mensaje) setAviso(mensaje); return r } catch (e) { setError(e.message || 'No se pudo completar la acción.') } finally { setOcupado(false) }
    return undefined
  }

  const enviarSolicitud = async () => {
    const ok = await ejecutar(async () => { await solicitarSoporte(solicitando.id, motivo); return true }, `Solicitud enviada a ${solicitando.nombre}. Te avisaremos cuando su administrador responda.`)
    if (ok) { setSolicitando(null); setMotivo(''); if (!enModoDemo()) cargar() }
  }
  const cancelar = async id => { await ejecutar(() => cancelarSolicitud(id), 'Solicitud cancelada.'); if (!enModoDemo()) cargar() }
  const entrar = async id => {
    const ok = await ejecutar(async () => { await entrarSoporte(id); return true })
    if (!ok) return
    if (enModoDemo()) { setAviso('Modo soporte activado (demostración). Mira la barra de arriba.'); return }
    window.location.assign('/')
  }
  const salir = async () => { await ejecutar(salirSoporte, 'Saliste del modo soporte.'); if (!enModoDemo()) window.location.assign('/plataforma') }

  const crear = async () => {
    const nombre = formEmpresa.nombre.trim(), correo = formEmpresa.correo.trim().toLowerCase()
    if (nombre.length < 2) { setError('Escribe el nombre de la empresa.'); return }
    if (!correoValido(correo)) { setError('Escribe un correo válido para el dueño (sin punto antes de la @).'); return }
    const r = await ejecutar(() => crearEmpresa(nombre, correo))
    if (!r) return
    setAviso(r.correo_enviado === false ? 'Empresa creada, pero no se pudo enviar el correo de invitación. Reenvíalo desde Configuración.' : `Empresa creada. Enviamos la invitación a ${correo}.`)
    setCreando(false); setFormEmpresa({ nombre: '', correo: '' }); cargar()
  }

  const tarjeta = e => <TarjetaEmpresa key={e.id} empresa={e} ocupado={ocupado} adentro={contexto.activo && contexto.organizacion_id === e.id}
    onSolicitar={emp => { setError(''); setMotivo(''); setSolicitando(emp) }} onCancelar={cancelar} onEntrar={entrar} onSalir={salir} />

  return <div className="pl-page">
    <header className="pl-hero">
      <div className="pl-hero__top">
        <div>
          <span className="pl-eyebrow"><i className="ti ti-building-community" aria-hidden="true" />PANEL DE PLATAFORMA</span>
          <h1>Todas tus empresas, <span>sin ver sus datos.</span></h1>
          <p>Ves quién usa AgroBloque y cómo va cada empresa. Para entrar a los datos de un cliente necesitas que su administrador lo autorice, y queda registrado.</p>
        </div>
        <button type="button" className="pl-hero__nuevo" onClick={() => { setError(''); setAviso(''); setCreando(true) }}><i className="ti ti-building-plus" aria-hidden="true" />Nueva empresa</button>
      </div>
      <div className="pl-kpis" aria-busy={datos.cargando}>
        <Kpi icono="ti-building" valor={datos.cargando ? '—' : numero(resumen.empresas)} etiqueta="Empresas" tono="bloques" />
        <Kpi icono="ti-users" valor={datos.cargando ? '—' : numero(resumen.usuarios)} etiqueta="Usuarios activos" tono="agua" />
        <Kpi icono="ti-map-2" valor={datos.cargando ? '—' : numero(resumen.campos)} etiqueta="Campos" tono="bloques" />
        <Kpi icono="ti-layout-grid" valor={datos.cargando ? '—' : numero(resumen.bloques)} etiqueta="Bloques" tono="agua" />
        <Kpi icono="ti-eye-shield" valor={datos.cargando ? '—' : numero(resumen.activos)} etiqueta="Con acceso de soporte" tono="alerta" />
      </div>
    </header>

    {datos.demo && <div className="pl-demo" role="note"><i className="ti ti-flask" aria-hidden="true" /><div><b>Vista de demostración.</b> Estas empresas son de ejemplo y nada se guarda. Cuando se aplique el SQL de soporte en la base, aquí aparecerán las empresas reales.</div></div>}
    <Notice tone="error">{error || datos.error}</Notice>
    <Notice>{aviso}</Notice>

    <div className="pl-tabs" role="tablist" aria-label="Secciones del panel">
      <button type="button" role="tab" aria-selected={vista === 'empresas'} className={vista === 'empresas' ? 'active' : ''} onClick={() => setVista('empresas')}><i className="ti ti-building" aria-hidden="true" />Empresas{resumen.pendientes > 0 && <b>{resumen.pendientes}</b>}</button>
      {datos.demo && <button type="button" role="tab" aria-selected={vista === 'cliente'} className={vista === 'cliente' ? 'active' : ''} onClick={() => setVista('cliente')}><i className="ti ti-user-shield" aria-hidden="true" />Así lo ve el cliente</button>}
    </div>

    {vista === 'empresas' && <>
      <section className="pl-toolbar">
        <label className="ab-block-search"><i className="ti ti-search" aria-hidden="true" /><input aria-label="Buscar empresa" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar empresa o correo…" /></label>
        <div className="ab-status-filters" role="group" aria-label="Filtrar empresas">
          {[['todas', 'Todas'], ['activos', 'Con acceso activo'], ['pendientes', 'Solicitudes pendientes']].map(([k, v]) => <button type="button" key={k} aria-pressed={filtro === k} className={filtro === k ? 'active' : ''} onClick={() => setFiltro(k)}>{v}</button>)}
        </div>
      </section>
      {datos.cargando
        ? <div className="pl-grid" role="status" aria-label="Cargando empresas">{[0, 1, 2].map(i => <div className="pl-skeleton" key={i} />)}</div>
        : !visibles.length ? <div className="ab-empty">No hay empresas que coincidan.</div>
          : <div className="pl-grid">{visibles.map(tarjeta)}</div>}
    </>}

    {vista === 'cliente' && <section className="pl-cliente">
      <div className="pl-cliente__head">
        <p>Esto es lo que ve el <b>administrador de la empresa</b> cuando le pides acceso. Prueba el recorrido completo: pide acceso a una empresa, apruébalo aquí como si fueras el cliente y vuelve a “Empresas” para entrar.</p>
        <label className="pl-cliente__selector">Ver como administrador de
          <select className="bl-input" value={clienteId} onChange={e => setClienteId(e.target.value)}>{datos.empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select>
        </label>
      </div>
      {clienteId && <SoporteCliente key={clienteId} demo api={apiClienteDemo(clienteId)} />}
    </section>}

    <section className="pl-como" aria-label="Cómo funciona el acceso de soporte">
      <h2><i className="ti ti-shield-lock" aria-hidden="true" />Cómo funciona el acceso de soporte</h2>
      <ol>
        <li><span>1</span><div><b>Pides acceso</b><small>Indicas el motivo. Al cliente le llega la solicitud.</small></div></li>
        <li><span>2</span><div><b>El cliente decide</b><small>Aprueba por 1, 4, 24 o 72 horas, o la rechaza.</small></div></li>
        <li><span>3</span><div><b>Entras en solo lectura</b><small>Ves lo mismo que su administrador, sin poder cambiar nada.</small></div></li>
        <li><span>4</span><div><b>Termina solo</b><small>Vence a la hora acordada o cuando el cliente lo revoca. Todo queda en su historial.</small></div></li>
      </ol>
    </section>

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
        <button type="button" className="bl-btn bl-btn--primary" disabled={ocupado} onClick={crear}>{ocupado ? 'Creando…' : 'Crear empresa y enviar invitación'}</button>
        <button type="button" className="bl-btn bl-btn--ghost" disabled={ocupado} onClick={() => setCreando(false)}>Cerrar</button>
      </div>
    </Modal>}
  </div>
}
