import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Abre el formulario de alta de una pantalla cuando se llega con ?nuevo=1 (botón «+» de la barra inferior).
// Espera a que la pantalla tenga sus datos (`listo`) para no abrir un formulario con listas vacías; si los
// datos tardan más de 3 s lo abre igual. Quita el parámetro de la dirección para que volver atrás no lo
// reabra. Sin permiso de crear (`permitido` en falso) solo limpia la dirección.
export function useAccionNueva(abrir, { permitido = true, listo = true } = {}) {
  const location = useLocation()
  const navigate = useNavigate()
  const pedido = new URLSearchParams(location.search).get('nuevo') === '1'
  const [esperaVencida, setEsperaVencida] = useState(false)
  const abrirRef = useRef(abrir)
  abrirRef.current = abrir

  useEffect(() => {
    if (!pedido) return undefined
    setEsperaVencida(false)
    const espera = window.setTimeout(() => setEsperaVencida(true), 3000)
    return () => window.clearTimeout(espera)
  }, [pedido])

  useEffect(() => {
    if (!pedido || !(listo || esperaVencida)) return
    const params = new URLSearchParams(location.search)
    params.delete('nuevo')
    const resto = params.toString()
    navigate({ pathname: location.pathname, search: resto ? `?${resto}` : '' }, { replace: true })
    if (permitido) abrirRef.current()
  }, [pedido, listo, esperaVencida, permitido, location.pathname, location.search, navigate])
}
