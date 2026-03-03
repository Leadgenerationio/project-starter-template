'use client'

import { useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, Loader2 } from 'lucide-react'

interface FileUploadStepProps {
  uploading: boolean
  onFileSelect: (file: File) => void
  onCancel: () => void
}

export function FileUploadStep({ uploading, onFileSelect, onCancel }: FileUploadStepProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFileSelect(file)
    // Reset so same file can be re-selected
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload File</CardTitle>
        <CardDescription>
          Supported formats: .xlsx, .xls, .csv (max 10MB).
          Required columns: First Name, Last Name, Email, Postcode, Product
        </CardDescription>
      </CardHeader>
      <CardContent>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleChange}
          className="hidden"
        />
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full"
          variant="outline"
        >
          {uploading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
          ) : (
            <><Upload className="h-4 w-4 mr-2" /> Choose File</>
          )}
        </Button>
        {uploading && (
          <Button variant="ghost" size="sm" onClick={onCancel} className="mt-2 w-full text-muted-foreground">
            Cancel Upload
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
