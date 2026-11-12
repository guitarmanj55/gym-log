// Repo hygiene check: zero dependencies, runs locally, in the pre-commit hook and in CI.
//   node scripts/check.mjs            check every tracked/unignored file
//   node scripts/check.mjs --staged   check only what is staged (used by the hook)
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname, basename } from 'node:path';

const staged = process.argv.includes('--staged');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const files = (staged
  ? git('diff', '--cached', '--name-only', '--diff-filter=ACM')
  : git('ls-files', '-co', '--exclude-standard'))
  .split('\n').filter(Boolean)
  .filter((f) => !/(^|\/)(node_modules|vendor|\.wrangler|_migration-backups)\//.test(f));

const problems = [];
const fail = (file, msg) => problems.push(`${file}: ${msg}`);

const FORBIDDEN = [/(^|\/)\.env(\.|$)(?!example)/, /(^|\/)\.dev\.vars$/, /\.(pem|key|p12|pfx)$/i];
const SECRETS = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic API key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, 'private key'],
];
const TEXT = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.html', '.css', '.yml', '.yaml', '.toml', '.jsonc', '.txt', '.py', '.ps1', '.webmanifest']);

for (const f of files) {
  if (FORBIDDEN.some((re) => re.test(f))) fail(f, 'secret-bearing file must not be committed (use .env.example / .dev.vars.example)');
  // Real bank statements must never be tracked; only redacted fixtures under tests/fixtures are allowed.
  if (/\.pdf$/i.test(f) && !/(^|\/)tests\/fixtures\//.test(f)) fail(f, 'PDF outside tests/fixtures (statements must be redacted fixtures)');

  const ext = extname(f).toLowerCase();
  if (!TEXT.has(ext) || basename(f) === 'check.mjs') continue;
  let size;
  try { size = statSync(f).size; } catch { continue; }
  if (size > 1_000_000) continue;
  const text = readFileSync(f, 'utf8');
  if (/^(<<<<<<< |>>>>>>> )/m.test(text)) fail(f, 'unresolved merge conflict marker');
  for (const [re, name] of SECRETS) if (re.test(text)) fail(f, `looks like a ${name}`);
}

// Syntax check every JS file (catches the typo that only shows up on the phone).
for (const f of files.filter((f) => /\.(m?js|cjs)$/.test(f) && !/\.min\.js$/.test(f))) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    fail(f, 'syntax error\n    ' + String(e.stderr || e.message).split('\n').slice(0, 4).join('\n    '));
  }
}

if (problems.length) {
  console.error(`check failed (${problems.length}):\n` + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`check ok (${files.length} file${files.length === 1 ? '' : 's'}${staged ? ', staged' : ''})`);
