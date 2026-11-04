import { useEffect } from 'react'

// Arrastrar hacia abajo el tirador de una hoja inferior (o el borde superior de «Más») la cierra,
// como en Apple Maps. Una sola escucha global: sirve a todos los modales sin tocar cada pantalla.
const SHEET = '.bl-sheet, .ag-modal-overlay>div, .ag-work-dialog, .ag-more-menu, [data-sheet]'
const GRAB_ZONE = 48
const EASE = 'cubic-bezier(.32,.72,0,1)'
const mobile = () => window.matchMedia('(max-width:1099px)').matches
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches

const requestClose = (sheet) => {
  if (sheet.matches('dialog')) { sheet.close(); return }
  if (sheet.matches('.ag-more-menu')) { document.querySelector('.ag-more-backdrop')?.click(); return }
  // Modales con Escape (ModalShell), con clic en el fondo (hojas de Vivero) o con su propio botón de cierre.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  const overlay = sheet.closest('.bl-overlay, .ag-modal-overlay') || (sheet.hasAttribute('data-sheet') ? sheet.parentElement : null)
  overlay?.click()
  const closer = Array.from(sheet.querySelectorAll('button')).find(b => /^(cerrar|cancelar|×|✕)$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()))
  closer?.click()
}

// Los modales antiguos son un div fijo a pantalla completa con la hoja dentro y sin clase propia:
// al montarse se detecta la hoja anclada al borde inferior y se marca para darle tirador y gesto.
const markSheet = (node) => {
  if (node.nodeType !== 1 || !mobile()) return
  const cs = getComputedStyle(node)
  if (cs.position !== 'fixed') return
  const box = node.getBoundingClientRect()
  const sheet = node.firstElementChild
  if (box.width < window.innerWidth - 1 || box.height < window.innerHeight - 1 || !sheet) return
  if (sheet.getBoundingClientRect().bottom >= window.innerHeight - 2 && getComputedStyle(sheet).position !== 'fixed') sheet.dataset.sheet = ''
}

export default function SheetGestures() {
  useEffect(() => {
    let drag = null
    const observer = new MutationObserver((records) => records.forEach(r => r.addedNodes.forEach(markSheet)))
    observer.observe(document.body, { childList: true, subtree: true })

    const point = (e) => (e.touches ? e.touches[0] : e)

    const start = (e) => {
      if (!mobile()) return
      const sheet = e.target.closest?.(SHEET)
      if (!sheet || sheet.scrollTop > 0) return
      const p = point(e)
      if (p.clientY - sheet.getBoundingClientRect().top > GRAB_ZONE) return
      drag = { sheet, y0: p.clientY, t0: performance.now(), dy: 0, moved: false }
      sheet.style.transition = 'none'
    }

    const move = (e) => {
      if (!drag) return
      const dy = Math.max(0, point(e).clientY - drag.y0)
      if (dy > 4) drag.moved = true
      if (!drag.moved) return
      if (e.cancelable) e.preventDefault()
      drag.dy = dy
      drag.sheet.style.transform = `translateY(${dy}px)`
    }

    const settle = (sheet, to, ms) => {
      sheet.style.transition = reduceMotion() ? 'none' : `transform ${ms}ms ${EASE}`
      sheet.style.transform = to
    }

    const end = () => {
      if (!drag) return
      const { sheet, dy, t0, moved } = drag
      drag = null
      if (!moved) { sheet.style.transition = ''; sheet.style.transform = ''; return }
      const velocity = dy / Math.max(1, performance.now() - t0)
      if (dy > 110 || velocity > 0.6) {
        settle(sheet, 'translateY(100%)', 220)
        window.setTimeout(() => {
          requestClose(sheet)
          // Si el modal no se cierra (por ejemplo está guardando), vuelve a su sitio.
          window.setTimeout(() => {
            if (sheet.isConnected && sheet.getClientRects().length) settle(sheet, 'translateY(0)', 320)
            window.setTimeout(() => { if (sheet.isConnected) { sheet.style.transition = ''; sheet.style.transform = '' } }, 340)
          }, 260)
        }, reduceMotion() ? 0 : 200)
      } else {
        settle(sheet, 'translateY(0)', 300)
        window.setTimeout(() => { sheet.style.transition = ''; sheet.style.transform = '' }, 320)
      }
    }

    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end)
    document.addEventListener('touchcancel', end)
    document.addEventListener('mousedown', start)
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', end)
    return () => {
      observer.disconnect()
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', end)
      document.removeEventListener('mousedown', start)
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', end)
    }
  }, [])
  return null
}
