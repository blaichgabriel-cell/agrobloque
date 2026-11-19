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

// La tabla admite una referencia por fila. Las notas destinadas a varios bloques se guardan
// con el mismo `created_at` y aquí vuelven a presentarse como una sola nota con varios vínculos.
const agruparNotas = (filas = []) => {
  const grupos = new Map()
  filas.forEach(nota => {
    const clave = `${nota.created_at || nota.id}|${nota.titulo || ''}|${nota.contenido || ''}`
    if (!grupos.has(clave)) grupos.set(clave, { ...nota, ids:[nota.id], referencias:[], filas:[{ id:nota.id, referencia_id:nota.referencia_id || null }] })
    else {
      grupos.get(clave).ids.push(nota.id)
      grupos.get(clave).filas.push({ id:nota.id, referencia_id:nota.referencia_id || null })
    }
    if (nota.referencia_tipo === 'bloque' && nota.referencia_id) grupos.get(clave).referencias.push(nota.referencia_id)
  })
  return Array.from(grupos.values())
}

export default function NotasPanel({ modulo, titulo = 'Notas', permisoModulo = modulo, mostrarFecha = true, limite = 6, modoPagina = false, permitirAsignarBloque = false, referenciaTipo = '', referenciaId = '', referenciaEtiqueta = '' }) {
  const can = useCan(permisoModulo)
  const [notas, setNotas] = useState([])
  const [bloques, setBloques] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({ fecha: hoy(), titulo: '', contenido: '', bloques_ids: [] })
  const [editando, setEditando] = useState(null)
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
    setNotas(agruparNotas(data || []))
  }

  const guardar = async () => {
    if (!form.contenido.trim() && !form.titulo.trim()) return
    setSaving(true)
    const bloquesIds = referenciaTipo === 'bloque' && referenciaId ? [referenciaId] : form.bloques_ids
    const datos = {
      modulo,
      fecha: form.fecha || hoy(),
      titulo: form.titulo.trim() || null,
      contenido: form.contenido.trim(),
    }
    let error = null
    if (editando) {
      const destinos = bloquesIds.length ? bloquesIds : [null]
      const filas = editando.filas || [{ id:editando.id, referencia_id:editando.referencia_id || null }]
      const existentes = new Map(filas.map(fila => [fila.referencia_id || '__general__', fila]))
      const deseados = new Set(destinos.map(id => id || '__general__'))
      const escrituras = destinos.map(bloqueId => {
        const existente = existentes.get(bloqueId || '__general__')
        const referencia = { referencia_tipo:bloqueId ? 'bloque' : null, referencia_id:bloqueId || null }
        return existente
          ? supabase.from('notas_modulo').update({ ...datos, ...referencia }).eq('id', existente.id)
          : supabase.from('notas_modulo').insert({ ...datos, ...referencia, created_at:editando.created_at || new Date().toISOString() })
      })
      const resultados = await Promise.all(escrituras)
      error = resultados.find(resultado => resultado.error)?.error || null
      if (!error) {
        const quitar = filas.filter(fila => !deseados.has(fila.referencia_id || '__general__')).map(fila => fila.id)
        if (quitar.length) error = (await supabase.from('notas_modulo').delete().in('id', quitar)).error
      }
    } else {
      const createdAt = new Date().toISOString()
      const registros = bloquesIds.length
        ? bloquesIds.map(bloqueId => ({ ...datos, referencia_tipo:'bloque', referencia_id:bloqueId, created_at:createdAt }))
        : [{ ...datos, referencia_tipo:null, referencia_id:null, created_at:createdAt }]
      error = (await supabase.from('notas_modulo').insert(registros)).error
    }

    if (error) {
      setError('No se pudo guardar la nota. Revisa el SQL de Supabase.')
    } else {
      setForm({ fecha: hoy(), titulo: '', contenido: '', bloques_ids: [] })
      setEditando(null)
      setAbierto(false)
      await fetchNotas()
    }
    setSaving(false)
  }

  const eliminar = async (ids) => {
    if (!window.confirm('¿Eliminar esta nota? Esta acción no se puede deshacer.')) return
    await supabase.from('notas_modulo').delete().in('id', Array.isArray(ids) ? ids : [ids])
    fetchNotas()
  }

  const abrirNueva = () => {
    setEditando(null)
    setForm({ fecha:hoy(), titulo:'', contenido:'', bloques_ids:[] })
    setAbierto(true)
    setError('')
  }

  const abrirEdicion = nota => {
    setEditando(nota)
    setForm({ fecha:nota.fecha || hoy(), titulo:nota.titulo || '', contenido:nota.contenido || '', bloques_ids:[...(nota.referencias || [])] })
    setAbierto(true)
    setError('')
  }

  const cerrarFormulario = () => {
    setAbierto(false)
    setEditando(null)
    setForm({ fecha:hoy(), titulo:'', contenido:'', bloques_ids:[] })
  }

  const alternarBloque = id => setForm(actual => ({
    ...actual,
    bloques_ids: actual.bloques_ids.includes(id) ? actual.bloques_ids.filter(item => item !== id) : [...actual.bloques_ids, id],
  }))

  return (
    <section className={`ui-0ccf91 notes-panel ${modoPagina ? 'notes-panel--page' : ''}`}>
      <div className="ui-a3f6e0">
        <div>
          <div className="ui-6dc1df">{titulo}</div>
          <div className="ui-66d4fa">{notas.length} nota{notas.length === 1 ? '' : 's'}</div>
        </div>
        {!isGuest && can.create && (
          <button className="ui-b371e7" type="button" onClick={() => abierto ? cerrarFormulario() : abrirNueva()}
           >
            {abierto ? 'Cerrar' : '+ Nota'}
          </button>
        )}
      </div>

      {error && <div className="ui-ced6bf">{error}</div>}

      {abierto && (
        <div className="ui-31eb11">
          <div className="note-form-mode">{editando ? 'Editar nota' : 'Nueva nota'}</div>
          {mostrarFecha && <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha:e.target.value }))}
            style={inputStyle} />}
          <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo:e.target.value }))}
            placeholder="Título opcional" style={inputStyle} />
          {permitirAsignarBloque && <fieldset className="note-block-picker">
            <legend>Asignar a bloques (opcional)</legend>
            <div className="note-block-picker__summary"><span>{form.bloques_ids.length ? `${form.bloques_ids.length} bloque${form.bloques_ids.length === 1 ? '' : 's'} seleccionado${form.bloques_ids.length === 1 ? '' : 's'}` : 'Sin asignar a bloques'}</span>{form.bloques_ids.length > 0 && <button type="button" onClick={() => setForm(f => ({ ...f, bloques_ids:[] }))}>Quitar selección</button>}</div>
            <div className="note-block-picker__options">
              {bloques.map(b => { const seleccionado = form.bloques_ids.includes(b.id); return <button type="button" key={b.id} aria-pressed={seleccionado} onClick={() => alternarBloque(b.id)}><i className={`ti ${seleccionado ? 'ti-circle-check-filled' : 'ti-circle'}`} aria-hidden="true" /><span>{b.campos?.nombre && <small>{b.campos.nombre}</small>}Bloque {b.codigo}</span></button> })}
            </div>
          </fieldset>}
          <textarea className="ui-db2152" value={form.contenido} onChange={e => setForm(f => ({ ...f, contenido:e.target.value }))}
            placeholder="Escribir nota..." style={{ ...inputStyle }} />
          <button className="ui-c630d0" type="button" onClick={guardar} disabled={saving}
           >
            {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Guardar nota'}
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
                {!isGuest && (can.edit || can.delete) && <div className="note-card-actions">
                  {can.edit && <button className="note-edit-button" type="button" onClick={() => abrirEdicion(n)}><i className="ti ti-pencil" aria-hidden="true" />Editar</button>}
                  {can.delete && <button className="ui-55ae91" type="button" onClick={() => eliminar(n.ids || [n.id])}><i className="ti ti-trash" aria-hidden="true" />Eliminar</button>}
                </div>}
              </div>
              {n.referencias?.length > 0 && <div className="note-block-badges">{n.referencias.map(bloqueId => <div className="note-block-badge" key={bloqueId}><i className="ti ti-box" aria-hidden="true" />{referenciaId === bloqueId && referenciaEtiqueta ? referenciaEtiqueta : (() => { const bloque = bloques.find(b => b.id === bloqueId); return bloque ? `${bloque.campos?.nombre ? `${bloque.campos.nombre} · ` : ''}Bloque ${bloque.codigo}` : 'Asignada a un bloque' })()}</div>)}</div>}
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
