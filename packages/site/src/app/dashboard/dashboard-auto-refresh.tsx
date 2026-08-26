'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const REFRESH_INTERVAL_MS = 5 * 60_000

/** Refresh only while visible and at the same cadence as the dashboard cache. */
export function DashboardAutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    let lastRefresh = Date.now()
    let timer: ReturnType<typeof setTimeout> | undefined

    const clearTimer = () => {
      if (timer) clearTimeout(timer)
      timer = undefined
    }
    const schedule = () => {
      clearTimer()
      if (document.visibilityState !== 'visible') return
      const remaining = Math.max(REFRESH_INTERVAL_MS - (Date.now() - lastRefresh), 0)
      timer = setTimeout(() => {
        lastRefresh = Date.now()
        router.refresh()
        schedule()
      }, remaining)
    }
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') {
        clearTimer()
        return
      }
      if (Date.now() - lastRefresh >= REFRESH_INTERVAL_MS) {
        lastRefresh = Date.now()
        router.refresh()
      }
      schedule()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    schedule()
    return () => {
      clearTimer()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [router])

  return null
}
