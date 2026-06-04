import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { descargarCsv, imprimirHtml } from '../lib/exporters'

export default function Auditoria() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState({ modulo:'', accion:'', texto:'' })

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

  const visibles = logs.filter(log => {
    const texto = `${log.accion || ''} ${log.modulo || ''} ${log.tabla || ''} ${log.detalle || ''} ${log.usuario_email || ''}`.toLowerCase()
    return (!filtro.modulo || log.modulo === filtro.modulo) &&
      (!filtro.accion || String(log.accion || '').toLowerCase().includes(filtro.accion.toLowerCase())) &&
      (!filtro.texto || texto.includes(filtro.texto.toLowerCase()))
  })

  const modulos = [...new Set(logs.map(l => l.modulo).filter(Boolean))].sort()

  const exportarCsv = () => {
    descargarCsv('auditoria-agrobloque', ['Fecha', 'Usuario', 'Accion', 'Modulo', 'Tabla', 'Registro', 'Detalle'], visibles.map(log => ({
      Fecha: String(log.created_at || '').slice(0, 16).replace('T', ' '),
      Usuario: log.usuario_email || '',
      Accion: log.accion || '',
      Modulo: log.modulo || '',
      Tabla: log.tabla || '',
      Registro: log.registro_id || '',
      Detalle: log.detalle || '',
    })))
  }

  const exportarPdf = () => {
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
    imprimirHtml('Auditoria AgroBloque', `
      <h1>Auditoria AgroBloque</h1>
      <div class="muted">${visibles.length} movimientos filtrados</div>
      <table>
        <tr><th>Fecha</th><th>Usuario</th><th>Accion</th><th>Modulo</th><th>Detalle</th></tr>
        ${visibles.map(log => `<tr><td>${esc(String(log.created_at || '').slice(0, 16).replace('T', ' '))}</td><td>${esc(log.usuario_email || '')}</td><td>${esc(log.accion || '')}</td><td>${esc(log.modulo || '')}</td><td>${esc(log.detalle || '')}</td></tr>`).join('')}
      </table>
    `)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#f2f1ef', padding:'24px 14px 100px' }}>
      <div style={{ maxWidth:900, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#8b928b' }}>Registro interno</div>
            <h1 style={{ margin:0, fontSize:24, letterSpacing:-0.6 }}>Auditoria</h1>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={exportarCsv} style={{ height:42, borderRadius:14, border:'1px solid #e8ece8', background:'#fff', padding:'0 12px', fontWeight:800, cursor:'pointer' }}>CSV</button>
            <button onClick={exportarPdf} style={{ height:42, borderRadius:14, border:'none', background:'#176a25', color:'#fff', padding:'0 12px', fontWeight:800, cursor:'pointer' }}>PDF</button>
            <button onClick={cargar} style={{ width:42, height:42, borderRadius:14, border:'none', background:'#212121', color:'#fff', cursor:'pointer' }}>
              <i className="ti ti-refresh" style={{ fontSize:20 }} aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <div style={{ background:'#fff', border:'1px solid #e8ece8', borderRadius:18, padding:12, marginBottom:12, display:'grid', gridTemplateColumns:'1fr 1fr 1.3fr', gap:8 }}>
          <select value={filtro.modulo} onChange={e => setFiltro(f => ({ ...f, modulo:e.target.value }))}
            style={{ border:'1px solid #e8ece8', borderRadius:12, padding:'10px 12px', fontSize:13, background:'#fff' }}>
            <option value="">Todos los modulos</option>
            {modulos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input value={filtro.accion} onChange={e => setFiltro(f => ({ ...f, accion:e.target.value }))} placeholder="Accion"
            style={{ border:'1px solid #e8ece8', borderRadius:12, padding:'10px 12px', fontSize:13 }} />
          <input value={filtro.texto} onChange={e => setFiltro(f => ({ ...f, texto:e.target.value }))} placeholder="Buscar usuario, detalle o tabla"
            style={{ border:'1px solid #e8ece8', borderRadius:12, padding:'10px 12px', fontSize:13 }} />
        </div>

        {error && <div style={{ background:'#fff0f0', color:'#c84040', padding:'10px 12px', borderRadius:14, fontSize:13, marginBottom:12 }}>{error}</div>}
        {loading ? (
          <div style={{ textAlign:'center', padding:38, color:'#8b928b' }}>Cargando auditoria...</div>
        ) : visibles.length === 0 ? (
          <div style={{ textAlign:'center', padding:38, color:'#8b928b', background:'#fff', borderRadius:20 }}>Todavia no hay movimientos registrados.</div>
        ) : visibles.map(log => (
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
