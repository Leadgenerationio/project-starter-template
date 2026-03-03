'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useOrg } from '@/providers/org-provider'
import type { OrgMember, OrgInvite } from '@/lib/types'
import { Trash2, Send, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function MembersPage() {
  const { addToast } = useToast()
  const { membership } = useOrg()
  const queryClient = useQueryClient()
  const isOwner = membership?.role === 'owner'
  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin'

  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'member' | 'invite' } | null>(null)

  const { data: members } = useQuery<OrgMember[]>({
    queryKey: ['org', 'members'],
    queryFn: async () => {
      const res = await fetch('/api/org/members')
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: invites } = useQuery<OrgInvite[]>({
    queryKey: ['org', 'invites'],
    queryFn: async () => {
      const res = await fetch('/api/org/invites')
      if (!res.ok) return []
      return res.json()
    },
  })

  const sendInvite = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/org/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: inviteRole }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      return res.json()
    },
    onSuccess: () => {
      addToast({ title: 'Invite sent' })
      setEmail('')
      queryClient.invalidateQueries({ queryKey: ['org', 'invites'] })
    },
    onError: (err) => {
      addToast({ title: 'Failed to send invite', description: err.message, variant: 'destructive' })
    },
  })

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch('/api/org/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
    },
    onSuccess: () => {
      addToast({ title: 'Member removed' })
      queryClient.invalidateQueries({ queryKey: ['org', 'members'] })
      setDeleteTarget(null)
    },
  })

  const revokeInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await fetch('/api/org/invites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
    },
    onSuccess: () => {
      addToast({ title: 'Invite revoked' })
      queryClient.invalidateQueries({ queryKey: ['org', 'invites'] })
      setDeleteTarget(null)
    },
  })

  const roleColors: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-800',
    admin: 'bg-blue-100 text-blue-800',
    member: 'bg-gray-100 text-gray-800',
  }

  return (
    <div>
      <PageHeader
        title="Team Members"
        description="Manage your organization's team"
        actions={
          <Link href="/settings">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Settings
            </Button>
          </Link>
        }
      />

      <div className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Members ({members?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {members?.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{m.user_email}</p>
                    <Badge variant="secondary" className={roleColors[m.role]}>{m.role}</Badge>
                  </div>
                  {isOwner && m.role !== 'owner' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget({ id: m.id, type: 'member' })}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Invite Member</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    type="email"
                  />
                </div>
                <div className="w-32 space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </Select>
                </div>
              </div>
              <Button onClick={() => sendInvite.mutate()} disabled={!email || sendInvite.isPending}>
                <Send className="h-4 w-4 mr-1" />
                {sendInvite.isPending ? 'Sending...' : 'Send Invite'}
              </Button>
            </CardContent>
          </Card>
        )}

        {invites && invites.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pending Invites ({invites.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{inv.email}</p>
                      <Badge variant="secondary" className={roleColors[inv.role]}>{inv.role}</Badge>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget({ id: inv.id, type: 'invite' })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={deleteTarget?.type === 'member' ? 'Remove Member' : 'Revoke Invite'}
        description={
          deleteTarget?.type === 'member'
            ? 'This member will lose access to the organization.'
            : 'This invitation will be cancelled.'
        }
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget?.type === 'member') removeMember.mutate(deleteTarget.id)
          else if (deleteTarget) revokeInvite.mutate(deleteTarget.id)
        }}
      />
    </div>
  )
}
