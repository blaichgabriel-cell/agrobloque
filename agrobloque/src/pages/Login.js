import React, { useState } from 'react'
import { clearLocalAuth, supabase } from '../lib/supabase'

function AgroBloqueLogo({ compact = false, light = false }) {
  const color = light ? '#ffffff' : '#103d2b'
  return (
    <div className={`login-brand ${compact ? 'login-brand-compact' : ''}`}>
      <svg width={compact ? 48 : 64} height={compact ? 48 : 64} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect width="64" height="64" rx="18" fill={light ? 'rgba(255,255,255,.13)' : '#edf5eb'} />
        <path d="M17 46 29.5 17h7L49 46h-8l-2.6-6.8H27.6L25 46h-8Z" fill={color} />
        <path d="M30.2 33.2h5.6L33 25.5l-2.8 7.7Z" fill={light ? '#183f2e' : '#edf5eb'} />
        <path d="M18 48c8.5-7 19-9.2 31-6.8" stroke="#76b947" strokeWidth="3.3" strokeLinecap="round" />
        <path d="M21 51c8-5.1 17.3-6.6 27.8-4.2" stroke="#76b947" strokeWidth="2.4" strokeLinecap="round" opacity=".78" />
      </svg>
      <div>
        <div className="login-brand-name" style={{ color }}>AgroBloque</div>
        {!compact && <div className="login-brand-tag" style={{ color: light ? 'rgba(255,255,255,.72)' : '#69756d' }}>Gestión agrícola simple y completa</div>}
      </div>
    </div>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  return (
    <main className="agrobloque-login">
      <style>{`
        .agrobloque-login{min-height:100vh;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(390px,.75fr);background:#f8f7f2;color:#102019;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
        .login-hero{position:relative;min-height:100vh;padding:54px 58px;display:flex;flex-direction:column;justify-content:space-between;background-image:linear-gradient(90deg,rgba(4,24,16,.87) 0%,rgba(7,33,22,.61) 50%,rgba(7,25,17,.12) 100%),linear-gradient(0deg,rgba(3,15,10,.5),transparent 48%),url('/assets/agrobloque-login-hero.png');background-size:cover;background-position:center}
        .login-brand{display:flex;align-items:center;gap:16px}.login-brand-name{font-size:34px;font-weight:850;letter-spacing:-1.6px;line-height:1}.login-brand-tag{font-size:13px;margin-top:7px;letter-spacing:.45px}.login-copy{max-width:650px;margin:auto 0}.login-copy h1{font-size:clamp(44px,4.2vw,68px);line-height:1.02;letter-spacing:-3px;color:#fff;margin:0 0 18px}.login-copy p{max-width:540px;color:rgba(255,255,255,.76);font-size:17px;line-height:1.6;margin:0}.login-features{display:flex;gap:10px;flex-wrap:wrap;margin-top:32px}.login-feature{border:1px solid rgba(255,255,255,.17);background:rgba(6,31,20,.47);backdrop-filter:blur(9px);border-radius:14px;padding:12px 15px;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;gap:8px}.login-feature i{font-size:18px;color:#91cf62}.login-hero-foot{color:rgba(255,255,255,.55);font-size:11px;letter-spacing:1.6px;text-transform:uppercase}.login-panel{padding:42px clamp(30px,4vw,68px);display:flex;flex-direction:column;justify-content:center;position:relative}.login-mobile-brand{display:none}.login-form{width:100%;max-width:440px;margin:auto}.login-form h2{font-size:34px;letter-spacing:-1.2px;margin:0 0 8px;color:#103d2b}.login-intro{font-size:14px;color:#69756d;margin:0 0 34px}.login-label{display:block;font-size:12px;font-weight:750;color:#29362f;margin-bottom:8px}.login-field{height:54px;border:1px solid #dce3dc;border-radius:13px;background:#fff;display:flex;align-items:center;padding:0 15px;gap:11px;margin-bottom:18px;transition:border .15s,box-shadow .15s}.login-field:focus-within{border-color:#4f9139;box-shadow:0 0 0 4px rgba(79,145,57,.11)}.login-field i{font-size:19px;color:#879188}.login-field input{border:0;outline:0;background:transparent;width:100%;font-size:14px;color:#17221b}.login-field button{border:0;background:transparent;padding:5px;color:#607066;cursor:pointer}.login-submit{width:100%;height:56px;border:0;border-radius:13px;background:linear-gradient(135deg,#123f2d,#0a5133);color:#fff;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 14px 30px rgba(15,69,44,.2);display:flex;align-items:center;justify-content:center;gap:10px}.login-submit:disabled{opacity:.65;cursor:wait}.login-error{color:#a73333;background:#fff0f0;border:1px solid #f5d1d1;padding:10px 12px;border-radius:10px;font-size:12px;margin-bottom:16px}.login-help{margin-top:20px;text-align:center;color:#78847c;font-size:12px}.login-footer{text-align:center;color:#9aa39c;font-size:11px;padding-top:28px}.login-security{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:10px;color:#8a958e;font-size:11px}
        @media(max-width:820px){.agrobloque-login{display:block;background:#f8f7f2}.login-hero{min-height:285px;padding:26px 22px 70px;background-image:linear-gradient(0deg,rgba(5,29,19,.88),rgba(5,27,18,.22)),url('/assets/agrobloque-login-hero.png');background-position:58% center}.login-hero>.login-brand,.login-hero-foot{display:none}.login-copy{margin:auto 0 0}.login-copy h1{font-size:34px;letter-spacing:-1.7px;margin-bottom:10px}.login-copy p{font-size:13px;line-height:1.45;max-width:330px}.login-features{display:none}.login-panel{min-height:calc(100vh - 250px);margin-top:-34px;border-radius:28px 28px 0 0;background:#f8f7f2;padding:27px 22px 30px}.login-mobile-brand{display:block;margin-bottom:25px}.login-brand-compact .login-brand-name{font-size:24px}.login-form{margin:0 auto}.login-form h2{font-size:27px}.login-intro{margin-bottom:25px}.login-footer{padding-top:24px}}
      `}</style>
      <section className="login-hero" aria-label="AgroBloque">
        <AgroBloqueLogo light />
        <div className="login-copy">
          <h1>Tu campo, siempre bajo control.</h1>
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
          <h2>Bienvenido</h2>
          <p className="login-intro">Ingresá a tu cuenta para continuar.</p>
          <form onSubmit={handleLogin}>
            {error && <div className="login-error" role="alert">{error}</div>}
            <label className="login-label" htmlFor="login-email">Correo electrónico</label>
            <div className="login-field"><i className="ti ti-mail" aria-hidden="true" /><input id="login-email" type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></div>
            <label className="login-label" htmlFor="login-password">Contraseña</label>
            <div className="login-field"><i className="ti ti-lock" aria-hidden="true" /><input id="login-password" type={showPassword ? 'text' : 'password'} placeholder="Tu contraseña" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}><i className={`ti ${showPassword ? 'ti-eye-off' : 'ti-eye'}`} aria-hidden="true" /></button></div>
            <button className="login-submit" type="submit" disabled={loading}>{loading ? 'Ingresando...' : 'Ingresar'}{!loading && <i className="ti ti-arrow-right" aria-hidden="true" />}</button>
          </form>
          <div className="login-help">Acceso exclusivo para usuarios autorizados.</div>
          <div className="login-security"><i className="ti ti-shield-lock" />Conexión segura y datos protegidos</div>
          <div className="login-footer">AgroBloque · Gestión agrícola simple y completa</div>
        </div>
      </section>
    </main>
  )
}
