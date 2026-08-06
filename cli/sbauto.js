#!/usr/bin/env node
/**
 * sbauto — the command line for the Stonebranch Automation Suite.
 *
 * One entry point for running and operating the service, identical on Linux and
 * Windows. Underneath it drives whatever the operating system already provides —
 * systemd on Linux, a scheduled task on Windows — so there is no process manager
 * to install and nothing extra to keep alive.
 *
 *   sbauto start | stop | restart | status
 *   sbauto run                    run in the foreground
 *   sbauto logs [-f] [-n 200]
 *   sbauto config [get|set]
 *   sbauto doctor                 check the install and say what is wrong
 *   sbauto version
 *
 * Written against Node's standard library only. It has to be able to diagnose a
 * broken installation, which rules out needing that installation's dependencies
 * to be present and working first.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync, spawn, spawnSync } = require('child_process');

// ── Layout ────────────────────────────────────────────────────────────────────

const IS_WIN = process.platform === 'win32';
const SERVICE = 'sbauto';

/** Install root: the directory containing this cli/ folder. */
const ROOT = process.env.SBAUTO_HOME || path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server', 'index.js');
const ENV_FILE = path.join(ROOT, 'config', 'sbauto.env');
const LOG_DIR = process.env.LOG_DIRECTORY || path.join(ROOT, 'logs');
const PID_FILE = path.join(ROOT, 'run', 'sbauto.pid');

const PKG = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); }
  catch { return { version: '1.0.0', name: 'sbauto' }; }
})();

// ── Output ────────────────────────────────────────────────────────────────────

const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? `\u001b[${code}m${s}\u001b[0m` : s);
const bold = s => c('1', s);
const dim = s => c('2', s);
const red = s => c('31', s);
const green = s => c('32', s);
const yellow = s => c('33', s);
const cyan = s => c('36', s);

const ok = m => console.log(`  ${green('ok')}    ${m}`);
const warn = m => console.log(`  ${yellow('warn')}  ${m}`);
const bad = m => console.log(`  ${red('fail')}  ${m}`);
const info = m => console.log(`  ${dim('·')}     ${m}`);
const die = m => { console.error(`\n${red('Error')} ${m}\n`); process.exit(1); };

// ── Config ────────────────────────────────────────────────────────────────────

/** Values that must never be echoed back to a terminal or a log. */
const SECRET_KEYS = new Set(['ENCRYPTION_KEY', 'AUTH_TOKEN', 'TEAMS_WEBHOOK_URL', 'POWER_AUTOMATE_URL']);

function readEnv() {
  const out = {};
  if (!fs.existsSync(ENV_FILE)) return out;
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function writeEnv(values) {
  fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true });
  const header = [
    '# Stonebranch Automation Suite — configuration',
    '#',
    '# Controller URLs and access tokens are NOT here. Each person signs in with',
    '# their own, through the web interface, and the token is held server-side for',
    '# that session only. Nothing about your controller belongs in this file.',
    '#',
    `# Written by sbauto ${PKG.version}. Apply changes with: sbauto restart`,
    '',
  ].join('\n');
  const body = Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n');
  fs.writeFileSync(ENV_FILE, `${header}${body}\n`, { mode: 0o600 });
  try { fs.chmodSync(ENV_FILE, 0o600); } catch { /* best effort on Windows */ }
}

const port = () => Number(readEnv().PORT || process.env.PORT || 8080);

// ── Service control ───────────────────────────────────────────────────────────
//
// Delegated to the operating system on purpose. systemd and the Windows task
// scheduler already do supervision, restart-on-failure and start-at-boot, and
// they are already installed, already monitored and already understood by whoever
// runs the box. A bundled process manager would add a dependency to do work the
// platform does better.

function systemctl(...args) {
  return spawnSync('systemctl', args, { encoding: 'utf8' });
}

function schtasks(...args) {
  return spawnSync('schtasks', args, { encoding: 'utf8' });
}

/** True when the service is registered with the platform. */
function isInstalled() {
  if (IS_WIN) {
    return schtasks('/Query', '/TN', SERVICE).status === 0;
  }
  const r = systemctl('list-unit-files', `${SERVICE}.service`);
  return r.status === 0 && /\bsbauto\.service\b/.test(r.stdout || '');
}

function serviceState() {
  if (!isInstalled()) return 'not-installed';
  if (IS_WIN) {
    const q = schtasks('/Query', '/TN', SERVICE, '/FO', 'LIST');
    if (q.status !== 0) return 'not-installed';
    // A scheduled task reports Running only while the process is alive.
    return /Status:\s*Running/i.test(q.stdout || '') ? 'running' : 'stopped';
  }
  const r = systemctl('is-active', SERVICE);
  return (r.stdout || '').trim() === 'active' ? 'running' : 'stopped';
}

/** Asks the running service whether it is actually healthy, not just alive. */
function probe(timeoutMs = 3000) {
  return new Promise(resolve => {
    const req = http.get(
      { host: '127.0.0.1', port: port(), path: '/health', timeout: timeoutMs },
      res => {
        let body = '';
        res.on('data', d => { body += d; });
        res.on('end', () => {
          try { resolve({ up: res.statusCode === 200, body: JSON.parse(body) }); }
          catch { resolve({ up: false, body: null }); }
        });
      },
    );
    req.on('error', () => resolve({ up: false, body: null }));
    req.on('timeout', () => { req.destroy(); resolve({ up: false, body: null }); });
  });
}

function requireInstalled(action) {
  if (isInstalled()) return;
  console.log(`\nThe service is not registered with the system, so there is nothing to ${action}.`);
  console.log(`Run ${cyan('sbauto run')} to start it in this terminal, or re-run the installer to`);
  console.log('register it to start at boot.\n');
  process.exit(1);
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdStart() {
  requireInstalled('start');
  const r = IS_WIN ? schtasks('/Run', '/TN', SERVICE) : systemctl('start', SERVICE);
  if (r.status !== 0) die((r.stderr || r.stdout || 'could not start the service').trim());

  // Report on the health endpoint rather than the process table: a process that
  // is up but failing to answer is not started in any sense the user cares about.
  process.stdout.write('  starting');
  for (let i = 0; i < 20; i++) {
    await new Promise(r2 => setTimeout(r2, 500));
    process.stdout.write('.');
    const h = await probe(1000);
    if (h.up) {
      console.log('');
      ok(`running on port ${port()}`);
      console.log(`\n  Open ${cyan(`http://localhost:${port()}`)}\n`);
      return;
    }
  }
  console.log('');
  warn('started, but it is not answering yet — check: sbauto logs');
}

async function cmdStop() {
  requireInstalled('stop');
  const r = IS_WIN ? schtasks('/End', '/TN', SERVICE) : systemctl('stop', SERVICE);
  if (r.status !== 0) die((r.stderr || r.stdout || 'could not stop the service').trim());
  ok('stopped');
}

async function cmdRestart() {
  requireInstalled('restart');
  if (IS_WIN) { schtasks('/End', '/TN', SERVICE); await new Promise(r => setTimeout(r, 1200)); }
  else {
    const r = systemctl('restart', SERVICE);
    if (r.status !== 0) die((r.stderr || r.stdout || 'could not restart').trim());
  }
  if (IS_WIN) schtasks('/Run', '/TN', SERVICE);
  await new Promise(r => setTimeout(r, 1500));
  const h = await probe();
  h.up ? ok(`restarted, running on port ${port()}`) : warn('restarted, not answering yet — sbauto logs');
}

async function cmdStatus() {
  const cfg = readEnv();
  const state = serviceState();
  const health = await probe();

  console.log(`\n${bold('Stonebranch Automation Suite')} ${dim(`v${PKG.version}`)}\n`);

  console.log(bold('  Service'));
  const stateLabel = { running: green('running'), stopped: yellow('stopped'), 'not-installed': dim('not registered') };
  info(`state       ${stateLabel[state] || state}`);
  info(`manager     ${IS_WIN ? 'Windows scheduled task' : 'systemd'} (${SERVICE})`);
  info(`starts at boot  ${isInstalled() ? 'yes' : 'no'}`);

  console.log(`\n${bold('  Reachable')}`);
  if (health.up) {
    ok(`http://localhost:${port()} answering`);
    if (health.body?.web === false) {
      warn('running as API only — no web interface in this install');
    }
  } else {
    bad(`http://localhost:${port()} not answering`);
  }

  console.log(`\n${bold('  Configuration')}`);
  info(`file        ${ENV_FILE}${fs.existsSync(ENV_FILE) ? '' : dim(' (missing)')}`);
  info(`port        ${port()}`);
  info(`logs        ${LOG_DIR}`);
  info(`secret key  ${cfg.ENCRYPTION_KEY ? green('set') : red('missing — the service will not start')}`);
  info(`teams alerts ${cfg.TEAMS_WEBHOOK_URL ? 'configured' : dim('not configured')}`);

  console.log(`\n${bold('  Controller access')}`);
  info('Each person signs in with their own controller URL and token, in the');
  info('web interface. Nothing is stored here, and tokens are never written to disk.');
  console.log('');
}

/** Runs in the foreground. Used for debugging, containers, and first-run checks. */
function cmdRun() {
  if (!fs.existsSync(SERVER)) die(`server not found at ${SERVER}`);
  const cfg = readEnv();
  if (!cfg.ENCRYPTION_KEY && !process.env.ENCRYPTION_KEY) {
    die('ENCRYPTION_KEY is not set. Run: sbauto config init');
  }

  console.log(`\n  Starting in the foreground. Ctrl-C to stop.\n  ${cyan(`http://localhost:${port()}`)}\n`);

  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...cfg, ...process.env, ENABLE_CONSOLE_LOGGING: 'true' },
  });
  child.on('exit', code => process.exit(code ?? 0));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
}

function cmdLogs(args) {
  const follow = args.includes('-f') || args.includes('--follow');
  const nIdx = Math.max(args.indexOf('-n'), args.indexOf('--lines'));
  const lines = nIdx >= 0 ? Number(args[nIdx + 1]) || 200 : 200;

  // Prefer the journal on Linux: it is where a systemd service's output actually
  // goes, including anything that failed before the log files opened.
  if (!IS_WIN && isInstalled()) {
    const jArgs = ['-u', SERVICE, '-n', String(lines), '--no-pager'];
    if (follow) jArgs.push('-f');
    const r = spawnSync('journalctl', jArgs, { stdio: 'inherit' });
    if (r.status === 0 || follow) return;
  }

  if (!fs.existsSync(LOG_DIR)) die(`no logs yet at ${LOG_DIR}`);
  const files = fs.readdirSync(LOG_DIR)
    .filter(f => f.startsWith('application') && f.endsWith('.log'))
    .sort();
  const latest = files[files.length - 1];
  if (!latest) die(`no application log in ${LOG_DIR}`);

  const file = path.join(LOG_DIR, latest);
  if (follow) {
    spawnSync(IS_WIN ? 'powershell' : 'tail',
      IS_WIN ? ['-Command', `Get-Content -Path '${file}' -Tail ${lines} -Wait`] : ['-n', String(lines), '-f', file],
      { stdio: 'inherit' });
  } else {
    const all = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    console.log(all.slice(-lines).join('\n'));
  }
}

function cmdConfig(args) {
  const [sub, key, ...rest] = args;

  if (sub === 'init') {
    const cfg = readEnv();
    if (!cfg.ENCRYPTION_KEY) {
      // Generated, never asked for. It protects data this service writes to its
      // own disk; no human needs to choose it, see it, or be able to lose it.
      cfg.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
      ok('generated a data-encryption key');
    }
    cfg.PORT = cfg.PORT || '8080';
    cfg.NODE_ENV = 'production';
    cfg.LOG_DIRECTORY = cfg.LOG_DIRECTORY || LOG_DIR;
    cfg.LOG_LEVEL = cfg.LOG_LEVEL || 'info';
    cfg.ENABLE_CONSOLE_LOGGING = cfg.ENABLE_CONSOLE_LOGGING || 'false';
    cfg.COPILOT_ENABLED = cfg.COPILOT_ENABLED || 'true';
    cfg.ALLOW_ENV_TOKEN_FALLBACK = cfg.ALLOW_ENV_TOKEN_FALLBACK || 'false';
    writeEnv(cfg);
    ok(`wrote ${ENV_FILE}`);
    return;
  }

  if (sub === 'set') {
    if (!key || rest.length === 0) die('usage: sbauto config set KEY VALUE');
    const cfg = readEnv();
    cfg[key.toUpperCase()] = rest.join(' ');
    writeEnv(cfg);
    ok(`${key.toUpperCase()} updated — apply with: sbauto restart`);
    return;
  }

  if (sub === 'get') {
    const cfg = readEnv();
    const k = (key || '').toUpperCase();
    if (!k) die('usage: sbauto config get KEY');
    console.log(SECRET_KEYS.has(k) ? (cfg[k] ? '(set, hidden)' : '(not set)') : (cfg[k] ?? ''));
    return;
  }

  // Default: show everything, with secrets redacted rather than omitted, so it is
  // obvious that a value exists without printing it.
  const cfg = readEnv();
  console.log(`\n  ${bold('Configuration')} ${dim(ENV_FILE)}\n`);
  const keys = Object.keys(cfg).sort();
  if (!keys.length) { info('empty — run: sbauto config init'); console.log(''); return; }
  for (const k of keys) {
    const v = SECRET_KEYS.has(k) ? (cfg[k] ? dim('(set, hidden)') : dim('(not set)')) : (cfg[k] || dim('(empty)'));
    console.log(`  ${k.padEnd(26)} ${v}`);
  }
  console.log('');
}

/**
 * Checks the installation and says what is wrong in terms of what to do next.
 *
 * Exists because the failures this service actually hits in the field are dull and
 * diagnosable — wrong Node version, port already taken, key missing, log directory
 * not writable, web build absent. Each one produces a different confusing symptom
 * at boot. Naming them directly turns a support conversation into one command.
 */
async function cmdDoctor() {
  console.log(`\n${bold('Checking the installation')}\n`);
  let problems = 0;
  let warnings = 0;

  // ── Runtime ────────────────────────────────────────────────────────────────
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 18) ok(`Node ${process.versions.node}`);
  else { bad(`Node ${process.versions.node} — 18 or newer is required`); problems++; }

  info(`platform ${os.platform()} ${os.arch()} · ${os.cpus().length} cpu · ${Math.round(os.totalmem() / 1e9)} GB`);

  // ── Files ──────────────────────────────────────────────────────────────────
  console.log('');
  fs.existsSync(SERVER) ? ok(`server present at ${SERVER}`)
    : (bad(`server missing at ${SERVER} — the install is incomplete`), problems++);

  const webIndex = path.join(ROOT, 'web', 'index.html');
  if (fs.existsSync(webIndex)) ok('web interface present');
  else { warn('no web interface — it will run as an API only'); warnings++; }

  const nodeModules = path.join(ROOT, 'server', 'node_modules');
  if (fs.existsSync(nodeModules) || fs.existsSync(path.join(ROOT, 'node_modules'))) ok('dependencies installed');
  else { bad('dependencies missing — run npm install in the install directory'); problems++; }

  // ── Configuration ──────────────────────────────────────────────────────────
  console.log('');
  const cfg = readEnv();
  if (!fs.existsSync(ENV_FILE)) { bad(`no config file — run: sbauto config init`); problems++; }
  else {
    ok(`config at ${ENV_FILE}`);
    if (!IS_WIN) {
      // The file holds the data-encryption key. World-readable is a finding.
      const mode = fs.statSync(ENV_FILE).mode & 0o777;
      mode === 0o600 ? ok('config readable only by its owner')
        : (warn(`config mode is ${mode.toString(8)} — should be 600. Fix: chmod 600 ${ENV_FILE}`), warnings++);
    }
  }
  if (cfg.ENCRYPTION_KEY) {
    (cfg.ENCRYPTION_KEY.length >= 32) ? ok('data-encryption key set')
      : (bad('encryption key is shorter than 32 characters'), problems++);
  } else { bad('no encryption key — run: sbauto config init'); problems++; }

  if (cfg.ALLOW_ENV_TOKEN_FALLBACK === 'true') {
    warn('ALLOW_ENV_TOKEN_FALLBACK is true — a server-side token can authorise requests '
      + 'without anyone signing in. Leave it false unless you intend that.');
    warnings++;
  }

  // ── Writable paths ─────────────────────────────────────────────────────────
  console.log('');
  for (const [label, dir] of [['logs', LOG_DIR], ['uploads', path.join(ROOT, 'uploads')]]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      ok(`${label} writable (${dir})`);
    } catch {
      bad(`${label} not writable: ${dir}`);
      problems++;
    }
  }

  // ── Port ───────────────────────────────────────────────────────────────────
  console.log('');
  const p = port();
  const health = await probe(1500);
  if (health.up) {
    ok(`port ${p} — this service is answering on it`);
  } else {
    const free = await new Promise(resolve => {
      const srv = require('net').createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => srv.close(() => resolve(true)));
      srv.listen(p, '0.0.0.0');
    });
    if (free) info(`port ${p} free — service is not running`);
    else { bad(`port ${p} is taken by something else. Change it: sbauto config set PORT 8081`); problems++; }
  }

  // ── Service registration ───────────────────────────────────────────────────
  console.log('');
  isInstalled()
    ? ok(`registered with ${IS_WIN ? 'the task scheduler' : 'systemd'} — starts at boot`)
    : (warn('not registered to start at boot — re-run the installer to fix'), warnings++);

  // ── Verdict ────────────────────────────────────────────────────────────────
  console.log('');
  if (problems === 0 && warnings === 0) console.log(`  ${green('Everything checks out.')}\n`);
  else if (problems === 0) console.log(`  ${yellow(`Usable, with ${warnings} thing${warnings === 1 ? '' : 's'} worth looking at.`)}\n`);
  else console.log(`  ${red(`${problems} problem${problems === 1 ? '' : 's'} will stop this working.`)}\n`);

  process.exit(problems > 0 ? 1 : 0);
}

function cmdHelp() {
  console.log(`
${bold('Stonebranch Automation Suite')} ${dim(`v${PKG.version}`)}
A self-hosted interface and automation layer over the Stonebranch UAC REST API.

${bold('Usage')}  sbauto <command>

  ${cyan('start')}          start the service
  ${cyan('stop')}           stop it
  ${cyan('restart')}        restart it, to pick up configuration changes
  ${cyan('status')}         is it running, is it answering, how is it configured
  ${cyan('run')}            run in this terminal instead of as a service

  ${cyan('logs')} [-f] [-n N]  show recent output, optionally following it
  ${cyan('config')}         show the configuration, secrets redacted
  ${cyan('config init')}    create a configuration, generating the encryption key
  ${cyan('config set')} K V  change one value
  ${cyan('doctor')}         check the install and say what is wrong
  ${cyan('version')}        print the version

${bold('Controller access')}
  Not configured here. Each person signs in with their own controller URL and
  access token through the web interface, and the token stays server-side for
  the length of that session only.

${bold('Where things are')}
  install   ${ROOT}
  config    ${ENV_FILE}
  logs      ${LOG_DIR}
`);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

(async () => {
  switch (cmd) {
    case 'start':   await cmdStart();   break;
    case 'stop':    await cmdStop();    break;
    case 'restart': await cmdRestart(); break;
    case 'status':  await cmdStatus();  break;
    case 'run':     cmdRun();           break;
    case 'logs':    cmdLogs(args);      break;
    case 'config':  cmdConfig(args);    break;
    case 'doctor':  await cmdDoctor();  break;
    case 'version':
    case '--version':
    case '-v':      console.log(PKG.version); break;
    case 'help':
    case '--help':
    case '-h':
    case undefined: cmdHelp(); break;
    default:
      console.error(`\nUnknown command: ${cmd}\nRun ${cyan('sbauto help')} to see what is available.\n`);
      process.exit(1);
  }
})().catch(e => die(e?.message || String(e)));
