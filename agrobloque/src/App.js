import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Mapa from './pages/Mapa'
import FichaBloque from './pages/pages/FichaBloque'
import Configuracion from './pages/Configuracion'
import Agenda from './pages/Agenda'
import Asistencia from './pages/Asistencia'
import Cosecha from './pages/Cosecha'
import Inventario from './pages/Inventario'
import Fumigaciones from './pages/Fumigaciones'
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
        <div style={{ fontSize:32, fontWeight:700, color:'#1a1a1a', marginBottom:8, letterSpacing:-1 }}>AgroBloque</div>
        <div style={{ color:'#888', fontSize:14 }}>Cargando...</div>
      </div>
    </div>
  )

  if (!session) return <Login />

  return (
    <BrowserRouter>
      <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'#f9f8f6', position:'relative', paddingBottom:64 }}>
        <Routes>
          <Route path="/" element={<Dashboard campoActivo={campoActivo} setCampoActivo={setCampoActivo}/>}/>
          <Route path="/mapa" element={<Mapa campoActivo={campoActivo}/>}/>
          <Route path="/bloque/:id" element={<FichaBloque/>}/>
          <Route path="/agenda" element={<Agenda/>}/>
          <Route path="/asistencia" element={<Asistencia/>}/>
          <Route path="/cosecha" element={<Cosecha/>}/>
          <Route path="/inventario" element={<Inventario/>}/>
          <Route path="/fumigaciones" element={<Fumigaciones/>}/>
          <Route path="/configuracion" element={<Configuracion/>}/>
          <Route path="*" element={<Navigate to="/"/>}/>
        </Routes>
        <NavBar/>
      </div>
    </BrowserRouter>
  )
}
