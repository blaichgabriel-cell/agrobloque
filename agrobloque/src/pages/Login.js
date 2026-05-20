import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

function LogoHS({ size = 72 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 90V30h11v24h26V30h11v60H51V60H25v30H14z" fill="#1E5631"/>
      <path d="M70 30h32c5.5 0 10 4.5 10 10v8c0 4.5-2.5 8-7 9.5 4.5 1.5 7 5 7 9.5v10c0 5.5-4.5 10-10 10H70V30zm11 26h19c1.8 0 3-1.2 3-3v-7c0-1.8-1.2-3-3-3H81v13zm0 23h19c1.8 0 3-1.2 3-3v-8c0-1.8-1.2-3-3-3H81v14z" fill="#2d8a4e"/>
      <path d="M60 26c0 0-5-14 0-20 5 6 0 20 0 20z" fill="#5abf7a"/>
      <path d="M60 24c0 0-12-9-10-19 9 2 10 19 10 19z" fill="#4aaa6a"/>
      <path d="M60 24c0 0 12-9 10-19-9 2-10 19-10 19z" fill="#4aaa6a"/>
    </svg>
  )
}

const s = {
  wrap: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0ede8', padding:24 },
  card: { background:'#f9f8f6', borderRadius:20, padding:'40px 28px 32px', width:'100%', maxWidth:360, border:'0.5px solid #d0cdc8' },
  logoBox: { textAlign:'center', marginBottom:28 },
  nombre: { fontSize:15, fontWeight:700, color:'#1E5631', marginBottom:2, marginTop:12, letterSpacing:-.2 },
  sub: { fontSize:11, color:'#888', letterSpacing:.5, textTransform:'uppercase' },
  slogan: { fontSize:12, color:'#2d8a4e', marginTop:4, fontStyle:'italic' },
  label: { fontSize:10, color:'#9a9a9a', marginBottom:5, display:'block' },
  input: { width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#f0ede8', fontSize:13, color:'#1a1a1a', marginBottom:14, outline:'none', boxSizing:'border-box' },
  btn: { width:'100%', padding:13, borderRadius:12, background:'#1E5631', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer', marginTop:4, letterSpacing:.2 },
  btnDisabled: { background:'#8aaa94' },
  error: { color:'#c0392b', fontSize:12, marginBottom:12, textAlign:'center', background:'#fff0f0', padding:'8px 12px', borderRadius:8 },
  divider: { borderTop:'1px solid #e8e6e2', margin:'20px 0' },
  footer: { fontSize:11, color:'#bbb', textAlign:'center' },
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Usuario o contraseña incorrectos')
    setLoading(false)
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.logoBox}>
          <LogoHS size={80} />
          <div style={s.nombre}>Horticultura El Sembrador</div>
          <div style={s.sub}>Sistema de gestión agrícola</div>
          <div style={s.slogan}>Cosechando Confianza</div>
        </div>
        <form onSubmit={handleLogin}>
          {error && <div style={s.error}>{error}</div>}
          <label style={s.label}>Email</label>
          <input style={s.input} type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
          <label style={s.label}>Contraseña</label>
          <input style={s.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
          <button style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }} type="submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
        <div style={s.divider}/>
        <div style={s.footer}>AgroBloque · Campo Norte & Sur</div>
      </div>
    </div>
  )
}
