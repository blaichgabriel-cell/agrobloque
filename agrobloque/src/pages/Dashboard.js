import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
  const navigate = useNavigate()
  const hoy = new Date().toISOString().split('T')[0]

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

  return (
    <div style={fondo}>
      <div style={{ padding: '26px 20px 102px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <LogoHS size={58} />
            <div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.56)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 }}>
                Horticultura
              </div>
              <div style={{ fontSize: 24, color: '#fff', fontWeight: 850, letterSpacing: -0.7, lineHeight: 1.05 }}>
                El Sembrador
              </div>
            </div>
          </div>

          <button onClick={() => navigate('/agenda')} style={{
            width: 48,
            height: 48,
            borderRadius: 18,
            border: 'none',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            cursor: 'pointer',
          }} aria-label="Abrir agenda">
            <i className="ti ti-bell" style={{ fontSize: 31, color: '#fff' }} aria-hidden="true"></i>
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
          padding: 8,
          borderRadius: 28,
          marginBottom: 18,
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
                minHeight: 54,
                borderRadius: 22,
                border: 'none',
                background: activo ? '#050706' : 'rgba(255,255,255,0.03)',
                color: activo ? '#fff' : 'rgba(255,255,255,0.72)',
                fontSize: 16,
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
          borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.22)',
          background: `
            radial-gradient(circle at 78% 20%, rgba(140,116,70,0.30), transparent 35%),
            linear-gradient(135deg, #080b0a 0%, #171a18 52%, #231f16 100%)
          `,
          padding: '26px 24px 24px',
          marginBottom: 18,
          boxShadow: '0 24px 60px rgba(0,0,0,0.42)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            right: 42,
            top: 62,
            fontSize: 130,
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
            width: 150,
            height: 82,
            borderTop: '3px solid rgba(255,255,255,0.08)',
            borderRadius: '70% 0 0 0',
            transform: 'rotate(-16deg)',
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
            <div>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 16 }}>
                Bloques activos
              </div>
              <div style={{ fontSize: 66, lineHeight: 0.9, fontWeight: 900, letterSpacing: -4, color: '#fff' }}>
                {loading ? '-' : stats.activos}
              </div>
              <div style={{ fontSize: 19, color: '#fff', marginTop: 14 }}>
                de {stats.bloques} totales
              </div>
            </div>
            <div style={{
              width: 58,
              height: 58,
              borderRadius: 17,
              border: '1px solid rgba(255,255,255,0.22)',
              background: 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <i className="ti ti-chart-bar" style={{ color: '#7bc043', fontSize: 32 }} aria-hidden="true"></i>
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.18)', margin: '34px 0 22px' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, position: 'relative' }}>
            <MiniStat icon="ti-plant-2" label="Cultivos" value={stats.cultivos} />
            <MiniStat icon="ti-users" label="Operarios" value={stats.operarios} divisor />
            <MiniStat icon="ti-alert-triangle" label="Alertas" value={alertas.length} divisor />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {accesos.map(item => (
            <button key={item.path} onClick={() => navigate(item.path)} style={{
              ...cardBlanca,
              minHeight: 98,
              borderRadius: 22,
              padding: '18px 14px',
              display: 'grid',
              gridTemplateColumns: '54px 1fr 18px',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              textAlign: 'left',
            }}>
              <span style={{
                width: 54,
                height: 54,
                borderRadius: 18,
                background: item.green ? '#eef6ea' : '#f1f1f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <i className={`ti ${item.icon}`} style={{ fontSize: 29, color: item.green ? '#2f741f' : '#080908' }} aria-hidden="true"></i>
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', color: '#050505', fontSize: 18, fontWeight: 850, letterSpacing: -0.4, lineHeight: 1.1 }}>
                  {item.label}
                </span>
                <span style={{ display: 'block', color: '#4f5358', fontSize: 14, marginTop: 6 }}>
                  {item.sub}
                </span>
              </span>
              <i className="ti ti-chevron-right" style={{ color: '#151515', fontSize: 22 }} aria-hidden="true"></i>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function MiniStat({ icon, label, value, divisor }) {
  return (
    <div style={{
      borderLeft: divisor ? '1px solid rgba(255,255,255,0.20)' : 'none',
      paddingLeft: divisor ? 18 : 0,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#fff', marginBottom: 13 }}>
        <i className={`ti ${icon}`} style={{ color: '#7bc043', fontSize: 27 }} aria-hidden="true"></i>
        <span style={{ fontSize: 16, color: '#fff', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div style={{ fontSize: 34, color: '#fff', fontWeight: 900, lineHeight: 1 }}>{value}</div>
    </div>
  )
}
