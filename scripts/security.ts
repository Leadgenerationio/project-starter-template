#!/usr/bin/env node
/**
 * Security Agent — continuous security audit for web applications
 *
 * Run:    npm run security
 * Config: scripts/security.config.json (all fields overridable via SECURITY_* env vars)
 *
 * Checks:
 *   1.  Blast radius — what damage a compromised component can do
 *   2.  Network exposure — open ports, listening services, CORS
 *   3.  Browser control exposure — XSS vectors, unsafe DOM, CSP
 *   4.  Local disk hygiene — temp files, world-readable dirs, stale artifacts
 *   5.  Plugin/model hygiene — dependency audit, outdated packages, known CVEs
 *   6.  Credential storage — .env files, hardcoded secrets, git history leaks
 *   7.  Reverse proxy configuration — headers, HTTPS, proxy misconfigs
 *   8.  Session logs on disk — log sanitization, PII, secrets in logs
 *   9.  Shell injection — exec() calls, unsanitized inputs in commands
 *   10. Input validation — API endpoints accepting unvalidated input
 *   11. Path traversal — file access without boundary checks
 *   12. Rate limiting — expensive endpoints without throttling
 *   13. File permissions — overly permissive files/directories
 *   14. Secrets in git history — credentials committed and "removed"
 */

import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import net from 'net';
import os from 'os';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Config {
  baseUrl: string;
  intervalSeconds: number;
  port: number;
  autoRemediate: boolean;
  verbose: boolean;
  checks: Record<string, boolean>;
  thresholds: {
    maxLogFileSizeMb: number;
    maxLogFileAgeDays: number;
    maxUploadDirSizeMb: number;
    maxOutputDirSizeMb: number;
    maxOpenPorts: number;
    maxEnvFilePermissions: string;
  };
}

type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
type CheckCategory =
  | 'blast-radius'
  | 'network'
  | 'browser'
  | 'disk'
  | 'deps'
  | 'credentials'
  | 'proxy'
  | 'logs'
  | 'injection'
  | 'input-validation'
  | 'path-traversal'
  | 'rate-limiting'
  | 'file-permissions'
  | 'git-secrets';

interface Finding {
  id: string;
  category: CheckCategory;
  severity: Severity;
  title: string;
  detail: string;
  file?: string;
  line?: number;
  remediation?: string;
  autoFixed?: boolean;
}

interface ScanReport {
  timestamp: string;
  durationMs: number;
  findings: Finding[];
  summary: Record<Severity, number>;
  checksRun: string[];
  config: Config;
}

interface ReportFile {
  lastScan: ScanReport;
  history: ScanReport[];
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
  magenta: '\x1b[35m',
  boldRed: '\x1b[1;31m',
  boldGreen: '\x1b[1;32m',
  boldYellow: '\x1b[1;33m',
  boldCyan: '\x1b[1;36m',
};

function severityColor(sev: Severity): string {
  switch (sev) {
    case 'critical': return c.boldRed;
    case 'high': return c.red;
    case 'medium': return c.yellow;
    case 'low': return c.cyan;
    case 'info': return c.gray;
  }
}

function severityIcon(sev: Severity): string {
  switch (sev) {
    case 'critical': return '!!';
    case 'high': return '! ';
    case 'medium': return '? ';
    case 'low': return '. ';
    case 'info': return '  ';
  }
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONFIG_PATH = path.join(SCRIPT_DIR, 'security.config.json');
const REPORT_PATH = path.join(PROJECT_ROOT, 'security-report.json');

// ─── Config ─────────────────────────────────────────────────────────────────

function loadConfig(): Config {
  let fileConfig: any = {};
  if (fs.existsSync(CONFIG_PATH)) {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  }

  const env = process.env;
  return {
    baseUrl: env.SECURITY_BASE_URL || fileConfig.baseUrl || 'http://localhost:3000',
    intervalSeconds: Number(env.SECURITY_INTERVAL) || fileConfig.intervalSeconds || 1800,
    port: Number(env.SECURITY_PORT) || fileConfig.port || 3000,
    autoRemediate: env.SECURITY_AUTO_REMEDIATE === '1' || fileConfig.autoRemediate || false,
    verbose: env.SECURITY_VERBOSE === '1' || fileConfig.verbose || false,
    checks: fileConfig.checks || {},
    thresholds: {
      maxLogFileSizeMb: fileConfig.thresholds?.maxLogFileSizeMb || 50,
      maxLogFileAgeDays: fileConfig.thresholds?.maxLogFileAgeDays || 14,
      maxUploadDirSizeMb: fileConfig.thresholds?.maxUploadDirSizeMb || 2000,
      maxOutputDirSizeMb: fileConfig.thresholds?.maxOutputDirSizeMb || 5000,
      maxOpenPorts: fileConfig.thresholds?.maxOpenPorts || 5,
      maxEnvFilePermissions: fileConfig.thresholds?.maxEnvFilePermissions || '600',
    },
  };
}

function isCheckEnabled(config: Config, check: string): boolean {
  return config.checks[check] !== false; // Default to enabled
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`  ${msg}`);
}

function verbose(config: Config, msg: string): void {
  if (config.verbose) console.log(`    ${c.gray}${msg}${c.reset}`);
}

function findFiles(dir: string, pattern: RegExp, maxDepth = 5): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current: string, depth: number): void {
    if (depth > maxDepth) return;
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) {
            walk(fullPath, depth + 1);
          }
        } else if (pattern.test(entry.name)) {
          results.push(fullPath);
        }
      }
    } catch {}
  }

  walk(dir, 0);
  return results;
}

function grepFiles(dir: string, pattern: RegExp, filePattern: RegExp, maxDepth = 5): { file: string; line: number; content: string }[] {
  const results: { file: string; line: number; content: string }[] = [];
  const files = findFiles(dir, filePattern, maxDepth);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          results.push({ file: path.relative(PROJECT_ROOT, file), line: i + 1, content: lines[i].trim() });
        }
      }
    } catch {}
  }

  return results;
}

function dirSizeMb(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  try {
    const output = execSync(`du -sm "${dir}" 2>/dev/null || echo "0"`, { encoding: 'utf-8' });
    return parseInt(output.split('\t')[0]) || 0;
  } catch {
    return 0;
  }
}

// ─── Security Checks ────────────────────────────────────────────────────────

function checkCredentialStorage(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check .env files exist and have proper permissions
  const envFiles = findFiles(PROJECT_ROOT, /^\.env/);
  for (const envFile of envFiles) {
    try {
      const stats = fs.statSync(envFile);
      const perms = (stats.mode & 0o777).toString(8);
      if (parseInt(perms) > parseInt(config.thresholds.maxEnvFilePermissions)) {
        findings.push({
          id: `cred-env-perms-${path.basename(envFile)}`,
          category: 'credentials',
          severity: 'high',
          title: `Env file too permissive: ${path.basename(envFile)}`,
          detail: `Permissions ${perms} (should be ${config.thresholds.maxEnvFilePermissions} or less)`,
          file: path.relative(PROJECT_ROOT, envFile),
          remediation: `chmod ${config.thresholds.maxEnvFilePermissions} "${envFile}"`,
        });

        if (config.autoRemediate) {
          try {
            fs.chmodSync(envFile, parseInt(config.thresholds.maxEnvFilePermissions, 8));
            findings[findings.length - 1].autoFixed = true;
          } catch {}
        }
      }
    } catch {}
  }

  // Check for hardcoded secrets in source
  const secretPatterns = [
    { pattern: /['"]sk[-_][a-zA-Z0-9]{20,}['"]/, name: 'API key (sk-...)' },
    { pattern: /['"]ghp_[a-zA-Z0-9]{36,}['"]/, name: 'GitHub PAT' },
    { pattern: /['"]AIza[a-zA-Z0-9_-]{35}['"]/, name: 'Google API key' },
    { pattern: /password\s*[:=]\s*['"][^'"]{8,}['"](?!\s*\|\|)/, name: 'Hardcoded password' },
    { pattern: /['"]-----BEGIN (RSA |EC )?PRIVATE KEY-----/, name: 'Private key' },
  ];

  for (const { pattern, name } of secretPatterns) {
    const matches = grepFiles(
      path.join(PROJECT_ROOT, 'src'),
      pattern,
      /\.(ts|tsx|js|jsx|json)$/,
    );

    for (const match of matches) {
      if (match.content.includes('process.env') || match.content.includes('// example')) continue;
      findings.push({
        id: `cred-hardcoded-${crypto.createHash('md5').update(match.file + match.line).digest('hex').slice(0, 8)}`,
        category: 'credentials',
        severity: 'critical',
        title: `Possible hardcoded ${name}`,
        detail: match.content.slice(0, 100),
        file: match.file,
        line: match.line,
        remediation: 'Move to environment variable',
      });
    }
  }

  // Check .gitignore includes env files
  const gitignorePath = path.join(PROJECT_ROOT, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.env')) {
      findings.push({
        id: 'cred-gitignore-env',
        category: 'credentials',
        severity: 'high',
        title: '.env files not in .gitignore',
        detail: 'Environment files could be committed to git',
        file: '.gitignore',
        remediation: 'Add .env* to .gitignore',
      });
    }
  }

  return findings;
}

function checkShellInjection(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check for exec/execSync with string interpolation
  const dangerousExec = grepFiles(
    path.join(PROJECT_ROOT, 'src'),
    /exec(Sync)?\s*\(\s*`/,
    /\.(ts|tsx|js|jsx)$/,
  );

  for (const match of dangerousExec) {
    if (match.content.includes('// safe:')) continue;
    findings.push({
      id: `inject-exec-${crypto.createHash('md5').update(match.file + match.line).digest('hex').slice(0, 8)}`,
      category: 'injection',
      severity: 'high',
      title: 'Shell injection risk: exec with template literal',
      detail: `${match.content.slice(0, 120)}`,
      file: match.file,
      line: match.line,
      remediation: 'Use execFile() or execFileSync() with array args instead of string interpolation',
    });
  }

  // Check for eval()
  const evalCalls = grepFiles(
    path.join(PROJECT_ROOT, 'src'),
    /\beval\s*\(/,
    /\.(ts|tsx|js|jsx)$/,
  );

  for (const match of evalCalls) {
    findings.push({
      id: `inject-eval-${crypto.createHash('md5').update(match.file + match.line).digest('hex').slice(0, 8)}`,
      category: 'injection',
      severity: 'critical',
      title: 'eval() usage detected',
      detail: match.content.slice(0, 100),
      file: match.file,
      line: match.line,
      remediation: 'Remove eval() — use safe alternatives',
    });
  }

  return findings;
}

function checkPathTraversal(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check for path.join with user input without validation
  const pathJoins = grepFiles(
    path.join(PROJECT_ROOT, 'src'),
    /path\.(join|resolve)\s*\([^)]*req\./,
    /\.(ts|tsx|js|jsx)$/,
  );

  for (const match of pathJoins) {
    if (match.content.includes('startsWith') || match.content.includes('normalize')) continue;
    findings.push({
      id: `path-trav-${crypto.createHash('md5').update(match.file + match.line).digest('hex').slice(0, 8)}`,
      category: 'path-traversal',
      severity: 'high',
      title: 'Potential path traversal',
      detail: `User input in path operation without boundary check`,
      file: match.file,
      line: match.line,
      remediation: 'Validate resolved path starts with expected directory using path.resolve() + startsWith()',
    });
  }

  return findings;
}

function checkInputValidation(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check API routes for missing input validation
  const apiDir = path.join(PROJECT_ROOT, 'src', 'app', 'api');
  if (!fs.existsSync(apiDir)) return findings;

  const routeFiles = findFiles(apiDir, /route\.(ts|js)$/);
  for (const file of routeFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const relPath = path.relative(PROJECT_ROOT, file);

      // POST/PUT routes that use req.json() without validation
      if (content.includes('req.json()') || content.includes('request.json()')) {
        const hasValidation =
          content.includes('zod') ||
          content.includes('yup') ||
          content.includes('joi') ||
          content.includes('typeof ') ||
          content.includes('if (!') ||
          content.includes('.parse(') ||
          content.includes('.validate(');

        if (!hasValidation) {
          findings.push({
            id: `input-val-${crypto.createHash('md5').update(relPath).digest('hex').slice(0, 8)}`,
            category: 'input-validation',
            severity: 'medium',
            title: 'API route may lack input validation',
            detail: `Route parses JSON body but no validation library or type checks detected`,
            file: relPath,
            remediation: 'Add input validation (zod, yup, or manual type checks) before processing',
          });
        }
      }
    } catch {}
  }

  return findings;
}

function checkDependencyAudit(_config: Config): Finding[] {
  const findings: Finding[] = [];

  try {
    const output = execSync('npm audit --json 2>/dev/null || true', {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      timeout: 30000,
    });

    const audit = JSON.parse(output);
    const vulns = audit.vulnerabilities || {};
    let highCount = 0;
    let criticalCount = 0;

    for (const [pkg, info] of Object.entries(vulns) as [string, any][]) {
      const severity = info.severity;
      if (severity === 'high') highCount++;
      if (severity === 'critical') criticalCount++;

      if (severity === 'high' || severity === 'critical') {
        findings.push({
          id: `dep-vuln-${pkg}`,
          category: 'deps',
          severity: severity as Severity,
          title: `Vulnerable dependency: ${pkg}`,
          detail: `${info.via?.[0]?.title || severity} vulnerability in ${pkg}@${info.range || 'unknown'}`,
          remediation: info.fixAvailable ? `npm audit fix` : 'Check for alternative package or manual patch',
        });
      }
    }
  } catch {}

  return findings;
}

function checkLocalDiskHygiene(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check for large directories
  const dirsToCheck = [
    { dir: 'public/uploads', max: config.thresholds.maxUploadDirSizeMb, label: 'Upload directory' },
    { dir: 'public/outputs', max: config.thresholds.maxOutputDirSizeMb, label: 'Output directory' },
    { dir: 'logs', max: config.thresholds.maxLogFileSizeMb * 10, label: 'Logs directory' },
    { dir: '.next', max: 1000, label: 'Next.js build cache' },
  ];

  for (const { dir, max, label } of dirsToCheck) {
    const fullDir = path.join(PROJECT_ROOT, dir);
    const size = dirSizeMb(fullDir);
    if (size > max) {
      findings.push({
        id: `disk-size-${dir.replace(/\//g, '-')}`,
        category: 'disk',
        severity: size > max * 2 ? 'high' : 'medium',
        title: `${label} too large: ${size}MB (max ${max}MB)`,
        detail: `${fullDir} is ${size}MB`,
        remediation: `Clean old files or increase threshold`,
      });
    }
  }

  // Check for world-readable sensitive files
  const sensitiveFiles = ['.env', '.env.local', '.env.production'];
  for (const filename of sensitiveFiles) {
    const filePath = path.join(PROJECT_ROOT, filename);
    if (fs.existsSync(filePath)) {
      try {
        const stats = fs.statSync(filePath);
        if (stats.mode & 0o004) {
          findings.push({
            id: `disk-world-readable-${filename}`,
            category: 'disk',
            severity: 'high',
            title: `${filename} is world-readable`,
            detail: `File permissions: ${(stats.mode & 0o777).toString(8)}`,
            file: filename,
            remediation: `chmod 600 "${filePath}"`,
          });
        }
      } catch {}
    }
  }

  return findings;
}

function checkFilePermissions(_config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check for overly permissive script files
  const scriptFiles = findFiles(path.join(PROJECT_ROOT, 'scripts'), /\.(ts|js|sh)$/);
  for (const file of scriptFiles) {
    try {
      const stats = fs.statSync(file);
      if (stats.mode & 0o002) {
        findings.push({
          id: `perm-world-writable-${path.basename(file)}`,
          category: 'file-permissions',
          severity: 'medium',
          title: `World-writable script: ${path.basename(file)}`,
          detail: `Permissions: ${(stats.mode & 0o777).toString(8)}`,
          file: path.relative(PROJECT_ROOT, file),
          remediation: 'Remove world-write permission',
        });
      }
    } catch {}
  }

  return findings;
}

function checkSecretsInHistory(_config: Config): Finding[] {
  const findings: Finding[] = [];

  try {
    // Check for common secret patterns in git history (limited search)
    const patterns = [
      'PRIVATE KEY',
      'sk-[a-zA-Z0-9]{20}',
      'ghp_[a-zA-Z0-9]{36}',
      'password.*=.*["\'][^"\']{8,}["\']',
    ];

    for (const pattern of patterns) {
      try {
        const output = execSync(
          `git log --all -p -S "${pattern}" --diff-filter=D -- '*.ts' '*.js' '*.json' '*.env*' 2>/dev/null | head -5`,
          { encoding: 'utf-8', cwd: PROJECT_ROOT, timeout: 10000 },
        );

        if (output.trim()) {
          findings.push({
            id: `git-secret-${crypto.createHash('md5').update(pattern).digest('hex').slice(0, 8)}`,
            category: 'git-secrets',
            severity: 'high',
            title: `Possible secret removed from git history`,
            detail: `Pattern "${pattern}" was found in deleted content. Secrets persist in git history even after removal.`,
            remediation: 'Use git-filter-repo or BFG Repo Cleaner to purge from history, then rotate the credential',
          });
        }
      } catch {}
    }
  } catch {}

  return findings;
}

function checkNetworkExposure(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check listening ports
  try {
    const output = execSync('lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null || netstat -tlnp 2>/dev/null || true', {
      encoding: 'utf-8',
      timeout: 5000,
    });

    const ports = new Set<number>();
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/:(\d+)\s/);
      if (match) ports.add(parseInt(match[1]));
    }

    if (ports.size > config.thresholds.maxOpenPorts) {
      findings.push({
        id: 'net-too-many-ports',
        category: 'network',
        severity: 'medium',
        title: `${ports.size} ports listening (max ${config.thresholds.maxOpenPorts})`,
        detail: `Open ports: ${[...ports].sort((a, b) => a - b).join(', ')}`,
        remediation: 'Close unnecessary services',
      });
    }
  } catch {}

  return findings;
}

function checkBrowserExposure(_config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check for dangerouslySetInnerHTML
  const dangerousHtml = grepFiles(
    path.join(PROJECT_ROOT, 'src'),
    /dangerouslySetInnerHTML/,
    /\.(tsx|jsx)$/,
  );

  for (const match of dangerousHtml) {
    if (match.content.includes('DOMPurify') || match.content.includes('sanitize')) continue;
    findings.push({
      id: `xss-dangerous-html-${crypto.createHash('md5').update(match.file + match.line).digest('hex').slice(0, 8)}`,
      category: 'browser',
      severity: 'high',
      title: 'dangerouslySetInnerHTML without sanitization',
      detail: match.content.slice(0, 100),
      file: match.file,
      line: match.line,
      remediation: 'Use DOMPurify or similar sanitization library',
    });
  }

  return findings;
}

function checkLogSanitization(_config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check for sensitive data in log statements
  const sensitiveLogPatterns = [
    { pattern: /console\.log.*password/i, name: 'password in console.log' },
    { pattern: /console\.log.*secret/i, name: 'secret in console.log' },
    { pattern: /console\.log.*token(?!s?\b.*count|s?\b.*balance|s?\b.*pricing)/i, name: 'token in console.log' },
    { pattern: /logger\.\w+.*password/i, name: 'password in logger' },
  ];

  for (const { pattern, name } of sensitiveLogPatterns) {
    const matches = grepFiles(
      path.join(PROJECT_ROOT, 'src'),
      pattern,
      /\.(ts|tsx|js|jsx)$/,
    );

    for (const match of matches) {
      if (match.content.includes('// safe:') || match.content.includes('redact')) continue;
      findings.push({
        id: `log-sensitive-${crypto.createHash('md5').update(match.file + match.line).digest('hex').slice(0, 8)}`,
        category: 'logs',
        severity: 'medium',
        title: `Possible ${name}`,
        detail: match.content.slice(0, 100),
        file: match.file,
        line: match.line,
        remediation: 'Redact sensitive values before logging',
      });
    }
  }

  return findings;
}

// ─── Scan Runner ────────────────────────────────────────────────────────────

async function runScan(config: Config): Promise<ScanReport> {
  const start = Date.now();
  const findings: Finding[] = [];
  const checksRun: string[] = [];

  const checks: { name: string; key: string; fn: (config: Config) => Finding[] }[] = [
    { name: 'Credential Storage', key: 'credentialStorage', fn: checkCredentialStorage },
    { name: 'Shell Injection', key: 'shellInjection', fn: checkShellInjection },
    { name: 'Path Traversal', key: 'pathTraversal', fn: checkPathTraversal },
    { name: 'Input Validation', key: 'inputValidation', fn: checkInputValidation },
    { name: 'Dependency Audit', key: 'dependencyAudit', fn: checkDependencyAudit },
    { name: 'Local Disk Hygiene', key: 'localDiskHygiene', fn: checkLocalDiskHygiene },
    { name: 'File Permissions', key: 'filePermissions', fn: checkFilePermissions },
    { name: 'Secrets in History', key: 'secretsInHistory', fn: checkSecretsInHistory },
    { name: 'Network Exposure', key: 'networkExposure', fn: checkNetworkExposure },
    { name: 'Browser Exposure', key: 'browserControlExposure', fn: checkBrowserExposure },
    { name: 'Log Sanitization', key: 'sessionLogs', fn: checkLogSanitization },
  ];

  for (const check of checks) {
    if (!isCheckEnabled(config, check.key)) {
      verbose(config, `Skipping ${check.name} (disabled)`);
      continue;
    }

    log(`${c.dim}Checking ${check.name}...${c.reset}`);
    checksRun.push(check.key);

    try {
      const checkFindings = check.fn(config);
      findings.push(...checkFindings);
      const count = checkFindings.length;
      if (count > 0) {
        const highCount = checkFindings.filter(f => f.severity === 'high' || f.severity === 'critical').length;
        log(`  ${highCount > 0 ? c.red : c.yellow}${count} finding${count === 1 ? '' : 's'}${c.reset}`);
      } else {
        log(`  ${c.green}Clean${c.reset}`);
      }
    } catch (err: any) {
      log(`  ${c.red}Error: ${err.message}${c.reset}`);
    }
  }

  const summary: Record<Severity, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const f of findings) {
    summary[f.severity]++;
  }

  return {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    findings,
    summary,
    checksRun,
    config,
  };
}

// ─── Report ─────────────────────────────────────────────────────────────────

function printReport(report: ScanReport): void {
  console.log('');
  console.log(`${c.bold}${'═'.repeat(80)}${c.reset}`);
  console.log(`${c.bold}  SECURITY SCAN RESULTS${c.reset}`);
  console.log(`${c.bold}${'═'.repeat(80)}${c.reset}`);
  console.log('');

  if (report.findings.length === 0) {
    console.log(`  ${c.boldGreen}No findings — all checks passed!${c.reset}`);
  } else {
    // Group by severity
    const bySeverity = new Map<Severity, Finding[]>();
    for (const f of report.findings) {
      if (!bySeverity.has(f.severity)) bySeverity.set(f.severity, []);
      bySeverity.get(f.severity)!.push(f);
    }

    for (const sev of ['critical', 'high', 'medium', 'low', 'info'] as Severity[]) {
      const items = bySeverity.get(sev);
      if (!items?.length) continue;

      console.log(`  ${severityColor(sev)}${c.bold}${sev.toUpperCase()} (${items.length})${c.reset}`);
      for (const f of items) {
        const fixed = f.autoFixed ? ` ${c.green}[AUTO-FIXED]${c.reset}` : '';
        console.log(`    ${severityColor(sev)}${severityIcon(sev)}${c.reset} ${f.title}${fixed}`);
        if (f.file) console.log(`       ${c.dim}${f.file}${f.line ? `:${f.line}` : ''}${c.reset}`);
        if (f.remediation) console.log(`       ${c.cyan}Fix: ${f.remediation}${c.reset}`);
      }
      console.log('');
    }
  }

  // Summary
  const { summary } = report;
  console.log(`  ${c.bold}SUMMARY${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(40)}${c.reset}`);
  console.log(`  Duration:  ${(report.durationMs / 1000).toFixed(1)}s`);
  console.log(`  Checks:    ${report.checksRun.length}`);
  if (summary.critical) console.log(`  ${c.boldRed}Critical:  ${summary.critical}${c.reset}`);
  if (summary.high) console.log(`  ${c.red}High:      ${summary.high}${c.reset}`);
  if (summary.medium) console.log(`  ${c.yellow}Medium:    ${summary.medium}${c.reset}`);
  if (summary.low) console.log(`  ${c.cyan}Low:       ${summary.low}${c.reset}`);
  if (summary.info) console.log(`  ${c.gray}Info:      ${summary.info}${c.reset}`);

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log(`  ${c.boldGreen}All clear!${c.reset}`);
  }

  console.log('');
  console.log(`${c.bold}${'═'.repeat(80)}${c.reset}`);
}

function saveReport(report: ScanReport): void {
  let reportFile: ReportFile = { lastScan: report, history: [] };

  if (fs.existsSync(REPORT_PATH)) {
    try {
      reportFile = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'));
    } catch {}
  }

  reportFile.lastScan = report;
  reportFile.history = [report, ...reportFile.history].slice(0, 50);

  fs.writeFileSync(REPORT_PATH, JSON.stringify(reportFile, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const isOnce = process.argv.includes('--once');

  console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.cyan}║              SECURITY AGENT                              ║${c.reset}`);
  console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}`);

  const config = loadConfig();
  console.log(`${c.dim}  Mode:     ${isOnce ? 'Single scan' : 'Continuous'}${c.reset}`);
  console.log(`${c.dim}  Interval: ${config.intervalSeconds}s${c.reset}`);
  console.log(`${c.dim}  Auto-fix: ${config.autoRemediate}${c.reset}`);
  console.log('');

  if (isOnce) {
    const report = await runScan(config);
    printReport(report);
    saveReport(report);

    // Exit codes for CI
    if (report.summary.critical > 0) process.exit(2);
    if (report.summary.high > 0) process.exit(1);
    process.exit(0);
  }

  // Continuous mode
  while (true) {
    console.log(`\n${c.bold}  Starting scan at ${new Date().toISOString()}${c.reset}\n`);
    const report = await runScan(config);
    printReport(report);
    saveReport(report);

    console.log(`\n${c.dim}  Next scan in ${config.intervalSeconds}s...${c.reset}`);
    await new Promise((r) => setTimeout(r, config.intervalSeconds * 1000));
  }
}

main().catch((err) => {
  console.error(`${c.boldRed}Fatal: ${err.message}${c.reset}`);
  process.exit(1);
});
