'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { ShieldCheck, ShieldOff, Loader2 } from 'lucide-react'

type EnrollmentState = 'loading' | 'not_enrolled' | 'enrolling' | 'enrolled'

export function MfaEnrollment() {
  const { addToast } = useToast()
  const [state, setState] = useState<EnrollmentState>('loading')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [unenrolling, setUnenrolling] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    checkEnrollment()
  }, [])

  async function checkEnrollment() {
    setState('loading')
    const supabase = createClient()
    const { data, error } = await supabase.auth.mfa.listFactors()

    if (error) {
      setState('not_enrolled')
      return
    }

    const verifiedFactor = data.totp?.find((f) => f.status === 'verified')
    if (verifiedFactor) {
      setFactorId(verifiedFactor.id)
      setState('enrolled')
    } else {
      setState('not_enrolled')
    }
  }

  async function startEnrollment() {
    setError('')
    const supabase = createClient()

    // Clean up any existing unverified factors before starting fresh enrollment
    const { data: factors } = await supabase.auth.mfa.listFactors()
    if (factors?.totp) {
      for (const factor of factors.totp) {
        // Unenroll any factor that isn't fully verified yet
        if ((factor.status as string) !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: factor.id })
        }
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'LeadVault Authenticator',
    })

    if (error) {
      setError(error.message)
      return
    }

    setFactorId(data.id)
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
    setState('enrolling')
  }

  async function verifyEnrollment(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setVerifying(true)

    const supabase = createClient()

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    })

    if (challengeError) {
      setError(challengeError.message)
      setVerifying(false)
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: verifyCode,
    })

    if (verifyError) {
      setError('Invalid code. Please check your authenticator app and try again.')
      setVerifying(false)
      return
    }

    addToast({ title: 'Two-factor authentication enabled' })
    setQrCode('')
    setSecret('')
    setVerifyCode('')
    setState('enrolled')
    setVerifying(false)
  }

  async function handleUnenroll() {
    setUnenrolling(true)
    const supabase = createClient()
    const { error } = await supabase.auth.mfa.unenroll({ factorId })

    if (error) {
      addToast({ title: 'Failed to disable 2FA', description: error.message, variant: 'destructive' })
      setUnenrolling(false)
      return
    }

    addToast({ title: 'Two-factor authentication disabled' })
    setFactorId('')
    setState('not_enrolled')
    setUnenrolling(false)
  }

  if (state === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (state === 'enrolled') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>Your account is protected with an authenticator app</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Enabled
              </span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleUnenroll}
              disabled={unenrolling}
            >
              {unenrolling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Disabling...
                </>
              ) : (
                <>
                  <ShieldOff className="h-4 w-4 mr-1" />
                  Disable 2FA
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (state === 'enrolling') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Set Up Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          <div className="flex justify-center">
            {/* QR code is a data URI from Supabase */}
            <img src={qrCode} alt="TOTP QR Code" className="h-48 w-48 rounded border" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Can&apos;t scan? Enter this key manually:
            </Label>
            <code className="block rounded bg-muted px-3 py-2 text-xs font-mono break-all select-all">
              {secret}
            </code>
          </div>

          <form onSubmit={verifyEnrollment} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="verify-code">Enter the 6-digit code from your app</Label>
              <Input
                id="verify-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                autoComplete="one-time-code"
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={verifying || verifyCode.length !== 6}>
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify & Enable'
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => setState('not_enrolled')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    )
  }

  // not_enrolled state
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Add an extra layer of security to your account using an authenticator app
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">{error}</div>
        )}
        <Button onClick={startEnrollment}>
          <ShieldCheck className="h-4 w-4 mr-1" />
          Enable Two-Factor Authentication
        </Button>
      </CardContent>
    </Card>
  )
}
