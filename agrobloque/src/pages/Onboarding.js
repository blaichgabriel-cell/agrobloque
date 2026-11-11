import React, { useState } from 'react'
import BrandLogo from '../components/BrandLogo'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const initialForm = organization => ({
  empresa: organization?.nombre && organization.nombre !== 'AgroBloque' ? organization.nombre : '',
  telefono: organization?.telefono || '',
  campo: '',
  bloques: '0',
  tipo: 'invernadero',
})

export default function Onboarding({ organization, preview = false, onComplete }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(() => initialForm(organization))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const update = (key, value) => setForm(current => ({ ...current, [key]:value }))

  const finish = async event => {
    event.preventDefault()
    const empresa = form.empresa.trim()
    const campo = form.campo.trim()
    if (empresa.length < 2) return setError('Ingresá el nombre de la empresa.')
    if (campo.length < 2) return setError('Ingresá el nombre del primer campo.')

    const totalBloques = Math.max(0, Math.min(24, Number.parseInt(form.bloques, 10) || 0))
    if (preview) {
      setResult({ empresa, campo, bloques:totalBloques })
      setStep(2)
      return
    }

    setSaving(true)
    setError('')
    try {
      const organizationPayload = {
        nombre:empresa,
        telefono:form.telefono.trim() || null,
      }
      const { data:updatedOrganization, error:organizationError } = await supabase
        .from('organizaciones')
        .update(organizationPayload)
        .eq('id', organization.id)
        .select('*')
        .single()
      if (organizationError) throw organizationError

      const { data:newField, error:fieldError } = await supabase
        .from('campos')
        .insert({ nombre:campo })
        .select('*')
        .single()
      if (fieldError) throw fieldError

      let bloquesCreados = totalBloques
      let blockWarning = ''
      if (totalBloques > 0) {
        const blocks = Array.from({ length:totalBloques }, (_, index) => ({
          campo_id:newField.id,
          codigo:`A-${index + 1}`,
          tipo:form.tipo,
          activo:true,
        }))
        const { error:blocksError } = await supabase.from('bloques').insert(blocks)
        if (blocksError) {
          bloquesCreados = 0
          blockWarning = 'El campo quedó creado, pero los bloques deberán agregarse desde Bloques.'
        }
      }

      setResult({ empresa, campo, bloques:bloquesCreados, warning:blockWarning, organization:updatedOrganization, campoRecord:newField })
      setStep(2)
    } catch (saveError) {
      setError(`No pudimos preparar el espacio: ${saveError.message || 'intentá nuevamente'}`)
    } finally {
      setSaving(false)
    }
  }

  if (step === 2) return (
    <main className="onboarding-shell">
      <section className="onboarding-card onboarding-success" aria-live="polite">
        <span className="onboarding-success__icon"><i className="ti ti-check" /></span>
        <small>{preview ? 'VISTA DE DEMOSTRACIÓN' : 'ESPACIO PREPARADO'}</small>
        <h1>{result.empresa} ya está en AgroBloque</h1>
        <p>El campo <strong>{result.campo}</strong> comienza limpio{result.bloques ? ` con ${result.bloques} bloques disponibles` : ''}. Ventas, costos, tareas e inventario están en cero.</p>
        {result.warning && <div className="onboarding-error" role="status"><i className="ti ti-alert-circle" />{result.warning}</div>}
        <div className="onboarding-success__summary">
          <span><i className="ti ti-building-community" /><b>{result.empresa}</b><small>Empresa</small></span>
          <span><i className="ti ti-map-pin" /><b>{result.campo}</b><small>Primer campo</small></span>
          <span><i className="ti ti-layout-grid" /><b>{result.bloques}</b><small>Bloques iniciales</small></span>
        </div>
        <button className="onboarding-primary" onClick={() => preview ? navigate('/configuracion') : onComplete?.({ organization:result.organization, campo:result.campoRecord })}>{preview ? 'Volver a configuración' : 'Entrar a mi espacio'}<i className="ti ti-arrow-right" /></button>
      </section>
    </main>
  )

  return (
    <main className="onboarding-shell">
      <header className="onboarding-brand"><BrandLogo className="onboarding-brand-logo" /><div><small>Configuración inicial</small></div>{preview && <b>Demostración</b>}</header>
      <section className="onboarding-card">
        <div className="onboarding-progress" aria-label={`Paso ${step + 1} de 2`}><span className="active" /><span className={step === 1 ? 'active' : ''} /></div>
        {step === 0 ? <div className="onboarding-welcome">
          <span className="onboarding-eyebrow">TU ESPACIO EMPIEZA LIMPIO</span>
          <h1>Prepará AgroBloque para tu empresa</h1>
          <p>Los datos de otros productores nunca aparecen acá. Vamos a crear tu empresa y el primer campo para que empieces con una base completamente vacía.</p>
          <div className="onboarding-benefits">
            <span><i className="ti ti-shield-lock" /><div><strong>Datos separados</strong><small>Tu equipo solo accede a esta empresa.</small></div></span>
            <span><i className="ti ti-sparkles" /><div><strong>Sin datos de ejemplo</strong><small>Cargás únicamente información real.</small></div></span>
            <span><i className="ti ti-users-plus" /><div><strong>Listo para tu equipo</strong><small>Después podés invitar usuarios y asignar permisos.</small></div></span>
          </div>
          <button className="onboarding-primary" onClick={() => setStep(1)}>Configurar mi espacio<i className="ti ti-arrow-right" /></button>
          {preview && <button className="onboarding-secondary" onClick={() => navigate('/configuracion')}>Salir de la demostración</button>}
        </div> : <form className="onboarding-form" onSubmit={finish}>
          <div><span className="onboarding-eyebrow">DATOS INICIALES</span><h1>Empresa y primer campo</h1><p>Podrás cambiar estos datos y agregar más campos cuando quieras.</p></div>
          <div className="onboarding-fields">
            <label><span>Nombre de la empresa *</span><input autoFocus value={form.empresa} onChange={event => update('empresa', event.target.value)} placeholder="Ej: Horticultura San José" maxLength="100" /></label>
            <label><span>Teléfono <em>opcional</em></span><input type="tel" value={form.telefono} onChange={event => update('telefono', event.target.value)} placeholder="+595 ..." /></label>
            <label className="wide"><span>Nombre del primer campo *</span><input value={form.campo} onChange={event => update('campo', event.target.value)} placeholder="Ej: Campo Principal" maxLength="100" /></label>
            <label><span>Bloques iniciales</span><select value={form.bloques} onChange={event => update('bloques', event.target.value)}><option value="0">Los crearé después</option><option value="4">4 bloques</option><option value="8">8 bloques</option><option value="12">12 bloques</option><option value="16">16 bloques</option></select></label>
            <label><span>Tipo inicial</span><select value={form.tipo} onChange={event => update('tipo', event.target.value)} disabled={form.bloques === '0'}><option value="invernadero">Invernadero</option><option value="campo_abierto">Campo abierto</option></select></label>
          </div>
          <div className="onboarding-note"><i className="ti ti-info-circle" /><span>Las secciones de producción, inventario, ventas, costos y personal comenzarán vacías.</span></div>
          {error && <div className="onboarding-error" role="alert"><i className="ti ti-alert-circle" />{error}</div>}
          <div className="onboarding-actions"><button type="button" className="onboarding-secondary" onClick={() => { setError(''); setStep(0) }}>Volver</button><button className="onboarding-primary" type="submit" disabled={saving}>{saving ? 'Preparando espacio…' : preview ? 'Ver resultado' : 'Crear mi espacio'}{!saving && <i className="ti ti-arrow-right" />}</button></div>
        </form>}
      </section>
      <footer className="onboarding-footer"><i className="ti ti-lock" />Espacio privado y protegido por empresa</footer>
    </main>
  )
}
