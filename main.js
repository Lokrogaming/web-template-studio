const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { execFile, spawn } = require('child_process');
const AdmZip = require('adm-zip');

const TEMPLATE_REPO = 'Lokrogaming/web-templates';
const TEMPLATE_BRANCH = 'main';
const MAPPING_URL = `https://raw.githubusercontent.com/${TEMPLATE_REPO}/${TEMPLATE_BRANCH}/templates.json`;
const ZIP_BASE_URL = `https://raw.githubusercontent.com/${TEMPLATE_REPO}/${TEMPLATE_BRANCH}/templates/`;

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
    const req = https.get(url, { headers: { 'User-Agent': 'web-template-studio' } }, (res) => {
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
    backgroundColor: '#0b1020',
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
  templateRepo: TEMPLATE_REPO,
  branch: TEMPLATE_BRANCH,
  mappingUrl: MAPPING_URL,
  zipBaseUrl: ZIP_BASE_URL,
  workspace: path.join(os.homedir(), 'WebTemplateStudio'),
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

ipcMain.handle('node-status', async () => {
  const node = await execFileAsync('node', ['-v']);
  const npm = await execFileAsync('npm', ['-v']);
  return {
    node: node.error ? null : node.stdout.trim(),
    npm: npm.error ? null : npm.stdout.trim(),
    ok: !node.error && !npm.error,
  };
});

ipcMain.handle('node-install', async () => {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Auto-Install nur auf Windows (winget) unterstützt. Bitte Node.js LTS manuell von nodejs.org installieren.' };
  }
  const winget = await execFileAsync('winget', ['--version']);
  if (winget.error) return { ok: false, error: 'winget nicht gefunden. Bitte Node.js LTS manuell installieren.' };
  return new Promise((resolve) => {
    const p = spawn('winget', ['install', '--id', 'OpenJS.NodeJS.LTS', '-e', '--accept-source-agreements', '--accept-package-agreements'], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => {
      if (code === 0) resolve({ ok: true, log: out.slice(-2000) });
      else resolve({ ok: false, error: 'winget Exit-Code ' + code + '. Log: ' + out.slice(-1500) });
    });
    p.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
});

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

ipcMain.handle('workflow-install', async (_e, template, repoName) => {
  const logs = [];
  const log = (m) => logs.push(m);
  try {
    if (!template || !template.zip || !template.id) return { ok: false, logs, error: 'Ungültiges Template.' };
    repoName = String(repoName || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!repoName) return { ok: false, logs, error: 'Ungültiger Repo-Name.' };

    const token = readToken();
    if (!token) return { ok: false, logs, error: 'GitHub nicht verknüpft. Bitte zuerst anmelden (Schritt 1).' };
    const me = await githubApi('/user', token);
    if (me.status !== 200 || !me.json.login) return { ok: false, logs, error: 'GitHub-Token ungültig.' };
    const owner = me.json.login;
    log('✓ Angemeldet als ' + owner);

    // 1. Download
    const url = ZIP_BASE_URL + template.zip;
    const tmpZip = path.join(os.tmpdir(), 'wts-' + Date.now() + '-' + template.zip);
    log('⬇ Lade ' + url);
    await downloadToFile(url, tmpZip);
    log('✓ Download OK');

    // 2. Entpacken
    const target = path.join(os.homedir(), 'WebTemplateStudio', repoName);
    if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
      return { ok: false, logs, error: 'Zielordner existiert bereits: ' + target };
    }
    fs.mkdirSync(target, { recursive: true });
    new AdmZip(tmpZip).extractAllTo(target, true);
    try { fs.unlinkSync(tmpZip); } catch {}
    log('✓ Entpackt nach ' + target);

    // .temp-config prüfen
    const cfgPath = path.join(target, '.temp-config');
    if (fs.existsSync(cfgPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        log(`✓ .temp-config: ${cfg.name || template.name} v${cfg.version || '?'} (${cfg.type || '?'})`);
      } catch { log('! .temp-config konnte nicht geparst werden (ignoriert).'); }
    } else {
      log('! Keine .temp-config im Zip gefunden (trotzdem fortgefahren).');
    }

    // 3. Git init + commit
    const git = async (args) => {
      const r = await execFileAsync('git', args, { cwd: target });
      if (r.error) throw new Error('git ' + args.join(' ') + ' fehlgeschlagen: ' + (r.stderr || r.error.message).slice(0, 500));
      return r;
    };
    await git(['init']);
    await git(['add', '-A']);
    // identity fallback
    await execFileAsync('git', ['config', 'user.name', owner], { cwd: target });
    await execFileAsync('git', ['config', 'user.email', owner + '@users.noreply.github.com'], { cwd: target });
    await git(['commit', '-m', `chore: ${template.name} Template installieren`]);
    await git(['branch', '-M', 'main']);
    log('✓ Git-Repo lokal initialisiert');

    // 4. GitHub-Repo erstellen
    log('⬆ Erstelle GitHub-Repo ' + owner + '/' + repoName);
    const create = await githubApi('/user/repos', token, 'POST', {
      name: repoName, private: false, auto_init: false,
      description: (template.description || template.name || 'Website').slice(0, 200),
    });
    let repoUrl = `https://github.com/${owner}/${repoName}`;
    if (create.status === 201) {
      repoUrl = create.json.html_url || repoUrl;
      log('✓ Repo erstellt: ' + repoUrl);
    } else if (create.status === 422) {
      log('! Repo existiert bereits – nutze bestehendes: ' + repoUrl);
    } else {
      throw new Error('Repo-Erstellung fehlgeschlagen (HTTP ' + create.status + '): ' + JSON.stringify(create.json).slice(0, 500));
    }

    // 5. Push
    const remoteWithToken = `https://${token}@github.com/${owner}/${repoName}.git`;
    await git(['remote', 'remove', 'origin']).catch(() => {});
    await git(['remote', 'add', 'origin', remoteWithToken]);
    const push = await execFileAsync('git', ['push', '-u', 'origin', 'main'], { cwd: target, timeout: 60000 });
    // Token sofort wieder aus Remote entfernen
    await execFileAsync('git', ['remote', 'set-url', 'origin', `https://github.com/${owner}/${repoName}.git`], { cwd: target });
    if (push.error) throw new Error('git push fehlgeschlagen: ' + (push.stderr || push.error.message).slice(0, 800));
    log('✓ Gepusht nach main');

    // 6. Pages (nur bei html/static sinnvoll, sonst trotzdem versuchen)
    let pagesUrl = `https://${owner}.github.io/${repoName}/`;
    const isHtml = String(template.type || '').toLowerCase().includes('html') || String(template.type || '').toLowerCase().includes('static') || fs.existsSync(path.join(target, 'index.html'));
    if (isHtml) {
      log('⚙ Aktiviere GitHub Pages …');
      const pages = await githubApi(`/repos/${owner}/${repoName}/pages`, token, 'POST', {
        build_type: 'legacy', source: { branch: 'main', path: '/' },
      });
      if ([201, 202, 204].includes(pages.status)) {
        log('✓ Pages aktiviert: ' + pagesUrl);
      } else if (pages.status === 409 || pages.status === 422) {
        const info = await githubApi(`/repos/${owner}/${repoName}/pages`, token);
        if (info.json && info.json.html_url) pagesUrl = info.json.html_url;
        log('✓ Pages existierte bereits: ' + pagesUrl);
      } else {
        log('! Pages konnte nicht automatisch aktiviert werden (HTTP ' + pages.status + '). Manuell: Repo → Settings → Pages → main / root.');
      }
    } else {
      log('ℹ Kein statisches HTML-Template – Pages-Schritt übersprungen.');
    }

    return { ok: true, logs, localPath: target, repoUrl, pagesUrl };
  } catch (e) {
    return { ok: false, logs, error: e.message };
  }
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
