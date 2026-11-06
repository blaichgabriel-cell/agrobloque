import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NotasPanel from '../components/NotasPanel'
import { descargarCsv } from '../lib/exporters'
import { registrarAuditoria } from '../lib/audit'

const TIPOS_COSTO = [
  { key:'insumos',              label:'Insumos',              icon:'ti-seeding',     color:"#124e38", bg:'#eeeeee' },
  { key:'combustible',          label:'Combustible',          icon:'ti-flame',       color:'#e07b00', bg:'#fff3e8' },
  { key:'herramientas',         label:'Herramientas',         icon:'ti-tool',        color:'#555',    bg:'#f2f1ef' },
  { key:'electricidad',         label:'Electricidad',         icon:'ti-bolt',        color:'#2980b9', bg:'#eaf4fb' },
  { key:'gastos_administrativos',label:'Gastos administrativos',icon:'ti-file-invoice',color:'#8e44ad',bg:'#f5eefb' },
  { key:'otro',                 label:'Otro',                 icon:'ti-plus-circle', color:'#888',    bg:'#f2f1ef' },
]

const parsearGs = (v) => parseInt(String(v || '').replace(/\./g, ''), 10) || 0
const fmtGs = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY')

export default function Costos({ campoActivo, isGuest = false }) {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const [campos, setCampos] = useState([])
  const [campoSel, setCampoSel] = useState(null)
  const [bloques, setBloques] = useState([])
  const [costosAuto, setCostosAuto] = useState({ agroquimicos: 0, jornales: 0 })
  const [costosManuales, setCostosManuales] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ tipo:'insumos', descripcion:'', monto:'', fecha: new Date().toISOString().split('T')[0], bloque_id:'' })
  const [saving, setSaving] = useState(false)
  const [periodo, setPeriodo] = useState('mes')

  useEffect(() => { fetchCampos() }, [])
  useEffect(() => { if (campoActivo) setCampoSel(campoActivo) }, [campoActivo])
  useEffect(() => { if (campoSel) { fetchBloques(); fetchCostos() } }, [campoSel, periodo])

  const fetchCampos = async () => {
    const { data } = await supabase.from('campos').select('*').order('nombre')
    const lista = data || []
    setCampos(lista)
    if (!campoSel && lista.length > 0) {
      const campoGuardado = typeof window !== 'undefined' ? window.localStorage.getItem('agrobloque-campo-activo') : null
      setCampoSel(campoActivo || lista.find(c => c.id === campoGuardado) || lista[0])
    }
  }

  const fetchBloques = async () => {
    const { data } = await supabase.from('bloques').select('*').eq('campo_id', campoSel.id).order('codigo')
    setBloques(data || [])
  }

  const getFechaDesde = () => {
    if (periodo === 'total') return '2020-01-01'
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
  }

  const formVacio = () => ({ tipo:'insumos', descripcion:'', monto:'', fecha: new Date().toISOString().split('T')[0], bloque_id:'' })

  const abrirNuevo = () => {
    setForm(formVacio())
    setModal(true)
  }

  const abrirEditar = (costo) => {
    setForm({
      id: costo.id,
      tipo: costo.tipo || 'insumos',
      descripcion: costo.descripcion || '',
      monto: costo.monto ? fmtGs(costo.monto) : '',
      fecha: costo.fecha || new Date().toISOString().split('T')[0],
      bloque_id: costo.bloque_id || '',
    })
    setModal(true)
  }

  const cerrarModal = () => {
    setModal(false)
    setForm(formVacio())
  }

  const fetchCostos = async () => {
    const desde = getFechaDesde()
    const { data: fumis } = await supabase.from('fumigaciones')
      .select('fumigacion_productos(dosis, descuento_stock, productos(precio_unitario))')
      .eq('campo_id', campoSel.id).gte('fecha', desde)
    let totalAgro = 0
    fumis?.forEach(f => f.fumigacion_productos?.forEach(fp => {
        totalAgro += (Number(fp.productos?.precio_unitario) || 0) * (Number(fp.descuento_stock ?? parseFloat(fp.dosis)) || 0)
    }))
    const { data: asist } = isGuest
      ? { data: [] }
      : await supabase.from('asistencia')
        .select('monto, operarios(campo_id)').gte('fecha', desde)
    let totalJornales = 0
    asist?.forEach(a => { if (a.operarios?.campo_id === campoSel.id) totalJornales += Number(a.monto) || 0 })
    setCostosAuto({ agroquimicos: totalAgro, jornales: totalJornales })
    const { data: manuales } = await supabase.from('costos')
      .select('*, bloques(codigo)').eq('campo_id', campoSel.id).gte('fecha', desde).order('fecha', { ascending: false })
    setCostosManuales(manuales || [])
  }

  const guardar = async () => {
    if (!form.monto || !form.fecha) return
    setSaving(true)
    const payload = {
      tipo: form.tipo, descripcion: form.descripcion || null,
      monto: parsearGs(form.monto), fecha: form.fecha,
      campo_id: campoSel?.id || null, bloque_id: form.bloque_id || null
    }
    if (form.id) await supabase.from('costos').update(payload).eq('id', form.id)
    else await supabase.from('costos').insert(payload)
    await registrarAuditoria({
      accion: form.id ? 'Edito costo manual' : 'Registro costo manual',
      modulo: 'Costos',
      tabla: 'costos',
      registroId: form.id || '',
      detalle: `${payload.descripcion || payload.tipo} - Gs. ${payload.monto}`,
    })
    await fetchCostos(); setSaving(false); cerrarModal()
  }

  const eliminar = async (id) => {
    await supabase.from('costos').delete().eq('id', id)
    await registrarAuditoria({ accion:'Elimino costo manual', modulo:'Costos', tabla:'costos', registroId:id })
    fetchCostos()
  }

  const totalManuales = costosManuales.reduce((s, c) => s + Number(c.monto), 0)
  const totalGeneral = costosAuto.agroquimicos + costosAuto.jornales + totalManuales

  const exportarCostos = () => {
    const rows = costosManuales.map(c => ({
      Fecha: c.fecha,
      Tipo: TIPOS_COSTO.find(t => t.key === c.tipo)?.label || c.tipo,
      Descripcion: c.descripcion || '',
      Bloque: c.bloques?.codigo || '',
      Monto: Number(c.monto) || 0,
    }))
    descargarCsv('costos-manuales', ['Fecha', 'Tipo', 'Descripcion', 'Bloque', 'Monto'], rows)
  }

  return (
    <div className="ui-c1c124">
      <div className="ui-341bdc" style={{ padding: isDesktop ? '34px 36px 18px' : '24px 20px 16px' }}>
        <div className="ui-796b93">
          <div>
            <div className="ui-476525">Gastos</div>
            <div className="ui-136b85">Costos</div>
          </div>
          <div className="ui-9c6869">
            <button className="ui-08ca22" onClick={exportarCostos}>
              <i className="ti ti-download ui-a780bf" aria-hidden="true"></i>
            </button>
            {!isGuest && (
              <button className="ui-11115c" onClick={abrirNuevo}>
                <i className="ti ti-plus ui-d0538c" aria-hidden="true"></i>
              </button>
            )}
          </div>
        </div>
        {campos.length > 1 && (
          <div className="ui-38410c">
            {campos.map(c => (
              <button className="ui-7cf9f5" key={c.id} onClick={() => setCampoSel(c)} style={{ background: campoSel?.id===c.id ? '#0F3923' : 'transparent', color: campoSel?.id===c.id ? '#fff' : 'var(--text-secondary)' }}>{c.nombre}</button>
            ))}
          </div>
        )}
        <div className="ui-32b742">
          {[['mes','Este mes'],['total','Historico']].map(([k,v]) => (
            <button className="ui-7cf9f5" key={k} onClick={() => setPeriodo(k)} style={{ background: periodo===k ? '#fff' : 'transparent', color: periodo===k ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: isDesktop ? '8px 36px 100px' : '8px 14px 100px' }}>
        <div className="ui-006f11">
          <div className="ui-280a4b">Total costos · {periodo === 'mes' ? 'este mes' : 'histórico'}</div>
          <div className="ui-e20fb2">Gs. {fmtGs(totalGeneral)}</div>
          <div className="ui-d773dd">{campoSel?.nombre}</div>
        </div>

        <div className="ui-998b74" style={{ gridTemplateColumns: isDesktop ? '0.9fr 1.1fr' : '1fr', gap: isDesktop ? 12 : 0 }}>
        <div className="ui-8551ef" style={{ boxShadow: isDesktop ? '0 10px 28px rgba(29,38,29,0.045)' : 'none' }}>
          <div className="ui-b98565">Calculados automaticamente</div>
          {[
            { icon:'ti-spray', color:'#e07b00', bg:'#fff3e8', label:'Agroquimicos', sub:'Desde fumigaciones registradas', val: costosAuto.agroquimicos },
            ...(!isGuest ? [{ icon:'ti-users', color:"#124e38", bg:'#eeeeee', label:'Jornales', sub:'Desde asistencia registrada', val: costosAuto.jornales }] : []),
          ].map((item, i) => (
            <div className="ui-0ff2a8" key={i} style={{ borderBottom: i===0 ? '1px solid #f2f1ef' : 'none' }}>
              <div className="ui-c36754">
                <div className="ui-ce59bb" style={{ background:item.bg }}>
                  <i className={`${`ti ${item.icon}`} ui-3dd9b4`} style={{ color:item.color }} aria-hidden="true"></i>
                </div>
                <div>
                  <div className="ui-197309">{item.label}</div>
                  <div className="ui-552ff3">{item.sub}</div>
                </div>
              </div>
              <div className="ui-788a2f">{item.val > 0 ? `Gs. ${fmtGs(item.val)}` : '—'}</div>
            </div>
          ))}
        </div>

        <div className="ui-8551ef" style={{ boxShadow: isDesktop ? '0 10px 28px rgba(29,38,29,0.045)' : 'none' }}>
          <div className="ui-546e10">
            <div className="ui-f25207">Costos manuales</div>
            <div className="ui-1d6b4b">Gs. {fmtGs(totalManuales)}</div>
          </div>
          {costosManuales.length === 0 ? (
            <div className="ui-004b1b">Sin costos manuales registrados</div>
          ) : costosManuales.map(c => {
            const tipo = TIPOS_COSTO.find(t => t.key === c.tipo) || TIPOS_COSTO[5]
            return (
              <div className="ui-9760f1" key={c.id}>
                <div className="ui-94c3f8" style={{ background:tipo.bg }}>
                  <i className={`${`ti ${tipo.icon}`} ui-0cf08e`} style={{ color:tipo.color }} aria-hidden="true"></i>
                </div>
                <div className="ui-da5cd6">
                  <div className="ui-0993fa">{c.descripcion || tipo.label}</div>
                  <div className="ui-552ff3">{c.fecha}{c.bloques?.codigo ? ' · ' + c.bloques.codigo : ''}</div>
                </div>
                <div className="ui-1d6b4b">Gs. {fmtGs(c.monto)}</div>
                {!isGuest && (
                  <>
                    <button className="ui-65faee" onClick={() => abrirEditar(c)}>
                      <i className="ti ti-pencil ui-93a7e1" aria-hidden="true"></i>
                    </button>
                    <button className="ui-ead866" onClick={() => eliminar(c.id)}>
                      <i className="ti ti-x ui-eafd27" aria-hidden="true"></i>
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
        </div>
        <NotasPanel modulo="costos" titulo="Bloc de notas de costos" />
      </div>

      {modal && (
        <div className="ui-66d878" style={{ alignItems: typeof window !== 'undefined' && window.innerWidth >= 768 ? 'center' : 'flex-end' }}>
          <div className="ui-526967" style={{ borderRadius: typeof window !== 'undefined' && window.innerWidth >= 768 ? 24 : '24px 24px 0 0', boxShadow: typeof window !== 'undefined' && window.innerWidth >= 768 ? '0 24px 70px rgba(0,0,0,0.24)' : 'none' }}>
            <div className="ui-c7b1b6">{form.id ? 'Editar costo' : 'Nuevo costo'}</div>
            <div className="ui-ad3529">Tipo</div>
            <div className="ui-06c66f">
              {TIPOS_COSTO.map(t => (
                <button className="ui-5430d5" key={t.key} onClick={() => setForm(f => ({...f, tipo:t.key}))} style={{ background: form.tipo===t.key ? '#0F3923' : '#fff', color: form.tipo===t.key ? '#fff' : '#555' }}>
                  <i className={`${`ti ${t.icon}`} ui-2592cc`} aria-hidden="true"></i>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="ui-524895">Monto (Gs.) *</div>
            <input className="ui-57fcbe"
              type="text" inputMode="numeric" value={form.monto}
              onChange={e => { const r=e.target.value.replace(/[^0-9]/g,''); setForm(f=>({...f,monto:r?parseInt(r,10).toLocaleString('es-PY'):''})) }}
              placeholder="Ej: 150.000"/>
            <div className="ui-524895">Descripción (opcional)</div>
            <input className="ui-57fcbe"
              type="text" value={form.descripcion} onChange={e => setForm(f=>({...f,descripcion:e.target.value}))} placeholder="Ej: Compra de plantines"/>
            <div className="ui-524895">Fecha</div>
            <input className="ui-57fcbe"
              type="date" value={form.fecha} onChange={e => setForm(f=>({...f,fecha:e.target.value}))}/>
            <div className="ui-524895">Bloque (opcional)</div>
            <select className="ui-b5e991"
              value={form.bloque_id} onChange={e => setForm(f=>({...f,bloque_id:e.target.value}))}>
              <option value="">Sin bloque especifico</option>
              {bloques.map(b => <option key={b.id} value={b.id}>{b.codigo}</option>)}
            </select>
            <button className="ui-ae772b" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Guardar costo'}</button>
            <button className="ui-3f3807" onClick={cerrarModal}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
