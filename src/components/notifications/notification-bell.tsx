'use client'

import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import Link from 'next/link'

export function NotificationBell() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await fetch('/api/notifications/unread-count')
      if (!res.ok) return { count: 0 }
      return res.json()
    },
    refetchInterval: 30000,
  })

  const count = data?.count ?? 0

  return (
    <Link href="/settings" className="relative p-2 rounded-md hover:bg-accent">
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}
