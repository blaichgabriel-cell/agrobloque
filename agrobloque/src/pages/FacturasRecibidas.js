import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { leerFacturaPdf } from '../lib/facturaPdf'
import { useCan } from '../lib/RoleContext'
import UnifiedFormModal, { ModalSection, ModalGrid, ModalField, ModalGroup, DateQuickField, ChoiceChips, resumenPie, fechaIso } from '../components/UnifiedFormModal'
import { toast } from 'sonner'
import { useConfirmar } from '../components/ModalConfirm'

const hoy = () => fechaIso(0)
const fmtGs = value => Math.round(Number(value) || 0).toLocaleString('es-PY')
const parseGs = value => parseInt(String(value || '').replace(/[^0-9]/g, ''), 10) || 0
const categorias = ['Insumos', 'Mercaderia', 'Servicios', 'Reparaciones', 'Combustible', 'Otros']

const inicial = {
  fecha: hoy(), proveedor: '', ruc: '', comprobante: '', total: '', moneda: 'PYG',
  categoria: 'Insumos', descripcion: '', notas: '', confianza: 0, textoExtraido: '',
}

export default function FacturasRecibidas({ role }) {
  const can = useCan('contabilidad')
  const [pedir, dialogoConfirmar] = useConfirmar()
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
    setForm({ ...inicial, fecha: hoy(), descripcion: `Compra segun factura ${file.name}` })
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
      if (!userId) throw new Error('La sesión venció. Inicia sesión nuevamente.')
      const safeName = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      // Multiempresa: la carpeta raiz es la organizacion (organizacion_id/usuario_id/archivo.pdf).
      // Sin organizacion (base anterior) se mantiene la ruta vieja usuario_id/archivo.pdf.
      const carpeta = role?.organizacionId ? `${role.organizacionId}/${userId}` : userId
      storagePath = `${carpeta}/${crypto.randomUUID()}-${safeName}`
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
      toast.success('Factura guardada para revisar', { description: `${form.proveedor.trim()} · Gs. ${fmtGs(total)}` })
    } catch (saveError) {
      if (storagePath) await supabase.storage.from('facturas-contabilidad').remove([storagePath])
      setError(saveError.message || 'No se pudo guardar la factura.')
    } finally {
      setSaving(false)
    }
  }

  const aprobar = async factura => {
    if (!(await pedir({ titulo: '¿Cargar la factura en Contabilidad?', mensaje: `${factura.proveedor} · Gs. ${fmtGs(factura.total)}. Entra al balance como un movimiento.`, textoBoton: 'Aprobar y cargar', tono: 'info' }))) return
    setError('')
    const { error: rpcError } = await supabase.rpc('aprobar_factura_contabilidad', { p_factura_id: factura.id })
    if (rpcError) setError(rpcError.message || 'No se pudo aprobar la factura.')
    else cargar()
  }

  const rechazar = async factura => {
    if (!(await pedir({ titulo: '¿Rechazar esta factura?', mensaje: 'Queda marcada como rechazada. El PDF se conserva.', textoBoton: 'Rechazar', tono: 'aviso' }))) return
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
    <main className="ui-71cde8" style={{ padding:isDesktop ? '32px 36px 100px' : '22px 14px 100px' }}>
      <header className="ui-6dc486">
        <div className="ui-118850">
          <button onClick={() => navigate('/contabilidad')} aria-label="Volver a Contabilidad" style={iconButton}>
            <i className="ti ti-arrow-left" aria-hidden="true" />
          </button>
          <div>
            <div className="ui-18854e">Contabilidad · documentos privados</div>
            <h1 className="ui-fc3fb4" style={{ fontSize:isDesktop ? 25 : 21 }}>Facturas recibidas</h1>
          </div>
        </div>
        {can.create && <button onClick={() => inputRef.current?.click()} style={primaryButton}>
          <i className="ti ti-upload" aria-hidden="true" /> <span>{isDesktop ? 'Subir factura PDF' : 'Subir PDF'}</span>
        </button>}
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={elegirArchivo} hidden />
      </header>

      <div className="ui-696e8a">
        <section style={notice}>
          <i className="ti ti-shield-check ui-1cfb3f" aria-hidden="true" />
          <div><strong>Prueba controlada</strong><div className="ui-e8c73b">El sistema intenta leer el PDF, pero nada entra al balance hasta que vos lo apruebes.</div></div>
        </section>

        {error && <div role="alert" style={errorBox}>{error}</div>}

        <div className="ui-d5c4f2">
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
              <div className="ui-3f9f96">
                <div className="ui-f2535c">
                  <strong className="ui-3e2dd6">{factura.proveedor}</strong>
                  <Estado estado={factura.estado} />
                </div>
                <div className="ui-ec4b50">
                  {factura.fecha_factura} · {factura.comprobante || 'Sin número'}{factura.ruc ? ` · RUC ${factura.ruc}` : ''}
                </div>
                <div className="ui-f99029">{factura.archivo_nombre}</div>
              </div>
              <div className="ui-bf011c">
                <strong className="ui-c1859e">{factura.moneda === 'USD' ? 'USD' : 'Gs.'} {fmtGs(factura.total)}</strong>
                <div className="ui-91294d">
                  <button onClick={() => abrirPdf(factura)} style={miniButton} title="Ver PDF"><i className="ti ti-eye" /></button>
                  {factura.estado === 'pendiente' && can.edit && <>
                    <button className="ui-d1059a" onClick={() => rechazar(factura)} style={{ ...miniButton }} title="Rechazar"><i className="ti ti-x" /></button>
                    <button className="ui-52184b" onClick={() => aprobar(factura)} style={{ ...miniButton }} title="Aprobar"><i className="ti ti-check" /></button>
                  </>}
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>

      <UnifiedFormModal
        open={modal}
        tone="finanzas"
        icon="ti-file-type-pdf"
        eyebrow="Revisar lectura"
        title="Nueva factura"
        label="Nueva factura"
        busy={saving}
        onClose={cerrar}
        onSubmit={guardarPendiente}
        submitLabel="Guardar para revisar"
        error={modal ? error : ''}
        summary={resumenPie([
          { solo: form.proveedor.trim() },
          { solo: parseGs(form.total) > 0 ? `Gs. ${fmtGs(parseGs(form.total))}` : '' },
          { solo: form.categoria },
        ]) || 'Proveedor, fecha y total de la factura'}
      >{() => <>
        <div className="apple-list__row">
          <span className="apple-subpanel__icon" aria-hidden="true"><i className="ti ti-file-type-pdf" /></span>
          <div className="apple-list__main"><strong>{archivo?.name}</strong>{estado && <small aria-live="polite">{estado}</small>}</div>
        </div>
        <ModalSection title="Factura" icon="ti-file-invoice">
          <ModalGrid>
            <ModalField label="Proveedor *"><input className="apple-control" data-autofocus value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} placeholder="Nombre del proveedor" /></ModalField>
            <DateQuickField label="Fecha de factura" required value={form.fecha} onChange={fecha => setForm(f => ({ ...f, fecha }))} />
          </ModalGrid>
          <ModalGrid>
            <ModalField label="RUC"><input className="apple-control apple-control--num" value={form.ruc} onChange={e => setForm(f => ({ ...f, ruc: e.target.value }))} placeholder="Ej: 80012345-6" /></ModalField>
            <ModalField label="Número de factura"><input className="apple-control apple-control--num" value={form.comprobante} onChange={e => setForm(f => ({ ...f, comprobante: e.target.value }))} placeholder="Ej: 001-001-0001234" /></ModalField>
          </ModalGrid>
        </ModalSection>
        <ModalSection title="Importe y categoría" icon="ti-cash">
          <ModalField label="Total en guaraníes *"><input className="apple-control apple-control--num" type="text" inputMode="numeric" value={form.total} onWheel={e => e.currentTarget.blur()} onChange={e => { const n = parseGs(e.target.value); setForm(f => ({ ...f, total: n ? fmtGs(n) : '' })) }} placeholder="Ej: 1.500.000" /></ModalField>
          <ModalGroup label="Categoría">
            <ChoiceChips wrap label="Categoría de la factura" value={form.categoria} onChange={categoria => setForm(f => ({ ...f, categoria }))} options={categorias.map(c => ({ value: c, label: c }))} />
          </ModalGroup>
        </ModalSection>
        <ModalSection title="Detalles opcionales" icon="ti-adjustments-horizontal" collapsible defaultOpen={false} badge="descripción, notas">
          <ModalField label="Descripción"><input className="apple-control" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Compra de fertilizantes" /></ModalField>
          <ModalField label="Notas"><input className="apple-control" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Opcional" /></ModalField>
        </ModalSection>
      </>}</UnifiedFormModal>

      {dialogoConfirmar}
    </main>
  )
}

function Empty({ icon, text }) {
  return <div className="ui-33b68b"><i className={`${`ti ${icon}`} ui-7068c5`} /><span className="ui-3044b6">{text}</span></div>
}

function Estado({ estado }) {
  const cfg = estado === 'aprobada' ? ['Aprobada', '#e7f5eb', '#176a35'] : estado === 'rechazada' ? ['Rechazada', '#f0f1f0', '#656b67'] : ['Pendiente', '#fff2d8', '#8c5b00']
  return <span className="ui-61bc14" style={{ background:cfg[1], color:cfg[2] }}>{cfg[0]}</span>
}

const panel = { background:'#fff', border:'1px solid #e5eae6', borderRadius:10, padding:'4px 16px' }
const notice = { display:'flex', gap:11, alignItems:'flex-start', padding:'13px 14px', background:'#edf7f1', border:'1px solid #d6eade', borderRadius:9, color:'#254234', fontSize:12 }
const errorBox = { background:'#fff0ed', border:'1px solid #f4c9c2', color:'#9b3026', borderRadius:8, padding:'10px 12px', fontSize:12, marginTop:12 }
const row = { display:'grid', gridTemplateColumns:'42px minmax(0, 1fr) auto', gap:11, alignItems:'center', padding:'13px 0', borderBottom:'1px solid #edf0ed' }
const documentIcon = { width:42, height:42, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', color:'#be3b32', fontSize:21 }
const iconButton = { width:40, height:40, border:'1px solid #dfe5e0', borderRadius:8, background:'#fff', color:'#37423c', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }
const primaryButton = { minHeight:42, border:'none', borderRadius:8, background:'#124e38', color:'#fff', padding:'0 14px', fontWeight:700, fontSize:12, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }
const miniButton = { width:31, height:31, border:'1px solid #dfe5e0', borderRadius:8, background:'#fff', color:'#4e5851', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center' }
const tab = { border:'1px solid #dfe5e0', borderRadius:8, background:'#fff', color:'#667069', padding:'8px 11px', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }
const tabActive = { ...tab, background:'#182c25', borderColor:'#182c25', color:'#fff' }
