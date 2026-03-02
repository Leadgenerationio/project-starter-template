# Project Starter Template

A reusable project template with built-in quality tools, AI coding rules, and testing agents.

## What's Included

### AI Coding Rules
- **`CLAUDE.md`** — Rules for Claude Code / AI assistants (post-implementation review, bug checks, code quality, proactive improvements)
- **`.cursorrules`** — Rules for Cursor AI editor
- **`ARCHITECTURE.md`** — Architecture documentation template
- **`.claude/memory/`** — Persistent memory with quality standards

### Testing Agents

Three standalone TypeScript agents that run independently of your app:

| Agent | Command | Purpose |
|-------|---------|---------|
| **Watchdog** | `npm run watchdog` | Continuous health monitoring + endpoint testing + auto-remediation |
| **Security** | `npm run security` | 14-category security audit (credentials, injection, XSS, deps, etc.) |
| **Stress Test** | `npm run stress-test` | Load testing with N concurrent users + latency percentiles |

### Quality Standards
- 10-section checklist in `.claude/memory/quality-standards.md`
- Covers: validation, progress feedback, robustness, async safety, UX polish, and more

## Quick Start

1. **Create a new repo from this template:**
   ```bash
   gh repo create my-new-project --template YOUR_USERNAME/project-starter-template
   cd my-new-project
   ```

2. **Install agent dependencies:**
   ```bash
   npm install
   ```

3. **Fill in your project details:**
   - Edit `CLAUDE.md` → Architecture Notes section
   - Edit `.cursorrules` → Architecture + File Structure sections
   - Edit `ARCHITECTURE.md` → Tech Stack + Data Flow

4. **Run agents:**
   ```bash
   npm run security:once    # One-time security scan
   npm run watchdog         # Continuous health monitoring
   npm run stress-test      # Load test
   ```

## Customising the Agents

### Watchdog
Edit `scripts/watchdog.config.json` to add your endpoints:
```json
{
  "endpoints": [
    { "name": "homepage", "method": "GET", "path": "/", "expectedStatus": 200, "requiresAuth": false },
    { "name": "api-users", "method": "GET", "path": "/api/users", "expectedStatus": 200, "requiresAuth": true }
  ]
}
```

Set `WATCHDOG_EMAIL` and `WATCHDOG_PASSWORD` env vars for authenticated endpoint tests.

### Security
Toggle checks in `scripts/security.config.json`:
```json
{
  "checks": {
    "shellInjection": true,
    "credentialStorage": true,
    "pathTraversal": true
  }
}
```

Use `npm run security:once` in CI pipelines — exits with code 1 for high, 2 for critical findings.

### Stress Test
Edit `scripts/stress-test.config.json` or use env vars:
```bash
STRESS_USERS=50 STRESS_CONCURRENCY=10 npm run stress-test
```

Add custom scenarios by writing functions in `scripts/stress-test.ts` (see the comments in the file for examples).

## Environment Variables

| Variable | Agent | Purpose |
|----------|-------|---------|
| `WATCHDOG_EMAIL` | Watchdog | Email for authenticated endpoint tests |
| `WATCHDOG_PASSWORD` | Watchdog | Password for authenticated endpoint tests |
| `WATCHDOG_BASE_URL` | Watchdog | Server URL (default: http://localhost:3000) |
| `WATCHDOG_INTERVAL` | Watchdog | Seconds between cycles (default: 3600) |
| `SECURITY_BASE_URL` | Security | Server URL (default: http://localhost:3000) |
| `SECURITY_INTERVAL` | Security | Seconds between scans (default: 1800) |
| `SECURITY_AUTO_REMEDIATE` | Security | Set to "1" to auto-fix issues |
| `STRESS_BASE_URL` | Stress Test | Server URL (default: http://localhost:3000) |
| `STRESS_USERS` | Stress Test | Number of virtual users (default: 100) |
| `STRESS_CONCURRENCY` | Stress Test | Max concurrent requests (default: 20) |
| `STRESS_VERBOSE` | Stress Test | Set to "1" for detailed logging |
