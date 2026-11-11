import React from 'react'
import logoMarca from '../assets/agrobloque-logo-marca.png'
import logoClaro from '../assets/agrobloque-logo-claro.png'

// Logo de AgroBloque con fondo transparente.
// - tone="auto" (por defecto): versión de color sobre fondos claros y versión blanca en modo oscuro.
// - tone="light": siempre la versión blanca (para fondos oscuros fijos, como el héroe del login).
export default function BrandLogo({ className = '', tone = 'auto', alt = 'AgroBloque' }) {
  if (tone === 'light') {
    return <img className={`bl-logo ${className}`} src={logoClaro} alt={alt} />
  }
  return <>
    <img className={`bl-logo bl-logo--sobre-claro ${className}`} src={logoMarca} alt={alt} />
    <img className={`bl-logo bl-logo--sobre-oscuro ${className}`} src={logoClaro} alt="" aria-hidden="true" />
  </>
}
