import React from 'react'

// Evita la pantalla en blanco: si una pantalla falla al dibujarse (o su archivo no
// carga tras un despliegue nuevo) se muestra un aviso con salida, y la navegación sigue viva.
export default class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) { console.error('Error de pantalla', error, info?.componentStack) }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const chunkFailed = /Loading chunk|ChunkLoadError|dynamically imported module/i.test(`${error?.name} ${error?.message}`)
    return <div className="bl-error-state" role="alert">
      <span className="bl-error-state__icon"><i className={`ti ${chunkFailed ? 'ti-cloud-off' : 'ti-alert-triangle'}`} aria-hidden="true" /></span>
      <h2>{chunkFailed ? 'Hay una versión nueva de la app' : 'Esta pantalla no pudo abrirse'}</h2>
      <p>{chunkFailed ? 'Recarga para continuar con la última versión. Tus datos están a salvo.' : 'Tus datos están a salvo. Puedes reintentar o volver al inicio.'}</p>
      <div className="bl-error-state__actions">
        <button className="bl-btn bl-btn--primary" onClick={() => chunkFailed ? window.location.reload() : this.setState({ error: null })}>{chunkFailed ? 'Recargar' : 'Reintentar'}</button>
        <a className="bl-btn bl-btn--ghost" href="/">Ir al inicio</a>
      </div>
    </div>
  }
}
