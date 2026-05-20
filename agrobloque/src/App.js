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

// Logo HS SVG reutilizable — exportado para uso en Login y splash
export function LogoHS({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* H */}
      <path d="M18 88V32h10v22h28V32h10v56H56V62H28v26H18z" fill="#1E5631"/>
      {/* S */}
      <path d="M72 32h30c5 0 9 4 9 9v8c0 4-2 7-6 8.5 4 1.5 6 4.5 6 8.5v10c0 5-4 9-9 9H72V32zm10 24h18c1.5 0 2.5-1 2.5-2.5v-7c0-1.5-1-2.5-2.5-2.5H82v12zm0 22h18c1.5 0 2.5-1 2.5-2.5v-8c0-1.5-1-2.5-2.5-2.5H82v13z" fill="#2d8a4e"/>
      {/* Hoja central */}
      <path d="M60 28c0 0-4-12 0-18 4 6 0 18 0 18z" fill="#4aaa6a"/>
      {/* Hoja izquierda */}
      <path d="M60 26c0 0-10-8-8-16 8 2 8 16 8 16z" fill="#3d9a5e"/>
      {/* Hoja derecha */}
      <path d="M60 26c0 0 10-8 8-16-8 2-8 16-8 16z" fill="#3d9a5e"/>
    </svg>
  )
}
