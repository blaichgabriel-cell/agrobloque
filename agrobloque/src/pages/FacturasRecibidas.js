import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { leerFacturaPdf } from '../lib/facturaPdf'

const hoy = () => new Date().toISOString().slice(0, 10)
const fmtGs = value => Math.round(Number(value) || 0).toLocaleString('es-PY')
const parseGs = value => parseInt(String(value || '').replace(/[^0-9]/g, ''), 10) || 0
const categorias = ['Insumos', 'Mercaderia', 'Servicios', 'Reparaciones', 'Combustible', 'Otros']

const inicial = {
  fecha: hoy(), proveedor: '', ruc: '', comprobante: '', total: '', moneda: 'PYG',
  categoria: 'Insumos', descripcion: '', notas: '', confianza: 0, textoExtraido: '',
}

export default function FacturasRecibidas() {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [facturas, setFacturas] = useState([])
  const [archivo, setArchivo] = useState(null)
  const [form, setForm] = useState(inicial)
  const [estado, setEstado] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filtro, setFiltro] = useState('pendiente')
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768

  const cargar = async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('contabilidad_facturas')
      .select('*')
      .order('created_at', { ascending: false })
    if (queryError) {
      setError('Falta ejecutar el archivo SQL de facturas en Supabase.')
      setFacturas([])
    } else {
      setError('')
      setFacturas(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const visibles = useMemo(() => facturas.filter(f => filtro === 'todas' || f.estado === filtro), [facturas, filtro])
  const pendientes = facturas.filter(f => f.estado === 'pendiente').length

  const elegirArchivo = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Selecciona un archivo PDF.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('El PDF supera el limite de 10 MB.')
      return
    }

    setArchivo(file)
    setForm({ ...inicial, descripcion: `Compra segun factura ${file.name}` })
    setEstado('Leyendo el PDF…')
    setError('')
    setModal(true)
    try {
      const datos = await leerFacturaPdf(file)
      setForm(actual => ({
        ...actual,
        ...datos,
        total: datos.total ? fmtGs(datos.total) : '',
        descripcion: datos.proveedor ? `Compra a ${datos.proveedor}` : actual.descripcion,
      }))
      setEstado(datos.confianza >= 60
        ? 'Datos encontrados. Revisa antes de guardar.'
        : 'Lectura parcial. Completa los datos faltantes.')
    } catch (readError) {
      setEstado(readError.message || 'No se pudo leer el PDF. Completa los datos manualmente.')
    }
  }

  const cerrar = () => {
    if (saving) return
    setModal(false)
    setArchivo(null)
    setForm(inicial)
    setEstado('')
  }

  const guardarPendiente = async () => {
    const total = parseGs(form.total)
    if (!archivo || !form.fecha || !form.proveedor.trim() || total <= 0) {
      setError('Completa fecha, proveedor y total antes de guardar.')
      return
    }
    setSaving(true)
    setError('')
    let storagePath = ''
    try {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (!userId) throw new Error('La sesion vencio. Inicia sesion nuevamente.')
      const safeName = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      storagePath = `${userId}/${crypto.randomUUID()}-${safeName}`
      const upload = await supabase.storage.from('facturas-contabilidad').upload(storagePath, archivo, {
        contentType: 'application/pdf', upsert: false,
      })
      if (upload.error) throw upload.error

      const insert = await supabase.from('contabilidad_facturas').insert({
        usuario_id: userId,
        estado: 'pendiente',
        origen: 'carga_manual',
        archivo_nombre: archivo.name,
        archivo_path: storagePath,
        fecha_factura: form.fecha,
        proveedor: form.proveedor.trim(),
        ruc: form.ruc.trim() || null,
        comprobante: form.comprobante.trim() || null,
        total,
        moneda: form.moneda,
        categoria: form.categoria,
        descripcion: form.descripcion.trim() || `Compra a ${form.proveedor.trim()}`,
        notas: form.notas.trim() || null,
        confianza_lectura: form.confianza || 0,
        texto_extraido: form.textoExtraido || null,
      })
      if (insert.error) throw insert.error
      setModal(false)
      setArchivo(null)
      setForm(inicial)
      setEstado('')
      await cargar()
    } catch (saveError) {
      if (storagePath) await supabase.storage.from('facturas-contabilidad').remove([storagePath])
      setError(saveError.message || 'No se pudo guardar la factura.')
    } finally {
      setSaving(false)
    }
  }

  const aprobar = async factura => {
    if (!window.confirm(`Cargar la factura de ${factura.proveedor} por Gs. ${fmtGs(factura.total)} en Contabilidad?`)) return
    setError('')
    const { error: rpcError } = await supabase.rpc('aprobar_factura_contabilidad', { p_factura_id: factura.id })
    if (rpcError) setError(rpcError.message || 'No se pudo aprobar la factura.')
    else cargar()
  }

  const rechazar = async factura => {
    if (!window.confirm('Marcar esta factura como rechazada? El PDF se conserva.')) return
    const { error: updateError } = await supabase
      .from('contabilidad_facturas').update({ estado: 'rechazada' }).eq('id', factura.id)
    if (updateError) setError(updateError.message || 'No se pudo rechazar la factura.')
    else cargar()
  }

  const abrirPdf = async factura => {
    const { data, error: signedError } = await supabase.storage
      .from('facturas-contabilidad').createSignedUrl(factura.archivo_path, 60)
    if (signedError) setError('No se pudo abrir el PDF.')
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <main style={{ minHeight:'100vh', background:'#f6f8f7', padding:isDesktop ? '32px 36px 100px' : '22px 14px 100px' }}>
      <header style={{ maxWidth:1080, margin:'0 auto 18px', display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <button onClick={() => navigate('/contabilidad')} aria-label="Volver a Contabilidad" style={iconButton}>
            <i className="ti ti-arrow-left" aria-hidden="true" />
          </button>
          <div>
            <div style={{ fontSize:11, color:'#697970', marginBottom:4 }}>Contabilidad · documentos privados</div>
            <h1 style={{ margin:0, fontSize:isDesktop ? 25 : 21, color:'#182c25' }}>Facturas recibidas</h1>
          </div>
        </div>
        <button onClick={() => inputRef.current?.click()} style={primaryButton}>
          <i className="ti ti-upload" aria-hidden="true" /> <span>{isDesktop ? 'Subir factura PDF' : 'Subir PDF'}</span>
        </button>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={elegirArchivo} hidden />
      </header>

      <div style={{ maxWidth:1080, margin:'0 auto' }}>
        <section style={notice}>
          <i className="ti ti-shield-check" style={{ fontSize:22, color:'#08603f' }} aria-hidden="true" />
          <div><strong>Prueba controlada</strong><div style={{ marginTop:3, color:'#667069' }}>El sistema intenta leer el PDF, pero nada entra al balance hasta que vos lo apruebes.</div></div>
        </section>

        {error && <div role="alert" style={errorBox}>{error}</div>}

        <div style={{ display:'flex', gap:6, margin:'14px 0', overflowX:'auto' }}>
          {[
            ['pendiente', `Pendientes (${pendientes})`],
            ['aprobada', 'Aprobadas'],
            ['rechazada', 'Rechazadas'],
            ['todas', 'Todas'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setFiltro(key)} style={filtro === key ? tabActive : tab}>{label}</button>
          ))}
        </div>

        <section style={panel}>
          {loading ? <Empty icon="ti-loader-2" text="Cargando facturas…" /> : visibles.length === 0 ? (
            <Empty icon="ti-file-invoice" text={filtro === 'pendiente' ? 'No hay facturas pendientes. Subi un PDF para comenzar.' : 'No hay facturas en esta sección.'} />
          ) : visibles.map(factura => (
            <article key={factura.id} style={row}>
              <div style={{ ...documentIcon, background:factura.estado === 'aprobada' ? '#edf7f1' : factura.estado === 'rechazada' ? '#f4f4f4' : '#fff6e7' }}>
                <i className="ti ti-file-type-pdf" aria-hidden="true" />
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}>
                  <strong style={{ color:'#17231e', fontSize:14 }}>{factura.proveedor}</strong>
                  <Estado estado={factura.estado} />
                </div>
                <div style={{ color:'#707a73', fontSize:12, marginTop:4 }}>
                  {factura.fecha_factura} · {factura.comprobante || 'Sin numero'}{factura.ruc ? ` · RUC ${factura.ruc}` : ''}
                </div>
                <div style={{ color:'#929993', fontSize:11, marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{factura.archivo_nombre}</div>
              </div>
              <div style={{ display:'grid', justifyItems:'end', gap:7 }}>
                <strong style={{ color:'#182c25', whiteSpace:'nowrap' }}>{factura.moneda === 'USD' ? 'USD' : 'Gs.'} {fmtGs(factura.total)}</strong>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => abrirPdf(factura)} style={miniButton} title="Ver PDF"><i className="ti ti-eye" /></button>
                  {factura.estado === 'pendiente' && <>
                    <button onClick={() => rechazar(factura)} style={{ ...miniButton, color:'#9b3c3c' }} title="Rechazar"><i className="ti ti-x" /></button>
                    <button onClick={() => aprobar(factura)} style={{ ...miniButton, background:'#08603f', color:'#fff', borderColor:'#08603f' }} title="Aprobar"><i className="ti ti-check" /></button>
                  </>}
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>

      {modal && (
        <div style={overlay} role="presentation" onMouseDown={event => event.target === event.currentTarget && cerrar()}>
          <section role="dialog" aria-modal="true" aria-labelledby="factura-title" style={sheet}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:16 }}>
              <div><div style={{ fontSize:11, color:'#697970' }}>Revisar lectura</div><h2 id="factura-title" style={{ margin:'4px 0 0', fontSize:20 }}>Nueva factura</h2></div>
              <button onClick={cerrar} style={iconButton} aria-label="Cerrar"><i className="ti ti-x" /></button>
            </div>
            <div style={fileSummary}><i className="ti ti-file-type-pdf" /><div style={{ minWidth:0 }}><strong style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{archivo?.name}</strong><small>{estado}</small></div></div>
            {error && <div role="alert" style={{ ...errorBox, marginTop:0, marginBottom:12 }}>{error}</div>}
            <div style={{ display:'grid', gridTemplateColumns:isDesktop ? '1fr 1fr' : '1fr', gap:isDesktop ? 10 : 0 }}>
              <Field label="Fecha de factura" type="date" value={form.fecha} onChange={value => setForm(f => ({ ...f, fecha:value }))} />
              <Field label="Proveedor" required value={form.proveedor} onChange={value => setForm(f => ({ ...f, proveedor:value }))} />
              <Field label="RUC" value={form.ruc} onChange={value => setForm(f => ({ ...f, ruc:value }))} />
              <Field label="Numero de factura" value={form.comprobante} onChange={value => setForm(f => ({ ...f, comprobante:value }))} />
              <Field label="Total en guaranies" required inputMode="numeric" value={form.total} onChange={value => setForm(f => ({ ...f, total:fmtGs(parseGs(value)) }))} />
              <label style={fieldWrap}><span style={label}>Categoria</span><select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria:e.target.value }))} style={input}>{categorias.map(item => <option key={item}>{item}</option>)}</select></label>
            </div>
            <Field label="Descripcion" value={form.descripcion} onChange={value => setForm(f => ({ ...f, descripcion:value }))} />
            <Field label="Notas (opcional)" value={form.notas} onChange={value => setForm(f => ({ ...f, notas:value }))} />
            <button onClick={guardarPendiente} disabled={saving} style={{ ...primaryButton, width:'100%', justifyContent:'center', opacity:saving ? .65 : 1 }}>{saving ? 'Guardando…' : 'Guardar para revisar'}</button>
            <button onClick={cerrar} disabled={saving} style={secondaryButton}>Cancelar</button>
          </section>
        </div>
      )}
    </main>
  )
}

function Field({ label: text, value, onChange, type = 'text', inputMode, required }) {
  return <label style={fieldWrap}><span style={label}>{text}{required ? ' *' : ''}</span><input type={type} inputMode={inputMode} value={value || ''} onChange={e => onChange(e.target.value)} style={input} /></label>
}

function Empty({ icon, text }) {
  return <div style={{ padding:'42px 20px', textAlign:'center', color:'#778079' }}><i className={`ti ${icon}`} style={{ display:'block', fontSize:30, marginBottom:10 }} /><span style={{ fontSize:13 }}>{text}</span></div>
}

function Estado({ estado }) {
  const cfg = estado === 'aprobada' ? ['Aprobada', '#e7f5eb', '#176a35'] : estado === 'rechazada' ? ['Rechazada', '#f0f1f0', '#656b67'] : ['Pendiente', '#fff2d8', '#8c5b00']
  return <span style={{ padding:'3px 7px', borderRadius:7, background:cfg[1], color:cfg[2], fontSize:10, fontWeight:700 }}>{cfg[0]}</span>
}

const panel = { background:'#fff', border:'1px solid #e5eae6', borderRadius:10, padding:'4px 16px' }
const notice = { display:'flex', gap:11, alignItems:'flex-start', padding:'13px 14px', background:'#edf7f1', border:'1px solid #d6eade', borderRadius:9, color:'#254234', fontSize:12 }
const errorBox = { background:'#fff0ed', border:'1px solid #f4c9c2', color:'#9b3026', borderRadius:8, padding:'10px 12px', fontSize:12, marginTop:12 }
const row = { display:'grid', gridTemplateColumns:'42px minmax(0, 1fr) auto', gap:11, alignItems:'center', padding:'13px 0', borderBottom:'1px solid #edf0ed' }
const documentIcon = { width:42, height:42, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', color:'#be3b32', fontSize:21 }
const iconButton = { width:40, height:40, border:'1px solid #dfe5e0', borderRadius:8, background:'#fff', color:'#37423c', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }
const primaryButton = { minHeight:42, border:'none', borderRadius:8, background:'#124e38', color:'#fff', padding:'0 14px', fontWeight:700, fontSize:12, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }
const secondaryButton = { width:'100%', marginTop:8, border:'1px solid #dde3de', borderRadius:8, background:'#fff', color:'#586159', padding:12, fontWeight:700, cursor:'pointer' }
const miniButton = { width:31, height:31, border:'1px solid #dfe5e0', borderRadius:8, background:'#fff', color:'#4e5851', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center' }
const tab = { border:'1px solid #dfe5e0', borderRadius:8, background:'#fff', color:'#667069', padding:'8px 11px', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }
const tabActive = { ...tab, background:'#182c25', borderColor:'#182c25', color:'#fff' }
const overlay = { position:'fixed', inset:0, zIndex:200, background:'rgba(14, 24, 19, .48)', display:'flex', alignItems:typeof window !== 'undefined' && window.innerWidth >= 768 ? 'center' : 'flex-end', justifyContent:'center' }
const sheet = { width:'100%', maxWidth:620, maxHeight:'92vh', overflowY:'auto', boxSizing:'border-box', padding:'22px 20px 28px', background:'#f7f9f7', borderRadius:typeof window !== 'undefined' && window.innerWidth >= 768 ? 16 : '18px 18px 0 0' }
const fileSummary = { display:'grid', gridTemplateColumns:'28px minmax(0, 1fr)', gap:9, alignItems:'center', padding:11, marginBottom:14, border:'1px solid #e2e7e3', borderRadius:8, background:'#fff', color:'#314039', fontSize:12 }
const fieldWrap = { display:'block', minWidth:0 }
const label = { display:'block', margin:'0 0 5px', color:'#707970', fontSize:10, fontWeight:700, textTransform:'uppercase' }
const input = { width:'100%', boxSizing:'border-box', border:'1px solid #dfe5e0', borderRadius:8, background:'#fff', color:'#18201b', padding:'11px 12px', fontSize:13, marginBottom:11 }
