'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { loginSchema, type LoginInput } from '@/lib/validations/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const input: LoginInput = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    }

    const result = loginSchema.safeParse(input)
    if (!result.success) {
      setError(result.error.issues[0].message)
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword(input)

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Check if user has MFA enrolled — if so, redirect to verification page
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const hasTOTP = factors?.totp && factors.totp.length > 0

    if (hasTOTP) {
      router.push('/mfa-verify')
      router.refresh()
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">LeadVault</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="you@example.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" placeholder="••••••" required />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
          <div className="text-sm text-center space-y-1">
            <Link href="/forgot-password" className="text-muted-foreground hover:underline block">
              Forgot password?
            </Link>
            <Link href="/register" className="text-muted-foreground hover:underline block">
              Don&apos;t have an account? Sign up
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}
