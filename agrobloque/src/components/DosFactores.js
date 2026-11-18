import React, { useCallback, useEffect, useRef, useState } from 'react'
import BrandLogo from './BrandLogo'
import { confirmarCodigo, desactivarDosFactores, estadoDosFactores, iniciarAlta, textoErrorDosFactores } from '../lib/dosFactores'

// Campo de 6 dígitos: solo números, sugiere el código guardado del teléfono y envía solo al completar el sexto.
function CampoCodigo({ valor, onCambio, onCompleto, disabled, id = 'dosf-codigo' }) {
  const campo = useRef(null)
  // Vuelve a enfocar el campo al terminar de verificar (también al fallar), para poder escribir el código nuevo enseguida.
  useEffect(() => { if (!disabled) campo.current?.focus() }, [disabled])
  return <input
    ref={campo}
    id={id}
    className="ag-2fa__codigo"
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="[0-9]*"
    maxLength={6}
    placeholder="000000"
    value={valor}
    disabled={disabled}
    aria-label="Código de 6 dígitos"
    onChange={e => {
      const limpio = e.target.value.replace(/\D/g, '').slice(0, 6)
      onCambio(limpio)
      if (limpio.length === 6) onCompleto?.(limpio)
    }}
  />
}

// Pantalla completa antes de entrar a la app.
//   modo "reto": la cuenta ya tiene la app vinculada; falta escribir el código de esta sesión.
//   modo "alta": hay que vincular la app (obligatorio para administración general).
export function PantallaDosFactores({ modo, factorId = null, obligatorio = false, onListo, onSalir, textoSalir = 'Cerrar sesión' }) {
  return <main className="ag-2fa">
    <section className="ag-2fa__card spatial-glass" aria-labelledby="dosf-titulo">
      <BrandLogo className="ag-2fa__logo" tone="auto" />
      {modo === 'alta'
        ? <AltaDosFactores obligatorio={obligatorio} onListo={onListo} />
        : <RetoDosFactores factorId={factorId} onListo={onListo} />}
      {onSalir && <button type="button" className="ag-2fa__salir" onClick={onSalir}>{textoSalir}</button>}
    </section>
  </main>
}

function RetoDosFactores({ factorId, onListo }) {
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const verificar = async (valor) => {
    if (enviando || valor.length !== 6) return
    setEnviando(true)
    setError('')
    try {
      await confirmarCodigo(factorId, valor)
      onListo?.()
    } catch (e) {
      setError(textoErrorDosFactores(e))
      setCodigo('')
    } finally {
      setEnviando(false)
    }
  }
  return <form onSubmit={e => { e.preventDefault(); verificar(codigo) }}>
    <span className="ag-2fa__icono" aria-hidden="true"><i className="ti ti-shield-lock" /></span>
    <h1 id="dosf-titulo">Verificación en dos pasos</h1>
    <p className="ag-2fa__texto">Abre tu app autenticadora y escribe el código de 6 dígitos de AgroBloque.</p>
    {error && <div className="ag-2fa__error" role="alert"><i className="ti ti-alert-circle" aria-hidden="true" /><span>{error}</span></div>}
    <CampoCodigo valor={codigo} onCambio={setCodigo} onCompleto={verificar} disabled={enviando} />
    <button className="ag-2fa__boton" type="submit" disabled={enviando || codigo.length !== 6}>{enviando ? 'Verificando…' : 'Verificar y entrar'}</button>
  </form>
}

function AltaDosFactores({ obligatorio, onListo }) {
  const [paso, setPaso] = useState('cargando')
  const [datos, setDatos] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const iniciado = useRef(false)

  const empezar = useCallback(async () => {
    setPaso('cargando')
    setError('')
    try {
      setDatos(await iniciarAlta())
      setPaso('codigo')
    } catch (e) {
      setError(textoErrorDosFactores(e))
      setPaso('fallo')
    }
  }, [])
  useEffect(() => {
    if (iniciado.current) return
    iniciado.current = true
    empezar()
  }, [empezar])

  const confirmar = async (valor) => {
    if (enviando || valor.length !== 6 || !datos) return
    setEnviando(true)
    setError('')
    try {
      await confirmarCodigo(datos.factorId, valor)
      onListo?.()
    } catch (e) {
      setError(textoErrorDosFactores(e))
      setCodigo('')
    } finally {
      setEnviando(false)
    }
  }
  const copiar = async () => {
    try { await navigator.clipboard.writeText(datos.secreto); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch (e) { /* sin portapapeles: la clave se puede copiar a mano */ }
  }

  if (paso === 'cargando') return <div role="status" aria-live="polite"><span className="ag-2fa__icono" aria-hidden="true"><i className="ti ti-shield-lock" /></span><h1 id="dosf-titulo">Preparando tu código…</h1></div>
  if (paso === 'fallo') return <div>
    <span className="ag-2fa__icono" aria-hidden="true"><i className="ti ti-shield-lock" /></span>
    <h1 id="dosf-titulo">Verificación en dos pasos</h1>
    {error && <div className="ag-2fa__error" role="alert"><i className="ti ti-alert-circle" aria-hidden="true" /><span>{error}</span></div>}
    <button className="ag-2fa__boton" type="button" onClick={empezar}>Reintentar</button>
  </div>

  return <form onSubmit={e => { e.preventDefault(); confirmar(codigo) }}>
    <span className="ag-2fa__icono" aria-hidden="true"><i className="ti ti-shield-lock" /></span>
    <h1 id="dosf-titulo">Activa la verificación en dos pasos</h1>
    {obligatorio && <p className="ag-2fa__aviso">Tu cuenta es de administración general: puede ver los datos de las empresas. Por seguridad, este paso es obligatorio.</p>}
    <ol className="ag-2fa__pasos">
      <li>Instala una app autenticadora en tu teléfono (Google Authenticator, Microsoft Authenticator o Authy).</li>
      <li>
        Escanea este código QR con la app.
        <div className="ag-2fa__qr">{datos.qr ? <img src={datos.qr} alt="Código QR para vincular la app autenticadora" width="168" height="168" /> : <span>No se pudo mostrar el QR. Usa la clave de abajo.</span>}</div>
        <div className="ag-2fa__clave">
          <span>¿No puedes escanear? Escribe esta clave en la app:</span>
          <code>{datos.secreto}</code>
          <button type="button" onClick={copiar}>{copiado ? 'Copiada' : 'Copiar clave'}</button>
        </div>
      </li>
      <li>Escribe el código de 6 dígitos que muestra la app.</li>
    </ol>
    {error && <div className="ag-2fa__error" role="alert"><i className="ti ti-alert-circle" aria-hidden="true" /><span>{error}</span></div>}
    <CampoCodigo valor={codigo} onCambio={setCodigo} onCompleto={confirmar} disabled={enviando} />
    <button className="ag-2fa__boton" type="submit" disabled={enviando || codigo.length !== 6}>{enviando ? 'Verificando…' : 'Activar y entrar'}</button>
  </form>
}

// Tarjeta de Configuración (administradores): ver si está activa, vincularla o, si no es obligatoria, quitarla.
export function SeguridadDosFactores({ obligatorio = false }) {
  const [estado, setEstado] = useState(null)
  const [alta, setAlta] = useState(false)
  const [aviso, setAviso] = useState('')
  const [codigo, setCodigo] = useState('')
  const [quitando, setQuitando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState('')

  const recargar = useCallback(() => estadoDosFactores().then(setEstado).catch(() => setEstado({ error: true })), [])
  useEffect(() => { recargar() }, [recargar])

  const quitar = async (valor) => {
    if (trabajando || valor.length !== 6) return
    setTrabajando(true)
    setError('')
    try {
      // Quitar la app exige haber verificado un código en esta sesión: se pide uno nuevo antes.
      await confirmarCodigo(estado.factorId, valor)
      await desactivarDosFactores(estado.factorId)
      setQuitando(false)
      setCodigo('')
      setAviso('Verificación en dos pasos desactivada.')
      await recargar()
    } catch (e) {
      setError(textoErrorDosFactores(e))
      setCodigo('')
    } finally {
      setTrabajando(false)
    }
  }

  if (!estado) return null
  if (estado.error) return null

  if (alta) return <PantallaDosFactores modo="alta" obligatorio={obligatorio} onListo={() => { setAlta(false); setAviso('Verificación en dos pasos activada.'); recargar() }} onSalir={() => setAlta(false)} textoSalir="Cancelar" />

  return <section className="ag-surface ag-2fa-setting" aria-labelledby="dosf-config-titulo">
    <div className="ag-2fa-setting__cabecera">
      <span className="ag-2fa-setting__icono" aria-hidden="true"><i className={`ti ${estado.tieneFactor ? 'ti-shield-check' : 'ti-shield-lock'}`} /></span>
      <span className="ag-2fa-setting__copia">
        <strong id="dosf-config-titulo">Verificación en dos pasos</strong>
        <small>{estado.tieneFactor ? 'Activa: al entrar se pide un código de tu app autenticadora.' : 'Protege tu cuenta con un código de tu teléfono además de la contraseña.'}</small>
      </span>
      {!estado.tieneFactor && <button type="button" className="ag-small-action" onClick={() => { setAviso(''); setAlta(true) }}>Activar</button>}
      {estado.tieneFactor && !obligatorio && !quitando && <button type="button" className="ag-small-action" onClick={() => { setAviso(''); setQuitando(true) }}>Desactivar</button>}
    </div>
    {aviso && <div className="ag-2fa-setting__aviso" role="status">{aviso}</div>}
    {estado.tieneFactor && obligatorio && <div className="ag-2fa-setting__aviso">Es obligatoria para cuentas de administración general.</div>}
    {quitando && <form className="ag-2fa-setting__quitar" onSubmit={e => { e.preventDefault(); quitar(codigo) }}>
      <label htmlFor="dosf-quitar">Para desactivarla, escribe un código actual de tu app:</label>
      {error && <div className="ag-2fa__error" role="alert"><i className="ti ti-alert-circle" aria-hidden="true" /><span>{error}</span></div>}
      <CampoCodigo id="dosf-quitar" valor={codigo} onCambio={setCodigo} onCompleto={quitar} disabled={trabajando} />
      <div className="ag-2fa-setting__acciones">
        <button type="button" className="ag-small-action" onClick={() => { setQuitando(false); setCodigo(''); setError('') }}>Cancelar</button>
        <button type="submit" className="ag-small-action" disabled={trabajando || codigo.length !== 6}>Desactivar</button>
      </div>
    </form>}
  </section>
}
