import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

function LogoHS({ size = 80 }) {
  const s = size
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="2" y="72" fontFamily="Georgia, 'Times New Roman', serif" fontSize="72" fontWeight="700" fill="#1E5631" letterSpacing="-4">HS</text>
      <path d="M50 18c0 0-4-12 0-18 4 6 0 18 0 18z" fill="#5abf7a"/>
      <path d="M50 16c0 0-11-8-9-16 9 2 9 16 9 16z" fill="#3d9a5e"/>
      <path d="M50 16c0 0 11-8 9-16-9 2-9 16-9 16z" fill="#3d9a5e"/>
    </svg>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Usuario o contraseña incorrectos')
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0ede8', padding:24 }}>
      <div style={{ background:'#f9f8f6', borderRadius:20, padding:'40px 28px 32px', width:'100%', maxWidth:360, border:'0.5px solid #d0cdc8' }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <LogoHS size={80} />
          <div style={{ fontSize:15, fontWeight:700, color:'#1E5631', marginBottom:2, marginTop:8, letterSpacing:-.2 }}>Horticultura El Sembrador</div>
          <div style={{ fontSize:11, color:'#888', letterSpacing:.5, textTransform:'uppercase' }}>Sistema de gestión agrícola</div>
          <div style={{ fontSize:12, color:'#2d8a4e', marginTop:4, fontStyle:'italic' }}>Cosechando Confianza</div>
        </div>
        <form onSubmit={handleLogin}>
          {error && <div style={{ color:'#c0392b', fontSize:12, marginBottom:12, textAlign:'center', background:'#fff0f0', padding:'8px 12px', borderRadius:8 }}>{error}</div>}
          <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:5 }}>Email</div>
          <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#f0ede8', fontSize:13, color:'#1a1a1a', marginBottom:14, boxSizing:'border-box' }} type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
          <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:5 }}>Contraseña</div>
          <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#f0ede8', fontSize:13, color:'#1a1a1a', marginBottom:14, boxSizing:'border-box' }} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
          <button style={{ width:'100%', padding:13, borderRadius:12, background: loading ? '#8aaa94' : '#1E5631', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer', marginTop:4 }} type="submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
        <div style={{ borderTop:'1px solid #e8e6e2', margin:'20px 0' }}/>
        <div style={{ fontSize:11, color:'#bbb', textAlign:'center' }}>AgroBloque · Campo Norte & Sur</div>
      </div>
    </div>
  )
}
