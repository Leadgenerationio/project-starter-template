'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBuyers } from '@/lib/hooks/use-buyers'
import { useDebounce } from '@/lib/hooks/use-debounce'
import { useCreateOrder, useConfirmOrder, useLeadCount, usePostcodeAreas } from '@/lib/hooks/use-orders'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { PRODUCTS } from '@/lib/constants'
import { formatCurrency, formatNumber } from '@/lib/utils/format'
import { ArrowLeft, ArrowRight, Check, Download } from 'lucide-react'
import type { Order } from '@/lib/types'
import type { OrderInput } from '@/lib/validations/order'

type Step = 'configure' | 'review' | 'download'

export default function SellLeadsPage() {
  const router = useRouter()
  const { addToast } = useToast()
  const { data: buyers } = useBuyers()
  const createOrder = useCreateOrder()
  const confirmOrder = useConfirmOrder()

  const [step, setStep] = useState<Step>('configure')
  const [buyerId, setBuyerId] = useState('')
  const [product, setProduct] = useState('')
  const [selectedAreas, setSelectedAreas] = useState<string[]>([])
  const [pricePerLead, setPricePerLead] = useState('5.00')
  const [order, setOrder] = useState<Order | null>(null)

  const activeBuyers = buyers?.filter((b) => b.is_active) ?? []
  const { data: postcodeAreasData } = usePostcodeAreas()
  const availableAreas = postcodeAreasData?.areas ?? []

  const postcodeString = selectedAreas.join(',')
  const debouncedPostcodes = useDebounce(postcodeString, 300)
  const { data: leadCountData } = useLeadCount({
    buyer_id: buyerId || undefined,
    product: product || undefined,
    postcodes: debouncedPostcodes || undefined,
  })

  function toggleArea(area: string) {
    setSelectedAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    )
  }

  const eligibleCount = leadCountData?.count ?? 0

  function handleCreateOrder() {
    createOrder.mutate(
      {
        buyer_id: buyerId,
        product_filter: (product || null) as OrderInput['product_filter'],
        postcode_filters: selectedAreas,
        price_per_lead: parseFloat(pricePerLead),
      },
      {
        onSuccess: (data) => {
          setOrder(data)
          setStep('review')
        },
        onError: (err) => {
          addToast({ title: 'Failed to create order', description: err.message, variant: 'destructive' })
        },
      }
    )
  }

  function handleConfirmOrder() {
    if (!order) return
    confirmOrder.mutate(order.id, {
      onSuccess: (data) => {
        setOrder({ ...order, status: 'confirmed', lead_count: data.lead_count, total_amount: data.total_amount })
        setStep('download')
        addToast({ title: `Order confirmed: ${data.lead_count} leads sold` })
      },
      onError: (err) => {
        addToast({ title: 'Failed to confirm order', description: err.message, variant: 'destructive' })
      },
    })
  }

  function handleDownload() {
    if (!order) return
    window.open(`/api/orders/${order.id}/download`, '_blank')
  }

  return (
    <div>
      <PageHeader title="Sell Leads" description="Create a new order to sell eligible leads to a buyer" />

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-6">
        {(['configure', 'review', 'download'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s ? 'bg-primary text-primary-foreground' :
              (['configure', 'review', 'download'].indexOf(step) > i) ? 'bg-green-500 text-white' :
              'bg-muted text-muted-foreground'
            }`}>
              {['configure', 'review', 'download'].indexOf(step) > i ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className="text-sm font-medium capitalize hidden sm:inline">{s}</span>
            {i < 2 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      {step === 'configure' && (
        <Card>
          <CardHeader>
            <CardTitle>Configure Order</CardTitle>
            <CardDescription>Select a buyer and set filters for the leads</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-lg">
            <div className="space-y-2">
              <Label>Buyer</Label>
              <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                <option value="">Select a buyer</option>
                {activeBuyers.map((b) => (
                  <option key={b.id} value={b.id}>{b.company_name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Product Filter (optional)</Label>
              <Select value={product} onChange={(e) => setProduct(e.target.value)}>
                <option value="">All Products</option>
                {PRODUCTS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Postcode Areas (optional)</Label>
              {availableAreas.length > 0 ? (
                <div className="flex flex-wrap gap-2 p-3 border rounded-md max-h-48 overflow-y-auto">
                  {availableAreas.map((area) => (
                    <label
                      key={area}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm cursor-pointer select-none transition-colors ${
                        selectedAreas.includes(area)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted border-input'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAreas.includes(area)}
                        onChange={() => toggleArea(area)}
                        className="sr-only"
                      />
                      {area}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No eligible leads with postcodes found</p>
              )}
              {selectedAreas.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedAreas.join(', ')}
                  <button type="button" className="ml-2 text-primary underline" onClick={() => setSelectedAreas([])}>
                    Clear all
                  </button>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Price Per Lead</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={pricePerLead}
                onChange={(e) => setPricePerLead(e.target.value)}
              />
            </div>

            {buyerId && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <strong>{formatNumber(eligibleCount)}</strong> eligible leads match your criteria
                {eligibleCount > 0 && (
                  <span> · Estimated total: <strong>{formatCurrency(eligibleCount * parseFloat(pricePerLead || '0'))}</strong></span>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={handleCreateOrder} disabled={!buyerId || eligibleCount === 0 || createOrder.isPending}>
              {createOrder.isPending ? 'Creating...' : 'Review Order'}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 'review' && order && (
        <Card>
          <CardHeader>
            <CardTitle>Review Order</CardTitle>
            <CardDescription>Confirm the details before processing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-w-lg">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Buyer</span>
              <span>{(order.buyer as { company_name?: string })?.company_name ?? buyerId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Product Filter</span>
              <span>{order.product_filter || 'All'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Postcode Filters</span>
              <span>{order.postcode_filters?.join(', ') || 'All'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price Per Lead</span>
              <span>{formatCurrency(order.price_per_lead)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between font-medium">
              <span>Lead Count</span>
              <span>{formatNumber(order.lead_count)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{formatCurrency(order.total_amount)}</span>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button variant="outline" onClick={() => setStep('configure')}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button onClick={handleConfirmOrder} disabled={confirmOrder.isPending}>
              {confirmOrder.isPending ? 'Confirming...' : 'Confirm & Process'}
              <Check className="h-4 w-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 'download' && order && (
        <Card>
          <CardHeader>
            <CardTitle>Order Complete</CardTitle>
            <CardDescription>Your leads have been processed and are ready for download</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-w-lg">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Leads Sold</span>
              <span className="font-medium">{formatNumber(order.lead_count)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Total Revenue</span>
              <span>{formatCurrency(order.total_amount)}</span>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1" />
              Download CSV
            </Button>
            <Button variant="outline" onClick={() => router.push('/orders/history')}>
              View Order History
            </Button>
            <Button variant="outline" onClick={() => { setStep('configure'); setOrder(null); setBuyerId(''); setProduct(''); setSelectedAreas([]); }}>
              New Order
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
