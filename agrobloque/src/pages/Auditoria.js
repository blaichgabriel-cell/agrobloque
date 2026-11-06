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
        <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Detalle</th></tr>
        ${visibles.map(log => `<tr><td>${esc(String(log.created_at || '').slice(0, 16).replace('T', ' '))}</td><td>${esc(log.usuario_email || '')}</td><td>${esc(log.accion || '')}</td><td>${esc(log.modulo || '')}</td><td>${esc(log.detalle || '')}</td></tr>`).join('')}
      </table>
    `)
  }

  return (
    <div className="ui-71cde8" style={{ padding: typeof window !== 'undefined' && window.innerWidth >= 768 ? '34px 36px 100px' : '24px 14px 100px' }}>
      <div className="ui-f47a4b" style={{ maxWidth: typeof window !== 'undefined' && window.innerWidth >= 768 ? 1180 : 900 }}>
        <div className="ui-ec8096">
          <div>
            <div className="ui-93a7e1">Registro interno</div>
            <h1 className="ui-ee8706">Auditoria</h1>
          </div>
          <div className="ui-9c6869">
            <button className="ui-2d8a82" onClick={exportarCsv}>CSV</button>
            <button className="ui-b6b93a" onClick={exportarPdf}>PDF</button>
            <button className="ui-eb7bbd" onClick={cargar}>
              <i className="ti ti-refresh ui-e5e6f8" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <div className="ui-8e13c4">
          <select className="ui-13d88e" value={filtro.modulo} onChange={e => setFiltro(f => ({ ...f, modulo:e.target.value }))}
           >
            <option value="">Todos los modulos</option>
            {modulos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input className="ui-ea25ac" value={filtro.accion} onChange={e => setFiltro(f => ({ ...f, accion:e.target.value }))} placeholder="Acción"
            />
          <input className="ui-ea25ac" value={filtro.texto} onChange={e => setFiltro(f => ({ ...f, texto:e.target.value }))} placeholder="Buscar usuario, detalle o tabla"
            />
        </div>

        {error && <div className="ui-9392ce">{error}</div>}
        {loading ? (
          <div className="ui-4e47d3">Cargando auditoria...</div>
        ) : visibles.length === 0 ? (
          <div className="ui-c59321">Todavia no hay movimientos registrados.</div>
        ) : visibles.map(log => (
          <div className="ui-b0ecff" key={log.id} style={{ boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 10px 28px rgba(29,38,29,0.045)' : 'none' }}>
            <div className="ui-8ac9c1">
              <strong className="ui-3dd9b4">{log.accion}</strong>
              <span className="ui-51b095">{String(log.created_at || '').slice(0, 16).replace('T', ' ')}</span>
            </div>
            <div className="ui-93a7e1">
              {log.modulo}{log.tabla ? ` - ${log.tabla}` : ''}{log.registro_id ? ` - ${log.registro_id}` : ''}
            </div>
            {log.detalle && <div className="ui-bbba42">{log.detalle}</div>}
            {log.usuario_email && <div className="ui-5f3fea">{log.usuario_email}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
