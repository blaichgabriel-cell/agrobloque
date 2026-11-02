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
      <text x="2" y="72" fontFamily="Georgia, 'Times New Roman', serif" fontSize="72" fontWeight="700" fill="#A0785A" letterSpacing="-4">AB</text>
      <path d="M50 18c0 0-4-12 0-18 4 6 0 18 0 18z" fill="#D4B08A"/>
      <path d="M50 16c0 0-11-8-9-16 9 2 9 16 9 16z" fill="#A0785A"/>
      <path d="M50 16c0 0 11-8 9-16-9 2-9 16-9 16z" fill="#A0785A"/>
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
    <div className="ui-4787b9">
      <div className="ui-13076d">
        <LogoHS size={56} />
        <div className="ui-c4a8d7">Cargando...</div>
      </div>
    </div>
  )

  if (!session) return <Login />

  return (
    <BrowserRouter>
      <div className="ui-4aa02f">
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
