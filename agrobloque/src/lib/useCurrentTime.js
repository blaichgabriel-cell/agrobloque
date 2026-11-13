import { useEffect, useState } from 'react'

// Mantiene las referencias dependientes de la hora actualizadas aunque la aplicación
// permanezca abierta durante horas o vuelva desde segundo plano después de medianoche.
export const useCurrentTime = (intervalMs = 60000) => {
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    const actualizar = () => setAhora(new Date())
    const intervalo = window.setInterval(actualizar, intervalMs)
    window.addEventListener('focus', actualizar)
    document.addEventListener('visibilitychange', actualizar)
    return () => {
      window.clearInterval(intervalo)
      window.removeEventListener('focus', actualizar)
      document.removeEventListener('visibilitychange', actualizar)
    }
  }, [intervalMs])

  return ahora
}
