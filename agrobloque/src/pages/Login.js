import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

function LogoHS({ size = 80 }) {
  const fs = Math.round(size * 0.72)
  return (
    <div style={{ width:size, height:size, background:'#212121', borderRadius:Math.round(size*0.22), display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto' }}>
      <span style={{ fontSize:fs, fontWeight:800, color:'#fff', letterSpacing:-2, lineHeight:1, fontFamily:"'Arial Black', 'Arial Bold', Arial, sans-serif" }}>HS</span>
    </div>
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
          <div style={{ fontSize:15, fontWeight:700, color:'#212121', marginBottom:2, marginTop:8, letterSpacing:-.2 }}>Horticultura El Sembrador</div>
          <div style={{ fontSize:11, color:'#888', letterSpacing:.5, textTransform:'uppercase' }}>Sistema de gestión agrícola</div>
          <div style={{ fontSize:12, color:'#444444', marginTop:4, fontStyle:'italic' }}>Cosechando Confianza</div>
        </div>
        <form onSubmit={handleLogin}>
          {error && <div style={{ color:'#c0392b', fontSize:12, marginBottom:12, textAlign:'center', background:'#fff0f0', padding:'8px 12px', borderRadius:8 }}>{error}</div>}
          <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:5 }}>Email</div>
          <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#f0ede8', fontSize:13, color:'#1a1a1a', marginBottom:14, boxSizing:'border-box' }} type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
          <div style={{ fontSize:10, color:'#9a9a9a', marginBottom:5 }}>Contraseña</div>
          <input style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1px solid #e8e6e2', background:'#f0ede8', fontSize:13, color:'#1a1a1a', marginBottom:14, boxSizing:'border-box' }} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
          <button style={{ width:'100%', padding:13, borderRadius:12, background: loading ? '#888888' : '#212121', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer', marginTop:4 }} type="submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
        <div style={{ borderTop:'1px solid #e8e6e2', margin:'20px 0' }}/>
        <div style={{ fontSize:11, color:'#bbb', textAlign:'center' }}>AgroBloque · Campo Norte & Sur</div>
      </div>
    </div>
  )
}
