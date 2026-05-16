import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const s = {
  wrap: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0ede8', padding:24 },
  card: { background:'#f9f8f6', borderRadius:16, padding:'36px 28px', width:'100%', maxWidth:360, border:'0.5px solid #d0cdc8' },
  logoBox: { textAlign:'center', marginBottom:28 },
  logoCircle: { width:72, height:72, background:'#1a1a1a', borderRadius:14, display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:12 },
  logoVS: { color:'#f9f8f6', fontSize:28, fontWeight:700, fontStyle:'italic', letterSpacing:-1 },
  logoVerde: { color:'#2d6a2d' },
  nombre: { fontSize:15, fontWeight:600, color:'#1a1a1a', marginBottom:2 },
  sub: { fontSize:12, color:'#888' },
  input: { width:'100%', padding:'11px 14px', borderRadius:8, border:'0.5px solid #d0cdc8', background:'#f0ede8', fontSize:14, color:'#1a1a1a', marginBottom:12, outline:'none' },
  btn: { width:'100%', padding:12, borderRadius:8, background:'#1a1a1a', color:'#f9f8f6', border:'none', fontSize:14, fontWeight:500, cursor:'pointer', marginTop:4 },
  error: { color:'#c0392b', fontSize:12, marginBottom:10, textAlign:'center' }
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
          <div style={s.logoCircle}>
            <span style={s.logoVS}><span style={s.logoVerde}>V</span>S</span>
          </div>
          <div style={s.nombre}>Horticultura El Sembrador</div>
          <div style={s.sub}>Sistema de gestión agrícola</div>
        </div>
        <form onSubmit={handleLogin}>
          {error && <div style={s.error}>{error}</div>}
          <input style={s.input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input style={s.input} type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} required />
          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
