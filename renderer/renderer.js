const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const FALLBACK = [
  { id: 'test-template', name: 'Test Template', zip: 'test-template.zip', verified: true, version: '1.0.0', description: 'Minimaler HTML-Starter (Offline-Fallback).', author: 'Lokrogaming', updated: '2026-10-09', type: 'html', languages: ['HTML', 'CSS', 'JavaScript'], entry: 'index.html', deploy: ['github-pages'] },
];

let CFG = null;
let TEMPLATES = [];
let CURRENT = null;
let LAST_INSTALL_PATH = null;
let PREVIEW_PORT = null;
let PV_PORT = null;
let PV_TMP = null;
let VIEW = 'market';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get installs() { try { return JSON.parse(localStorage.getItem('sitesmith.installs') || '[]'); } catch { return []; } },
  add(i) { const l = store.installs; l.unshift(i); localStorage.setItem('sitesmith.installs', JSON.stringify(l.slice(0, 50))); },
};

function toast(msg, ms = 4000) {
  const el = $('#status');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}
const show = (id) => document.getElementById(id).classList.remove('hidden');
const hide = (id) => document.getElementById(id).classList.add('hidden');

const verifiedBadge = (t) => t.verified === true
  ? '<span class="badge-verified" title="Verifiziertes Template">✔ verifiziert</span>'
  : '<span class="badge-unverified" title="Nicht verifiziert">○ community</span>';

const previewUrl = (t) => (t.preview ? CFG.rawBaseUrl + t.preview : null);

const DEPLOY_LABEL = { 'github-pages': '▲ Pages-ready', 'vercel': '▲ Vercel', 'netlify': '▲ Netlify', 'node': '⬢ Node' };
const deployFlags = (t) => (t.deploy || []).map((d) => `<span class="flag">${esc(DEPLOY_LABEL[d] || d)}</span>`).join('');
const stackBadges = (t) => (t.languages || []).map((l) => `<span class="stack">${esc(l)}</span>`).join('');

// Placeholder-SVG (Data-URI), falls Template kein Preview-Bild hat
const placeholder = (t) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#18181B"/><text x="30" y="150" font-family="monospace" font-size="44" font-weight="bold" fill="#3F3F46">${esc((t.name || '?').slice(0, 18))}</text><text x="30" y="185" font-family="monospace" font-size="20" fill="#6366F1">SiteSmith · ${esc(t.id || '')}</text></svg>`);

async function loadTemplates() {
  CFG = await window.studio.getConfig();
  $('#repoLine').textContent = `Templates aus ${CFG.templateRepo} (${CFG.branch})`;
  try {
    const res = await fetch(CFG.mappingUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('templates.json ist kein Array');
    TEMPLATES = data;
  } catch (e) {
    TEMPLATES = FALLBACK;
    toast('Offline-Modus: templates.json nicht erreichbar (' + e.message + '). Zeige Fallback.');
  }
  renderGrid();
}

function filtered() {
  const q = ($('#search').value || '').toLowerCase();
  return TEMPLATES.filter((t) => (t.name + ' ' + (t.description || '') + ' ' + t.id).toLowerCase().includes(q));
}

function renderGrid() {
  const grid = $('#grid');
  grid.innerHTML = '';
  filtered().forEach((t) => {
    const img = previewUrl(t) || placeholder(t);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img class="card-img" loading="lazy" src="${img}" alt="${esc(t.name)}" onerror="this.src='${placeholder(t)}'" />
      <div class="card-body">
        <h3 class="card-title">${esc(t.name)} ${verifiedBadge(t)}</h3>
        <p class="desc">${esc(t.description || '')}</p>
        <div class="stacks">${stackBadges(t)}</div>
        <div class="deploy-flags">${deployFlags(t)}</div>
        <div class="card-meta">v${esc(t.version || '?')} · ${esc(t.type || '?')} · by ${esc(t.author || '?')}</div>
        <div class="card-actions">
          <button class="btn primary" data-act="install">Install Template</button>
          <button class="btn ghost" data-act="preview">Preview</button>
          <button class="btn ghost" data-act="more" title="Details">…</button>
        </div>
      </div>`;
    card.querySelector('[data-act="install"]').addEventListener('click', () => openUse(t));
    card.querySelector('[data-act="preview"]').addEventListener('click', () => cardPreview(t));
    card.querySelector('[data-act="more"]').addEventListener('click', () => openDetail(t));
    card.querySelector('.card-img').addEventListener('click', () => openDetail(t));
    grid.appendChild(card);
  });
  if (!grid.children.length) grid.innerHTML = '<p class="sub">Keine Templates gefunden.</p>';
}

// ---------- Views ----------
function setView(v) {
  VIEW = v;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  $('#view-market').classList.toggle('hidden', v !== 'market');
  $('#view-installed').classList.toggle('hidden', v !== 'installed');
  if (v === 'installed') renderInstalled();
}
function renderInstalled() {
  const list = $('#installedList');
  const items = store.installs;
  const c = $('#installedCount');
  c.textContent = items.length || '';
  c.classList.toggle('hidden', !items.length);
  list.innerHTML = '';
  if (!items.length) { list.innerHTML = '<p class="sub">Noch nichts installiert – per Workflow auf der Marketplace-Seite starten.</p>'; return; }
  items.forEach((it) => {
    const el = document.createElement('div');
    el.className = 'inst-item';
    el.innerHTML = `<div class="grow"><b>${esc(it.repoName)}</b> <span class="sub small">· ${esc(it.templateName)} · ${esc(it.at || '')}</span><br/><span class="path">${esc(it.localPath || '')}</span></div>`;
    const mk = (label, fn) => { const b = document.createElement('button'); b.className = 'btn ghost sm'; b.textContent = label; b.addEventListener('click', fn); el.appendChild(b); };
    if (it.localPath) mk('Ordner', () => window.studio.openFolder(it.localPath));
    if (it.repoUrl) mk('Repo', () => window.studio.openExternal(it.repoUrl));
    if (it.pagesUrl) mk('Pages', () => window.studio.openExternal(it.pagesUrl));
    if (it.localPath) mk('Preview', async () => {
      const r = await window.studio.previewStart(it.localPath);
      if (r.ok) openPvOverlay(it.repoName, r.url, r.port, null);
      else toast('Preview-Fehler: ' + r.error, 6000);
    });
    list.appendChild(el);
  });
}

// ---------- Nutzen-Modal ----------
function openUse(t) {
  CURRENT = t;
  $('#useName').textContent = t.name + ' · v' + (t.version || '?');
  show('useModal');
}
async function useZip() {
  if (!CURRENT) return;
  toast('Lade ' + CURRENT.zip + ' …');
  const r = await window.studio.downloadZip(CURRENT);
  toast(r.ok ? 'Gespeichert: ' + r.path + ' – bitte entpacken. Deploy-Anleitung siehe Detail-Panel.' : 'Download fehlgeschlagen: ' + r.error, 6000);
  hide('useModal');
}

// ---------- Detail-Panel ----------
function openDetail(t) {
  CURRENT = t;
  $('#dImg').src = previewUrl(t) || placeholder(t);
  $('#dImg').onerror = function () { this.src = placeholder(t); };
  $('#dName').textContent = t.name;
  $('#dVerified').innerHTML = verifiedBadge(t);
  $('#dDesc').textContent = t.description || '';
  $('#dStacks').innerHTML = stackBadges(t);
  $('#dDeploy').innerHTML = deployFlags(t);
  const rows = [
    ['Art / Typ', t.type], ['Sprachen', (t.languages || []).join(', ')],
    ['Version', t.version], ['Author', t.author], ['Latest updated', t.updated],
    ['Zip im Repo', 'templates/' + t.zip], ['Entry', t.entry || 'index.html'],
    ['Verifiziert', t.verified === true ? 'ja (verified: true im Mapping)' : 'nein'],
  ];
  $('#dBody').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v || '–')}</dd>`).join('');
  refreshGhMini();
  show('detailPanel');
}
async function refreshGhMini() {
  const s = await window.studio.githubStatus();
  $('#dGh').textContent = s.connected ? `Verbunden als ${s.user.login} – Workflow kann Repos erstellen.` : 'Nicht verbunden – im Workflow-Schritt 1 anmelden.';
}

// ---------- Card-Preview ----------
async function cardPreview(t) {
  $('#pvTitle').textContent = 'Preview: ' + t.name;
  $('#pvUrl').textContent = 'lädt …';
  show('pvModal');
  const r = await window.studio.previewTemplate(t);
  if (!r.ok) { $('#pvUrl').textContent = 'Fehler: ' + r.error; return; }
  PV_PORT = r.port; PV_TMP = r.tmpPath;
  $('#pvUrl').textContent = r.url;
  $('#pvView').src = r.url;
}
async function closePv() {
  if (PV_PORT != null) await window.studio.previewTemplateStop(PV_PORT, PV_TMP);
  PV_PORT = null; PV_TMP = null;
  try { $('#pvView').src = 'about:blank'; } catch {}
  hide('pvModal');
}
function openPvOverlay(title, url, port, tmp) {
  $('#pvTitle').textContent = 'Preview: ' + title;
  $('#pvUrl').textContent = url;
  PV_PORT = port; PV_TMP = tmp;
  show('pvModal');
  $('#pvView').src = url;
}

// ---------- Workflow ----------
async function openFlow() {
  hide('useModal');
  $('#fTitle').textContent = 'Workflow: ' + (CURRENT ? CURRENT.name : '');
  $('#flowLog').textContent = '';
  $('#flowLinks').innerHTML = '';
  $('#previewUrl').textContent = '';
  $('#previewView').classList.add('hidden');
  $('#previewStopBtn').classList.add('hidden');
  $('#previewBtn').disabled = true;
  LAST_INSTALL_PATH = null; PREVIEW_PORT = null;
  $('#repoInput').value = (CURRENT ? CURRENT.id + '-website' : 'meine-website').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  show('flowModal');
  await refreshGh();
  await refreshNode();
}
function paintGh(s) {
  const side = $('#ghSide');
  if (s.connected) { side.textContent = 'GH: ' + s.user.login; side.className = 'side-status ok'; }
  else { side.textContent = 'GitHub: nicht verbunden'; side.className = 'side-status bad'; }
}
async function refreshGh() {
  $('#ghState').textContent = 'Prüfe GitHub-Verknüpfung …';
  const s = await window.studio.githubStatus();
  paintGh(s);
  $('#accountBtn').textContent = s.connected ? (s.user.login || '?').slice(0, 2).toUpperCase() : '⋯';
  if (s.connected) {
    $('#ghState').innerHTML = `✓ Verbunden als <b>${esc(s.user.login)}</b>${s.ghCli ? ' (gh CLI erkannt)' : ''}`;
    $('#ghLoginBox').classList.add('hidden');
    $('#ghLogout').classList.remove('hidden');
  } else {
    $('#ghState').textContent = '✗ Nicht verbunden. ' + (s.hint || '');
    $('#ghLoginBox').classList.remove('hidden');
    $('#ghLogout').classList.add('hidden');
  }
  return s;
}
async function refreshNode() {
  $('#nodeState').textContent = 'Prüfe Node.js & npm …';
  const s = await window.studio.nodeStatus();
  const side = $('#nodeSide');
  if (s.ok) {
    side.textContent = `Node ${s.node} · npm ${s.npm}`;
    side.className = 'side-status ok';
    $('#nodeState').textContent = `✓ Gefunden: node ${s.node}, npm ${s.npm}`;
    $('#nodeInstallBtn').classList.add('hidden');
  } else {
    side.textContent = 'Node: fehlt';
    side.className = 'side-status bad';
    $('#nodeState').textContent = `✗ Node.js/npm nicht gefunden. Für HTML-Preview optional, für Node-Templates Pflicht.`;
    $('#nodeInstallBtn').classList.remove('hidden');
  }
  return s;
}
async function runInstall() {
  if (!CURRENT) return;
  const repoName = $('#repoInput').value.trim();
  $('#installBtn').disabled = true;
  $('#flowLog').textContent = 'Starte …\n';
  const r = await window.studio.workflowInstall(CURRENT, repoName);
  (r.logs || []).forEach((l) => { $('#flowLog').textContent += l + '\n'; });
  if (r.ok) {
    $('#flowLog').textContent += '✓ Fertig!\n';
    $('#flowLinks').innerHTML = '';
    const mk = (label, url) => { const b = document.createElement('button'); b.className = 'btn ghost sm'; b.textContent = label; b.addEventListener('click', () => window.studio.openExternal(url)); return b; };
    if (r.repoUrl) $('#flowLinks').appendChild(mk('GitHub-Repo öffnen', r.repoUrl));
    if (r.pagesUrl) $('#flowLinks').appendChild(mk('Pages-Seite öffnen', r.pagesUrl));
    const ordner = document.createElement('button');
    ordner.className = 'btn ghost sm'; ordner.textContent = 'Ordner öffnen';
    ordner.addEventListener('click', () => window.studio.openFolder(r.localPath));
    $('#flowLinks').appendChild(ordner);
    store.add({ repoName, templateName: CURRENT.name, localPath: r.localPath, repoUrl: r.repoUrl, pagesUrl: r.pagesUrl, at: new Date().toLocaleString('de-DE') });
    const c = $('#installedCount'); c.textContent = store.installs.length; c.classList.remove('hidden');
    LAST_INSTALL_PATH = r.localPath;
    $('#previewBtn').disabled = false;
    toast('Installation erfolgreich.');
  } else {
    $('#flowLog').textContent += '✗ Fehler: ' + (r.error || 'unbekannt') + '\n';
    toast('Installation fehlgeschlagen: ' + (r.error || ''), 6000);
  }
  $('#installBtn').disabled = false;
}
async function startPreview() {
  if (!LAST_INSTALL_PATH) return;
  $('#previewBtn').disabled = true;
  const r = await window.studio.previewStart(LAST_INSTALL_PATH);
  if (!r.ok) { toast('Preview-Fehler: ' + r.error, 6000); $('#previewBtn').disabled = false; return; }
  PREVIEW_PORT = r.port;
  $('#previewUrl').textContent = r.url + (r.note ? ' — ' + r.note : '');
  const wv = $('#previewView');
  wv.classList.remove('hidden');
  wv.src = r.url;
  $('#previewStopBtn').classList.remove('hidden');
  toast('Preview läuft: ' + r.url);
}
async function stopPreview() {
  if (PREVIEW_PORT != null) await window.studio.previewStop(PREVIEW_PORT);
  PREVIEW_PORT = null;
  $('#previewView').classList.add('hidden');
  $('#previewStopBtn').classList.add('hidden');
  $('#previewBtn').disabled = false;
  $('#previewUrl').textContent = '';
}

// ---------- Events ----------
document.addEventListener('DOMContentLoaded', () => {
  loadTemplates();
  refreshGh(); refreshNode();
  $('#search').addEventListener('input', () => { if (VIEW === 'market') renderGrid(); });
  $('#refreshBtn').addEventListener('click', loadTemplates);
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#accountBtn').addEventListener('click', async () => { await openFlow(); });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.close === 'pvModal') closePv();
    else hide(b.dataset.close);
  }));
  document.querySelectorAll('.overlay').forEach((o) => o.addEventListener('click', (e) => {
    if (e.target === o) { if (o.id === 'pvModal') closePv(); else o.classList.add('hidden'); }
  }));

  $('#useWorkflowBtn').addEventListener('click', openFlow);
  $('#useZipBtn').addEventListener('click', useZip);
  $('#dInstallBtn').addEventListener('click', () => openUse(CURRENT));
  $('#dZipBtn').addEventListener('click', () => useZip());

  $('#tokenSave').addEventListener('click', async () => {
    const t = $('#tokenInput').value.trim();
    if (!t) return toast('Bitte Token einfügen.');
    const r = await window.studio.githubSaveToken(t);
    if (r.ok) { $('#tokenInput').value = ''; toast('Angemeldet als ' + r.user.login); }
    else toast('Anmeldung fehlgeschlagen: ' + r.error, 6000);
    refreshGh();
  });
  $('#ghLogout').addEventListener('click', async () => { await window.studio.githubLogout(); refreshGh(); });
  $('#nodeInstallBtn').addEventListener('click', async () => {
    toast('Installiere Node.js LTS via winget … (kann dauern)');
    const r = await window.studio.nodeInstall();
    toast(r.ok ? 'Node-Installation angestoßen – App/PC ggf. neu starten, dann erneut prüfen.' : 'Auto-Install fehlgeschlagen: ' + r.error, 6000);
    setTimeout(refreshNode, 3000);
  });
  $('#installBtn').addEventListener('click', runInstall);
  $('#previewBtn').addEventListener('click', startPreview);
  $('#previewStopBtn').addEventListener('click', stopPreview);
});
