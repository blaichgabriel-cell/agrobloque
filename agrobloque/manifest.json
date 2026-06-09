import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { registrarAuditoria } from '../lib/audit'

const CULTIVO_COLORES = {
  'Morrón':'#c8793a','Tomate':'#c0392b','Pepino':'#27ae60',
  'Berenjena':'#8e44ad','Zapalito':'#f39c12','Zucchini':'#16a085',
  'Lechuga':'#2ecc71','Lechuga repollo':'#1abc9c','Tomate Cherry':'#e74c3c',
}

export default function Mapa({ campoActivo }) {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const [bloques, setBloques] = useState([])
  const [plantaciones, setPlantaciones] = useState({})
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [modalBloque, setModalBloque] = useState(false)
  const [formBloque, setFormBloque] = useState({ letra:'A', numero:'', tipo:'invernadero' })
  const [savingBloque, setSavingBloque] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!campoActivo) return
    fetchData()
  }, [campoActivo])

  const fetchData = async () => {
    setLoading(true)
    const { data: bloquesData, error } = await supabase
      .from('bloques')
      .select('id, codigo, activo, tipo')
      .eq('campo_id', campoActivo.id)
      .order('codigo')

    if (error || !bloquesData) { setLoading(false); return }
    setBloques(bloquesData)

    const ids = bloquesData.map(b => b.id)
    if (ids.length === 0) { setLoading(false); return }

    const { data: plantData } = await supabase
      .from('plantaciones')
      .select('id, bloque_id, fecha_siembra, activa, cultivos(nombre)')
      .in('bloque_id', ids)
      .eq('activa', true)

    const mapa = {}
    ;(plantData || []).forEach(p => { mapa[p.bloque_id] = p })
    setPlantaciones(mapa)
    setLoading(false)
  }

  const limpiarBloque = () => setFormBloque({ letra:'A', numero:'', tipo:'invernadero' })

  const guardarBloque = async () => {
    if (!campoActivo?.id || !formBloque.numero) return
    const letra = String(formBloque.letra || '').trim().toUpperCase()
    const numero = String(formBloque.numero || '').replace(/[^0-9]/g, '')
    const codigo = `${letra}-${numero}`

    if (!letra || !numero) {
      setError('Completá letra y número del bloque.')
      return
    }
    if (bloques.some(b => String(b.codigo).toUpperCase() === codigo)) {
      setError(`El bloque ${codigo} ya existe en este campo.`)
      return
    }

    setSavingBloque(true)
    setError('')
    try {
      const { data, error } = await supabase
        .from('bloques')
        .insert({ campo_id: campoActivo.id, codigo, tipo: formBloque.tipo, activo: true })
        .select('id')
        .single()
      if (error) throw error
      await registrarAuditoria({
        accion: 'Registro bloque',
        modulo: 'Mapa',
        tabla: 'bloques',
        registroId: data?.id || '',
        detalle: `Bloque ${codigo}`,
      })
      limpiarBloque()
      setModalBloque(false)
      await fetchData()
    } catch (e) {
      setError(`No se pudo crear el bloque: ${e.message}`)
    }
    setSavingBloque(false)
  }

  const getCultivo = (b) => plantaciones[b.id]?.cultivos?.nombre || null
  const getColor = (b) => {
    const c = getCultivo(b)
    return c ? (CULTIVO_COLORES[c] || '#555') : null
  }

  const cultivos = [...new Set(bloques.map(b => getCultivo(b)).filter(Boolean))]
  const bloquesFiltrados = filtro === 'todos' ? bloques
    : filtro === 'vacio' ? bloques.filter(b => !getCultivo(b))
    : bloques.filter(b => getCultivo(b) === filtro)

  if (!campoActivo) return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:13, color:'#9a9a9a' }}>Seleccioná un campo desde el inicio</div>
    </div>
  )

  return (
    <div style={{ background:'#f2f1ef', minHeight:'100vh' }}>
      <div style={{ background:'#f2f1ef', padding: isDesktop ? '34px 36px 0' : '24px 20px 0' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:14 }}>
          <div>
            <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:4 }}>Campo activo</div>
            <div style={{ fontSize:22, fontWeight:700, color:'#212121', letterSpacing:-.5 }}>{campoActivo?.nombre}</div>
          </div>
          <button onClick={() => { setError(''); setModalBloque(true) }} style={{ width:40, height:40, borderRadius:14, background:'#212121', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
            <i className="ti ti-plus" style={{ color:'#fff', fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>
        {error && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:10 }}>{error}</div>}
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:8 }}>
          {[['todos','Todos'], ...cultivos.map(c => [c,c]), ['vacio','Sin cultivo']].map(([k,v]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', background: filtro===k ? '#212121' : '#e8e6e2', color: filtro===k ? '#fff' : '#9a9a9a' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: isDesktop ? '18px 36px 100px' : '8px 14px 100px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Cargando bloques...</div>
        ) : bloquesFiltrados.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#9a9a9a', fontSize:13 }}>Sin bloques para mostrar</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns: isDesktop ? 'repeat(4, minmax(180px, 1fr))' : '1fr 1fr', gap: isDesktop ? 14 : 8 }}>
            {bloquesFiltrados.map(b => {
              const cultivo = getCultivo(b)
              const color = getColor(b)
              return (
                <div key={b.id} onClick={() => navigate(`/bloque/${b.id}`)}
                  style={{ background: color || '#fff', borderRadius:20, padding: isDesktop ? '18px 18px' : '14px 12px', cursor:'pointer', minHeight: isDesktop ? 120 : 90, display:'flex', flexDirection:'column', justifyContent:'space-between', boxShadow: isDesktop ? '0 12px 28px rgba(31,36,31,0.06)' : 'none' }}>
                  <div style={{ fontSize:10, fontWeight:600, color: cultivo ? 'rgba(255,255,255,0.55)' : '#c0c0c0', textTransform:'uppercase' }}>
                    {b.tipo === 'invernadero' ? 'Inv.' : 'Campo'}
                  </div>
                  <div>
                    <div style={{ fontSize:22, fontWeight:800, color: cultivo ? '#fff' : '#0a0a0a', letterSpacing:-.5 }}>{b.codigo}</div>
                    <div style={{ fontSize:10, color: cultivo ? 'rgba(255,255,255,0.75)' : '#c0c0c0', marginTop:2 }}>
                      {cultivo || 'Sin cultivo'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <NotasPanel modulo="mapa" titulo="Blog de notas de mapa" />
      </div>

      {modalBloque && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', zIndex:120, display:'flex', alignItems: isDesktop ? 'center' : 'flex-end', justifyContent:'center' }} onClick={e => e.target===e.currentTarget && setModalBloque(false)}>
          <div style={{ background:'#f2f1ef', borderRadius: isDesktop ? 24 : '24px 24px 0 0', width:'100%', maxWidth:440, padding:'24px 20px 38px', boxShadow: isDesktop ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div style={{ fontSize:18, fontWeight:800, color:'#0a0a0a', marginBottom:4 }}>Agregar bloque</div>
            <div style={{ fontSize:12, color:'#8b928b', marginBottom:18 }}>{campoActivo?.nombre}</div>
            {error && <div style={{ background:'#fff0f0', color:'#c84040', fontSize:12, padding:'8px 12px', borderRadius:10, marginBottom:12 }}>{error}</div>}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr', gap:10 }}>
              <div>
                <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Letra</div>
                <input value={formBloque.letra} maxLength={3} onChange={e => setFormBloque(f => ({ ...f, letra:e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))} style={inputBloque} placeholder="A" />
              </div>
              <div>
                <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Número</div>
                <input value={formBloque.numero} inputMode="numeric" onChange={e => setFormBloque(f => ({ ...f, numero:e.target.value.replace(/[^0-9]/g, '') }))} style={inputBloque} placeholder="Ej: 9" />
              </div>
            </div>

            <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:6 }}>Tipo</div>
            <select value={formBloque.tipo} onChange={e => setFormBloque(f => ({ ...f, tipo:e.target.value }))} style={inputBloque}>
              <option value="invernadero">Invernadero</option>
              <option value="campo">Campo abierto</option>
            </select>

            <div style={{ background:'#fff', borderRadius:14, padding:'12px 14px', marginBottom:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, color:'#8b928b' }}>Vista previa</span>
              <strong style={{ fontSize:18, color:'#0a0a0a' }}>{`${(formBloque.letra || 'A').toUpperCase()}-${formBloque.numero || '?'}`}</strong>
            </div>

            <button onClick={guardarBloque} disabled={savingBloque} style={{ width:'100%', padding:14, borderRadius:14, background:'#212121', border:'none', fontSize:14, fontWeight:800, color:'#fff', cursor:'pointer' }}>
              {savingBloque ? 'Guardando...' : 'Guardar bloque'}
            </button>
            <button onClick={() => setModalBloque(false)} style={{ width:'100%', padding:12, borderRadius:14, background:'transparent', border:'1px solid #e8e6e2', fontSize:13, color:'#9a9a9a', cursor:'pointer', marginTop:8 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const inputBloque = {
  width:'100%',
  padding:'11px 14px',
  borderRadius:12,
  border:'1px solid #e8e6e2',
  background:'#fff',
  fontSize:13,
  color:'#0a0a0a',
  marginBottom:12,
  boxSizing:'border-box',
}
