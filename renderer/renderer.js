const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const FALLBACK = [
  { id: 'test-template', name: 'Test Template', zip: 'test-template.zip', verified: true, version: '1.0.0', description: 'Minimaler HTML-Starter (Offline-Fallback).', author: 'Lokrogaming', updated: '2026-10-09', type: 'html', languages: ['HTML', 'CSS', 'JavaScript'], entry: 'index.html', deploy: ['github-pages'] },
];

let CFG = null;
let TEMPLATES = [];
let CURRENT = null;
let VIEW = 'market';
let GH = { connected: false };
let NODE = { ok: false };
let LAST_INSTALL = null;
let PV = { port: null, tmp: null };
let LAST_FOCUS = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = () => { try { if (window.lucide) window.lucide.createIcons(); } catch {} };
const show = (id) => document.getElementById(id).classList.remove('hidden');
const hide = (id) => document.getElementById(id).classList.add('hidden');

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

function openOverlay(id) {
  LAST_FOCUS = document.activeElement;
  show(id);
  const dlg = document.getElementById(id).querySelector('[role=dialog], .modal');
  const f = document.getElementById(id).querySelector('input:not([disabled]), button:not([disabled])');
  if (f) setTimeout(() => f.focus(), 30);
  icons();
}
function closeOverlay(id) {
  hide(id);
  if (LAST_FOCUS && LAST_FOCUS.focus) try { LAST_FOCUS.focus(); } catch {}
}

// ---------- Badges / Bilder ----------
const verifiedBadge = (t) => t.verified === true
  ? '<span class="badge-verified"><i data-lucide="badge-check"></i>verifiziert</span>'
  : '<span class="badge-unverified"><i data-lucide="info"></i>community</span>';
const previewUrl = (t) => (t.preview ? CFG.rawBaseUrl + t.preview : null);
const DEPLOY_LABEL = { 'github-pages': 'Pages-ready', 'vercel': 'Vercel', 'netlify': 'Netlify', 'node': 'Node' };
const deployFlags = (t) => (t.deploy || []).map((d) => `<span class="flag"><i data-lucide="globe"></i>${esc(DEPLOY_LABEL[d] || d)}</span>`).join('');
const stackBadges = (t) => (t.languages || []).map((l) => `<span class="stack">${esc(l)}</span>`).join('');
const placeholder = (t) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#2a2d36"/><text x="30" y="150" font-family="monospace" font-size="42" font-weight="bold" fill="#6d7280">${esc((t.name || '?').slice(0, 18))}</text><text x="30" y="185" font-family="monospace" font-size="20" fill="#1bd96a">SiteSmith · ${esc(t.id || '')}</text></svg>`);
const needsNodeGuess = (t) => /node|npm/i.test(String(t.type || ''));
const isHtmlGuess = (t) => /html|static/i.test(String(t.type || '')) || (t.entry || '').endsWith('.html');

// ---------- Templates laden ----------
async function loadTemplates() {
  CFG = await window.studio.getConfig();
  $('#repoLine').textContent = `Templates aus ${CFG.templateRepo} (${CFG.branch})`;
  const grid = $('#grid');
  const state = $('#gridState');
  grid.innerHTML = '';
  state.classList.add('hidden');
  grid.innerHTML = Array.from({ length: 6 }).map(() => '<div class="skel"><div class="img"></div><div class="ln"></div><div class="ln w60"></div></div>').join('');
  try {
    const res = await fetch(CFG.mappingUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unerwartetes Format.');
    TEMPLATES = data;
    if (!TEMPLATES.length) {
      grid.innerHTML = '';
      state.classList.remove('hidden');
      state.innerHTML = '<i data-lucide="package"></i><b>Keine Templates gefunden</b><span>Das Mapping ist leer.</span>';
      icons();
      return;
    }
  } catch (e) {
    grid.innerHTML = '';
    state.classList.remove('hidden');
    const offline = !navigator.onLine;
    state.innerHTML = `<i data-lucide="${offline ? 'wifi-off' : 'triangle-alert'}"></i><b>${offline ? 'Offline' : 'Templates konnten nicht geladen werden'}</b><span>${esc(e.message)} – prüfe die Internetverbindung.</span><button class="btn ghost sm" id="retryLoad"><i data-lucide="refresh-cw"></i>Erneut versuchen</button>`;
    icons();
    const rb = $('#retryLoad');
    if (rb) rb.addEventListener('click', loadTemplates);
    TEMPLATES = [];
    return;
  }
  renderGrid();
}

function renderGrid() {
  const q = ($('#search').value || '').toLowerCase();
  const grid = $('#grid');
  const state = $('#gridState');
  grid.innerHTML = '';
  const list = TEMPLATES.filter((t) => (t.name + ' ' + (t.description || '') + ' ' + t.id).toLowerCase().includes(q));
  if (!list.length) {
    state.classList.remove('hidden');
    state.innerHTML = '<i data-lucide="search"></i><b>Nichts gefunden</b><span>Suchbegriff anpassen oder Filter zurücksetzen.</span>';
    icons();
    return;
  }
  state.classList.add('hidden');
  list.forEach((t) => {
    const img = previewUrl(t) || placeholder(t);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img class="card-img" loading="lazy" src="${img}" alt="Vorschau: ${esc(t.name)}" />
      <div class="card-body">
        <h3 class="card-title">${esc(t.name)} ${verifiedBadge(t)}</h3>
        <p class="desc">${esc(t.description || '')}</p>
        <div class="stacks">${stackBadges(t)}</div>
        <div class="deploy-flags">${deployFlags(t)}</div>
        <div class="card-meta">v${esc(t.version || '?')} · ${esc(t.type || '?')} · by ${esc(t.author || '?')}</div>
        <div class="card-actions">
          <button class="btn primary" data-act="install"><i data-lucide="package"></i>Install Template</button>
          <button class="btn ghost icon" data-act="preview" title="Live-Preview starten" aria-label="Live-Preview für ${esc(t.name)} starten"><i data-lucide="eye"></i></button>
          <button class="btn ghost icon" data-act="more" title="Details ansehen" aria-label="Details für ${esc(t.name)} ansehen"><i data-lucide="info"></i></button>
        </div>
      </div>`;
    card.querySelector('[data-act="install"]').addEventListener('click', (ev) => openInstall(t, ev.target.closest('button')));
    card.querySelector('[data-act="preview"]').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b.disabled) return; cardPreview(t, b); });
    card.querySelector('[data-act="more"]').addEventListener('click', () => openDetail(t));
    const im = card.querySelector('.card-img');
    im.addEventListener('click', () => openDetail(t));
    im.addEventListener('error', function () { this.src = placeholder(t); });
    grid.appendChild(card);
  });
  icons();
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
  if (!items.length) {
    list.innerHTML = '<div class="state"><i data-lucide="hard-drive"></i><b>Noch nichts installiert</b><span>Starte im Marketplace eine Installation.</span></div>';
    icons();
    return;
  }
  items.forEach((it) => {
    const el = document.createElement('div');
    el.className = 'inst-item';
    el.innerHTML = `<div class="grow"><b>${esc(it.repoName)}</b> <span class="sub small">· ${esc(it.templateName)} · ${esc(it.at || '')}</span><br/><span class="path">${esc(it.localPath || '')}</span></div>`;
    const mk = (icon, label, title, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ghost sm'; b.title = title;
      b.innerHTML = `<i data-lucide="${icon}"></i>${label}`;
      b.addEventListener('click', fn);
      el.appendChild(b);
    };
    if (it.localPath) mk('folder-open', 'Ordner', 'Ordner im Explorer öffnen', () => window.studio.openFolder(it.localPath));
    if (it.repoUrl) mk('external-link', 'Repo', 'GitHub-Repo im Browser öffnen', () => window.studio.openExternal(it.repoUrl));
    if (it.pagesUrl) mk('globe', 'Pages', 'Veröffentlichte Seite öffnen', () => window.studio.openExternal(it.pagesUrl));
    if (it.localPath) mk('eye', 'Preview', 'Lokale Preview starten', async () => {
      const r = await window.studio.previewStart(it.localPath);
      if (r.ok) openPv(it.repoName, r.url, r.port, null);
      else toast('Preview-Fehler: ' + r.error, 6000);
    });
    list.appendChild(el);
  });
  icons();
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
  $('#dGh').textContent = GH.connected ? `Verbunden als ${GH.user.login} – Repo-Erstellung möglich.` : 'Nicht verbunden – Anmeldung erfolgt bei Bedarf im Install-Dialog.';
  show('detailPanel');
  icons();
}

// ---------- Status ----------
function paintGh(s) {
  GH = s.connected ? { connected: true, user: s.user } : { connected: false };
  const side = $('#ghSide');
  side.querySelector('span').textContent = s.connected ? 'GitHub: ' + s.user.login : 'GitHub: nicht verbunden';
  side.classList.toggle('ok', s.connected);
  side.classList.toggle('bad', !s.connected);
  $('#accountBtn').textContent = s.connected ? (s.user.login || '?').slice(0, 2).toUpperCase() : '?';
}
async function refreshGh() {
  const s = await window.studio.githubStatus();
  paintGh(s);
  return s;
}
function paintNode(s) {
  NODE = s;
  const side = $('#nodeSide');
  const label = s.ok ? `Node ${s.node}${s.npm ? ' · npm ' + s.npm : ''}${s.source === 'bundled' ? ' (App)' : ''}`
    : (s.source === 'system' && s.tooOld) ? `Node ${s.node || '?'} zu alt (min. v${s.minMajor})` : 'Node: fehlt – einrichten';
  side.querySelector('span').textContent = label;
  side.classList.toggle('ok', !!s.ok);
  side.classList.toggle('warn', !s.ok);
  side.classList.toggle('bad', false);
}
async function refreshNode() {
  const s = await window.studio.nodeStatus();
  paintNode(s);
  return s;
}

// ---------- Card-Preview ----------
async function cardPreview(t, btn) {
  if (PV.port != null) return;
  if (btn) btn.disabled = true;
  $('#pvTitle').textContent = 'Preview: ' + t.name;
  $('#pvUrl').textContent = 'lädt …';
  openOverlay('pvModal');
  const r = await window.studio.previewTemplate(t);
  if (btn) btn.disabled = false;
  if (!r.ok) { $('#pvUrl').textContent = 'Fehler: ' + r.error + ' – prüfe die Internetverbindung und versuche es erneut.'; return; }
  PV = { port: r.port, tmp: r.tmpPath };
  $('#pvUrl').textContent = r.url;
  $('#pvView').src = r.url;
}
async function closePv() {
  if (PV.port != null) await window.studio.previewTemplateStop(PV.port, PV.tmp);
  PV = { port: null, tmp: null };
  try { $('#pvView').src = 'about:blank'; } catch {}
  closeOverlay('pvModal');
}
function openPv(title, url, port, tmp) {
  $('#pvTitle').textContent = 'Preview: ' + title;
  $('#pvUrl').textContent = url;
  PV = { port, tmp };
  openOverlay('pvModal');
  $('#pvView').src = url;
}

// ---------- Install-Dialog ----------
const INST_STEPS = [
  ['download', 'Template herunterladen'], ['extract', 'Entpacken'], ['deps', 'Abhängigkeiten (npm)'],
  ['readme', 'README schreiben'], ['git', 'Lokales Git-Repo'], ['repo', 'GitHub-Repo erstellen'],
  ['push', 'Pushen'], ['pages', 'Pages verknüpfen'],
];
let INST = null;

function stepIcon(st) {
  if (st === 'done') return '<i data-lucide="check"></i>';
  if (st === 'error') return '<i data-lucide="x"></i>';
  if (st === 'running') return '<i data-lucide="loader" class="spin"></i>';
  if (st === 'skip') return '<i data-lucide="chevron-right"></i>';
  return '<i data-lucide="info"></i>';
}
function renderInstSteps(states) {
  $('#instSteps').innerHTML = INST_STEPS.filter(([id]) => !INST.skip.has(id)).map(([id, label]) =>
    `<li data-s="${states[id] || 'pending'}"><span class="st">${stepIcon(states[id] || 'pending')}</span><span class="lbl">${label}</span></li>`).join('');
  icons();
}
function instStage(name) {
  ['Config', 'Auth', 'Node', 'Progress', 'Result'].forEach((s) => $('#instStage' + s).classList.toggle('hidden', s !== name));
}

function openInstall(t) {
  CURRENT = t;
  INST = { busy: false, skip: new Set(), states: {}, opts: null, unsub: null };
  $('#instTitle').textContent = 'Template installieren';
  $('#instTemplate').textContent = `${t.name} · v${t.version || '?'} · ${t.type || '?'}`;
  $('#repoInput').value = (t.id + '-website').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60);
  $('#targetInput').value = CFG.workspace;
  $('#optRepo').checked = true;
  $('#optPages').checked = isHtmlGuess(t);
  $('#optReadme').checked = true;
  $('#instLog').textContent = '';
  updatePrereqHint();
  instStage('Config');
  openOverlay('installDialog');
}
function updatePrereqHint() {
  const box = $('#instPrereqHint');
  const hints = [];
  if ($('#optRepo').checked && !GH.connected) hints.push('GitHub noch nicht verbunden – Anmeldung erfolgt im nächsten Schritt.');
  if (needsNodeGuess(CURRENT) && !NODE.ok) hints.push(`Node.js wird benötigt (${NODE.source === 'system' && NODE.tooOld ? 'Update nötig' : 'fehlt'}) – Einrichtung erfolgt im nächsten Schritt.`);
  box.classList.toggle('hidden', !hints.length);
  box.textContent = hints.join(' ');
}
async function useZipOnly() {
  if (!CURRENT || INST.busy) return;
  INST.busy = true;
  $('#instZipBtn').disabled = true;
  toast('Lade ' + CURRENT.zip + ' …');
  const r = await window.studio.downloadZip(CURRENT);
  INST.busy = false;
  $('#instZipBtn').disabled = false;
  if (r.ok) {
    toast('Gespeichert: ' + r.path + ' – bitte entpacken. Deploy-Anleitung siehe Detail-Panel.', 6000);
    closeOverlay('installDialog');
  } else {
    toast('Download fehlgeschlagen: ' + r.error + ' – Internetverbindung prüfen und erneut versuchen.', 6000);
  }
}

async function instStart() {
  if (INST.busy) return;
  const repoName = $('#repoInput').value.trim();
  if (!/^[a-z0-9._-]{1,60}$/.test(repoName)) {
    toast('Ungültiger Repository-Name – nur Kleinbuchstaben, Zahlen, . _ - (max. 60 Zeichen).', 6000);
    $('#repoInput').focus();
    return;
  }
  // Status live prüfen (Token kann abgelaufen, Node deinstalliert worden sein)
  $('#instStartBtn').disabled = true;
  await refreshGh();
  await refreshNode();
  $('#instStartBtn').disabled = false;
  const targetDir = $('#targetInput').value.trim() || CFG.workspace;
  INST.opts = { targetDir, createRepo: $('#optRepo').checked, pages: $('#optPages').checked, readme: $('#optReadme').checked, repoName };
  // Kontext-Prereqs
  if (INST.opts.createRepo && !GH.connected) { instStage('Auth'); return; }
  if (needsNodeGuess(CURRENT) && !NODE.ok) { instStage('Node'); return; }
  runInstall();
}

async function instAuthDone() {
  await refreshGh();
  if (!GH.connected) { toast('Noch nicht verbunden – bitte Anmeldung abschließen.', 5000); return; }
  if (needsNodeGuess(CURRENT) && !NODE.ok) { instStage('Node'); return; }
  runInstall();
}

async function runInstall() {
  INST.busy = true;
  INST.states = {};
  INST.skip = new Set();
  if (!needsNodeGuess(CURRENT)) INST.skip.add('deps');
  if (!INST.opts.readme) INST.skip.add('readme');
  if (!INST.opts.createRepo) { INST.skip.add('repo'); INST.skip.add('push'); INST.skip.add('pages'); }
  else if (!INST.opts.pages || !isHtmlGuess(CURRENT)) INST.skip.add('pages');
  instStage('Progress');
  renderInstSteps(INST.states);
  $('#instLog').textContent = '';
  $('#instCancelBtn').disabled = false;
  INST.unsub = window.studio.onInstallProgress((p) => {
    if (p.step === 'log') {
      $('#instLog').textContent += p.log + '\n';
      $('#instLog').scrollTop = 1e6;
      return;
    }
    INST.states[p.step] = p.status;
    renderInstSteps(INST.states);
  });
  const r = await window.studio.workflowInstall(CURRENT, INST.opts.repoName, INST.opts);
  if (INST.unsub) { INST.unsub(); INST.unsub = null; }
  INST.busy = false;
  showInstallResult(r);
}

function showInstallResult(r) {
  INST_STEPS.forEach(([id]) => { if (!INST.skip.has(id) && !INST.states[id]) { INST.states[id] = r.ok ? 'done' : 'pending'; } });
  renderInstSteps(INST.states);
  instStage('Result');
  const box = $('#instResult');
  const links = $('#instLinks');
  links.innerHTML = '';
  $('#instRetryBtn').classList.toggle('hidden', r.ok || r.cancelled);
  if (r.ok) {
    box.className = 'result ok';
    box.innerHTML = `<i data-lucide="circle-check"></i><div><b>Installation erfolgreich</b><p>${esc(INST.opts.repoName)} ist bereit.${r.repoUrl ? '' : ' (nur lokal)'}</p></div>`;
    $('#instResultLog').classList.add('hidden');
    const mk = (icon, label, title, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ghost sm'; b.title = title;
      b.innerHTML = `<i data-lucide="${icon}"></i>${label}`;
      b.addEventListener('click', fn);
      links.appendChild(b);
    };
    if (r.localPath) mk('folder-open', 'Ordner', 'Ordner im Explorer öffnen', () => window.studio.openFolder(r.localPath));
    if (r.repoUrl) mk('external-link', 'Repo', 'GitHub-Repo im Browser öffnen', () => window.studio.openExternal(r.repoUrl));
    if (r.pagesUrl) mk('globe', 'Pages', 'Veröffentlichte Seite öffnen', () => window.studio.openExternal(r.pagesUrl));
    if (r.localPath) mk('eye', 'Preview', 'Lokale Preview starten', async () => {
      const p = await window.studio.previewStart(r.localPath);
      if (p.ok) openPv(INST.opts.repoName, p.url, p.port, null);
      else toast('Preview-Fehler: ' + p.error, 6000);
    });
    store.add({ repoName: INST.opts.repoName, templateName: CURRENT.name, localPath: r.localPath, repoUrl: r.repoUrl, pagesUrl: r.pagesUrl, at: new Date().toLocaleString('de-DE') });
    const c = $('#installedCount'); c.textContent = store.installs.length; c.classList.remove('hidden');
    LAST_INSTALL = r.localPath;
    toast('Installation erfolgreich.');
  } else if (r.cancelled) {
    box.className = 'result';
    box.innerHTML = `<i data-lucide="info"></i><div><b>Abgebrochen</b><p>Der Vorgang wurde gestoppt. Bereits angelegte Dateien bleiben bestehen.</p></div>`;
    $('#instResultLog').classList.add('hidden');
  } else {
    box.className = 'result err';
    box.innerHTML = `<i data-lucide="circle-x"></i><div><b>Installation fehlgeschlagen</b><p>${esc(r.error || 'Unbekannter Fehler.')}</p>${r.next ? `<p><b>Nächster Schritt:</b> ${esc(r.next)}</p>` : ''}</div>`;
    const lg = $('#instResultLog');
    lg.classList.remove('hidden');
    lg.textContent = (r.logs || []).join('\n');
  }
  icons();
}

async function instCancel() {
  if (!INST.busy) { closeOverlay('installDialog'); return; }
  $('#instCancelBtn').disabled = true;
  await window.studio.installCancel();
}

// ---------- Node-Setup ----------
const SETUP_STEPS = [
  ['check', 'Vorhandene Installation prüfen'], ['version', 'LTS-Version ermitteln'],
  ['download', 'Herunterladen (nodejs.org)'], ['extract', 'Entpacken'], ['verify', 'Prüfen'], ['done', 'Fertig'],
];
let SETUP = { busy: false, unsub: null, auto: false };
function renderSetupSteps(states) {
  $('#setupSteps').innerHTML = SETUP_STEPS.map(([id, label]) =>
    `<li data-s="${states[id] || 'pending'}"><span class="st">${stepIcon(states[id] || 'pending')}</span><span class="lbl">${label}</span></li>`).join('');
  icons();
}
function openSetup(auto) {
  SETUP = { busy: false, unsub: SETUP.unsub, auto: !!auto };
  renderSetupSteps({});
  $('#setupProgressWrap').classList.add('hidden');
  $('#setupProgress').style.width = '0';
  $('#setupStatus').textContent = '';
  $('#setupError').classList.add('hidden');
  $('#setupRetry').classList.add('hidden');
  $('#setupStart').classList.remove('hidden');
  $('#setupLater').textContent = auto ? 'Später' : 'Schließen';
  openOverlay('setupOverlay');
}
function closeSetup() {
  if (SETUP.busy) return;
  if (SETUP.unsub) { SETUP.unsub(); SETUP.unsub = null; }
  closeOverlay('setupOverlay');
}
async function setupRun() {
  if (SETUP.busy) return;
  SETUP.busy = true;
  $('#setupStart').classList.add('hidden');
  $('#setupRetry').classList.add('hidden');
  $('#setupLater').disabled = true;
  $('#setupClose').disabled = true;
  $('#setupError').classList.add('hidden');
  const states = {};
  renderSetupSteps(states);
  $('#setupProgressWrap').classList.remove('hidden');
  if (SETUP.unsub) SETUP.unsub();
  SETUP.unsub = window.studio.onNodeSetup((p) => {
    states[p.step] = p.status === 'done' ? 'done' : p.status === 'error' ? 'error' : 'running';
    if (p.step === 'done') SETUP_STEPS.forEach(([id]) => { if (!states[id]) states[id] = 'done'; });
    renderSetupSteps(states);
    if (p.percent != null) $('#setupProgress').style.width = p.percent + '%';
    if (p.detail) $('#setupStatus').textContent = p.detail;
  });
  const r = await window.studio.nodeSetupStart();
  SETUP.busy = false;
  $('#setupLater').disabled = false;
  $('#setupClose').disabled = false;
  if (r.ok) {
    $('#setupProgress').style.width = '100%';
    $('#setupStatus').textContent = `Bereit: Node ${r.node}${r.npm ? ' · npm ' + r.npm : ''}${r.reused ? ' (wiederverwendet)' : ''}.`;
    $('#setupStart').classList.add('hidden');
    $('#setupLater').textContent = 'Fertig';
    await refreshNode();
    toast('Node.js bereit.');
    // Falls das Setup aus dem Install-Dialog kam: automatisch fortfahren
    if (!$('#installDialog').classList.contains('hidden') && INST && !INST.busy) {
      closeSetup();
      toast('Setze Installation fort …');
      runInstall();
      return;
    }
  } else if (r.cancelled) {
    $('#setupStatus').textContent = 'Abgebrochen.';
    $('#setupRetry').classList.remove('hidden');
    $('#setupStart').classList.remove('hidden');
  } else {
    const eb = $('#setupError');
    eb.classList.remove('hidden');
    eb.innerHTML = `<b>Schritt „${esc(r.step || '?')}“ fehlgeschlagen:</b> ${esc(r.error || '')}${r.next ? `<p class="next"><b>Nächster Schritt:</b> ${esc(r.next)}</p>` : ''}`;
    $('#setupRetry').classList.remove('hidden');
    $('#setupStart').classList.add('hidden');
    icons();
  }
}

// ---------- Konto-Dialog (Sidebar/Topbar) ----------
async function openAccount() {
  const s = await refreshGh();
  $('#accState').textContent = s.connected
    ? `Verbunden als ${s.user.login} – Repo-Erstellung, Push und Pages sind möglich.`
    : 'Nicht verbunden. Melde dich an, damit SiteSmith Repos erstellen kann.';
  $('#accLogin').classList.toggle('hidden', s.connected);
  $('#accLogout').classList.toggle('hidden', !s.connected);
  const ob = $('#accOauthBtn');
  if (ob) ob.classList.toggle('hidden', !(CFG && CFG.oauthConfigured));
  openOverlay('accountDialog');
}

// ---------- Events ----------
document.addEventListener('DOMContentLoaded', () => {
  icons();
  init();
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#search').addEventListener('input', () => { if (VIEW === 'market' && TEMPLATES.length) renderGrid(); });
  $('#refreshBtn').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b.dataset.busy) return;
    b.dataset.busy = '1';
    loadTemplates().finally(() => { delete b.dataset.busy; });
  });
  $('#accountBtn').addEventListener('click', openAccount);
  $('#ghSide').addEventListener('click', openAccount);
  $('#nodeSide').addEventListener('click', () => openSetup(false));

  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.close;
    if (id === 'pvModal') closePv();
    else if (id === 'installDialog') { if (!INST || !INST.busy) closeOverlay(id); }
    else closeOverlay(id);
  }));
  document.querySelectorAll('.overlay').forEach((o) => o.addEventListener('click', (e) => {
    if (e.target !== o) return;
    if (o.id === 'pvModal') closePv();
    else if (o.id === 'installDialog') { if (!INST || !INST.busy) closeOverlay(o.id); }
    else if (o.id === 'setupOverlay') closeSetup();
    else closeOverlay(o.id);
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const open = ['installDialog', 'setupOverlay', 'accountDialog', 'pvModal'].find((id) => !document.getElementById(id).classList.contains('hidden'));
      if (open) {
        const els = Array.from(document.getElementById(open).querySelectorAll('button:not([disabled]), input:not([disabled]), summary')).filter((el) => el.offsetParent !== null);
        if (els.length) {
          const first = els[0], last = els[els.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      return;
    }
    if (e.key !== 'Escape') return;
    if (!$('#pvModal').classList.contains('hidden')) closePv();
    else if (!$('#accountDialog').classList.contains('hidden')) closeOverlay('accountDialog');
    else if (!$('#installDialog').classList.contains('hidden')) { if (!INST || !INST.busy) closeOverlay('installDialog'); }
    else if (!$('#setupOverlay').classList.contains('hidden')) closeSetup();
    else if (!$('#detailPanel').classList.contains('hidden')) closeOverlay('detailPanel');
  });

  // Install-Dialog
  ['optRepo', 'optPages', 'optReadme'].forEach((id) => document.getElementById(id).addEventListener('change', updatePrereqHint));
  $('#instStartBtn').addEventListener('click', instStart);
  $('#instZipBtn').addEventListener('click', useZipOnly);
  $('#targetBrowse').addEventListener('click', async () => {
    const r = await window.studio.pickFolder($('#targetInput').value.trim() || CFG.workspace);
    if (r.ok) $('#targetInput').value = r.path;
  });
  $('#instOauthBtn').addEventListener('click', async () => {
    const b = $('#instOauthBtn');
    if (b.disabled) return;
    b.disabled = true;
    $('#instOauthWait').classList.remove('hidden');
    const r = await window.studio.oauthStart();
    b.disabled = false;
    $('#instOauthWait').classList.add('hidden');
    if (r.ok) { toast('Verbunden.'); instAuthDone(); }
    else toast('Anmeldung: ' + (r.error || 'fehlgeschlagen'), 6000);
  });
  $('#instOauthCancel').addEventListener('click', () => window.studio.oauthCancel());
  $('#instTokenSave').addEventListener('click', async () => {
    const v = $('#instTokenInput').value.trim();
    if (!v) { toast('Bitte Token einfügen.'); return; }
    const r = await window.studio.githubSaveToken(v);
    if (r.ok) { $('#instTokenInput').value = ''; toast('Verbunden.'); instAuthDone(); }
    else toast('Anmeldung fehlgeschlagen: ' + r.error, 6000);
  });
  $('#instNodeBtn').addEventListener('click', () => { openSetup(false); });
  $('#instCancelBtn').addEventListener('click', instCancel);
  $('#instRetryBtn').addEventListener('click', () => { runInstall(); });
  $('#instDoneBtn').addEventListener('click', () => closeOverlay('installDialog'));

  // Konto
  $('#accOauthBtn').addEventListener('click', async () => {
    const b = $('#accOauthBtn');
    if (b.disabled) return;
    b.disabled = true;
    $('#accOauthWait').classList.remove('hidden');
    const r = await window.studio.oauthStart();
    b.disabled = false;
    $('#accOauthWait').classList.add('hidden');
    if (r.ok) { toast('Verbunden.'); closeOverlay('accountDialog'); }
    else toast('Anmeldung: ' + (r.error || 'fehlgeschlagen'), 6000);
    refreshGh();
  });
  $('#accOauthCancel').addEventListener('click', () => window.studio.oauthCancel());
  $('#accTokenSave').addEventListener('click', async () => {
    const v = $('#accTokenInput').value.trim();
    if (!v) { toast('Bitte Token einfügen.'); return; }
    const r = await window.studio.githubSaveToken(v);
    if (r.ok) { $('#accTokenInput').value = ''; toast('Verbunden.'); closeOverlay('accountDialog'); }
    else toast('Anmeldung fehlgeschlagen: ' + r.error, 6000);
    refreshGh();
  });
  $('#accLogout').addEventListener('click', async () => {
    await window.studio.githubLogout();
    await refreshGh();
    closeOverlay('accountDialog');
    toast('Abgemeldet.');
  });

  // Setup
  $('#setupStart').addEventListener('click', setupRun);
  $('#setupRetry').addEventListener('click', setupRun);
  $('#setupLater').addEventListener('click', closeSetup);
  $('#setupClose').addEventListener('click', closeSetup);

  // Detail
  $('#dInstallBtn').addEventListener('click', () => openInstall(CURRENT));
  $('#dZipBtn').addEventListener('click', async () => {
    if (!CURRENT) return;
    toast('Lade ' + CURRENT.zip + ' …');
    const r = await window.studio.downloadZip(CURRENT);
    toast(r.ok ? 'Gespeichert: ' + r.path : 'Download fehlgeschlagen: ' + r.error + ' – Internetverbindung prüfen.', 6000);
  });

  window.addEventListener('offline', () => toast('Verbindung verloren – SiteSmith arbeitet offline weiter, Downloads pausieren.', 6000));
  window.addEventListener('online', () => toast('Wieder online.'));
});

async function init() {
  await loadTemplates();
  await refreshGh();
  const n = await refreshNode();
  const c = $('#installedCount');
  c.textContent = store.installs.length || '';
  c.classList.toggle('hidden', !store.installs.length);
  // Erststart: Node fehlt → Setup anbieten (nicht erzwingen)
  if (!n.ok) {
    setTimeout(() => {
      if (!window.studio) return;
      openSetup(true);
      toast(n.source === 'system' && n.tooOld
        ? `System-Node ${n.node} ist zu alt (min. v${n.minMajor}) – richte eine aktuelle Version ein.`
        : 'Node.js fehlt – für Node-Templates jetzt einrichten (empfohlen).', 7000);
    }, 600);
  }
  icons();
}
