import React, { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { canAccessModule } from '../lib/permissions'

// Pantallas de la pestaña «Operación»: el encabezado móvil muestra un selector entre ellas.
export const OPERACIONES = [
  { path: '/cosecha', key: 'cosecha', label: 'Cosecha', icon: 'ti-basket' },
  { path: '/fumigaciones', key: 'fumigaciones', label: 'Fumigaciones', icon: 'ti-spray' },
  { path: '/fertilizaciones', key: 'plan_nutricional', label: 'Fertilizaciones', icon: 'ti-droplet' },
]
export const OPERACION_STORAGE_KEY = 'agrobloque-operacion'
export const operacionesPermitidas = role => OPERACIONES.filter(op => canAccessModule(role, op.key))

// Tareas abiertas + productos sin stock o bajo el mínimo: lo mismo que cuenta el menú de escritorio.
export function useConteoAlertas(role, activo = true) {
  const [conteo, setConteo] = useState(0)
  const conteoConfirmado = useRef(false)
  const puede = activo && canAccessModule(role, 'alertas')
  useEffect(() => {
    if (!puede) { setConteo(0); return undefined }
    let cancelado = false
    conteoConfirmado.current = false
    const sincronizarConteo = event => {
      conteoConfirmado.current = true
      setConteo(Math.max(0, Number(event.detail?.count) || 0))
    }
    window.addEventListener('agrobloque:alertas-conteo', sincronizarConteo)
    Promise.all([
      supabase.from('tareas').select('id', { count: 'exact', head: true }).eq('completada', false).eq('anulada', false),
      supabase.from('productos').select('id,stock_actual,stock_minimo').eq('activo', true),
    ]).then(([tareas, productos]) => {
      if (cancelado) return
      const stock = (productos.data || []).filter(p => Number(p.stock_actual) <= 0 || (Number(p.stock_minimo) > 0 && Number(p.stock_actual) <= Number(p.stock_minimo))).length
      if (!conteoConfirmado.current) setConteo(Number(tareas.count || 0) + stock)
    }).catch(() => {})
    return () => { cancelado = true; window.removeEventListener('agrobloque:alertas-conteo', sincronizarConteo) }
  }, [puede, role?.email])
  return conteo
}

function useCampos() {
  const [campos, setCampos] = useState([])
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const actualizar = () => setVersion(v => v + 1)
    window.addEventListener('agrobloque:campos-actualizados', actualizar)
    return () => window.removeEventListener('agrobloque:campos-actualizados', actualizar)
  }, [])
  useEffect(() => {
    let cancelado = false
    supabase.from('campos').select('id,nombre').order('nombre').then(({ data }) => { if (!cancelado) setCampos(data || []) })
    return () => { cancelado = true }
  }, [version])
  return campos
}

// Encabezado móvil (< 1100 px, donde no hay menú lateral): 56 px de cristal pegado arriba.
export function MobileHeader({ campoActivo, setCampoActivo, role, organization, contexto = { activo: false } }) {
  const navigate = useNavigate()
  const location = useLocation()
  const campos = useCampos()
  const alertas = useConteoAlertas(role)
  const operaciones = operacionesPermitidas(role)
  const enOperacion = operaciones.some(op => op.path === location.pathname)
  const empresa = contexto.activo ? (contexto.organizacion_nombre || organization?.nombre || 'Empresa') : (organization?.nombre && organization.nombre !== 'AgroBloque' ? organization.nombre : 'AgroBloque')
  const soporte = contexto.activo && !contexto.propia
  const elegirCampo = id => {
    const campo = campos.find(c => c.id === id)
    if (!campo) return
    setCampoActivo(campo)
    try { window.localStorage.setItem('agrobloque-campo-activo', campo.id) } catch (e) { /* almacenamiento bloqueado */ }
  }
  const cambiarOperacion = path => {
    try { window.localStorage.setItem(OPERACION_STORAGE_KEY, path) } catch (e) { /* almacenamiento bloqueado */ }
    navigate(path)
  }

  return <header className={`ag-mhead ${soporte ? "is-soporte" : ""}`}>
    <div className="ag-mhead__fila">
      <label className={`ag-mhead__campo ${campos.length > 1 ? '' : 'is-unico'}`}>
        <span className="ag-mhead__pin" aria-hidden="true"><i className="ti ti-map-pin" /></span>
        <span className="ag-mhead__textos"><small title={empresa}>{soporte && <span className="ag-mhead__soporte">Soporte · </span>}{empresa}</small><b title={campoActivo?.nombre || ''}>{campoActivo?.nombre || 'Sin campo'}</b></span>
        {campos.length > 1 && <i className="ti ti-selector ag-mhead__chevron" aria-hidden="true" />}
        <select aria-label="Campo activo" value={campoActivo?.id || ''} onChange={e => elegirCampo(e.target.value)} disabled={campos.length < 2}>
          {!campos.length && <option value="">Sin campos</option>}
          {campos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </label>
      <div className="ag-mhead__acciones">
        {canAccessModule(role, 'buscar') && <button type="button" className="ag-mhead__boton" aria-label="Buscar" onClick={() => navigate('/buscar')}><i className="ti ti-search" aria-hidden="true" /></button>}
        {canAccessModule(role, 'alertas') && <button type="button" className="ag-mhead__boton" aria-label={alertas ? `Alertas: ${alertas} pendientes` : 'Alertas'} onClick={() => navigate('/alertas')}>
          <i className="ti ti-bell" aria-hidden="true" />
          {alertas > 0 && <span className="ag-mhead__badge">{alertas > 99 ? '99+' : alertas}</span>}
        </button>}
      </div>
    </div>
    {enOperacion && operaciones.length > 1 && <nav className="ag-mhead__segmentos" aria-label="Tipo de operación" style={{ '--seg': operaciones.length }}>
      {operaciones.map(op => <button type="button" key={op.path} aria-current={location.pathname === op.path ? 'page' : undefined} onClick={() => cambiarOperacion(op.path)}>{op.label}</button>)}
    </nav>}
  </header>
}
