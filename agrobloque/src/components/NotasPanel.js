import React, { useEffect, useState } from 'react'
import { guestToken, supabase } from '../lib/supabase'
import { useCan } from '../lib/RoleContext'

const hoy = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function NotasPanel({ modulo, titulo = 'Notas', permisoModulo = modulo, mostrarFecha = true, limite = 6, modoPagina = false, permitirAsignarBloque = false, referenciaTipo = '', referenciaId = '', referenciaEtiqueta = '' }) {
  const can = useCan(permisoModulo)
  const [notas, setNotas] = useState([])
  const [bloques, setBloques] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({ fecha: hoy(), titulo: '', contenido: '', bloque_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isGuest = Boolean(guestToken)

  useEffect(() => {
    fetchNotas()
  }, [modulo, referenciaTipo, referenciaId])

  useEffect(() => {
    if (!permitirAsignarBloque) return
    supabase.from('bloques').select('id,codigo,campos(nombre)').eq('activo', true).order('codigo')
      .then(({ data }) => setBloques(data || []))
  }, [permitirAsignarBloque])

  const fetchNotas = async () => {
    if (!modulo) return
    let consulta = supabase
      .from('notas_modulo')
      .select('*')
      .eq('modulo', modulo)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (referenciaTipo && referenciaId) consulta = consulta.eq('referencia_tipo', referenciaTipo).eq('referencia_id', referenciaId)
    const { data, error } = await consulta

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
    const bloqueId = referenciaTipo === 'bloque' && referenciaId ? referenciaId : form.bloque_id
    const { error } = await supabase.from('notas_modulo').insert({
      modulo,
      fecha: form.fecha || hoy(),
      titulo: form.titulo.trim() || null,
      contenido: form.contenido.trim(),
      referencia_tipo: bloqueId ? 'bloque' : null,
      referencia_id: bloqueId || null,
    })

    if (error) {
      setError('No se pudo guardar la nota. Revisa el SQL de Supabase.')
    } else {
      setForm({ fecha: hoy(), titulo: '', contenido: '', bloque_id: '' })
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
    <section className={`ui-0ccf91 notes-panel ${modoPagina ? 'notes-panel--page' : ''}`}>
      <div className="ui-a3f6e0">
        <div>
          <div className="ui-6dc1df">{titulo}</div>
          <div className="ui-66d4fa">{notas.length} nota{notas.length === 1 ? '' : 's'}</div>
        </div>
        {!isGuest && can.create && (
          <button className="ui-b371e7" type="button" onClick={() => setAbierto(v => !v)}
           >
            {abierto ? 'Cerrar' : '+ Nota'}
          </button>
        )}
      </div>

      {error && <div className="ui-ced6bf">{error}</div>}

      {abierto && (
        <div className="ui-31eb11">
          {mostrarFecha && <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha:e.target.value }))}
            style={inputStyle} />}
          <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo:e.target.value }))}
            placeholder="Título opcional" style={inputStyle} />
          {permitirAsignarBloque && <label className="note-block-field">Asignar a un bloque (opcional)
            <select value={form.bloque_id} onChange={e => setForm(f => ({ ...f, bloque_id:e.target.value }))} style={inputStyle}>
              <option value="">Sin asignar a un bloque</option>
              {bloques.map(b => <option key={b.id} value={b.id}>{b.campos?.nombre ? `${b.campos.nombre} · ` : ''}Bloque {b.codigo}</option>)}
            </select>
          </label>}
          <textarea className="ui-db2152" value={form.contenido} onChange={e => setForm(f => ({ ...f, contenido:e.target.value }))}
            placeholder="Escribir nota..." style={{ ...inputStyle }} />
          <button className="ui-c630d0" type="button" onClick={guardar} disabled={saving}
           >
            {saving ? 'Guardando...' : 'Guardar nota'}
          </button>
        </div>
      )}

      {notas.length === 0 ? (
        <div className="ui-58e1e8">Sin notas registradas.</div>
      ) : (
        <div className="ui-b1b744">
          {(limite ? notas.slice(0, limite) : notas).map(n => (
            <div className="ui-62d523" key={n.id}>
              <div className="ui-7f7e09">
                <div className="ui-3f9f96">
                  {mostrarFecha && <div className="ui-93a7e1">{n.fecha}</div>}
                  {n.titulo && <div className="ui-51b484">{n.titulo}</div>}
                </div>
                {!isGuest && can.delete && (
                  <button className="ui-55ae91" type="button" onClick={() => eliminar(n.id)}
                   >
                    Eliminar
                  </button>
                )}
              </div>
              {n.referencia_tipo === 'bloque' && <div className="note-block-badge"><i className="ti ti-box" aria-hidden="true" />{referenciaId === n.referencia_id && referenciaEtiqueta ? referenciaEtiqueta : (() => { const bloque = bloques.find(b => b.id === n.referencia_id); return bloque ? `${bloque.campos?.nombre ? `${bloque.campos.nombre} · ` : ''}Bloque ${bloque.codigo}` : 'Asignada a un bloque' })()}</div>}
              <div className="ui-48791d">{n.contenido}</div>
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
  borderRadius:8,
  border:'1px solid #e4e7e2',
  background:'#fff',
  fontSize:13,
  color:"#182c25",
  marginBottom:8,
  boxSizing:'border-box',
}
