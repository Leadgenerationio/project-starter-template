#!/usr/bin/env node
/**
 * Watchdog QA Agent — continuous health/endpoint monitor with auto-remediation
 *
 * Run:    npm run watchdog
 * Config: scripts/watchdog.config.json (all fields overridable via WATCHDOG_* env vars)
 *
 * Features:
 *   - Health endpoint monitoring
 *   - API endpoint testing (public + authenticated)
 *   - Filesystem checks (stale files, missing dirs)
 *   - Auto-remediation (restart server, create dirs, clean old files)
 *   - Cycle reports saved to watchdog-report.json
 *
 * Customise by adding your endpoints to the `endpoints` array in config
 * or by modifying the test functions below.
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Config {
  baseUrl: string;
  intervalSeconds: number;
  port: number;
  maxFileAgeHours: number;
  maxConcurrentStress: number;
  autoRestart: boolean;
  autoCleanup: boolean;
  autoCreateDirs: boolean;
  verbose: boolean;
  watchdogEmail: string;
  watchdogPassword: string;
  healthEndpoint: string;
  endpoints: EndpointTest[];
}

interface EndpointTest {
  name: string;
  method: string;
  path: string;
  expectedStatus: number;
  requiresAuth: boolean;
  body?: any;
}

type TestStatus = 'pass' | 'fail' | 'warn' | 'skip';
type TestCategory = 'health' | 'api' | 'filesystem' | 'remediation';

interface TestResult {
  id: string;
  name: string;
  category: TestCategory;
  status: TestStatus;
  durationMs: number;
  error?: string;
  detail?: string;
}

interface CycleReport {
  cycle: number;
  timestamp: string;
  results: TestResult[];
  remediations: string[];
  summary: { passed: number; failed: number; warned: number; skipped: number };
  config: Config;
}

interface ReportFile {
  lastCycle: CycleReport;
  history: CycleReport[];
}

interface CycleContext {
  serverUp: boolean;
  authCookie: string;
  remediations: string[];
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  boldRed: '\x1b[1;31m',
  boldGreen: '\x1b[1;32m',
};

function tag(status: TestStatus): string {
  switch (status) {
    case 'pass': return `${c.green}[PASS]${c.reset}`;
    case 'fail': return `${c.boldRed}[FAIL]${c.reset}`;
    case 'warn': return `${c.yellow}[WARN]${c.reset}`;
    case 'skip': return `${c.gray}[SKIP]${c.reset}`;
  }
}

function fixTag(): string {
  return `${c.cyan}[FIX] ${c.reset}`;
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONFIG_PATH = path.join(SCRIPT_DIR, 'watchdog.config.json');
const REPORT_PATH = path.join(PROJECT_ROOT, 'watchdog-report.json');

// ─── Config ─────────────────────────────────────────────────────────────────

function loadConfig(): Config {
  let fileConfig: any = {};
  if (fs.existsSync(CONFIG_PATH)) {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  }

  const env = process.env;
  return {
    baseUrl: env.WATCHDOG_BASE_URL || fileConfig.baseUrl || 'http://localhost:3000',
    intervalSeconds: Number(env.WATCHDOG_INTERVAL) || fileConfig.intervalSeconds || 3600,
    port: Number(env.WATCHDOG_PORT) || fileConfig.port || 3000,
    maxFileAgeHours: Number(env.WATCHDOG_MAX_FILE_AGE) || fileConfig.maxFileAgeHours || 24,
    maxConcurrentStress: Number(env.WATCHDOG_MAX_STRESS) || fileConfig.maxConcurrentStress || 5,
    autoRestart: env.WATCHDOG_AUTO_RESTART === '1' || fileConfig.autoRestart || false,
    autoCleanup: env.WATCHDOG_AUTO_CLEANUP === '1' || fileConfig.autoCleanup || false,
    autoCreateDirs: env.WATCHDOG_AUTO_CREATE_DIRS !== '0' && (fileConfig.autoCreateDirs !== false),
    verbose: env.WATCHDOG_VERBOSE === '1' || fileConfig.verbose || false,
    watchdogEmail: env.WATCHDOG_EMAIL || fileConfig.watchdogEmail || '',
    watchdogPassword: env.WATCHDOG_PASSWORD || fileConfig.watchdogPassword || '',
    healthEndpoint: fileConfig.healthEndpoint || '/api/health',
    endpoints: fileConfig.endpoints || [],
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`  ${msg}`);
}

function verbose(config: Config, msg: string): void {
  if (config.verbose) console.log(`    ${c.gray}${msg}${c.reset}`);
}

async function timedTest(
  id: string,
  name: string,
  category: TestCategory,
  fn: () => Promise<{ status: TestStatus; error?: string; detail?: string }>,
): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    console.log(`  ${tag(result.status)} ${name} ${c.dim}(${duration}ms)${c.reset}${result.error ? ` — ${result.error}` : ''}`);
    return { id, name, category, ...result, durationMs: duration };
  } catch (err: any) {
    const duration = Date.now() - start;
    console.log(`  ${tag('fail')} ${name} ${c.dim}(${duration}ms)${c.reset} — ${err.message}`);
    return { id, name, category, status: 'fail', durationMs: duration, error: err.message };
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function testHealth(config: Config, ctx: CycleContext): Promise<TestResult> {
  return timedTest('health', 'Server health check', 'health', async () => {
    try {
      const res = await fetch(`${config.baseUrl}${config.healthEndpoint}`, {
        signal: AbortSignal.timeout(10000),
      });
      ctx.serverUp = res.ok;
      if (!res.ok) return { status: 'fail', error: `HTTP ${res.status}` };
      return { status: 'pass' };
    } catch (err: any) {
      ctx.serverUp = false;
      return { status: 'fail', error: err.message };
    }
  });
}

async function testEndpoint(
  config: Config,
  ctx: CycleContext,
  endpoint: EndpointTest,
): Promise<TestResult> {
  return timedTest(`api-${endpoint.name}`, `API: ${endpoint.method} ${endpoint.path}`, 'api', async () => {
    if (!ctx.serverUp) return { status: 'skip', error: 'Server is down' };
    if (endpoint.requiresAuth && !ctx.authCookie) return { status: 'skip', error: 'No auth cookie' };

    const headers: Record<string, string> = {};
    if (endpoint.requiresAuth && ctx.authCookie) {
      headers['Cookie'] = ctx.authCookie;
    }
    if (endpoint.body) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${config.baseUrl}${endpoint.path}`, {
      method: endpoint.method,
      headers,
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === endpoint.expectedStatus) {
      return { status: 'pass' };
    }

    return {
      status: res.status === 429 ? 'warn' : 'fail',
      error: `Expected ${endpoint.expectedStatus}, got ${res.status}`,
    };
  });
}

async function testFilesystem(config: Config, ctx: CycleContext): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Check required directories exist
  const requiredDirs = ['public', 'src'];
  for (const dir of requiredDirs) {
    const fullPath = path.join(PROJECT_ROOT, dir);
    results.push(
      await timedTest(`fs-dir-${dir}`, `Directory exists: ${dir}`, 'filesystem', async () => {
        if (fs.existsSync(fullPath)) return { status: 'pass' };

        if (config.autoCreateDirs) {
          fs.mkdirSync(fullPath, { recursive: true });
          ctx.remediations.push(`Created missing directory: ${dir}`);
          return { status: 'warn', detail: 'Created missing directory' };
        }

        return { status: 'fail', error: `Missing directory: ${dir}` };
      }),
    );
  }

  // Check for stale temp files
  results.push(
    await timedTest('fs-stale-files', 'No stale temp files', 'filesystem', async () => {
      const tmpDirs = ['public/uploads', 'public/outputs', 'tmp'].map(d => path.join(PROJECT_ROOT, d));
      let staleCount = 0;

      for (const dir of tmpDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
          const files = fs.readdirSync(dir);
          const now = Date.now();
          const maxAge = config.maxFileAgeHours * 60 * 60 * 1000;

          for (const file of files) {
            try {
              const stats = fs.statSync(path.join(dir, file));
              if (now - stats.mtimeMs > maxAge) {
                staleCount++;
                if (config.autoCleanup) {
                  fs.unlinkSync(path.join(dir, file));
                }
              }
            } catch {}
          }
        } catch {}
      }

      if (staleCount === 0) return { status: 'pass' };
      if (config.autoCleanup) {
        ctx.remediations.push(`Cleaned ${staleCount} stale file(s)`);
        return { status: 'warn', detail: `Cleaned ${staleCount} stale files` };
      }
      return { status: 'warn', detail: `${staleCount} stale files found` };
    }),
  );

  return results;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

async function authenticate(config: Config, ctx: CycleContext): Promise<void> {
  if (!config.watchdogEmail || !config.watchdogPassword) {
    verbose(config, 'No watchdog credentials — skipping auth');
    return;
  }

  try {
    // Get CSRF token
    const csrfRes = await fetch(`${config.baseUrl}/api/auth/csrf`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!csrfRes.ok) throw new Error(`CSRF failed: ${csrfRes.status}`);

    const csrfCookies = csrfRes.headers.getSetCookie?.() || [];
    const { csrfToken } = await csrfRes.json();

    // Login
    const cookieHeader = csrfCookies.map((ck: string) => ck.split(';')[0]).join('; ');
    const loginRes = await fetch(`${config.baseUrl}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: new URLSearchParams({ csrfToken, email: config.watchdogEmail, password: config.watchdogPassword }),
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });

    const loginCookies = loginRes.headers.getSetCookie?.() || [];
    const allCookies = [...csrfCookies, ...loginCookies]
      .map((ck: string) => ck.split(';')[0])
      .filter(Boolean);

    // Follow redirect
    const redirectUrl = loginRes.headers.get('location') || '';
    if (redirectUrl) {
      const followRes = await fetch(
        redirectUrl.startsWith('http') ? redirectUrl : `${config.baseUrl}${redirectUrl}`,
        { headers: { Cookie: allCookies.join('; ') }, redirect: 'manual', signal: AbortSignal.timeout(5000) },
      );
      const followCookies = followRes.headers.getSetCookie?.() || [];
      for (const ck of followCookies) allCookies.push(ck.split(';')[0]);
    }

    ctx.authCookie = allCookies.join('; ');
    log(`${c.green}Authenticated as ${config.watchdogEmail}${c.reset}`);
  } catch (err: any) {
    log(`${c.yellow}Auth failed: ${err.message} — authenticated tests will be skipped${c.reset}`);
  }
}

// ─── Remediation ────────────────────────────────────────────────────────────

async function remediateServerDown(config: Config, ctx: CycleContext): Promise<TestResult | null> {
  if (ctx.serverUp || !config.autoRestart) return null;

  return timedTest('remediate-restart', 'Auto-restart server', 'remediation', async () => {
    try {
      // Try to start the dev server
      const child = spawn('npm', ['run', 'dev'], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      ctx.remediations.push('Started dev server');

      // Wait a bit and recheck
      await new Promise((r) => setTimeout(r, 5000));
      const check = await fetch(config.baseUrl, { signal: AbortSignal.timeout(5000) }).catch(() => null);
      if (check?.ok) {
        ctx.serverUp = true;
        return { status: 'pass', detail: 'Server restarted successfully' };
      }
      return { status: 'warn', detail: 'Server started but not responding yet' };
    } catch (err: any) {
      return { status: 'fail', error: err.message };
    }
  });
}

// ─── Cycle ──────────────────────────────────────────────────────────────────

async function runCycle(config: Config, cycleNum: number): Promise<CycleReport> {
  console.log(`\n${c.bold}  Cycle ${cycleNum} — ${new Date().toISOString()}${c.reset}\n`);

  const ctx: CycleContext = { serverUp: false, authCookie: '', remediations: [] };
  const results: TestResult[] = [];

  // Health check
  results.push(await testHealth(config, ctx));

  // Remediate if server down
  if (!ctx.serverUp) {
    const remediation = await remediateServerDown(config, ctx);
    if (remediation) results.push(remediation);
  }

  // Authenticate for protected endpoint tests
  if (ctx.serverUp) {
    await authenticate(config, ctx);
  }

  // Test configured endpoints
  for (const endpoint of config.endpoints) {
    results.push(await testEndpoint(config, ctx, endpoint));
  }

  // Filesystem checks
  const fsResults = await testFilesystem(config, ctx);
  results.push(...fsResults);

  // Build summary
  const summary = {
    passed: results.filter((r) => r.status === 'pass').length,
    failed: results.filter((r) => r.status === 'fail').length,
    warned: results.filter((r) => r.status === 'warn').length,
    skipped: results.filter((r) => r.status === 'skip').length,
  };

  console.log('');
  console.log(
    `  ${c.bold}Summary:${c.reset} ` +
      `${c.green}${summary.passed} passed${c.reset}, ` +
      `${summary.failed > 0 ? c.boldRed : c.dim}${summary.failed} failed${c.reset}, ` +
      `${c.yellow}${summary.warned} warned${c.reset}, ` +
      `${c.gray}${summary.skipped} skipped${c.reset}`,
  );

  if (ctx.remediations.length > 0) {
    console.log(`  ${c.cyan}Remediations: ${ctx.remediations.join(', ')}${c.reset}`);
  }

  return { cycle: cycleNum, timestamp: new Date().toISOString(), results, remediations: ctx.remediations, summary, config };
}

// ─── Report ─────────────────────────────────────────────────────────────────

function saveReport(report: CycleReport): void {
  let reportFile: ReportFile = { lastCycle: report, history: [] };

  if (fs.existsSync(REPORT_PATH)) {
    try {
      reportFile = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'));
    } catch {}
  }

  reportFile.lastCycle = report;
  reportFile.history = [report, ...reportFile.history].slice(0, 100);

  fs.writeFileSync(REPORT_PATH, JSON.stringify(reportFile, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.cyan}║              WATCHDOG QA AGENT                           ║${c.reset}`);
  console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}`);

  const config = loadConfig();
  console.log(`${c.dim}  Base URL:    ${config.baseUrl}${c.reset}`);
  console.log(`${c.dim}  Interval:    ${config.intervalSeconds}s${c.reset}`);
  console.log(`${c.dim}  Endpoints:   ${config.endpoints.length} configured${c.reset}`);
  console.log(`${c.dim}  Auto-fix:    restart=${config.autoRestart}, cleanup=${config.autoCleanup}, dirs=${config.autoCreateDirs}${c.reset}`);

  let cycle = 0;
  while (true) {
    cycle++;
    const report = await runCycle(config, cycle);
    saveReport(report);

    console.log(`\n${c.dim}  Next cycle in ${config.intervalSeconds}s...${c.reset}`);
    await new Promise((r) => setTimeout(r, config.intervalSeconds * 1000));
  }
}

main().catch((err) => {
  console.error(`${c.boldRed}Fatal: ${err.message}${c.reset}`);
  process.exit(1);
});
