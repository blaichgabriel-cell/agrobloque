import React, { useEffect, useState } from 'react'
import { PlataformaCabecera } from '../components/PlataformaUI'
import { forceLocalSignOut, supabase } from '../lib/supabase'

const TEMAS = [['light', 'ti-sun', 'Claro'], ['dark', 'ti-moon-stars', 'Oscuro'], ['system', 'ti-device-desktop', 'Del dispositivo']]

// Equipo Super Admin: quiénes son los administradores generales y la configuración global de la plataforma.
export default function PlataformaEquipo({ themeMode = 'system', onThemeChange }) {
  const [correo, setCorreo] = useState('')
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setCorreo(data?.session?.user?.email || '')).catch(() => {}) }, [])

  return <div className="pl-page">
    <PlataformaCabecera icono="ti-shield-lock" eyebrow="EQUIPO SUPER ADMIN" titulo="Los administradores de AgroBloque" sub="Hay exactamente dos administradores generales. Pueden crear empresas y pedir acceso de soporte, pero no ven los datos de ningún cliente sin su autorización." />

    <section className="pl-bloque" aria-labelledby="eq-admins">
      <h2 id="eq-admins"><i className="ti ti-users-group" aria-hidden="true" />Administradores generales</h2>
      <ul className="pl-filas">
        <li>
          <span className="pl-avatar pl-avatar--chico" aria-hidden="true">{(correo || '?').charAt(0).toUpperCase()}</span>
          <div><b>{correo || 'Tu cuenta'}</b><span>Administrador general · esta es tu sesión</span></div>
          <span className="sp-chip sp-chip--activo"><i className="ti ti-user-check" aria-hidden="true" />Tú</span>
        </li>
        <li>
          <span className="pl-avatar pl-avatar--chico" aria-hidden="true"><i className="ti ti-user" /></span>
          <div><b>El segundo administrador general</b><span>Tu socio. Su correo no se muestra aquí por privacidad.</span></div>
        </li>
      </ul>
      <p className="pl-nota"><i className="ti ti-info-circle" aria-hidden="true" /><span>Agregar o quitar un administrador general se hace en la base de datos (tabla <code>private.platform_admins</code>), por quien tenga acceso de Administrator al proyecto de Supabase. No se puede hacer desde la app.</span></p>
    </section>

    <section className="pl-bloque" aria-labelledby="eq-reglas">
      <h2 id="eq-reglas"><i className="ti ti-list-check" aria-hidden="true" />Reglas de la plataforma</h2>
      <ul className="pl-reglas">
        <li><i className="ti ti-mail" aria-hidden="true" /><span>Un correo pertenece a una sola empresa.</span></li>
        <li><i className="ti ti-eye-off" aria-hidden="true" /><span>Los administradores generales no ven datos de clientes sin autorización.</span></li>
        <li><i className="ti ti-clock-hour-4" aria-hidden="true" /><span>El acceso de soporte es de solo lectura y dura como máximo 72 horas.</span></li>
        <li><i className="ti ti-list-details" aria-hidden="true" /><span>Cada solicitud, aprobación y entrada queda registrada e inmodificable.</span></li>
        <li><i className="ti ti-database-export" aria-hidden="true" /><span>Los respaldos se hacen cada semana y nunca se suben a GitHub.</span></li>
      </ul>
    </section>

    <section className="pl-bloque" aria-labelledby="eq-config">
      <h2 id="eq-config"><i className="ti ti-settings" aria-hidden="true" />Configuración</h2>
      <div className="pl-temas" role="radiogroup" aria-label="Tema de la aplicación">
        {TEMAS.map(([valor, icono, etiqueta]) => <button type="button" key={valor} className={themeMode === valor ? 'activo' : ''} role="radio" aria-checked={themeMode === valor} onClick={() => onThemeChange?.(valor)}>
          <i className={`ti ${icono}`} aria-hidden="true" /><span>{etiqueta}</span>
        </button>)}
      </div>
      <button type="button" className="bl-btn bl-btn--ghost pl-salir" onClick={() => forceLocalSignOut()}><i className="ti ti-logout" aria-hidden="true" />Cerrar sesión</button>
    </section>
  </div>
}
