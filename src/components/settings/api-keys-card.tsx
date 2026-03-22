'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { formatDateTime } from '@/lib/utils/format'
import { Key, Copy, Check, Plus, Trash2 } from 'lucide-react'

interface ApiKey {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
  is_active: boolean
}

export function ApiKeysCard() {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: keys } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const res = await fetch('/api/settings/api-keys')
      if (!res.ok) return []
      return res.json()
    },
  })

  const createKey = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      return res.json()
    },
    onSuccess: (data) => {
      setCreatedKey(data.key)
      setNewKeyName('')
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
    onError: (err) => {
      addToast({ title: 'Failed to create key', description: err.message, variant: 'destructive' })
    },
  })

  const toggleKey = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await fetch('/api/settings/api-keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active }),
      })
      if (!res.ok) throw new Error('Failed')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      addToast({ title: 'API key updated' })
    },
  })

  const deleteKey = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/settings/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      addToast({ title: 'API key deleted' })
    },
  })

  const handleCopy = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCloseCreate = () => {
    setShowCreate(false)
    setCreatedKey(null)
    setNewKeyName('')
    setCopied(false)
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys
            </CardTitle>
            <CardDescription>Manage keys for the lead ingest API</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Create Key
          </Button>
        </CardHeader>
        <CardContent>
          {keys && keys.length > 0 ? (
            <div className="space-y-3">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{k.name}</span>
                      <Badge variant={k.is_active ? 'default' : 'secondary'}>
                        {k.is_active ? 'Active' : 'Revoked'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {formatDateTime(k.created_at)}
                      {k.last_used_at && ` · Last used ${formatDateTime(k.last_used_at)}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleKey.mutate({ id: k.id, is_active: !k.is_active })}
                    >
                      {k.is_active ? 'Revoke' : 'Activate'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteKey.mutate(k.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No API keys yet. Create one to start sending leads via API.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={handleCloseCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdKey ? 'API Key Created' : 'Create API Key'}</DialogTitle>
            <DialogDescription>
              {createdKey
                ? 'Copy this key now — it will only be shown once.'
                : 'Give your key a name to identify it later.'}
            </DialogDescription>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input value={createdKey} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
                <p className="text-sm text-yellow-800">
                  This key will not be shown again. Store it securely.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={handleCloseCreate}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Key Name</Label>
                <Input
                  placeholder="e.g. Facebook Leads, Zapier Integration"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newKeyName.trim()) createKey.mutate(newKeyName.trim())
                  }}
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createKey.mutate(newKeyName.trim())}
                  disabled={!newKeyName.trim() || createKey.isPending}
                >
                  Create Key
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
