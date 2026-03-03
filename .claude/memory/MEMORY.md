# Project Memory

## Core Rule: Always Implement Improvements
When building or modifying features, ALWAYS proactively implement quality standards. Don't just identify issues — fix them during implementation.

## Quality Standards (Always Apply)
See [quality-standards.md](quality-standards.md) for the full checklist (10 sections).
Key areas: validation, progress feedback, user control, robustness, performance, code hygiene, async/state safety, long operations, cost safety, UX polish.

## User Preferences
- Wants proactive improvements, not minimum viable implementations
- Wants bugs found and fixed during implementation, not reported for later
- Wants self-review pass after every feature before declaring done
- After any feature/major change: ALWAYS update ARCHITECTURE.md, CLAUDE.md, .cursorrules, and memory files

## Project: LeadVault
- Multi-tenant lead management and resale platform
- Next.js 16 + Supabase + Tailwind v4 + TanStack React Query/Table

## Key Technical Decisions
- **Zod v4**: Use `.issues[0].message` not `.errors[0].message`
- **Zod + react-hook-form**: Don't use `.default()` in schemas — causes type mismatch with zodResolver
- **Next.js 16**: Route handlers use `params: Promise<{}>` pattern
- **Tailwind v4**: Uses `@import "tailwindcss"`, `@theme {}`, and `@tailwindcss/postcss`
- **Multi-tenancy**: All tables have `org_id` + RLS. Use `getAuthenticatedOrg()` for API routes.

## Key Files
- Auth helper: `src/lib/supabase/auth-helpers.ts`
- Constants/types: `src/lib/constants.ts`, `src/lib/types.ts`
- Validations: `src/lib/validations/{lead,buyer,order,auth,import}.ts`
- Hooks: `src/lib/hooks/{use-leads,use-buyers,use-orders,use-import-job}.ts`
- DB migrations: `supabase/migrations/00001-00012.sql`
- Agents: `scripts/{lead-aging-agent,import-agent,watchdog,security,stress-test}.ts`
