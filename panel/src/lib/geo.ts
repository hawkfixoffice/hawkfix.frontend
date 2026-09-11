import { useEffect } from 'react'
import { sb, type Me } from './supabase'

/** Телефон мастера раз в минуту сообщает, где он.
 *  Нужно для двух вещей: менеджер видит бригаду на карте, а алгоритм
 *  подбора учитывает, кто ближе к адресу заказа. Для офиса не включаем —
 *  их местоположение никого не касается. */
export function useMasterPing(me: Me) {
  useEffect(() => {
    if (me.role !== 'master' || typeof navigator === 'undefined' || !navigator.geolocation) return

    const send = (pos: GeolocationPosition) => {
      sb.from('staff_locations').upsert({
        staff_id: me.id,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
        updated_at: new Date().toISOString(),
      }).then(() => {})
    }
    const ask = () => navigator.geolocation.getCurrentPosition(send, () => {}, {
      enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000,
    })

    ask()
    const id = window.setInterval(ask, 60_000)
    return () => window.clearInterval(id)
  }, [me.id, me.role])
}

/** Отметка присутствия: пока вкладка панели открыта и видима, раз в минуту
 *  уходит удар сердца. Из этих минут складывается рабочее время в профиле —
 *  для менеджера это единственная измеримая работа: он не ездит и не сдаёт
 *  отчётов, он сидит в панели. Свёрнутая вкладка не считается.
 *
 *  Точность в минуту намеренная: интерес в «сколько часов сегодня», а не
 *  в секундах, и строка на минуту на человека — это 480 строк за смену. */
export function useOnlinePing(me: Me) {
  useEffect(() => {
    if (!me.id) return
    const beat = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      sb.rpc('ping_online').then(() => {})
    }
    beat()
    const id = window.setInterval(beat, 60_000)
    document.addEventListener('visibilitychange', beat)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', beat) }
  }, [me.id])
}

/** Координаты устройства по запросу — например, чтобы построить маршрут
 *  «отсюда к клиенту» прямо сейчас. */
export function currentPosition(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  })
}
