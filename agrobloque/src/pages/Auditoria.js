import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auditoria() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending:false })
      .limit(120)
    if (error) setError('Falta ejecutar el SQL profesional en Supabase.')
    setLogs(data || [])
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#f2f1ef', padding:'24px 14px 100px' }}>
      <div style={{ maxWidth:900, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#8b928b' }}>Registro interno</div>
            <h1 style={{ margin:0, fontSize:24, letterSpacing:-0.6 }}>Auditoria</h1>
          </div>
          <button onClick={cargar} style={{ width:42, height:42, borderRadius:14, border:'none', background:'#212121', color:'#fff', cursor:'pointer' }}>
            <i className="ti ti-refresh" style={{ fontSize:20 }} aria-hidden="true"></i>
          </button>
        </div>

        {error && <div style={{ background:'#fff0f0', color:'#c84040', padding:'10px 12px', borderRadius:14, fontSize:13, marginBottom:12 }}>{error}</div>}
        {loading ? (
          <div style={{ textAlign:'center', padding:38, color:'#8b928b' }}>Cargando auditoria...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign:'center', padding:38, color:'#8b928b', background:'#fff', borderRadius:20 }}>Todavia no hay movimientos registrados.</div>
        ) : logs.map(log => (
          <div key={log.id} style={{ background:'#fff', borderRadius:18, padding:'14px 16px', marginBottom:8, border:'1px solid #e8ece8' }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:6 }}>
              <strong style={{ fontSize:15 }}>{log.accion}</strong>
              <span style={{ fontSize:11, color:'#8b928b' }}>{String(log.created_at || '').slice(0, 16).replace('T', ' ')}</span>
            </div>
            <div style={{ fontSize:12, color:'#687068' }}>
              {log.modulo}{log.tabla ? ` - ${log.tabla}` : ''}{log.registro_id ? ` - ${log.registro_id}` : ''}
            </div>
            {log.detalle && <div style={{ fontSize:13, marginTop:8, color:'#202820' }}>{log.detalle}</div>}
            {log.usuario_email && <div style={{ fontSize:11, marginTop:8, color:'#8b928b' }}>{log.usuario_email}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
