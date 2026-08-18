#!/usr/bin/env node
//
// Pull what is currently broken on the live server into this working copy.
//
//   npm run errors                 # unresolved issues, newest first
//   npm run errors -- --limit=50
//   npm run errors -- --status=all
//   npm run errors -- --source=sentry
//
// Writes .errors/live-errors.md (for reading, and for pasting at an AI
// assistant) and .errors/live-errors.json (for anything that wants to parse
// it). Both are gitignored: they are a snapshot of production at a moment,
// they contain stack traces from a live hospital, and they go stale in
// minutes. Re-run the command instead of committing the output.
//
// This is the last link in the chain. The app captures errors, the API stores
// and groups them, and this brings them back to the machine where the fix gets
// written — so the loop from "it broke in production" to "here is the file and
// line" closes without anyone reading a log tail over a screen share.
//
// Two backends, because the app reports to two places:
//   --source=hms      the hospital's own /api/errors  (default)
//   --source=sentry   the Sentry issues API
//
// No dependencies: Node 20 has fetch and everything else used here.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Configuration ----------------------------------------------------------

// Credentials live in .env.errors at the repo root, NOT in backend/.env.
//
// They are a different kind of secret: backend/.env is the production server's
// own configuration, while this is a developer's personal login to a live
// hospital. Keeping them apart means neither file gets copied somewhere it
// shouldn't be to make the other one work.
function loadEnvFile() {
  const path = join(ROOT, '.env.errors');
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    // A real environment variable always wins, so CI can override the file.
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile();

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v = 'true'] = a.slice(2).split('=');
      return [k, v];
    })
);

const LIMIT = Math.min(Number(args.limit) || 25, 100);
const STATUS = args.status || 'open';
const OUT_DIR = join(ROOT, args.out || '.errors');

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`\n${hint}\n`);
  process.exit(1);
}

// --- Source: the hospital's own API -----------------------------------------

async function fromHms() {
  const base = (process.env.HMS_URL || '').replace(/\/$/, '');
  const email = process.env.HMS_EMAIL;
  const password = process.env.HMS_PASSWORD;
  const tenant = process.env.HMS_TENANT || 'default';

  if (!base || !email || !password) {
    fail(
      'HMS_URL, HMS_EMAIL and HMS_PASSWORD are required for --source=hms.',
      'Create .env.errors at the repo root:\n\n' +
      '  HMS_URL=https://your-app.onrender.com\n' +
      '  HMS_EMAIL=admin@yourhospital.com\n' +
      '  HMS_PASSWORD=…\n' +
      '  HMS_TENANT=default\n'
    );
  }

  const headers = { 'Content-Type': 'application/json', 'X-Tenant': tenant };

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password }),
  });

  if (!loginRes.ok) {
    fail(`Login failed (${loginRes.status}). Check HMS_EMAIL / HMS_PASSWORD / HMS_TENANT.`);
  }

  const token = (await loginRes.json())?.data?.token;
  if (!token) fail('Login succeeded but returned no token.');

  const authed = { ...headers, Authorization: `Bearer ${token}` };
  const query = new URLSearchParams({ limit: String(LIMIT), status: STATUS, sort: args.sort || 'recent' });

  const [listRes, statsRes] = await Promise.all([
    fetch(`${base}/api/errors?${query}`, { headers: authed }),
    fetch(`${base}/api/errors/stats`, { headers: authed }),
  ]);

  if (listRes.status === 403) {
    fail('That account cannot read error logs.', 'It needs the errors:view permission (Roles → Error Tracking).');
  }
  if (!listRes.ok) fail(`Could not fetch errors (${listRes.status}).`);

  const groups = (await listRes.json())?.data || [];
  const stats = statsRes.ok ? (await statsRes.json())?.data : null;

  // The list endpoint omits stacks and samples because they are expensive and
  // a list does not show them. Here they are the ENTIRE point — a report
  // without a stack trace cannot be acted on — so each group is fetched in
  // full. Sequentially, because this is pointing at a live hospital's API and
  // a burst of parallel requests is not worth the seconds it saves.
  const detailed = [];
  for (const g of groups) {
    const res = await fetch(`${base}/api/errors/${g._id || g.id}`, { headers: authed });
    detailed.push(res.ok ? (await res.json())?.data : g);
  }

  return { source: `${base} (tenant: ${tenant})`, stats, groups: detailed };
}

// --- Source: Sentry ---------------------------------------------------------

async function fromSentry() {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  if (!token || !org || !project) {
    fail(
      'SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are required for --source=sentry.',
      'Add to .env.errors:\n\n' +
      '  SENTRY_AUTH_TOKEN=sntrys_…   # Settings → Auth Tokens, scope: event:read\n' +
      '  SENTRY_ORG=your-org\n' +
      '  SENTRY_PROJECT=hms\n'
    );
  }

  const headers = { Authorization: `Bearer ${token}` };
  const host = process.env.SENTRY_HOST || 'https://sentry.io';
  const query = new URLSearchParams({
    query: STATUS === 'all' ? '' : 'is:unresolved',
    limit: String(LIMIT),
    statsPeriod: args.period || '24h',
  });

  const res = await fetch(`${host}/api/0/projects/${org}/${project}/issues/?${query}`, { headers });
  if (res.status === 401) fail('Sentry rejected the token. It needs the event:read scope.');
  if (!res.ok) fail(`Sentry request failed (${res.status}).`);

  const issues = await res.json();

  // Sentry's issue list has no stack either — the trace lives on the latest
  // EVENT of each issue, which is a second request per issue.
  const groups = [];
  for (const issue of issues) {
    let stack = '';
    try {
      const evRes = await fetch(`${host}/api/0/issues/${issue.id}/events/latest/`, { headers });
      if (evRes.ok) stack = formatSentryStack(await evRes.json());
    } catch {
      // A missing trace is worth less than the issue, not worth failing over.
    }

    groups.push({
      name: issue.metadata?.type || issue.type || 'Error',
      message: issue.metadata?.value || issue.title,
      route: issue.culprit || '',
      count: Number(issue.count) || 0,
      affectedUsers: Number(issue.userCount) || 0,
      firstSeenAt: issue.firstSeen,
      lastSeenAt: issue.lastSeen,
      resolved: issue.status === 'resolved',
      release: issue.firstRelease?.shortVersion || '',
      permalink: issue.permalink,
      stack,
      samples: [],
    });
  }

  return { source: `Sentry · ${org}/${project}`, stats: null, groups };
}

// Sentry stores a structured stack, not a string. Rebuilt here in the shape a
// developer reads, innermost frame last, the way a thrown Error prints.
function formatSentryStack(event) {
  const entry = event.entries?.find((e) => e.type === 'exception');
  const values = entry?.data?.values || [];
  return values
    .map((v) => {
      const frames = (v.stacktrace?.frames || [])
        .slice(-15)
        .map((f) => `    at ${f.function || '?'} (${f.filename}:${f.lineNo}:${f.colNo})`)
        .join('\n');
      return `${v.type}: ${v.value}\n${frames}`;
    })
    .join('\n\n');
}

// --- Output -----------------------------------------------------------------

const ago = (date) => {
  if (!date) return '—';
  const mins = Math.round((Date.now() - new Date(date)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

function toMarkdown({ source, stats, groups }) {
  const lines = [
    '# Live errors',
    '',
    `Fetched ${new Date().toISOString()} from ${source}`,
    `Filter: status=${STATUS}, limit=${LIMIT}`,
    '',
  ];

  if (stats) {
    lines.push(
      `**${stats.openGroups}** open issues · **${stats.newToday}** new today · ` +
      `**${stats.occurrences}** occurrences · **${stats.slowGroups}** slow endpoints · ` +
      `running \`${stats.currentRelease}\``,
      ''
    );
  }

  if (groups.length === 0) {
    lines.push('Nothing is broken. 🎉', '');
    return lines.join('\n');
  }

  // A table first, so the shape of the problem is visible before any one
  // stack trace is read.
  lines.push(
    '| # | Error | Where | Count | People | Last seen |',
    '|---|-------|-------|-------|--------|-----------|'
  );
  groups.forEach((g, i) => {
    const affected = typeof g.affectedUsers === 'number' ? g.affectedUsers : (g.affectedUsers?.length || 0);
    const message = String(g.message || '').replace(/\|/g, '\\|').slice(0, 70);
    lines.push(
      `| ${i + 1} | ${g.name}: ${message} | \`${[g.method, g.route].filter(Boolean).join(' ') || '—'}\` | ` +
      `${g.count} | ${affected} | ${ago(g.lastSeenAt)} |`
    );
  });
  lines.push('');

  groups.forEach((g, i) => {
    const affected = typeof g.affectedUsers === 'number' ? g.affectedUsers : (g.affectedUsers?.length || 0);

    lines.push(
      `## ${i + 1}. ${g.name}`,
      '',
      `> ${g.message}`,
      '',
      `- **Where:** \`${[g.method, g.route].filter(Boolean).join(' ') || '—'}\``
        + (g.statusCode ? ` → HTTP ${g.statusCode}` : ''),
      `- **Seen:** ${g.count} time(s), affecting ${affected} signed-in user(s)`,
      `- **First:** ${g.firstSeenAt || '—'} · **Last:** ${g.lastSeenAt || '—'} (${ago(g.lastSeenAt)})`,
      `- **Release:** \`${g.release || 'unknown'}\``
        + (g.environment ? ` · ${g.environment}` : '')
        + (g.source ? ` · ${g.source}` : ''),
    );

    if (g.permalink) lines.push(`- **Sentry:** ${g.permalink}`);
    if (g.sentryEventId) lines.push(`- **Sentry event:** \`${g.sentryEventId}\``);
    lines.push('');

    if (g.stack) {
      lines.push('```', g.stack.trim(), '```', '');
    }

    if (g.samples?.length) {
      lines.push('Recent occurrences:', '');
      for (const s of g.samples.slice(0, 5)) {
        lines.push(
          `- ${s.at} · ${s.userName || 'signed out'}${s.userRole ? ` (${s.userRole})` : ''}` +
          ` · \`${s.url || '—'}\`` +
          (s.requestId ? ` · request \`${s.requestId}\`` : '') +
          (s.durationMs ? ` · ${Math.round(s.durationMs)}ms` : '')
        );
      }
      lines.push('');
    }

    if (g.samples?.[0]?.extra) {
      lines.push('```json', JSON.stringify(g.samples[0].extra, null, 2), '```', '');
    }
  });

  return lines.join('\n');
}

// --- Main -------------------------------------------------------------------

// `auto` picks whichever one is actually configured, so the common case is
// just `npm run errors` with no flag to remember.
function resolveSource() {
  if (args.source) return args.source;
  if (process.env.HMS_URL) return 'hms';
  if (process.env.SENTRY_AUTH_TOKEN) return 'sentry';
  return 'hms'; // its failure message is the more useful one to land on
}

const source = resolveSource();
console.log(`Fetching ${STATUS} errors from ${source}…`);

const result = source === 'sentry' ? await fromSentry() : await fromHms();

mkdirSync(OUT_DIR, { recursive: true });
const mdPath = join(OUT_DIR, 'live-errors.md');
const jsonPath = join(OUT_DIR, 'live-errors.json');

writeFileSync(mdPath, toMarkdown(result), 'utf8');
writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');

console.log(`\n✓ ${result.groups.length} error group(s) written to:`);
console.log(`    ${mdPath}`);
console.log(`    ${jsonPath}`);

if (result.groups.length) {
  console.log('\nTop issues:');
  for (const g of result.groups.slice(0, 5)) {
    console.log(`  · ${String(g.count).padStart(5)}×  ${g.name}: ${String(g.message).slice(0, 80)}`);
  }
}
