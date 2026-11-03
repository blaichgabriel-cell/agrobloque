import { useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'

const localDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const notificationsEnabled = () => typeof window !== 'undefined' && window.localStorage.getItem('agrobloque-notificaciones') === 'on' && window.Notification?.permission === 'granted'

const taskNotificationKey = (task, today) => `agrobloque-task-notified:${task.id}:${today}`

const taskIsDue = (task, today, currentTime) => {
  const scheduledTime = task.hora_programada ? String(task.hora_programada).slice(0, 5) : ''
  if (task.fecha_programada === today && scheduledTime && currentTime < scheduledTime) return false
  return !sessionStorage.getItem(taskNotificationKey(task, today))
}

const notifyTasks = tasks => {
  const today = localDate()
  const now = new Date()
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const pending = (tasks || []).filter(task => taskIsDue(task, today, currentTime))
  if (!pending.length) return
  const overdue = pending.filter(task => task.fecha_programada < today).length
  const first = pending[0]
  const firstTime = first.hora_programada ? ` · ${String(first.hora_programada).slice(0, 5)}` : ''
  const title = pending.length === 1
    ? (overdue ? 'Tarea vencida' : 'Tarea programada para hoy')
    : `${pending.length} tareas requieren atención`
  const description = pending.length === 1
    ? `${first.descripcion || 'Tarea pendiente'}${firstTime}`
    : `${overdue ? `${overdue} vencida${overdue === 1 ? '' : 's'} · ` : ''}${first.descripcion || 'Revisá la agenda del campo'}`
  const summaryKey = `agrobloque-task-summary:${today}`
  toast.warning(title, {
    id:summaryKey,
    description,
    action:{ label:'Ver agenda', onClick:() => { window.location.href = '/agenda' } },
  })
  if (notificationsEnabled()) {
    new Notification(`AgroBloque · ${title}`, {
      body:description,
      icon:'/logo192.png',
      tag:summaryKey,
    })
  }
  pending.forEach(task => sessionStorage.setItem(taskNotificationKey(task, today), '1'))
}

const notifyStock = product => {
  if (!notificationsEnabled()) return
  const today = localDate()
  const key = `agrobloque-stock-notified:${product.id}:${today}`
  if (localStorage.getItem(key)) return
  const agotado = Number(product.stock_actual || 0) <= 0
  try { new Notification(agotado ? 'AgroBloque · Producto agotado' : 'AgroBloque · Stock bajo', { body:`${product.nombre} · disponible ${product.stock_actual || 0}`, icon:'/logo192.png', tag:key }) } catch {}
  localStorage.setItem(key, '1')
}

export default function TaskNotifications({ enabled = true }) {
  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    const check = async () => {
      const today = localDate()
      const [tareas, productos] = await Promise.all([
        supabase.from('tareas').select('*').eq('completada', false).eq('anulada', false).lte('fecha_programada', today).order('fecha_programada').limit(8),
        supabase.from('productos').select('id,nombre,stock_actual,stock_minimo').eq('activo', true),
      ])
      if (!active) return
      if (!tareas.error) notifyTasks(tareas.data || [])
      if (!productos.error) (productos.data || []).filter(producto => Number(producto.stock_actual || 0) <= 0 || (Number(producto.stock_minimo || 0) > 0 && Number(producto.stock_actual || 0) <= Number(producto.stock_minimo || 0))).slice(0, 4).forEach(notifyStock)
    }
    check()
    const timer = window.setInterval(check, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled])
  return null
}
