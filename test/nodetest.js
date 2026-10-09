// E2E-Test für den Node-Setup-Pfad in main.js – mit gestubbtem electron-Modul.
// Aufruf: npm run test:node [-- --full]
//   ohne --full: nur node-status + node-setup-start im Reuse-Modus (kein Download)
//   mit  --full: PATH ohne System-Node -> echter Download/Extract/Verify von nodejs.org
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

const PROJ = path.join(__dirname, '..');
const FULL = process.argv.includes('--full');
const TMP_USER = fs.mkdtempSync(path.join(os.tmpdir(), 'sitesmith-test-'));

class FakeWin {
  constructor() {}
  loadFile() {}
  get webContents() { return { send: () => {} }; }
  isDestroyed() { return true; }
}
FakeWin.fromWebContents = () => null;
const handlers = {};
const fakeElectron = {
  app: {
    getPath: (n) => (n === 'userData' ? TMP_USER : os.tmpdir()),
    whenReady: () => Promise.resolve(),
    on: () => {},
  },
  BrowserWindow: FakeWin,
  ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } },
  shell: { openExternal: async () => {}, openPath: async () => {} },
  dialog: { showOpenDialog: async () => ({ canceled: true }) },
};
const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'electron') return fakeElectron;
  return origLoad.call(this, req, ...rest);
};

if (FULL && process.platform === 'win32') {
  process.env.PATH = 'C:\\Windows\\System32';
}

(async () => {
  process.chdir(PROJ);
  const mainApi = require(path.join(PROJ, 'main.js'));

  const need = ['node-status', 'node-setup-start', 'node-setup-state', 'node-setup-cancel', 'workflow-install', 'install-cancel', 'pick-folder', 'preview-template', 'preview-template-stop'];
  const missing = need.filter((h) => !handlers[h]);
  console.log('Handler registriert:', need.length - missing.length + '/' + need.length, missing.length ? ('FEHLT: ' + missing.join(',')) : '');
  if (missing.length) process.exit(1);

  const st = await handlers['node-status']();
  console.log('node-status:', JSON.stringify(st));

  const r = await handlers['node-setup-start']({ sender: null });
  console.log('node-setup-start:', JSON.stringify({ ok: r.ok, reused: r.reused || false, node: r.node || null, step: r.step || null, error: (r.error || '').slice(0, 120) }));
  if (FULL) {
    if (!r.ok || !r.node) { console.log('FULL-TEST FEHLGESCHLAGEN'); process.exit(1); }
    const marker = JSON.parse(fs.readFileSync(path.join(TMP_USER, 'nodejs.json'), 'utf8'));
    console.log('Marker:', marker.version, '| exe da:', fs.existsSync(marker.exe));
    // Wiederholbarkeit: zweiter Lauf muss wiederverwenden (kein Download)
    const r2 = await handlers['node-setup-start']({ sender: null });
    console.log('zweiter Lauf reused:', r2.reused === true);
    if (r2.reused !== true) { console.log('REUSE-TEST FEHLGESCHLAGEN'); process.exit(1); }
  } else if (!r.ok) {
    console.log('REUSE-TEST FEHLGESCHLAGEN'); process.exit(1);
  }
  console.log('NODE-TEST OK');

  // Meta-UUID-System
  const uuidOk = (u) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u);
  const u1 = mainApi.newUuid();
  console.log('UUID-Format:', uuidOk(u1) ? 'OK' : 'FEHLER ' + u1);
  if (!uuidOk(u1)) process.exit(1);
  const metaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sitesmith-meta-'));
  const meta = mainApi.ensureProjectMeta(metaTmp, { id: 't1', name: 'T1', version: '9.9' });
  const onDisk = JSON.parse(fs.readFileSync(path.join(metaTmp, 'meta', 'meta.json'), 'utf8'));
  const metaOk = uuidOk(meta.projectId) && meta.templateId === 't1' && Array.isArray(onDisk.previews) && fs.existsSync(path.join(metaTmp, 'meta', 'thumbnails'));
  console.log('meta/-Ordner:', metaOk ? 'OK' : 'FEHLER');
  if (!metaOk) process.exit(1);
  // Idempotenz: zweite Anlage behält projectId
  const meta2 = mainApi.ensureProjectMeta(metaTmp, { id: 't1', name: 'T1', version: '9.9' });
  if (meta2.projectId !== meta.projectId) { console.log('META-REUSE FEHLGESCHLAGEN'); process.exit(1); }
  console.log('META-TEST OK');
  try { fs.rmSync(metaTmp, { recursive: true, force: true }); } catch {}

  // npm-Env-Sanitize: npm_config_allow_scripts darf nicht an Kindprozesse durchgereicht werden
  const cleaned = mainApi.cleanNpmEnv({ PATH: 'x', npm_config_allow_scripts: 'esbuild', OTHER: 'y' });
  const envOk = !('npm_config_allow_scripts' in cleaned) && cleaned.PATH === 'x' && cleaned.OTHER === 'y';
  console.log('npm-Env-Sanitize:', envOk ? 'OK' : 'FEHLER');
  if (!envOk) process.exit(1);
  console.log('ENV-TEST OK');

  // Preview-E2E: statisches Template wird direkt serviert
  const httpMod = require('http');
  const fetchLocal = (port) => new Promise((resolve, reject) => {
    httpMod.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => resolve({ status: res.statusCode, body: s }));
    }).on('error', reject);
  });
  const pv = await handlers['preview-template'](null, { zip: 'test-template.zip', id: 'test-template' });
  if (!pv.ok) { console.log('PREVIEW-TEST FEHLGESCHLAGEN: ' + pv.error); process.exit(1); }
  const page = await fetchLocal(pv.port);
  await handlers['preview-template-stop'](null, pv.port, pv.tmpPath);
  const staticOk = page.status === 200 && page.body.includes('Hallo vom Test Template');
  console.log('Preview statisch:', staticOk ? 'OK' : 'FEHLER');
  if (!staticOk) process.exit(1);

  if (FULL) {
    // React-Template: muss installiert+gebaut werden (dist mit /assets/, kein /src/main.jsx)
    const r2 = await handlers['preview-template'](null, { zip: 'react-starter.zip', id: 'react-starter' });
    if (!r2.ok) { console.log('PREVIEW-REACT FEHLGESCHLAGEN: ' + r2.error); process.exit(1); }
    const p2 = await fetchLocal(r2.port);
    await handlers['preview-template-stop'](null, r2.port, r2.tmpPath);
    const builtOk = p2.status === 200 && !p2.body.includes('/src/main.jsx') && /assets\//.test(p2.body);
    console.log('Preview React (gebaut):', builtOk ? 'OK' : 'FEHLER');
    if (!builtOk) process.exit(1);
  }
  process.exit(0);
})().catch((e) => { console.error('TEST-CRASH:', e); process.exit(1); });
