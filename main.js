const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');
const AdmZip = require('adm-zip');

const TEMPLATE_REPO = 'Lokrogaming/web-templates';
const TEMPLATE_BRANCH = 'main';
const APP_NAME = 'SiteSmith';
// OAuth-App (Developer settings → OAuth Apps): Callback-URL http://127.0.0.1/callback eintragen.
// Nach dem Erstellen die Client-ID hier eintragen – kein Secret nötig (PKCE + Loopback).
const GITHUB_OAUTH_CLIENT_ID = 'Iv23liauHPpy0m4o9OiA';
const GITHUB_OAUTH_SCOPES = 'repo workflow read:user';
const MAPPING_URL = `https://raw.githubusercontent.com/${TEMPLATE_REPO}/${TEMPLATE_BRANCH}/templates.json`;
const ZIP_BASE_URL = `https://raw.githubusercontent.com/${TEMPLATE_REPO}/${TEMPLATE_BRANCH}/templates/`;
const RAW_BASE_URL = `https://raw.githubusercontent.com/${TEMPLATE_REPO}/${TEMPLATE_BRANCH}/`;

const servers = new Map(); // port -> http.Server

function userDataFile(name) {
  return path.join(app.getPath('userData'), name);
}
function readToken() {
  try {
    const f = userDataFile('github.json');
    if (!fs.existsSync(f)) return null;
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return j.token || null;
  } catch { return null; }
}
function writeToken(token) {
  const f = userDataFile('github.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ token, savedAt: new Date().toISOString() }), 'utf8');
}
function clearToken() {
  try { fs.unlinkSync(userDataFile('github.json')); } catch {}
}

function execFileAsync(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 20000, ...opts }, (error, stdout, stderr) => {
      resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function downloadToFile(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { headers: { 'User-Agent': 'sitesmith' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        downloadToFile(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error('Download fehlgeschlagen: HTTP ' + res.statusCode + ' für ' + url));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    });
    req.on('error', (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
  });
}

function githubApi(apiPath, token, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'User-Agent': 'web-template-studio',
        'Accept': 'application/vnd.github+json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json' };

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (urlPath.endsWith('/')) urlPath += 'index.html';
        const safe = path.normalize(urlPath).replace(/^([/\\])+/, '');
        const filePath = path.join(rootDir, safe);
        if (!filePath.startsWith(path.normalize(rootDir))) { res.statusCode = 403; res.end('forbidden'); return; }
        fs.readFile(filePath, (err, data) => {
          if (err) {
            // SPA fallback auf index.html
            const idx = path.join(rootDir, 'index.html');
            fs.readFile(idx, (e2, d2) => {
              if (e2) { res.statusCode = 404; res.end('not found'); return; }
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(d2);
            });
            return;
          }
          res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
          res.end(data);
        });
      } catch (e) { res.statusCode = 500; res.end('error'); }
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      servers.set(port, server);
      resolve({ url: `http://127.0.0.1:${port}`, port });
    });
    server.on('error', reject);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1220,
    height: 840,
    autoHideMenuBar: true,
    title: 'SiteSmith',
    backgroundColor: '#09090B',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------- IPC ----------

ipcMain.handle('get-config', async () => ({
  appName: APP_NAME,
  oauthConfigured: GITHUB_OAUTH_CLIENT_ID.length > 0,
  oauthHasSecret: !!readOAuthSecret(),
  templateRepo: TEMPLATE_REPO,
  branch: TEMPLATE_BRANCH,
  mappingUrl: MAPPING_URL,
  zipBaseUrl: ZIP_BASE_URL,
  rawBaseUrl: RAW_BASE_URL,
  workspace: path.join(os.homedir(), 'SiteSmith'),
  downloads: app.getPath('downloads'),
}));

ipcMain.handle('github-status', async () => {
  const token = readToken();
  // zusätzlich gh CLI prüfen (nur als Hinweis)
  const gh = await execFileAsync('gh', ['auth', 'status']);
  const ghCli = !gh.error;
  if (!token) return { connected: false, user: null, ghCli, hint: 'Kein Token gespeichert.' };
  try {
    const r = await githubApi('/user', token);
    if (r.status === 200 && r.json && r.json.login) {
      return { connected: true, user: { login: r.json.login, name: r.json.name, avatar: r.json.avatar_url }, ghCli };
    }
    return { connected: false, user: null, ghCli, hint: 'Token ungültig (HTTP ' + r.status + ').' };
  } catch (e) {
    return { connected: false, user: null, ghCli, hint: 'Netzwerkfehler: ' + e.message };
  }
});

ipcMain.handle('github-save-token', async (_e, token) => {
  token = String(token || '').trim().replace(/^gh[po]_/, (m) => m); // nicht verändern, nur trimmen
  if (!token) return { ok: false, error: 'Leeres Token.' };
  try {
    const r = await githubApi('/user', token);
    if (r.status === 200 && r.json && r.json.login) {
      writeToken(token);
      return { ok: true, user: { login: r.json.login, name: r.json.name, avatar: r.json.avatar_url } };
    }
    return { ok: false, error: 'Token abgelehnt (HTTP ' + r.status + '). Scopes nötig: repo, workflow.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('github-logout', async () => { clearToken(); return { ok: true }; });

// ---------- OAuth Web-Flow (Browser + Loopback, PKCE, kein Secret) ----------
let oauthPending = null;

function closeOAuthServer() {
  if (oauthPending) {
    if (oauthPending.timer) clearTimeout(oauthPending.timer);
    try { oauthPending.server.close(); } catch {}
    oauthPending = null;
  }
}

const oauthHtml = (msg) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${APP_NAME}</title></head><body style="background:#09090B;color:#FAFAFA;font-family:system-ui;display:flex;height:100vh;align-items:center;justify-content:center;margin:0"><div style="text-align:center;max-width:420px"><h2>${msg}</h2><p style="color:#A1A1AA">Du kannst dieses Fenster schließen und zu ${APP_NAME} zurückkehren.</p></div></body></html>`;
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function readOAuthSecret() {
  try {
    const f = userDataFile('oauth.json');
    if (!fs.existsSync(f)) return null;
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return j.clientSecret || null;
  } catch { return null; }
}

function exchangeOAuthCode(code, verifier, redirectUri) {
  return new Promise((resolve) => {
    const bodyObj = { client_id: GITHUB_OAUTH_CLIENT_ID, code, redirect_uri: redirectUri, code_verifier: verifier };
    const secret = readOAuthSecret();
    if (secret) bodyObj.client_secret = secret;
    const body = JSON.stringify(bodyObj);
    const req = https.request({
      hostname: 'github.com', path: '/login/oauth/access_token', method: 'POST',
      headers: { 'User-Agent': 'sitesmith', 'Accept': 'application/json', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', async () => {
        try {
          const j = JSON.parse(raw);
          if (!j.access_token) {
            const code = j.error ? '`' + j.error + '` ' : '';
            return resolve({ ok: false, error: code + (j.error_description || j.error || 'Kein Token erhalten.') });
          }
          const me = await githubApi('/user', j.access_token);
          resolve({
            ok: true, token: j.access_token,
            user: me.json && me.json.login ? { login: me.json.login, name: me.json.name, avatar: me.json.avatar_url } : null,
          });
        } catch (e) { resolve({ ok: false, error: e.message }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

ipcMain.handle('github-oauth-start', async () => {
  if (!GITHUB_OAUTH_CLIENT_ID) {
    return { ok: false, error: 'Keine OAuth Client-ID konfiguriert (GITHUB_OAUTH_CLIENT_ID in main.js).' };
  }
  closeOAuthServer();
  const crypto = require('crypto');
  const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const state = b64url(crypto.randomBytes(16));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname !== '/callback') { res.statusCode = 404; res.end('not found'); return; }
        const p = oauthPending;
        if (!p) { res.statusCode = 400; res.end('expired'); return; }
        const err = u.searchParams.get('error');
        if (err) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(oauthHtml('Abgebrochen.'));
          const r = p.resolve;
          closeOAuthServer();
          r({ ok: false, error: u.searchParams.get('error_description') || err });
          return;
        }
        const code = u.searchParams.get('code');
        if (!code || u.searchParams.get('state') !== p.state) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(oauthHtml('Ungültige Antwort – bitte erneut versuchen.'));
          return;
        }
        exchangeOAuthCode(code, p.verifier, p.redirectUri).then((tok) => {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          if (!tok.ok) {
            res.end(oauthHtml('Fehler: ' + escHtml(tok.error)));
          } else {
            writeToken(tok.token);
            res.end(oauthHtml('✓ ' + APP_NAME + ' ist mit GitHub verbunden.'));
          }
          const r = p.resolve;
          closeOAuthServer();
          r(tok.ok ? { ok: true, user: tok.user } : { ok: false, error: tok.error });
        });
      } catch (e) { try { res.statusCode = 500; res.end('error'); } catch {} }
    });
    server.listen(0, '127.0.0.1', async () => {
      const redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
      oauthPending = {
        server, resolve, state, verifier, redirectUri,
        timer: setTimeout(() => {
          const p = oauthPending;
          closeOAuthServer();
          if (p) p.resolve({ ok: false, error: 'Zeitüberschreitung – bitte erneut versuchen.' });
        }, 5 * 60 * 1000),
      };
      const params = new URLSearchParams({
        client_id: GITHUB_OAUTH_CLIENT_ID, redirect_uri: redirectUri,
        scope: GITHUB_OAUTH_SCOPES, state,
        code_challenge: challenge, code_challenge_method: 'S256',
      });
      await shell.openExternal('https://github.com/login/oauth/authorize?' + params.toString());
    });
    server.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
});

ipcMain.handle('github-oauth-cancel', async () => {
  const p = oauthPending;
  closeOAuthServer();
  if (p) p.resolve({ ok: false, error: 'Abgebrochen.' });
  return { ok: true };
});

ipcMain.handle('github-oauth-save-secret', async (_e, secret) => {
  secret = String(secret || '').trim();
  if (!secret) return { ok: false, error: 'Leeres Secret.' };
  const f = userDataFile('oauth.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ clientSecret: secret, savedAt: new Date().toISOString() }), 'utf8');
  return { ok: true };
});

// ---------- Node.js Runtime ----------
// Strategie: vorhandenes System-Node (>= 20) wiederverwenden. Sonst offizielles
// LTS-Zip von nodejs.org nach userData/nodejs entpacken (kein Admin, kein PATH-Eingriff,
// wiederholbar, keine Duplikate). Alles läuft im Main-Prozess, nie im Renderer.
const NODE_MIN_MAJOR = 20;
const NODE_DIST_INDEX = 'https://nodejs.org/dist/index.json';

function readNodeMarker() {
  try {
    const f = userDataFile('nodejs.json');
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch { return null; }
}
function writeNodeMarker(m) {
  const f = userDataFile('nodejs.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ ...m, savedAt: new Date().toISOString() }), 'utf8');
}
function bundledNodeRoot() { return path.join(app.getPath('userData'), 'nodejs'); }

async function checkNode() {
  // 1. app-lokal (SiteSmith-eigen)
  try {
    const marker = readNodeMarker();
    if (marker && marker.exe && fs.existsSync(marker.exe)) {
      const v = await execFileAsync(marker.exe, ['-v']);
      if (!v.error) {
        let npmv = null;
        if (marker.npmCli && fs.existsSync(marker.npmCli)) {
          const r = await execFileAsync(marker.exe, [marker.npmCli, '-v']);
          if (!r.error) npmv = r.stdout.trim();
        }
        return { ok: true, node: v.stdout.trim(), npm: npmv, source: 'bundled', version: marker.version || null, minMajor: NODE_MIN_MAJOR };
      }
    }
  } catch {}
  // 2. System (Hinweis: 'npm' ist auf Windows eine .cmd und braucht cmd.exe; statische Args, keine Shell-Injektion möglich)
  const node = await execFileAsync('node', ['-v']);
  const npm = process.platform === 'win32'
    ? await execFileAsync('cmd.exe', ['/d', '/s', '/c', 'npm -v'])
    : await execFileAsync('npm', ['-v']);
  if (!node.error && !npm.error) {
    const major = parseInt(String(node.stdout.trim()).replace(/^v/, '').split('.')[0], 10);
    if (Number.isFinite(major) && major >= NODE_MIN_MAJOR) {
      return { ok: true, node: node.stdout.trim(), npm: npm.stdout.trim(), source: 'system', minMajor: NODE_MIN_MAJOR };
    }
    return { ok: false, node: node.stdout.trim(), npm: npm.stdout.trim(), source: 'system', tooOld: true, minMajor: NODE_MIN_MAJOR };
  }
  return { ok: false, node: null, npm: null, source: 'none', minMajor: NODE_MIN_MAJOR };
}

ipcMain.handle('node-status', async () => checkNode());

function fetchJson(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'sitesmith' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson(res.headers.location, timeoutMs).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode + ' für ' + url)); return; }
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error('Ungültige Antwort von ' + url)); } });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('Zeitüberschreitung beim Abruf von ' + url)); });
  });
}

function downloadWithProgress(url, dest, onPct) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const file = fs.createWriteStream(dest);
      const req = https.get(u, { headers: { 'User-Agent': 'sitesmith' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close(); try { fs.unlinkSync(dest); } catch {}
          go(res.headers.location); return;
        }
        if (res.statusCode !== 200) {
          file.close(); try { fs.unlinkSync(dest); } catch {}
          reject(new Error('Download fehlgeschlagen: HTTP ' + res.statusCode)); return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let got = 0;
        res.on('data', (c) => { got += c.length; if (total > 0 && onPct) onPct(Math.min(100, Math.round((got / total) * 100))); });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
        file.on('error', (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
      });
      req.on('error', (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
      nodeSetup.req = req;
    };
    go(url);
  });
}

const nodeSetup = { running: false, cancel: false, req: null };
function nodeSend(win, payload) {
  try { if (win && !win.isDestroyed()) win.webContents.send('node-setup-progress', payload); } catch {}
}

ipcMain.handle('node-setup-state', async () => ({ running: nodeSetup.running }));
ipcMain.handle('node-setup-cancel', async () => {
  nodeSetup.cancel = true;
  try { if (nodeSetup.req) nodeSetup.req.destroy(); } catch {}
  return { ok: true };
});

ipcMain.handle('node-setup-start', async (e) => {
  if (nodeSetup.running) return { ok: false, error: 'Setup läuft bereits.' };
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Auto-Setup nur auf Windows.', next: 'Installiere Node.js LTS manuell von https://nodejs.org und starte SiteSmith neu.' };
  }
  nodeSetup.running = true;
  nodeSetup.cancel = false;
  nodeSetup.req = null;
  const win = BrowserWindow.fromWebContents(e.sender);
  const prog = (step, status, detail, percent) => nodeSend(win, { step, status, detail: detail || '', percent: percent ?? null });
  const cancelled = () => nodeSetup.cancel;
  const done = (r) => { nodeSetup.running = false; nodeSetup.req = null; return r; };
  try {
    prog('check', 'running', 'Prüfe vorhandene Installation …');
    const cur = await checkNode();
    if (cur.ok) {
      prog('done', 'done', `Bereits vorhanden: Node ${cur.node} (${cur.source === 'bundled' ? 'SiteSmith' : 'System'}) – wird wiederverwendet.`);
      return done({ ok: true, reused: true, ...cur });
    }
    if (cancelled()) { prog('check', 'idle', 'Abgebrochen.'); return done({ ok: false, cancelled: true }); }

    prog('version', 'running', 'Ermittle aktuelle LTS-Version (nodejs.org) …');
    let version;
    try {
      const index = await fetchJson(NODE_DIST_INDEX);
      if (cancelled()) { prog('version', 'idle', 'Abgebrochen.'); return done({ ok: false, cancelled: true }); }
      if (!Array.isArray(index)) throw new Error('Unerwartetes Format.');
      const lts = index.find((r) => r && r.lts && /^v\d+\.\d+\.\d+$/.test(r.version));
      if (!lts) throw new Error('Keine LTS-Version gefunden.');
      version = lts.version;
    } catch (err) {
      return done({ ok: false, step: 'version', error: 'LTS-Version nicht ermittelbar: ' + err.message, next: 'Internetverbindung prüfen und erneut versuchen – oder Node.js LTS manuell von https://nodejs.org installieren und SiteSmith neu starten.' });
    }

    const root = bundledNodeRoot();
    const marker = readNodeMarker();
    if (marker && marker.version === version && marker.exe && fs.existsSync(marker.exe)) {
      const v = await execFileAsync(marker.exe, ['-v']);
      if (!v.error) {
        prog('done', 'done', `Bereits eingerichtet: Node ${v.stdout.trim()} (kein erneuter Download).`);
        return done({ ok: true, reused: true, node: v.stdout.trim(), source: 'bundled', version });
      }
    }

    const file = `node-${version}-win-x64.zip`;
    const url = `https://nodejs.org/dist/${version}/${file}`;
    const dest = path.join(os.tmpdir(), `sitesmith-${file}`);
    prog('download', 'running', `Lade ${file} von nodejs.org …`, 0);
    try {
      await downloadWithProgress(url, dest, (p) => { if (!cancelled()) prog('download', 'running', `Lade ${file} … ${p} %`, p); });
    } catch (err) {
      if (cancelled()) { prog('download', 'idle', 'Abgebrochen.'); return done({ ok: false, cancelled: true }); }
      return done({ ok: false, step: 'download', error: err.message, next: 'Internetverbindung prüfen und erneut versuchen – oder Node.js LTS manuell von https://nodejs.org installieren.' });
    }
    if (cancelled()) { try { fs.unlinkSync(dest); } catch {} prog('download', 'idle', 'Abgebrochen.'); return done({ ok: false, cancelled: true }); }

    prog('extract', 'running', 'Entpacke …');
    try {
      const tmpRoot = path.join(os.tmpdir(), `sitesmith-node-${Date.now()}`);
      fs.mkdirSync(tmpRoot, { recursive: true });
      new AdmZip(dest).extractAllTo(tmpRoot, true);
      try { fs.unlinkSync(dest); } catch {}
      const sub = fs.readdirSync(tmpRoot).find((n) => n.startsWith('node-') && fs.statSync(path.join(tmpRoot, n)).isDirectory());
      if (!sub) throw new Error('Unerwartetes Archiv-Layout.');
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
      fs.mkdirSync(path.dirname(root), { recursive: true });
      fs.cpSync(path.join(tmpRoot, sub), root, { recursive: true });
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
    } catch (err) {
      return done({ ok: false, step: 'extract', error: 'Entpacken fehlgeschlagen: ' + err.message, next: 'Sicherstellen, dass genug Speicherplatz frei ist, dann erneut versuchen.' });
    }
    if (cancelled()) { prog('extract', 'idle', 'Abgebrochen.'); return done({ ok: false, cancelled: true }); }

    prog('verify', 'running', 'Prüfe Installation …');
    const exe = path.join(root, 'node.exe');
    const npmCli = path.join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const v = await execFileAsync(exe, ['-v']);
    if (v.error) {
      return done({ ok: false, step: 'verify', error: 'node.exe antwortet nicht.', next: 'Setup erneut ausführen oder Node.js LTS manuell von https://nodejs.org installieren.' });
    }
    let npmv = null;
    if (fs.existsSync(npmCli)) {
      const r = await execFileAsync(exe, [npmCli, '-v']);
      if (!r.error) npmv = r.stdout.trim();
    }
    writeNodeMarker({ version, exe, npmCli: fs.existsSync(npmCli) ? npmCli : null });
    prog('done', 'done', `Fertig: Node ${v.stdout.trim()}${npmv ? ' · npm ' + npmv : ''} (SiteSmith-eigen, kein Admin nötig).`);
    return done({ ok: true, node: v.stdout.trim(), npm: npmv, source: 'bundled', version });
  } catch (err) {
    return done({ ok: false, step: 'unknown', error: err.message, next: 'Setup erneut versuchen oder Node.js LTS manuell von https://nodejs.org installieren.' });
  }
});

// npm install im Projektordner – nutzt gebündeltes oder System-Node
async function npmInstall(cwd) {
  const st = await checkNode();
  if (!st.ok) throw new Error('Node.js fehlt oder ist zu alt (min. v' + NODE_MIN_MAJOR + ').');
  let cmd, args;
  if (st.source === 'bundled') {
    const marker = readNodeMarker();
    cmd = path.join(path.dirname(marker.exe), 'npm.cmd');
    args = ['install', '--no-audit', '--no-fund', '--loglevel=error'];
  } else {
    // System-npm (.cmd) via cmd.exe mit statischen Args aufrufen
    cmd = 'cmd.exe';
    args = ['/d', '/s', '/c', 'npm install --no-audit --no-fund --loglevel=error'];
  }
  const r = await execFileAsync(cmd, args, { cwd, timeout: 5 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
  if (r.error) throw new Error('npm install fehlgeschlagen: ' + (r.stderr || r.error.message).slice(0, 600));
  return r;
}

ipcMain.handle('download-zip', async (_e, template) => {
  try {
    const zipName = template && template.zip ? template.zip : null;
    if (!zipName) return { ok: false, error: 'Template hat keinen Zip-Namen.' };
    const url = ZIP_BASE_URL + zipName;
    const dest = path.join(app.getPath('downloads'), zipName);
    await downloadToFile(url, dest);
    return { ok: true, path: dest, url };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

const installCtl = { active: false, cancel: false };
ipcMain.handle('install-cancel', async () => { installCtl.cancel = true; return { ok: true }; });

ipcMain.handle('pick-folder', async (e, defPath) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win || undefined, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defPath || os.homedir(),
  });
  if (r.canceled || !r.filePaths.length) return { ok: false };
  return { ok: true, path: r.filePaths[0] };
});

ipcMain.handle('workflow-install', async (e, template, repoName, options = {}) => {
  if (installCtl.active) return { ok: false, error: 'Es läuft bereits eine Installation.', next: 'Warte bis sie fertig ist oder brich sie ab.' };
  installCtl.active = true;
  installCtl.cancel = false;
  const win = BrowserWindow.fromWebContents(e.sender);
  const send = (step, status, logLine) => {
    try { if (win && !win.isDestroyed()) win.webContents.send('install-progress', { step, status, log: logLine || '' }); } catch {}
  };
  const logs = [];
  const log = (m) => { logs.push(m); send('log', 'info', m); };
  const cancelled = () => installCtl.cancel;
  const finish = (r) => { installCtl.active = false; return r; };
  const runStep = async (id, fn) => {
    if (cancelled()) throw { cancelled: true };
    send(id, 'running');
    try {
      const r = await fn();
      send(id, 'done');
      return r;
    } catch (err) {
      if (err && err.cancelled) throw err;
      send(id, 'error', err && err.message);
      throw err;
    }
  };
  try {
    const opts = { targetDir: '', createRepo: true, pages: true, readme: true, ...(options || {}) };
    if (!template || !template.zip || !template.id) return finish({ ok: false, error: 'Ungültiges Template.', next: 'Wähle ein anderes Template aus der Übersicht.' });
    repoName = String(repoName || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!repoName) return finish({ ok: false, error: 'Ungültiger Repository-Name.', next: 'Nur Kleinbuchstaben, Zahlen, Punkte, Unter- und Bindestriche verwenden.' });

    const base = opts.targetDir && String(opts.targetDir).trim() ? String(opts.targetDir).trim() : path.join(os.homedir(), 'SiteSmith');
    const target = path.join(base, repoName);
    if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
      return finish({ ok: false, error: 'Zielordner existiert bereits: ' + target, next: 'Anderen Repository-Namen wählen oder den Ordner vorher löschen/umbenennen.' });
    }

    let token = null;
    let owner = null;
    if (opts.createRepo) {
      token = readToken();
      if (!token) return finish({ ok: false, error: 'GitHub nicht verknüpft.', next: 'Im Install-Dialog auf „Mit GitHub anmelden“ klicken und danach erneut starten.' });
      const me = await githubApi('/user', token);
      if (me.status !== 200 || !me.json.login) {
        return finish({ ok: false, error: 'GitHub-Token ungültig (HTTP ' + me.status + ').', next: 'Erneut anmelden (altes Token wird dabei ersetzt).' });
      }
      owner = me.json.login;
      log('Angemeldet als ' + owner);
    }

    await runStep('download', async () => {
      const url = ZIP_BASE_URL + template.zip;
      const tmpZip = path.join(os.tmpdir(), 'sitesmith-' + Date.now() + '-' + template.zip);
      log('Lade ' + template.zip + ' …');
      await downloadToFile(url, tmpZip);
      log('Download OK');
      return tmpZip;
    }).then((zip) => { installCtl._zip = zip; });
    if (cancelled()) throw { cancelled: true };

    await runStep('extract', async () => {
      fs.mkdirSync(target, { recursive: true });
      new AdmZip(installCtl._zip).extractAllTo(target, true);
      try { fs.unlinkSync(installCtl._zip); } catch {}
      log('Entpackt nach ' + target);
      const cfgPath = path.join(target, '.temp-config');
      if (fs.existsSync(cfgPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
          log(`Template: ${cfg.name || template.name} v${cfg.version || '?'} (${cfg.type || '?'})`);
        } catch { log('Hinweis: .temp-config konnte nicht gelesen werden (ignoriert).'); }
      }
    });
    if (cancelled()) throw { cancelled: true };

    const hasPkg = fs.existsSync(path.join(target, 'package.json'));
    if (hasPkg) {
      await runStep('deps', async () => {
        const st = await checkNode();
        if (!st.ok) {
          throw new Error(st.source === 'none'
            ? 'Node.js fehlt für dieses Template.'
            : `Node.js ist zu alt (${st.node || '?'}, min. v${NODE_MIN_MAJOR}).`);
        }
        log(`Installiere Abhängigkeiten (npm, Node ${st.node}) …`);
        await npmInstall(target);
        log('Abhängigkeiten installiert');
      }).catch((err) => {
        if (err && err.cancelled) throw err;
        throw new Error(err.message + ' [Nächster Schritt: Node.js über den Setup-Bildschirm einrichten und Installation erneut starten.]');
      });
    }
    if (cancelled()) throw { cancelled: true };

    if (opts.readme) {
      await runStep('readme', async () => {
        const isHtmlTemplate = String(template.type || '').toLowerCase().includes('html') || String(template.type || '').toLowerCase().includes('static') || fs.existsSync(path.join(target, 'index.html'));
        installCtl._isHtml = isHtmlTemplate;
        const readmeGen =
`# ${repoName}

Erstellt mit **${APP_NAME}** aus dem Template **${template.name}** (v${template.version || '?'}, ID \`${template.id}\`).

## Lokal starten

- **Statisches HTML:** \`index.html\` im Browser öffnen – oder mit Preview-Server:
  \`\`\`
  npx serve .
  \`\`\`
- **Node-Projekt:**
  \`\`\`
  npm install
  npm run dev
  \`\`\`

## Deployment

- **GitHub Pages (statisch):** Repo → Settings → Pages → Deploy from branch \`main\` / \`/ (root)\`.
  URL-Schema: \`https://<user>.github.io/${repoName}/\`.
- **Node-Projekt:** \`npm run build\` → Ordner \`dist/\` auf Pages / Vercel / Netlify deployen.

---
_Template: ${template.name} · Author: ${template.author || '?'} · Stand: ${template.updated || '?'}._
`;
        const readmePath = path.join(target, 'README.md');
        if (!fs.existsSync(readmePath)) {
          fs.writeFileSync(readmePath, readmeGen, 'utf8');
          log('README mit Deployment-Anleitung geschrieben');
        } else {
          log('README existiert bereits – nicht überschrieben');
        }
      });
    } else {
      installCtl._isHtml = fs.existsSync(path.join(target, 'index.html'));
    }
    if (cancelled()) throw { cancelled: true };

    await runStep('git', async () => {
      const git = async (args) => {
        const r = await execFileAsync('git', args, { cwd: target });
        if (r.error) throw new Error('git ' + args.join(' ') + ' fehlgeschlagen.');
        return r;
      };
      try {
        await git(['--version']);
      } catch {
        throw new Error('Git wurde nicht gefunden.');
      }
      await git(['init']);
      await git(['add', '-A']);
      await execFileAsync('git', ['config', 'user.name', owner || 'sitesmith'], { cwd: target });
      await execFileAsync('git', ['config', 'user.email', (owner || 'sitesmith') + '@users.noreply.github.com'], { cwd: target });
      await git(['commit', '-m', `chore: ${template.name} Template installieren`]);
      await git(['branch', '-M', 'main']);
      log('Lokales Git-Repo initialisiert');
    }).catch((err) => {
      if (err && err.cancelled) throw err;
      const next = /nicht gefunden/.test(err.message)
        ? 'Git von https://git-scm.com installieren, dann Installation erneut starten (Zielordner vorher löschen).'
        : 'Details stehen im Log – ggf. Zielordner löschen und erneut versuchen.';
      throw new Error(err.message + ' [Nächster Schritt: ' + next + ']');
    });
    if (cancelled()) throw { cancelled: true };

    let repoUrl = null;
    let pagesUrl = null;
    if (opts.createRepo) {
      await runStep('repo', async () => {
        log('Erstelle GitHub-Repo ' + owner + '/' + repoName);
        const create = await githubApi('/user/repos', token, 'POST', {
          name: repoName, private: false, auto_init: false,
          description: (template.description || template.name || 'Website').slice(0, 200),
        });
        repoUrl = `https://github.com/${owner}/${repoName}`;
        if (create.status === 201) {
          repoUrl = create.json.html_url || repoUrl;
          log('Repo erstellt: ' + repoUrl);
        } else if (create.status === 422) {
          log('Repo existiert bereits – nutze bestehendes: ' + repoUrl);
        } else {
          throw new Error('Repo-Erstellung fehlgeschlagen (HTTP ' + create.status + ').');
        }
      });

      await runStep('push', async () => {
        const git = async (args) => {
          const r = await execFileAsync('git', args, { cwd: target });
          if (r.error) throw new Error('git ' + args.join(' ') + ' fehlgeschlagen.');
          return r;
        };
        await git(['remote', 'remove', 'origin']).catch(() => {});
        await git(['remote', 'add', 'origin', `https://${token}@github.com/${owner}/${repoName}.git`]);
        const push = await execFileAsync('git', ['push', '-u', 'origin', 'main'], { cwd: target, timeout: 60000 });
        await execFileAsync('git', ['remote', 'set-url', 'origin', `https://github.com/${owner}/${repoName}.git`], { cwd: target });
        if (push.error) throw new Error('git push fehlgeschlagen – ggf. keine Schreibrechte oder keine Verbindung.');
        log('Gepusht nach main');
      });

      if (installCtl._isHtml && opts.pages) {
        await runStep('pages', async () => {
          pagesUrl = `https://${owner}.github.io/${repoName}/`;
          log('Aktiviere GitHub Pages …');
          const pages = await githubApi(`/repos/${owner}/${repoName}/pages`, token, 'POST', {
            build_type: 'legacy', source: { branch: 'main', path: '/' },
          });
          if ([201, 202, 204].includes(pages.status)) {
            log('Pages aktiviert: ' + pagesUrl);
          } else if (pages.status === 409 || pages.status === 422) {
            const info = await githubApi(`/repos/${owner}/${repoName}/pages`, token);
            if (info.json && info.json.html_url) pagesUrl = info.json.html_url;
            log('Pages existierte bereits: ' + pagesUrl);
          } else {
            log('Pages-Aktivierung übersprungen (HTTP ' + pages.status + ') – manuell: Repo → Settings → Pages → main / root.');
          }
        });
      } else if (!installCtl._isHtml) {
        log('Kein statisches HTML-Template – Pages-Schritt entfällt.');
      }
    } else {
      log('Nur lokal installiert (kein GitHub-Repo gewünscht).');
    }

    return finish({ ok: true, logs, localPath: target, repoUrl, pagesUrl });
  } catch (err) {
    if (err && err.cancelled) return finish({ ok: false, cancelled: true, logs, error: 'Installation abgebrochen.' });
    return finish({ ok: false, logs, error: (err && err.message) || 'Unbekannter Fehler.' });
  }
});

ipcMain.handle('preview-template', async (_e, template) => {
  try {
    if (!template || !template.zip) return { ok: false, error: 'Ungültiges Template.' };
    const url = ZIP_BASE_URL + template.zip;
    const stamp = Date.now();
    const tmpZip = path.join(os.tmpdir(), 'sitesmith-pv-' + stamp + '-' + template.zip);
    const tmpDir = path.join(os.tmpdir(), 'sitesmith-pv-' + stamp + '-' + (template.id || 'tpl'));
    await downloadToFile(url, tmpZip);
    fs.mkdirSync(tmpDir, { recursive: true });
    new AdmZip(tmpZip).extractAllTo(tmpDir, true);
    try { fs.unlinkSync(tmpZip); } catch {}
    const pkg = path.join(tmpDir, 'package.json');
    const root = fs.existsSync(pkg) && fs.existsSync(path.join(tmpDir, 'dist')) ? path.join(tmpDir, 'dist') : tmpDir;
    const s = await startStaticServer(root);
    return { ok: true, ...s, tmpPath: tmpDir };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('preview-template-stop', async (_e, port, tmpPath) => {
  const s = servers.get(Number(port));
  if (s) { await new Promise((r) => s.close(r)); servers.delete(Number(port)); }
  if (tmpPath) {
    try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {}
  }
  return { ok: true };
});

ipcMain.handle('preview-start', async (_e, localPath) => {
  try {
    if (!localPath || !fs.existsSync(localPath)) return { ok: false, error: 'Ordner nicht gefunden: ' + localPath };
    const pkg = path.join(localPath, 'package.json');
    // Hinweis: Node-Projekte mit dev-Server werden hier bewusst NICHT automatisch per npm gestartet (v1: statischer Serve).
    if (fs.existsSync(pkg)) {
      // trotzdem statisch serven (dist/ bevorzugt, sonst root)
      const dist = path.join(localPath, 'dist');
      const root = fs.existsSync(dist) ? dist : localPath;
      const s = await startStaticServer(root);
      return { ok: true, ...s, note: 'package.json gefunden – v1 serviert statisch aus ' + root + '. Für HMR: Projektordner öffnen und `npm install && npm run dev` ausführen.' };
    }
    const s = await startStaticServer(localPath);
    return { ok: true, ...s };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('preview-stop', async (_e, port) => {
  const s = servers.get(Number(port));
  if (s) { await new Promise((r) => s.close(r)); servers.delete(Number(port)); }
  return { ok: true };
});

ipcMain.handle('open-folder', async (_e, p) => { await shell.openPath(p); return { ok: true }; });
ipcMain.handle('open-external', async (_e, url) => { await shell.openExternal(url); return { ok: true }; });
