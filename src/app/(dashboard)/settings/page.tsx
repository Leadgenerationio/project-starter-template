'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { useOrg } from '@/providers/org-provider'
import type { Notification } from '@/lib/types'
import { formatDateTime } from '@/lib/utils/format'
import { Bell, Check } from 'lucide-react'
import Link from 'next/link'

export default function SettingsPage() {
  const { org } = useOrg()
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [orgName, setOrgName] = useState(org?.name ?? '')

  useEffect(() => {
    if (org?.name) setOrgName(org.name)
  }, [org?.name])

  const updateOrg = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      return res.json()
    },
    onSuccess: () => {
      addToast({ title: 'Organization updated' })
      queryClient.invalidateQueries({ queryKey: ['org'] })
    },
    onError: (err) => {
      addToast({ title: 'Failed to update', description: err.message, variant: 'destructive' })
    },
  })

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications')
      if (!res.ok) return []
      return res.json()
    },
  })

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  return (
    <div>
      <PageHeader title="Settings" description="Manage your organization" />

      <div className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>Update your organization details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Organization Name</Label>
              <div className="flex gap-2">
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                <Button onClick={() => updateOrg.mutate(orgName)} disabled={updateOrg.isPending}>
                  Save
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={org?.slug ?? ''} disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Team</CardTitle>
              <CardDescription>Manage members and invitations</CardDescription>
            </div>
            <Link href="/settings/members">
              <Button variant="outline" size="sm">Manage Team</Button>
            </Link>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
            </div>
            {notifications && notifications.some((n) => !n.read) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markRead.mutate(notifications.filter((n) => !n.read).map((n) => n.id))}
              >
                <Check className="h-4 w-4 mr-1" />
                Mark All Read
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {notifications && notifications.length > 0 ? (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`border-b pb-3 last:border-0 ${!n.read ? 'bg-blue-50/50 -mx-2 px-2 rounded' : ''}`}
                  >
                    <div className="flex justify-between items-start">
                      <p className={`text-sm ${!n.read ? 'font-medium' : ''}`}>{n.title}</p>
                      <span className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No notifications yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
