'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Organization, OrgMember } from '@/lib/types'
import { useAuth } from './auth-provider'

interface OrgContextValue {
  org: Organization | null
  membership: OrgMember | null
  loading: boolean
}

const OrgContext = createContext<OrgContextValue>({ org: null, membership: null, loading: true })

export function useOrg() {
  return useContext(OrgContext)
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [org, setOrg] = useState<Organization | null>(null)
  const [membership, setMembership] = useState<OrgMember | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setOrg(null)
      setMembership(null)
      setLoading(false)
      return
    }

    const supabase = createClient()

    async function loadOrg() {
      const { data: memberData } = await supabase
        .from('org_members')
        .select('*, organizations(*)')
        .eq('user_id', user!.id)
        .limit(1)
        .single()

      if (memberData) {
        setMembership({
          id: memberData.id,
          org_id: memberData.org_id,
          user_id: memberData.user_id,
          role: memberData.role,
          created_at: memberData.created_at,
        })
        setOrg(memberData.organizations as unknown as Organization)
      }
      setLoading(false)
    }

    loadOrg()
  }, [user])

  return (
    <OrgContext.Provider value={{ org, membership, loading }}>
      {children}
    </OrgContext.Provider>
  )
}
