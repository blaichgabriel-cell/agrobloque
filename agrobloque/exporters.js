import React, { useEffect, useState } from 'react'
import { guestToken, supabase } from '../lib/supabase'

const hoy = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function NotasPanel({ modulo, titulo = 'Notas' }) {
  const [notas, setNotas] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({ fecha: hoy(), titulo: '', contenido: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isGuest = Boolean(guestToken)

  useEffect(() => {
    fetchNotas()
  }, [modulo])

  const fetchNotas = async () => {
    if (!modulo) return
    const { data, error } = await supabase
      .from('notas_modulo')
      .select('*')
      .eq('modulo', modulo)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      setError('Falta ejecutar el SQL de notas en Supabase.')
      setNotas([])
      return
    }

    setError('')
    setNotas(data || [])
  }

  const guardar = async () => {
    if (!form.contenido.trim() && !form.titulo.trim()) return
    setSaving(true)
    const { error } = await supabase.from('notas_modulo').insert({
      modulo,
      fecha: form.fecha || hoy(),
      titulo: form.titulo.trim() || null,
      contenido: form.contenido.trim(),
    })

    if (error) {
      setError('No se pudo guardar la nota. Revisa el SQL de Supabase.')
    } else {
      setForm({ fecha: hoy(), titulo: '', contenido: '' })
      setAbierto(false)
      await fetchNotas()
    }
    setSaving(false)
  }

  const eliminar = async (id) => {
    await supabase.from('notas_modulo').delete().eq('id', id)
    fetchNotas()
  }

  return (
    <section style={{ background:'#fff', borderRadius:20, padding:'16px', marginTop:16, boxShadow:'0 10px 28px rgba(0,0,0,0.04)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:'#0a0a0a' }}>{titulo}</div>
          <div style={{ fontSize:11, color:'#8b928b', marginTop:2 }}>{notas.length} nota{notas.length === 1 ? '' : 's'}</div>
        </div>
        {!isGuest && (
          <button type="button" onClick={() => setAbierto(v => !v)}
            style={{ border:'none', borderRadius:12, background:'#212121', color:'#fff', padding:'9px 12px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            {abierto ? 'Cerrar' : '+ Nota'}
          </button>
        )}
      </div>

      {error && <div style={{ background:'#fff3e8', color:'#b26400', borderRadius:12, padding:'9px 11px', fontSize:12, marginBottom:10 }}>{error}</div>}

      {abierto && (
        <div style={{ background:'#f7f7f5', borderRadius:16, padding:12, marginBottom:12 }}>
          <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha:e.target.value }))}
            style={inputStyle} />
          <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo:e.target.value }))}
            placeholder="Titulo opcional" style={inputStyle} />
          <textarea value={form.contenido} onChange={e => setForm(f => ({ ...f, contenido:e.target.value }))}
            placeholder="Escribir nota..." style={{ ...inputStyle, minHeight:74, resize:'vertical', marginBottom:10 }} />
          <button type="button" onClick={guardar} disabled={saving}
            style={{ width:'100%', border:'none', borderRadius:13, background:'#1a5c2e', color:'#fff', padding:12, fontSize:13, fontWeight:800, cursor:'pointer' }}>
            {saving ? 'Guardando...' : 'Guardar nota'}
          </button>
        </div>
      )}

      {notas.length === 0 ? (
        <div style={{ color:'#9a9a9a', fontSize:13, padding:'8px 0' }}>Sin notas registradas.</div>
      ) : (
        <div style={{ display:'grid', gap:8 }}>
          {notas.slice(0, 6).map(n => (
            <div key={n.id} style={{ background:'#f7f7f5', borderRadius:14, padding:'11px 12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:5 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, color:'#8b928b' }}>{n.fecha}</div>
                  {n.titulo && <div style={{ fontSize:13, fontWeight:800, color:'#0a0a0a', marginTop:2 }}>{n.titulo}</div>}
                </div>
                {!isGuest && (
                  <button type="button" onClick={() => eliminar(n.id)}
                    style={{ border:'1px solid #ffcccc', background:'transparent', color:'#c84040', borderRadius:10, padding:'5px 9px', fontSize:11, cursor:'pointer' }}>
                    Eliminar
                  </button>
                )}
              </div>
              <div style={{ fontSize:13, color:'#3b403c', lineHeight:1.45, whiteSpace:'pre-wrap' }}>{n.contenido}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const inputStyle = {
  width:'100%',
  padding:'10px 12px',
  borderRadius:12,
  border:'1px solid #e4e7e2',
  background:'#fff',
  fontSize:13,
  color:'#0a0a0a',
  marginBottom:8,
  boxSizing:'border-box',
}
