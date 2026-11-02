import { useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'

const localDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const notifyTask = task => {
  const today = localDate()
  const now = new Date()
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const scheduledTime = task.hora_programada ? String(task.hora_programada).slice(0, 5) : ''
  if (task.fecha_programada === today && scheduledTime && currentTime < scheduledTime) return
  const key = `agrobloque-task-notified:${task.id}:${today}`
  if (sessionStorage.getItem(key)) return
  const overdue = task.fecha_programada < today
  const time = scheduledTime ? ` · ${scheduledTime}` : ''
  toast.warning(overdue ? 'Tarea vencida' : 'Tarea programada para hoy', {
    id:key,
    description:`${task.descripcion || 'Tarea pendiente'}${time}`,
    duration:8000,
    action:{ label:'Ver agenda', onClick:() => { window.location.href = '/agenda' } },
  })
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(overdue ? 'AgroBloque · Tarea vencida' : 'AgroBloque · Tarea de hoy', {
      body:`${task.descripcion || 'Tarea pendiente'}${time}`,
      icon:'/logo192.png',
      tag:key,
    })
  }
  sessionStorage.setItem(key, '1')
}

export default function TaskNotifications({ enabled = true }) {
  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    const check = async () => {
      const today = localDate()
      const { data, error } = await supabase.from('tareas').select('*').eq('completada', false).eq('anulada', false).lte('fecha_programada', today).order('fecha_programada').limit(8)
      if (!active || error) return
      ;(data || []).forEach(notifyTask)
    }
    check()
    const timer = window.setInterval(check, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled])
  return null
}
