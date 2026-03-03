# Architecture

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Authentication**: Supabase Auth with email/password
- **Styling**: Tailwind CSS v4 + custom shadcn/ui-style components
- **State Management**: TanStack React Query + React Context (auth, org)
- **Forms**: React Hook Form + Zod v4 validation
- **Tables**: TanStack React Table
- **Deployment**: Vercel

## File Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root: providers, fonts
│   ├── page.tsx                      # Redirect → /dashboard or /login
│   ├── globals.css                   # Tailwind + theme variables
│   ├── (auth)/                       # Auth layout (centered card)
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── invite/[token]/page.tsx
│   ├── (dashboard)/                  # Dashboard layout (sidebar + topbar)
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx        # 4 metric cards
│   │   ├── leads/
│   │   │   ├── page.tsx              # Data table + filters + pagination
│   │   │   ├── new/page.tsx          # Manual lead entry form
│   │   │   ├── import/page.tsx       # Excel upload + progress
│   │   │   └── [id]/page.tsx         # Lead detail + aging bar + sale history
│   │   ├── buyers/
│   │   │   ├── page.tsx              # Buyer table + 3 metric cards
│   │   │   ├── new/page.tsx          # Buyer creation form
│   │   │   └── [id]/page.tsx         # Buyer detail + purchase history
│   │   ├── orders/
│   │   │   ├── page.tsx              # 3-step sell wizard
│   │   │   ├── history/page.tsx      # Order history table
│   │   │   └── [id]/page.tsx         # Order detail + lead list
│   │   └── settings/
│   │       ├── page.tsx              # Org settings + notifications
│   │       └── members/page.tsx      # Team members + invites
│   └── api/
│       ├── health/route.ts
│       ├── auth/{register,callback}/route.ts
│       ├── dashboard/stats/route.ts
│       ├── leads/route.ts            # GET (list+filter), POST (create)
│       ├── leads/[id]/route.ts       # GET, PATCH, DELETE
│       ├── leads/count/route.ts      # GET (eligible count for orders)
│       ├── leads/import/route.ts     # POST (file upload)
│       ├── leads/import/[jobId]/route.ts  # GET (job status)
│       ├── buyers/route.ts           # GET (with stats), POST
│       ├── buyers/[id]/route.ts      # GET (with history), PATCH, DELETE
│       ├── orders/route.ts           # POST (create draft)
│       ├── orders/[id]/route.ts      # GET, DELETE
│       ├── orders/[id]/confirm/route.ts   # POST (confirm + create sales)
│       ├── orders/[id]/download/route.ts  # GET (CSV download)
│       ├── orders/history/route.ts   # GET (all orders)
│       ├── notifications/route.ts    # GET, PATCH (mark read)
│       ├── notifications/unread-count/route.ts
│       ├── org/route.ts              # GET, PATCH
│       ├── org/members/route.ts      # GET, DELETE
│       └── org/invites/route.ts      # GET, POST, DELETE
├── lib/
│   ├── supabase/{client,server,admin,middleware,auth-helpers}.ts
│   ├── validations/{lead,buyer,order,auth,import}.ts
│   ├── utils/{cn,format,lead-status,csv-export,excel-parser}.ts
│   ├── hooks/{use-leads,use-buyers,use-orders,use-import-job}.ts
│   ├── constants.ts
│   └── types.ts
├── components/
│   ├── ui/{button,input,label,card,badge,select,textarea,table,skeleton,dialog,toast,dropdown-menu}.tsx
│   ├── layout/{sidebar,topbar,mobile-nav}.tsx
│   ├── dashboard/metric-card.tsx
│   ├── leads/{leads-table,lead-form,lead-aging-bar,lead-status-badge,lead-filters}.tsx
│   ├── buyers/{buyers-table,buyer-form}.tsx
│   ├── notifications/notification-bell.tsx
│   └── shared/{data-table,data-table-pagination,page-header,empty-state,loading-skeleton,confirm-dialog,error-boundary}.tsx
├── providers/{auth-provider,org-provider,query-provider}.tsx
└── middleware.ts

scripts/
├── watchdog.ts + config               # Endpoint health testing
├── security.ts + config               # Security audit
├── stress-test.ts + config            # Load testing
├── lead-aging-agent.ts + config       # Hourly status transitions + file cleanup
└── import-agent.ts + config           # Background Excel processing

supabase/
├── migrations/00001-00012.sql         # Schema + RLS + functions + storage
└── seed.sql                           # Demo data template
```

## Data Flow

### Lead Lifecycle
```
Created → New (0-14d) → Aging (15-29d) → Eligible (30+d) → Resold
```
- Status updated hourly by `update_lead_statuses()` DB function (pg_cron) or lead-aging agent
- Buyer exclusion: leads can't be sold to original buyer or prior purchasers

### Order Flow
```
Configure → Create Draft → Review → Confirm (creates lead_sales, updates statuses) → Download CSV
```

### Import Flow
```
Upload file → Store in Supabase Storage → Create import_job → Import agent processes rows → Notify user
```

## Database (8 tables + RLS)

| Table | Purpose |
|-------|---------|
| `organizations` | Tenant isolation |
| `org_members` | User-org membership (owner/admin/member) |
| `org_invites` | Pending team invites with token |
| `buyers` | Lead purchasers |
| `leads` | Core lead data with status lifecycle |
| `orders` | Resale order groups (draft/confirmed/downloaded) |
| `lead_sales` | Individual sale records (original/resale) |
| `import_jobs` | Excel upload tracking with progress |
| `notifications` | In-app alerts |

All tables have `org_id` for multi-tenancy with Row Level Security.

## API Routes

All API routes require authentication (enforced by middleware + `getAuthenticatedOrg()`).
RLS provides additional database-level security per organization.
