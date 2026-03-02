#!/usr/bin/env node
/**
 * Stress Test Agent — Simulates N concurrent users performing realistic flows.
 *
 * Run:    npm run stress-test
 * Config: scripts/stress-test.config.json
 *
 * Phases:
 *   1. Setup     — Check server, prepare fixtures
 *   2. Register  — Register & login N users (if scenarios include "register")
 *   3. Health    — Hammer health endpoint concurrently
 *   4. Custom    — Run any custom scenario functions you add
 *   5. Report    — Per-endpoint metrics table + summary
 *
 * Env vars:
 *   STRESS_BASE_URL     — Server URL (default: http://localhost:3000)
 *   STRESS_USERS        — Number of virtual users (default: 100)
 *   STRESS_CONCURRENCY  — Max concurrent requests (default: 20)
 *   STRESS_VERBOSE      — Set to "1" for detailed logging
 *
 * Customise:
 *   Add your own scenario functions (e.g. scenarioUpload, scenarioCreatePost)
 *   and register them in the main() phases section.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Types ──────────────────────────────────────────────────────────────────

interface StressConfig {
  baseUrl: string;
  users: number;
  concurrency: number;
  scenarios: string[];
  verbose: boolean;
}

interface VirtualUser {
  index: number;
  email: string;
  password: string;
  authCookie: string;
  data: Record<string, any>; // Store any scenario-specific data
}

interface Metric {
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  success: boolean;
  error?: string;
  userId?: number;
}

interface EndpointStats {
  endpoint: string;
  requests: number;
  successes: number;
  failures: number;
  errorRate: string;
  p50: string;
  p95: string;
  p99: string;
  mean: string;
  min: string;
  max: string;
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
  boldCyan: '\x1b[1;36m',
};

// ─── Paths ──────────────────────────────────────────────────────────────────

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONFIG_PATH = path.join(SCRIPT_DIR, 'stress-test.config.json');

// ─── Config ─────────────────────────────────────────────────────────────────

function loadConfig(): StressConfig {
  let fileConfig: Partial<StressConfig> = {};
  if (fs.existsSync(CONFIG_PATH)) {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  }

  const env = process.env;
  return {
    baseUrl: env.STRESS_BASE_URL || fileConfig.baseUrl || 'http://localhost:3000',
    users: Number(env.STRESS_USERS) || fileConfig.users || 100,
    concurrency: Number(env.STRESS_CONCURRENCY) || fileConfig.concurrency || 20,
    scenarios: fileConfig.scenarios || ['health'],
    verbose: env.STRESS_VERBOSE === '1' || fileConfig.verbose || false,
  };
}

// ─── Metrics ────────────────────────────────────────────────────────────────

const metrics: Metric[] = [];

function record(m: Metric): void {
  metrics.push(m);
}

/** Timed fetch that records metrics automatically. */
async function timedFetch(
  endpoint: string,
  method: string,
  url: string,
  init: RequestInit,
  userId?: number,
): Promise<Response> {
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(url, init);
    const isSuccess = res.ok || (endpoint === 'login' && res.status === 302);
    record({
      endpoint,
      method,
      statusCode: res.status,
      durationMs: Date.now() - start,
      success: isSuccess,
      error: isSuccess ? undefined : `HTTP ${res.status}`,
      userId,
    });
    return res;
  } catch (err: any) {
    record({
      endpoint,
      method,
      statusCode: 0,
      durationMs: Date.now() - start,
      success: false,
      error: err.message,
      userId,
    });
    throw err;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`  ${c.dim}${msg}${c.reset}`);
}

function verbose(config: StressConfig, msg: string): void {
  if (config.verbose) console.log(`    ${c.gray}${msg}${c.reset}`);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** Run items through fn with limited concurrency. */
async function runBatched<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIdx = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIdx < items.length) {
        const i = nextIdx++;
        await fn(items[i], i);
      }
    },
  );
  await Promise.allSettled(workers);
}

/** Progress bar for batch operations. */
function progressBar(current: number, total: number, label: string): void {
  const pct = Math.round((current / total) * 100);
  const barLen = 30;
  const filled = Math.round((current / total) * barLen);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barLen - filled);
  process.stdout.write(`\r  ${c.cyan}${bar}${c.reset} ${pct}% ${label} (${current}/${total})`);
  if (current === total) process.stdout.write('\n');
}

// ─── Auth (NextAuth compatible) ─────────────────────────────────────────────

async function registerUser(
  baseUrl: string,
  email: string,
  password: string,
  name: string,
): Promise<any> {
  const res = await timedFetch('register', 'POST', `${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, companyName: `Stress Co ${email}` }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Register failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function loginUser(baseUrl: string, email: string, password: string): Promise<string> {
  // Get CSRF token
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, { signal: AbortSignal.timeout(5000) });
  if (!csrfRes.ok) throw new Error(`CSRF failed: ${csrfRes.status}`);

  const csrfCookies = csrfRes.headers.getSetCookie?.() || [];
  const { csrfToken } = await csrfRes.json();

  // Login
  const cookieHeader = csrfCookies.map((ck: string) => ck.split(';')[0]).join('; ');
  const loginRes = await timedFetch('login', 'POST', `${baseUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: new URLSearchParams({ csrfToken, email, password }),
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
      redirectUrl.startsWith('http') ? redirectUrl : `${baseUrl}${redirectUrl}`,
      { headers: { Cookie: allCookies.join('; ') }, redirect: 'manual', signal: AbortSignal.timeout(5000) },
    );
    const followCookies = followRes.headers.getSetCookie?.() || [];
    for (const ck of followCookies) allCookies.push(ck.split(';')[0]);
  }

  if (allCookies.length === 0) throw new Error('No session cookies received');
  return allCookies.join('; ');
}

// ─── Scenarios ──────────────────────────────────────────────────────────────

/**
 * Health check stress — hammer the health endpoint concurrently.
 * This is a good baseline for any project.
 */
async function scenarioHealth(config: StressConfig, users: VirtualUser[]): Promise<void> {
  console.log(`${c.bold}  PHASE: Health endpoint stress (${users.length} concurrent)${c.reset}`);
  let done = 0;

  await runBatched(users, config.concurrency, async (user) => {
    try {
      await timedFetch(
        'health',
        'GET',
        `${config.baseUrl}/api/health`,
        { signal: AbortSignal.timeout(10000) },
        user.index,
      );
    } catch (err: any) {
      verbose(config, `User ${user.index} health check failed: ${err.message}`);
    }
    done++;
    progressBar(done, users.length, 'health checks');
  });

  console.log('');
}

/*
 * ────────────────────────────────────────────────────────────────────────────
 * ADD YOUR CUSTOM SCENARIOS BELOW
 *
 * Example:
 *
 * async function scenarioCreatePost(config: StressConfig, users: VirtualUser[]): Promise<void> {
 *   console.log(`${c.bold}  PHASE: Create posts (${users.length} users)${c.reset}`);
 *   let done = 0;
 *
 *   await runBatched(users, config.concurrency, async (user) => {
 *     try {
 *       const res = await timedFetch('create-post', 'POST', `${config.baseUrl}/api/posts`, {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json', Cookie: user.authCookie },
 *         body: JSON.stringify({ title: `Post by user ${user.index}`, content: 'Test content' }),
 *         signal: AbortSignal.timeout(15000),
 *       }, user.index);
 *
 *       if (res.ok) {
 *         const data = await res.json();
 *         user.data.postId = data.id;
 *       }
 *     } catch {}
 *     done++;
 *     progressBar(done, users.length, 'posts created');
 *   });
 *
 *   console.log('');
 * }
 * ────────────────────────────────────────────────────────────────────────────
 */

// ─── Report ─────────────────────────────────────────────────────────────────

function generateReport(config: StressConfig, totalDurationMs: number): void {
  console.log('');
  console.log(`${c.bold}${'═'.repeat(90)}${c.reset}`);
  console.log(`${c.bold}  STRESS TEST RESULTS${c.reset}`);
  console.log(`${c.bold}${'═'.repeat(90)}${c.reset}`);
  console.log('');

  // Group by endpoint
  const byEndpoint = new Map<string, Metric[]>();
  for (const m of metrics) {
    const key = `${m.method} ${m.endpoint}`;
    if (!byEndpoint.has(key)) byEndpoint.set(key, []);
    byEndpoint.get(key)!.push(m);
  }

  // Calculate stats per endpoint
  const stats: EndpointStats[] = [];
  for (const [endpoint, endpointMetrics] of byEndpoint) {
    const durations = endpointMetrics.map((m) => m.durationMs).sort((a, b) => a - b);
    const successes = endpointMetrics.filter((m) => m.success).length;
    const failures = endpointMetrics.length - successes;

    stats.push({
      endpoint,
      requests: endpointMetrics.length,
      successes,
      failures,
      errorRate: `${((failures / endpointMetrics.length) * 100).toFixed(1)}%`,
      p50: `${percentile(durations, 50)}ms`,
      p95: `${percentile(durations, 95)}ms`,
      p99: `${percentile(durations, 99)}ms`,
      mean: `${Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)}ms`,
      min: `${durations[0]}ms`,
      max: `${durations[durations.length - 1]}ms`,
    });
  }

  // Print table
  const cols = [
    { key: 'endpoint', label: 'Endpoint', width: 28 },
    { key: 'requests', label: 'Reqs', width: 6 },
    { key: 'successes', label: 'OK', width: 6 },
    { key: 'failures', label: 'Fail', width: 6 },
    { key: 'errorRate', label: 'Err%', width: 7 },
    { key: 'p50', label: 'p50', width: 9 },
    { key: 'p95', label: 'p95', width: 9 },
    { key: 'p99', label: 'p99', width: 9 },
    { key: 'mean', label: 'Mean', width: 9 },
  ];

  const header = cols.map((col) => col.label.padEnd(col.width)).join(' ');
  console.log(`  ${c.bold}${header}${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(header.length)}${c.reset}`);

  for (const s of stats) {
    const row = cols
      .map((col) => String((s as any)[col.key]).padEnd(col.width))
      .join(' ');
    const color = s.failures > 0 ? c.yellow : c.green;
    console.log(`  ${color}${row}${c.reset}`);
  }

  // Summary
  const totalRequests = metrics.length;
  const totalSuccesses = metrics.filter((m) => m.success).length;
  const totalFailures = totalRequests - totalSuccesses;
  const allDurations = metrics.map((m) => m.durationMs).sort((a, b) => a - b);
  const rateLimited = metrics.filter((m) => m.statusCode === 429).length;

  console.log('');
  console.log(`  ${c.bold}SUMMARY${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
  console.log(`  Users:          ${config.users}`);
  console.log(`  Concurrency:    ${config.concurrency}`);
  console.log(`  Duration:       ${(totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Total requests: ${totalRequests}`);
  if (totalRequests > 0) {
    console.log(`  Throughput:     ${(totalRequests / (totalDurationMs / 1000)).toFixed(1)} req/s`);
    console.log(`  Success rate:   ${totalSuccesses}/${totalRequests} (${((totalSuccesses / totalRequests) * 100).toFixed(1)}%)`);
  }

  if (totalFailures > 0) console.log(`  ${c.boldRed}Failures:       ${totalFailures}${c.reset}`);
  if (rateLimited > 0) console.log(`  ${c.yellow}Rate limited:   ${rateLimited}${c.reset}`);

  if (allDurations.length > 0) {
    console.log(`  p50 latency:    ${percentile(allDurations, 50)}ms`);
    console.log(`  p95 latency:    ${percentile(allDurations, 95)}ms`);
    console.log(`  p99 latency:    ${percentile(allDurations, 99)}ms`);
  }

  // Error breakdown
  const errors = metrics.filter((m) => !m.success && m.error);
  if (errors.length > 0) {
    const errorCounts = new Map<string, number>();
    for (const e of errors) {
      const key = e.error || 'Unknown';
      errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
    }

    console.log('');
    console.log(`  ${c.bold}ERROR BREAKDOWN${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
    for (const [err, count] of [...errorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`  ${c.red}${count}x${c.reset} ${err}`);
    }
  }

  console.log('');
  console.log(`${c.bold}${'═'.repeat(90)}${c.reset}`);

  // Exit code
  if (totalRequests > 0 && totalFailures / totalRequests > 0.1) {
    console.log(`\n  ${c.boldRed}STRESS TEST FAILED — error rate above 10%${c.reset}\n`);
    process.exitCode = 1;
  } else {
    console.log(`\n  ${c.boldGreen}STRESS TEST PASSED${c.reset}\n`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.cyan}║              STRESS TEST AGENT                           ║${c.reset}`);
  console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}`);

  const config = loadConfig();
  console.log(`${c.dim}  Base URL:      ${config.baseUrl}${c.reset}`);
  console.log(`${c.dim}  Users:         ${config.users}${c.reset}`);
  console.log(`${c.dim}  Concurrency:   ${config.concurrency}${c.reset}`);
  console.log(`${c.dim}  Scenarios:     ${config.scenarios.join(', ')}${c.reset}`);
  console.log('');

  const overallStart = Date.now();

  // Check server is up
  try {
    const res = await fetch(config.baseUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    log('Server is up');
  } catch (err: any) {
    console.error(`${c.boldRed}  Server not responding at ${config.baseUrl}: ${err.message}${c.reset}`);
    process.exit(1);
  }

  console.log('');

  // Create virtual users
  const users: VirtualUser[] = Array.from({ length: config.users }, (_, i) => ({
    index: i,
    email: `stress-${Date.now().toString(36)}-${String(i).padStart(4, '0')}@test.local`,
    password: `StressTest${Date.now().toString(36)}!${i}`,
    authCookie: '',
    data: {},
  }));

  // ─── Phase: Register & Login (optional) ─────────────────────────
  if (config.scenarios.includes('register')) {
    console.log(`${c.bold}  PHASE: Register & Login ${config.users} users${c.reset}`);
    let registered = 0;
    let loggedIn = 0;

    await runBatched(users, Math.min(config.concurrency, 10), async (user) => {
      try {
        await registerUser(config.baseUrl, user.email, user.password, `Stress User ${user.index}`);
        registered++;
      } catch (err: any) {
        verbose(config, `Register user ${user.index} failed: ${err.message}`);
      }
      progressBar(registered, config.users, 'registered');
    });

    log(`${registered}/${config.users} registered`);

    const registeredUsers = users.filter(() => true); // All attempted
    await runBatched(registeredUsers, config.concurrency, async (user) => {
      try {
        user.authCookie = await loginUser(config.baseUrl, user.email, user.password);
        loggedIn++;
      } catch (err: any) {
        verbose(config, `Login user ${user.index} failed: ${err.message}`);
      }
      progressBar(loggedIn, registeredUsers.length, 'logged in');
    });

    log(`${loggedIn}/${registeredUsers.length} authenticated`);
    console.log('');
  }

  // ─── Phase: Health stress ──────────────────────────────────────
  if (config.scenarios.includes('health')) {
    await scenarioHealth(config, users);
  }

  /*
   * ────────────────────────────────────────────────────────────────
   * ADD YOUR CUSTOM SCENARIO PHASES HERE
   *
   * Example:
   * if (config.scenarios.includes('create-posts')) {
   *   await scenarioCreatePost(config, users.filter(u => u.authCookie));
   * }
   * ────────────────────────────────────────────────────────────────
   */

  // ─── Report ────────────────────────────────────────────────────
  generateReport(config, Date.now() - overallStart);
}

main().catch((err) => {
  console.error(`${c.boldRed}Fatal error: ${err.message}${c.reset}`);
  process.exit(1);
});
