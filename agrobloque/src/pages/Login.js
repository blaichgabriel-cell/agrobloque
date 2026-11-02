import React, { useState } from 'react'
import { clearLocalAuth, supabase } from '../lib/supabase'

function AgroBloqueLogo({ compact = false, light = false }) {
  const color = light ? '#ffffff' : '#103d2b'
  return (
    <div className={`login-brand ${compact ? 'login-brand-compact' : ''} ${light ? 'is-light' : ''}`}>
      <svg width={compact ? 48 : 64} height={compact ? 48 : 64} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect width="64" height="64" rx="18" fill={light ? 'rgba(255,255,255,.13)' : '#edf5eb'} />
        <path d="M17 46 29.5 17h7L49 46h-8l-2.6-6.8H27.6L25 46h-8Z" fill={color} />
        <path d="M30.2 33.2h5.6L33 25.5l-2.8 7.7Z" fill={light ? '#183f2e' : '#edf5eb'} />
        <path d="M18 48c8.5-7 19-9.2 31-6.8" stroke="#76b947" strokeWidth="3.3" strokeLinecap="round" />
        <path d="M21 51c8-5.1 17.3-6.6 27.8-4.2" stroke="#76b947" strokeWidth="2.4" strokeLinecap="round" opacity=".78" />
      </svg>
      <div>
        <div className="login-brand-name">AgroBloque</div>
        {!compact && <div className="login-brand-tag">Gestión agrícola simple y completa</div>}
      </div>
    </div>
  )
}

export default function Login({ mode = 'login', session = null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const isPasswordSetup = mode === 'set-password'
  const setupUnavailable = isPasswordSetup && !session

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    clearLocalAuth()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message?.includes('Failed to fetch')
        ? 'No se pudo conectar. Probá de nuevo en unos segundos.'
        : 'El correo o la contraseña no son correctos.')
    }
    setLoading(false)
  }

  const handlePasswordReset = async () => {
    const cleanEmail = email.trim().toLowerCase()
    setError('')
    setMessage('')
    if (!cleanEmail) {
      setError('Escribí tu correo para enviarte el enlace de acceso.')
      return
    }
    setLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/?auth_action=set-password`,
    })
    if (resetError) setError('No se pudo enviar el enlace. Verificá el correo e intentá nuevamente.')
    else setMessage('Te enviamos un enlace para crear tu contraseña. Revisá también la carpeta de spam.')
    setLoading(false)
  }

  const handleSetPassword = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!session) {
      setError('Este enlace no es valido o vencio. Solicita una nueva invitacion.')
      return
    }
    if (password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres.')
      return
    }
    if (password !== passwordConfirm) {
      setError('Las contrasenas no coinciden.')
      return
    }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError('No se pudo guardar la contrasena. Solicita un enlace nuevo e intenta otra vez.')
      setLoading(false)
      return
    }
    window.location.replace('/')
  }

  return (
    <main className="agrobloque-login">
      <section className="login-hero" aria-label="AgroBloque">
        <AgroBloqueLogo light />
        <div className="login-copy">
          <h1>Tu campo, <span>siempre bajo control.</span></h1>
          <p>Organizá cultivos, tareas, inventario y producción desde un solo lugar, con información clara para tomar mejores decisiones.</p>
          <div className="login-features">
            <span className="login-feature"><i className="ti ti-map-2" />Gestión por bloques</span>
            <span className="login-feature"><i className="ti ti-box" />Inventario conectado</span>
            <span className="login-feature"><i className="ti ti-history" />Trazabilidad completa</span>
          </div>
        </div>
        <div className="login-hero-foot">Tecnología para cultivar mejor</div>
      </section>
      <section className="login-panel">
        <div className="login-form">
          <div className="login-mobile-brand"><AgroBloqueLogo compact /></div>
          <h2>{isPasswordSetup ? 'Crea tu contraseña' : 'Bienvenido'}</h2>
          <p className="login-intro">{isPasswordSetup ? 'Elegí una contraseña personal para acceder a tu cuenta.' : 'Ingresá a tu cuenta para continuar.'}</p>
          <form onSubmit={isPasswordSetup ? handleSetPassword : handleLogin}>
            {error && <div className="login-error" role="alert"><i className="ti ti-alert-circle" aria-hidden="true" /><span>{error}</span></div>}
            {setupUnavailable && <div className="login-error" role="alert"><i className="ti ti-alert-circle" aria-hidden="true" /><span>Este enlace no es válido o venció. Solicitá una nueva invitación o usá “Primera vez o ¿olvidaste tu contraseña?”.</span></div>}
            {message && <div className="login-message" role="status">{message}</div>}
            {!isPasswordSetup && <>
              <label className="login-label" htmlFor="login-email">Correo electrónico</label>
              <div className="login-field"><i className="ti ti-mail" aria-hidden="true" /><input id="login-email" type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></div>
            </>}
            <label className="login-label" htmlFor="login-password">{isPasswordSetup ? 'Nueva contraseña' : 'Contraseña'}</label>
            <div className="login-field"><i className="ti ti-lock" aria-hidden="true" /><input id="login-password" type={showPassword ? 'text' : 'password'} placeholder={isPasswordSetup ? 'Mínimo 8 caracteres' : 'Tu contraseña'} value={password} onChange={e => setPassword(e.target.value)} autoComplete={isPasswordSetup ? 'new-password' : 'current-password'} minLength={isPasswordSetup ? 8 : undefined} required /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}><i className={`ti ${showPassword ? 'ti-eye-off' : 'ti-eye'}`} aria-hidden="true" /></button></div>
            {isPasswordSetup && <>
              <label className="login-label" htmlFor="login-password-confirm">Repetir contraseña</label>
              <div className="login-field"><i className="ti ti-lock-check" aria-hidden="true" /><input id="login-password-confirm" type={showPassword ? 'text' : 'password'} placeholder="Repetí tu contraseña" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} autoComplete="new-password" minLength="8" required /></div>
            </>}
            <button className="login-submit" type="submit" disabled={loading || setupUnavailable}>{loading ? 'Guardando...' : (isPasswordSetup ? 'Guardar contraseña y entrar' : 'Ingresar')}{!loading && <i className="ti ti-arrow-right" aria-hidden="true" />}</button>
          </form>
          {!isPasswordSetup && <button className="login-reset" type="button" onClick={handlePasswordReset} disabled={loading}>Primera vez o ¿olvidaste tu contraseña?</button>}
          <div className="login-help">{isPasswordSetup ? 'Tu contraseña es privada y el administrador no puede verla.' : 'Acceso exclusivo para usuarios autorizados.'}</div>
          <div className="login-security"><i className="ti ti-shield-lock" />Conexión segura y datos protegidos</div>
          <div className="login-footer">AgroBloque · Gestión agrícola simple y completa</div>
        </div>
      </section>
    </main>
  )
}
