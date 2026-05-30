import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DesktopDashboard from './DesktopDashboard'

const CAMPO_STORAGE_KEY = 'agrobloque-campo-activo'

function LogoHS({ size = 56 }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,0.22)',
      background: 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      boxShadow: '0 14px 34px rgba(0,0,0,0.35)',
      flexShrink: 0,
    }}>
      <span style={{
        color: '#fff',
        fontSize: Math.round(size * 0.42),
        fontWeight: 900,
        letterSpacing: -2,
        lineHeight: 1,
        fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif",
      }}>HS</span>
      <span style={{
        position: 'absolute',
        top: 12,
        right: 13,
        width: 17,
        height: 8,
        background: '#7bc043',
        borderRadius: '16px 16px 2px 16px',
        transform: 'rotate(-8deg)',
      }} />
    </div>
  )
}

function useViewportWidth() {
  const [width, setWidth] = useState(typeof window === 'undefined' ? 480 : window.innerWidth)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return width
}

const accesos = [
  { icon: 'ti-map', label: 'Mapa', sub: 'Ver bloques', path: '/mapa', green: true },
  { icon: 'ti-calendar', label: 'Agenda', sub: 'Tareas', path: '/agenda', green: true },
  { icon: 'ti-users', label: 'Asistencia', sub: 'Planilla', path: '/asistencia' },
  { icon: 'ti-chart-bar', label: 'Reportes', sub: 'Rentabilidad', path: '/reportes' },
  { icon: 'ti-spray', label: 'Fumigaciones', sub: 'Historial', path: '/fumigaciones', green: true },
  { icon: 'ti-box', label: 'Inventario', sub: 'Stock', path: '/inventario' },
  { icon: 'ti-cut', label: 'Cosecha', sub: 'Produccion', path: '/cosecha' },
  { icon: 'ti-coin', label: 'Costos', sub: 'Gastos', path: '/costos' },
]

const fondo = {
  minHeight: '100vh',
  background: `
    radial-gradient(circle at 20% 0%, rgba(74,124,50,0.22), transparent 28%),
    radial-gradient(circle at 90% 30%, rgba(200,170,95,0.14), transparent 30%),
    linear-gradient(180deg, #090b0a 0%, #111310 48%, #090a09 100%)
  `,
  color: '#fff',
}

const cardBlanca = {
  background: 'linear-gradient(145deg, #ffffff, #f5f5f3)',
  border: '1px solid rgba(255,255,255,0.82)',
  boxShadow: '0 18px 35px rgba(0,0,0,0.22)',
}

export default function Dashboard({ campoActivo, setCampoActivo }) {
  const [campos, setCampos] = useState([])
  const [stats, setStats] = useState({ bloques: 0, activos: 0, cultivos: 0, operarios: 0 })
  const [alertas, setAlertas] = useState([])
  const [loading, setLoading] = useState(true)
  const viewportWidth = useViewportWidth()
  const navigate = useNavigate()
  const hoy = new Date().toISOString().split('T')[0]
  const compacto = viewportWidth < 430
  const muyChico = viewportWidth < 375
  const usarDashboardEscritorio = viewportWidth >= 1100

  const cargarStats = async (campo) => {
    if (!campo?.id) return
    setLoading(true)

    const { data: bloques } = await supabase
      .from('bloques')
      .select('id, activo')
      .eq('campo_id', campo.id)

    const bloqueIds = (bloques || []).map(b => b.id)
    const plantacionesQuery = bloqueIds.length > 0
      ? supabase.from('plantaciones').select('id').eq('activa', true).in('bloque_id', bloqueIds)
      : Promise.resolve({ data: [] })

    const [{ data: plantas }, { data: ops }, { data: tareas }] = await Promise.all([
      plantacionesQuery,
      supabase.from('operarios').select('id').eq('campo_id', campo.id),
      supabase
        .from('tareas')
        .select('*, campos(nombre), bloques(codigo)')
        .eq('campo_id', campo.id)
        .eq('completada', false)
        .lte('fecha_programada', hoy)
        .order('fecha_programada'),
    ])

    setStats({
      bloques: bloques?.length || 0,
      activos: bloques?.filter(b => b.activo).length || 0,
      cultivos: plantas?.length || 0,
      operarios: ops?.length || 0,
    })
    setAlertas(tareas || [])
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.from('campos').select('*').order('nombre')
      if (!data || data.length === 0) {
        setLoading(false)
        return
      }

      setCampos(data)
      const guardado = typeof window !== 'undefined'
        ? window.localStorage.getItem(CAMPO_STORAGE_KEY)
        : null
      const campo = campoActivo || data.find(c => c.id === guardado) || data[0]
      if (!campoActivo) setCampoActivo(campo)
      await cargarStats(campo)
    }

    init()
  }, [])

  useEffect(() => {
    if (campoActivo) cargarStats(campoActivo)
  }, [campoActivo])

  const seleccionarCampo = (campo) => {
    setCampoActivo(campo)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CAMPO_STORAGE_KEY, campo.id)
    }
  }

  if (usarDashboardEscritorio) {
    return <DesktopDashboard campoActivo={campoActivo} setCampoActivo={setCampoActivo} />
  }

  return (
    <div style={fondo}>
      <div style={{ padding: compacto ? '20px 14px 96px' : '26px 20px 102px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: compacto ? 20 : 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: compacto ? 12 : 16 }}>
            <LogoHS size={compacto ? 50 : 58} />
            <div>
              <div style={{ fontSize: compacto ? 11 : 13, color: 'rgba(255,255,255,0.56)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 }}>
                Horticultura
              </div>
              <div style={{ fontSize: compacto ? 22 : 24, color: '#fff', fontWeight: 850, letterSpacing: -0.7, lineHeight: 1.05 }}>
                El Sembrador
              </div>
            </div>
          </div>

          <button onClick={() => navigate('/agenda')} style={{
            width: compacto ? 42 : 48,
            height: compacto ? 42 : 48,
            borderRadius: 18,
            border: 'none',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            cursor: 'pointer',
          }} aria-label="Abrir agenda">
            <i className="ti ti-bell" style={{ fontSize: compacto ? 28 : 31, color: '#fff' }} aria-hidden="true"></i>
            <span style={{
              position: 'absolute',
              top: 7,
              right: 8,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: alertas.length > 0 ? '#7bc043' : 'rgba(123,192,67,0.45)',
            }} />
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(campos.length, 1)}, minmax(0, 1fr))`,
          gap: 8,
          padding: compacto ? 6 : 8,
          borderRadius: compacto ? 24 : 28,
          marginBottom: compacto ? 14 : 18,
          background: 'linear-gradient(145deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06))',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        }}>
          {campos.length === 0 ? (
            <div style={{ padding: 14, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Sin campos</div>
          ) : campos.map(campo => {
            const activo = campoActivo?.id === campo.id
            return (
              <button key={campo.id} onClick={() => seleccionarCampo(campo)} style={{
                minHeight: compacto ? 48 : 54,
                borderRadius: compacto ? 19 : 22,
                border: 'none',
                background: activo ? '#050706' : 'rgba(255,255,255,0.03)',
                color: activo ? '#fff' : 'rgba(255,255,255,0.72)',
                fontSize: compacto ? 14 : 16,
                fontWeight: activo ? 800 : 500,
                cursor: 'pointer',
                boxShadow: activo ? '0 14px 24px rgba(0,0,0,0.32)' : 'none',
              }}>
                {campo.nombre}
              </button>
            )
          })}
        </div>

        <div style={{
          borderRadius: compacto ? 22 : 24,
          border: '1px solid rgba(255,255,255,0.22)',
          background: `
            radial-gradient(circle at 78% 20%, rgba(140,116,70,0.30), transparent 35%),
            linear-gradient(135deg, #080b0a 0%, #171a18 52%, #231f16 100%)
          `,
          padding: compacto ? '20px 18px 20px' : '26px 24px 24px',
          marginBottom: compacto ? 14 : 18,
          boxShadow: '0 24px 60px rgba(0,0,0,0.42)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            right: 42,
            top: 62,
            fontSize: compacto ? 106 : 130,
            lineHeight: 1,
            fontWeight: 900,
            color: 'rgba(255,255,255,0.045)',
            letterSpacing: -10,
            pointerEvents: 'none',
          }}>HS</div>
          <div style={{
            position: 'absolute',
            right: 22,
            bottom: 28,
            width: compacto ? 126 : 150,
            height: compacto ? 70 : 82,
            borderTop: '3px solid rgba(255,255,255,0.08)',
            borderRadius: '70% 0 0 0',
            transform: 'rotate(-16deg)',
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
            <div>
              <div style={{ fontSize: compacto ? 13 : 15, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: compacto ? 12 : 16 }}>
                Bloques activos
              </div>
              <div style={{ fontSize: muyChico ? 52 : compacto ? 58 : 66, lineHeight: 0.9, fontWeight: 900, letterSpacing: -4, color: '#fff' }}>
                {loading ? '-' : stats.activos}
              </div>
              <div style={{ fontSize: compacto ? 16 : 19, color: '#fff', marginTop: compacto ? 10 : 14 }}>
                de {stats.bloques} totales
              </div>
            </div>
            <div style={{
              width: compacto ? 50 : 58,
              height: compacto ? 50 : 58,
              borderRadius: compacto ? 15 : 17,
              border: '1px solid rgba(255,255,255,0.22)',
              background: 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <i className="ti ti-chart-bar" style={{ color: '#7bc043', fontSize: compacto ? 28 : 32 }} aria-hidden="true"></i>
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.18)', margin: compacto ? '24px 0 18px' : '34px 0 22px' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, position: 'relative' }}>
            <span style={{ position: 'absolute', left: '33.333%', top: '8%', bottom: '8%', width: 1, background: 'rgba(255,255,255,0.20)' }} />
            <span style={{ position: 'absolute', left: '66.666%', top: '8%', bottom: '8%', width: 1, background: 'rgba(255,255,255,0.20)' }} />
            <MiniStat icon="ti-plant-2" label="Cultivos" value={stats.cultivos} compact={compacto} />
            <MiniStat icon="ti-users" label="Operarios" value={stats.operarios} compact={compacto} />
            <MiniStat icon="ti-alert-triangle" label="Alertas" value={alertas.length} compact={compacto} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: compacto ? 8 : 12 }}>
          {accesos.map(item => (
            <button key={item.path} onClick={() => navigate(item.path)} style={{
              ...cardBlanca,
              minHeight: compacto ? 76 : 98,
              borderRadius: compacto ? 18 : 22,
              padding: compacto ? '12px 10px' : '18px 14px',
              display: 'grid',
              gridTemplateColumns: compacto ? '38px minmax(0, 1fr) 12px' : '54px minmax(0, 1fr) 18px',
              alignItems: 'center',
              gap: compacto ? 7 : 12,
              cursor: 'pointer',
              textAlign: 'left',
              boxSizing: 'border-box',
              minWidth: 0,
            }}>
              <span style={{
                width: compacto ? 38 : 54,
                height: compacto ? 38 : 54,
                borderRadius: compacto ? 13 : 18,
                background: item.green ? '#eef6ea' : '#f1f1f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <i className={`ti ${item.icon}`} style={{ fontSize: compacto ? 22 : 29, color: item.green ? '#2f741f' : '#080908' }} aria-hidden="true"></i>
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{
                  display: 'block',
                  color: '#050505',
                  fontSize: compacto ? (item.label.length > 10 ? 12 : 13.5) : 18,
                  fontWeight: 850,
                  letterSpacing: -0.2,
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {item.label}
                </span>
                <span style={{ display: 'block', color: '#4f5358', fontSize: compacto ? 12 : 14, marginTop: compacto ? 4 : 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.sub}
                </span>
              </span>
              <i className="ti ti-chevron-right" style={{ color: '#151515', fontSize: compacto ? 17 : 22, justifySelf: 'end' }} aria-hidden="true"></i>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function MiniStat({ icon, label, value, compact }) {
  return (
    <div style={{
      padding: compact ? '0 9px' : '0 18px',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 9, color: '#fff', marginBottom: compact ? 9 : 13 }}>
        <i className={`ti ${icon}`} style={{ color: '#7bc043', fontSize: compact ? 21 : 27, flexShrink: 0 }} aria-hidden="true"></i>
        <span style={{ fontSize: compact ? 12 : 16, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </div>
      <div style={{ fontSize: compact ? 28 : 34, color: '#fff', fontWeight: 900, lineHeight: 1 }}>{value}</div>
    </div>
  )
}
