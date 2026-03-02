# Quality Standards — Always Implement

Every time code is written or modified, apply ALL of these. Don't mention them as suggestions — just do them.

## 1. Validation & Error Handling
- Validate file sizes, types, and formats BEFORE processing
- Show specific, actionable error messages (not "something went wrong")
- Validate external dependencies are available at startup / first use
- Never silently swallow errors — always surface to user

## 2. Progress & Feedback
- Show real progress (% or X of Y) during batch operations
- Show loading spinners with context ("Processing item 3 of 10...")
- Disable buttons and show state during async operations
- Auto-scroll to results when complete

## 3. User Control
- Let users customise behaviour where it makes sense
- Always allow undo / go-back without losing work
- Provide cancel buttons for long operations

## 4. Robustness
- Validate inputs at system boundaries (uploads, API calls, form submissions)
- Handle partial failures in batch operations (don't lose completed work)
- Clean up temporary files even on error
- Add structured error codes, not just string messages
- Use `Promise.allSettled` (not `Promise.all`) when parallel operations should return partial results
- Align code timeouts strictly below server route max duration
- Clean up orphaned files on disk when multi-step operations fail midway (try/finally)

## 5. Performance
- Don't poll when not visible (pause polling on hidden tabs/collapsed sections)
- Use exponential backoff for polling (not fixed intervals) — start 3-5s, back off to 15-30s

## 6. Code Hygiene
- Remove dead code (unused components, types, imports)
- Don't duplicate logic — extract shared utilities
- Imports at top of file (not inside functions)
- Parameterize hardcoded values
- After writing any feature, grep for unused types/interfaces/exports and delete them

## 7. Async & State Safety
- Fix stale closures in async handlers: if an async callback references React state and runs >1 second, use a ref or callback-form setState
- Add AbortController to any client-side fetch that can run >10 seconds; abort on unmount and provide a cancel button
- Auto-dismiss success/done status banners after 5 seconds or on next user interaction
- Disable navigation while an async operation is in progress, or preserve feedback when the user returns

## 8. Long Operations (>10 seconds)
- Use SSE or status-polling endpoint — never a single blocking fetch with just a spinner
- Show per-item progress where possible
- For operations >30 seconds, prefer background jobs: return a job ID immediately, poll status
- Always provide cancellation support (client-side AbortController + server-side API cancellation)
- Show preview of generated content before committing it

## 9. Cost & Safety for External APIs
- Rate limit / debounce buttons that trigger paid API calls
- Show cost estimate or confirmation before expensive operations
- Add server-side rate limiting on expensive endpoints

## 10. UX Polish
- Show constraints (file size limits, format requirements) before the user hits them
- Provide batch operations where users commonly need them
- Label outputs clearly with context
