import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { createClient } from '@/lib/supabase/server'
import { AuthProvider } from '@/providers/auth-provider'
import { OrgProvider } from '@/providers/org-provider'
import { QueryProvider } from '@/providers/query-provider'
import { ToastProvider } from '@/components/ui/toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LeadVault',
  description: 'Multi-tenant lead management and resale platform',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          <AuthProvider initialUser={user}>
            <OrgProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </OrgProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
