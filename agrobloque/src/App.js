import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Mapa from './pages/Mapa'
import FichaBloque from './pages/FichaBloque'
import Configuracion from './pages/Configuracion'
import Agenda from './pages/Agenda'
import Asistencia from './pages/Asistencia'
import Cosecha from './pages/Cosecha'
import Inventario from './pages/Inventario'
import Fumigaciones from './pages/Fumigaciones'
import Costos from './pages/Costos'
import Reportes from './pages/Reportes'
import Compradores from './pages/Compradores'
import NavBar from './components/NavBar'

// Logo definido ANTES de usarse
export function LogoHS({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="2" y="72" fontFamily="Georgia, 'Times New Roman', serif" fontSize="72" fontWeight="700" fill="#1E5631" letterSpacing="-4">HS</text>
      <path d="M50 18c0 0-4-12 0-18 4 6 0 18 0 18z" fill="#5abf7a"/>
      <path d="M50 16c0 0-11-8-9-16 9 2 9 16 9 16z" fill="#3d9a5e"/>
      <path d="M50 16c0 0 11-8 9-16-9 2-9 16-9 16z" fill="#3d9a5e"/>
    </svg>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [campoActivo, setCampoActivo] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#f0ede8' }}>
      <div style={{ textAlign:'center' }}>
        <LogoHS size={56} />
        <div style={{ color:'#888', fontSize:13, marginTop:12 }}>Cargando...</div>
      </div>
    </div>
  )

  if (!session) return <Login />

  return (
    <BrowserRouter>
      <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'#f2f1ef', position:'relative', paddingBottom:64 }}>
        <Routes>
          <Route path="/" element={<Dashboard campoActivo={campoActivo} setCampoActivo={setCampoActivo}/>}/>
          <Route path="/mapa" element={<Mapa campoActivo={campoActivo}/>}/>
          <Route path="/bloque/:id" element={<FichaBloque/>}/>
          <Route path="/agenda" element={<Agenda/>}/>
          <Route path="/asistencia" element={<Asistencia/>}/>
          <Route path="/cosecha" element={<Cosecha/>}/>
          <Route path="/inventario" element={<Inventario/>}/>
          <Route path="/fumigaciones" element={<Fumigaciones/>}/>
          <Route path="/costos" element={<Costos campoActivo={campoActivo}/>}/>
          <Route path="/reportes" element={<Reportes campoActivo={campoActivo}/>}/>
          <Route path="/compradores" element={<Compradores/>}/>
          <Route path="/configuracion" element={<Configuracion/>}/>
          <Route path="*" element={<Navigate to="/"/>}/>
        </Routes>
        <NavBar/>
      </div>
    </BrowserRouter>
  )
}
