import React from 'react'
import NotasPanel from '../components/NotasPanel'

export default function BlocNotas() {
  return (
    <div className="ag-page notes-page">
      <header className="ag-page-header notes-page__header">
        <div>
          <div className="ui-476525">Apuntes rápidos</div>
          <h1 className="ag-page-title">Bloc de notas</h1>
          <p>Escribí recordatorios, ideas o cualquier dato que quieras conservar. Sin fechas ni programación.</p>
        </div>
      </header>
      <main className="ag-page-body notes-page__body">
        <NotasPanel
          modulo="bloc_notas"
          permisoModulo="agenda"
          titulo="Mis notas"
          mostrarFecha={false}
          limite={null}
          modoPagina
        />
      </main>
    </div>
  )
}
