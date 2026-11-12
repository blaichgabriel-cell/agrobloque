import React from 'react'
import { useVolverAlPanel } from './Soporte'

// Solo en la demostración: al entrar a una empresa de ejemplo no hay datos reales que mostrar, así que cada módulo
// del cliente enseña esta pantalla. El menú, la cápsula de arriba y el botón de volver son los de verdad.
export default function DemoInmersion({ contexto, modulo }) {
  const { volver, ocupado } = useVolverAlPanel()
  const campo = contexto.campo_nombre
  return <div className="pl-page">
    <section className="pl-inmersion bl-card" aria-labelledby="demo-titulo">
      <span className="pl-inmersion__icono" aria-hidden="true"><i className="ti ti-shield-check" /></span>
      <span className="pl-inmersion__etiqueta">{contexto.propia ? 'DEMOSTRACIÓN' : 'MODO SOPORTE · SOLO LECTURA'}</span>
      <h1 id="demo-titulo">{modulo}</h1>
      <p>Aquí verías <b>{modulo}</b> de <b>{contexto.organizacion_nombre}{campo ? ` · ${campo}` : ''}</b>. Esta es una demostración con empresas de ejemplo, así que no hay datos reales todavía.</p>
      <ul>
        <li><i className="ti ti-layout-sidebar" aria-hidden="true" />El menú ya es el del cliente: campo, operación y gestión.</li>
        <li><i className="ti ti-eye" aria-hidden="true" />{contexto.propia ? 'Es una empresa propia de ejemplo.' : 'Todo es de solo lectura: no podrás crear, editar ni borrar.'}</li>
        <li><i className="ti ti-arrow-back-up" aria-hidden="true" />Con «Volver al Panel AgroBloque» sales y regresas a todas tus empresas.</li>
      </ul>
      <button type="button" className="bl-btn bl-btn--primary" onClick={volver} disabled={ocupado}><i className="ti ti-arrow-left" aria-hidden="true" />Volver al Panel AgroBloque</button>
    </section>
  </div>
}
