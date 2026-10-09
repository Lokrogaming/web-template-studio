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
  remove(localPath) { localStorage.setItem('sitesmith.installs', JSON.stringify(store.installs.filter((x) => x.localPath !== localPath))); },
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
    card.querySelector('[data-act="more"]').addEventListener('click', () => openDetailView(t));
    const im = card.querySelector('.card-img');
    im.addEventListener('click', () => openDetailView(t));
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
  $('#view-detail').classList.toggle('hidden', v !== 'detail');
  $('#view-settings').classList.toggle('hidden', v !== 'settings');
  if (v === 'installed') renderInstalled();
  if (v !== 'detail' && DETAIL) leaveDetailView(v);
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
      if (r.ok) openPv(it.repoName, r.url, r.port, null, { template: it.templateId ? { id: it.templateId } : null, targetDir: it.localPath, note: r.note });
      else toast('Preview-Fehler: ' + r.error, 6000);
    });
    mk('settings', 'Einstellungen', 'Project-Settings öffnen', () => openSettings(it));
    list.appendChild(el);
  });
  icons();
}

// ---------- Detailseite (eigene View im Modrinth-Overview-Stil) ----------
let DETAIL = null; // { template, port, tmp, url, captured }

async function leaveDetailView(backTo) {
  if (DETAIL) {
    const d = DETAIL;
    DETAIL = null;
    if (d.port != null) { try { await window.studio.previewTemplateStop(d.port, d.tmp); } catch {} }
  }
  if (VIEW === 'detail') setView(backTo || 'market');
}

function versionList(t) {
  const vs = Array.isArray(t.versions) && t.versions.length ? t.versions
    : [{ version: t.version || '?', date: t.updated || '?', notes: 'Aktuelle Version.' }];
  return vs.map((v) => `<li><span class="ver">v${esc(v.version)}</span><span class="vdate">${esc(v.date || '')}</span><p>${esc(v.notes || '')}</p></li>`).join('');
}

async function openDetailView(t) {
  if (DETAIL) await leaveDetailView('market');
  CURRENT = t;
  DETAIL = { template: t, port: null, tmp: null, url: null, captured: false };
  setView('detail');
  const rows = [
    ['Art / Typ', t.type], ['Sprachen', (t.languages || []).join(', ')],
    ['Version', t.version], ['Author', t.author], ['Latest updated', t.updated],
    ['Zip im Repo', 'templates/' + t.zip], ['Entry', t.entry || 'index.html'],
    ['Verifiziert', t.verified === true ? 'ja (verified: true im Mapping)' : 'nein'],
  ];
  const feats = Array.isArray(t.features) && t.features.length ? t.features : ['Keine Angaben.'];
  $('#detailContent').innerHTML = `
    <div class="back-row"><button class="btn ghost sm" id="dBack"><i data-lucide="chevron-left"></i>Zurück zur Übersicht</button></div>
    <div class="tpl-hero">
      <div class="tpl-icon">${esc((t.name || '?').slice(0, 1).toUpperCase())}</div>
      <div class="tpl-title">
        <h2>${esc(t.name)} ${verifiedBadge(t)}</h2>
        <p class="sub">${esc(t.description || '')}</p>
        <div class="chips"><span class="chip">v${esc(t.version || '?')}</span><span class="chip">${esc(t.type || '?')}</span><span class="chip">by ${esc(t.author || '?')}</span><span class="chip">updated ${esc(t.updated || '?')}</span></div>
        <div class="stacks">${stackBadges(t)}</div>
      </div>
      <div class="tpl-actions">
        <button id="dInstall" class="btn primary"><i data-lucide="package"></i>Install Template</button>
        <button id="dZip" class="btn ghost icon" title=".zip laden (für Erfahrene)" aria-label=".zip laden (für Erfahrene)"><i data-lucide="download"></i></button>
      </div>
    </div>
    <div class="live">
      <div class="live-head"><b><i data-lucide="eye"></i>Live-Preview</b><code id="dPvUrl">startet …</code><button id="dPvExt" class="btn ghost sm hidden"><i data-lucide="external-link"></i>Im Browser öffnen</button></div>
      <div class="live-body"><webview id="dPvView"></webview></div>
      <div id="dThumbs" class="thumbs"><span class="sub small">Thumbnails werden beim Ansehen automatisch erstellt (UUID-gemapped).</span></div>
    </div>
    <div class="detail-grid">
      <div>
        <h3>Überblick</h3>
        <p>${esc(t.description || '')}</p>
        <div class="deploy-flags">${deployFlags(t)}</div>
        <h3>Features</h3>
        <ul class="feat">${feats.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <h3>Galerie</h3>
        <div id="dGallery" class="gallery"><p class="sub small">Lädt …</p></div>
        <h3>Versionen</h3>
        <ol class="versions">${versionList(t)}</ol>
      </div>
      <aside>
        <h3>Informationen</h3>
        <dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v || '–')}</dd>`).join('')}</dl>
        <h3>Installation</h3>
        <p class="sub small">SiteSmith erstellt wahlweise nur lokal oder zusätzlich ein GitHub-Repo, verknüpft Pages (bei HTML), legt <code>meta/</code> mit Projekt-UUID an, schreibt ein README und startet eine localhost-Preview.</p>
        <h3>GitHub</h3>
        <p class="sub small">${GH.connected ? `Verbunden als ${esc(GH.user.login)} – Repo-Erstellung möglich.` : 'Nicht verbunden – Anmeldung erfolgt bei Bedarf im Install-Dialog.'}</p>
      </aside>
    </div>`;
  icons();
  $('#dBack').addEventListener('click', () => leaveDetailView('market'));
  $('#dInstall').addEventListener('click', () => openInstall(CURRENT));
  $('#dZip').addEventListener('click', async () => {
    if (!CURRENT) return;
    toast('Lade ' + CURRENT.zip + ' …');
    const r = await window.studio.downloadZip(CURRENT);
    toast(r.ok ? 'Gespeichert: ' + r.path : 'Download fehlgeschlagen: ' + r.error + ' – Internetverbindung prüfen.', 6000);
  });
  startDetailPreview();
}

async function startDetailPreview() {
  const snap = DETAIL;
  if (!snap) return;
  const t = snap.template;
  const urlEl = $('#dPvUrl');
  try {
    const r = await window.studio.previewTemplate(t);
    if (!DETAIL || DETAIL.template !== t) {
      if (r.ok) { try { await window.studio.previewTemplateStop(r.port, r.tmpPath); } catch {} }
      return;
    }
    if (!r.ok) { if (urlEl) urlEl.textContent = 'Preview fehlgeschlagen: ' + r.error + ' – Internetverbindung prüfen.'; return; }
    DETAIL.port = r.port;
    DETAIL.tmp = r.tmpPath;
    DETAIL.url = r.url;
    if (urlEl) urlEl.textContent = r.url + (r.note ? ' – ' + r.note : '');
    const ext = document.getElementById('dPvExt');
    if (ext) ext.classList.add('hidden');
    const wv = $('#dPvView');
    if (wv) {
      wv.src = r.url;
      armPreviewFail(wv, urlEl, ext, () => (DETAIL ? DETAIL.url : null));
      try { wv.addEventListener('did-finish-load', () => autoCaptureDetail()); } catch {}
      setTimeout(() => autoCaptureDetail(), 8000);
    }
    loadGallery();
  } catch (e) {
    if (urlEl) urlEl.textContent = 'Preview fehlgeschlagen: ' + e.message;
  }
}

// Beim Ansehen: automatisch Thumbnail + Preview-UUID anlegen und mappen
async function autoCaptureDetail() {
  if (!DETAIL || DETAIL.captured || !DETAIL.url) return;
  DETAIL.captured = true;
  try {
    const r = await window.studio.previewCapture({ url: DETAIL.url, template: DETAIL.template });
    if (!DETAIL) return;
    if (r.ok) {
      toast('Thumbnail gespeichert (Preview-UUID ' + String(r.previewId).slice(0, 8) + ' …).');
      loadGallery();
    }
  } catch {}
}

async function loadGallery() {
  if (!DETAIL) return;
  const tid = DETAIL.template.id;
  let r;
  try { r = await window.studio.metaList({ templateId: tid }); } catch { return; }
  if (!DETAIL || DETAIL.template.id !== tid || !r.ok) return;
  const cards = r.entries.map((e) => `<span class="thumb" title="Preview-UUID ${esc(e.previewId)} · ${esc(e.at || '')}"><img src="${e.dataUrl}" alt="Thumbnail ${esc(String(e.previewId).slice(0, 8))}" /></span>`).join('');
  const g = $('#dGallery');
  if (g) g.innerHTML = r.entries.length ? cards : '<p class="sub small">Noch keine Thumbnails.</p>';
  const th = $('#dThumbs');
  if (th) th.innerHTML = r.entries.length ? r.entries.slice(0, 4).map((e) => `<span class="thumb sm" title="Preview-UUID ${esc(e.previewId)}"><img src="${e.dataUrl}" alt="Thumbnail" /></span>`).join('') : '<span class="sub small">Thumbnails werden beim Ansehen automatisch erstellt (UUID-gemapped).</span>';
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

// Zeigt bei Ladefehlern im Webview einen Browser-Fallback (statt weißer Seite)
function armPreviewFail(wv, urlEl, extBtn, getUrl) {
  if (!wv || !wv.addEventListener) return;
  try {
    wv.addEventListener('did-fail-load', (_e, _code, desc, _url, isMainFrame) => {
      if (isMainFrame === false) return;
      if (urlEl) urlEl.textContent = 'Laden fehlgeschlagen (' + (desc || 'unbekannt') + ') – Seite prüfen oder im Browser öffnen.';
      if (extBtn) {
        extBtn.classList.remove('hidden');
        extBtn.onclick = () => { const u = getUrl(); if (u) window.studio.openExternal(u); };
      }
      icons();
    });
  } catch {}
}

// ---------- Card-Preview ----------
async function cardPreview(t, btn) {
  if (PV.port != null) return;
  if (btn) btn.disabled = true;
  $('#pvTitle').textContent = 'Preview: ' + t.name;
  $('#pvUrl').textContent = 'lädt … (beim ersten Mal wird ggf. gebaut)';
  $('#pvExt').classList.add('hidden');
  openOverlay('pvModal');
  const r = await window.studio.previewTemplate(t);
  if (btn) btn.disabled = false;
  if (!r.ok) { $('#pvUrl').textContent = 'Fehler: ' + r.error + ' – prüfe die Internetverbindung und versuche es erneut.'; return; }
  PV = { port: r.port, tmp: r.tmpPath, url: r.url, template: t, targetDir: null, captured: false };
  $('#pvUrl').textContent = r.url + (r.note ? ' – ' + r.note : '');
  $('#pvView').src = r.url;
  armPreviewFail($('#pvView'), $('#pvUrl'), $('#pvExt'), () => PV.url);
  autoCapturePv();
}
async function autoCapturePv() {
  if (!PV || PV.captured || !PV.url || !PV.template) return;
  PV.captured = true;
  try {
    const r = await window.studio.previewCapture({ url: PV.url, template: PV.template, targetDir: PV.targetDir || null });
    if (r.ok) toast('Thumbnail gespeichert (Preview-UUID ' + String(r.previewId).slice(0, 8) + ' …).');
  } catch {}
}
async function closePv() {
  if (PV.port != null) await window.studio.previewTemplateStop(PV.port, PV.tmp);
  PV = { port: null, tmp: null };
  try { $('#pvView').src = 'about:blank'; } catch {}
  closeOverlay('pvModal');
}
function openPv(title, url, port, tmp, extra) {
  $('#pvTitle').textContent = 'Preview: ' + title;
  $('#pvUrl').textContent = url + (extra && extra.note ? ' – ' + extra.note : '');
  $('#pvExt').classList.add('hidden');
  PV = { port, tmp, url, template: (extra && extra.template) || null, targetDir: (extra && extra.targetDir) || null, captured: false };
  openOverlay('pvModal');
  $('#pvView').src = url;
  armPreviewFail($('#pvView'), $('#pvUrl'), $('#pvExt'), () => PV.url);
  autoCapturePv();
}

// ---------- Install-Dialog ----------
const INST_STEPS = [
  ['download', 'Template herunterladen'], ['extract', 'Entpacken'], ['meta', 'Meta-Ordner (UUID)'], ['deps', 'Abhängigkeiten (npm)'],
  ['readme', 'README schreiben'], ['git', 'Lokales Git-Repo'], ['repo', 'GitHub-Repo erstellen'],
  ['push', 'Pushen'], ['pages', 'Pages verknüpfen'],
];
let INST = null;
let INST_GEN = 0;

function stepIcon(st) {
  if (st === 'done') return '<i data-lucide="check"></i>';
  if (st === 'error') return '<i data-lucide="x"></i>';
  if (st === 'running') return '<i data-lucide="loader" class="spin"></i>';
  if (st === 'skip') return '<i data-lucide="chevron-right"></i>';
  return '<i data-lucide="info"></i>';
}

// ---------- Konfigurations-Formular (Schema aus .temp-config) ----------
function fieldInput(f, val) {
  const v = esc(val ?? '');
  const req = f.required ? ' <b class="req" title="Pflichtfeld">*</b>' : '';
  const label = `<span>${esc(f.name || f.id)}${req} <code>{${esc(f.id)}}</code></span>`;
  const common = `data-fid="${esc(f.id)}" aria-label="${esc(f.name || f.id)}"`;
  let input = '';
  if (f.type === 'textarea') input = `<textarea ${common} rows="3">${v}</textarea>`;
  else if (f.type === 'boolean') input = `<label class="check"><input type="checkbox" ${common} ${String(val) === 'true' ? 'checked="checked"' : ''} /><span>Aktiviert</span></label>`;
  else if (f.type === 'color') input = `<input type="color" ${common} value="${v || '#1bd96a'}" />`;
  else if (f.type === 'select') input = `<select ${common}>${(f.options || []).map((o) => `<option value="${esc(o)}" ${String(val) === String(o) ? 'selected="selected"' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else {
    const t = f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : f.type === 'number' ? 'number' : 'text';
    input = `<input type="${t}" ${common} value="${v}" />`;
  }
  return `<label class="field cfg">${label}${input}</label>`;
}
function renderConfigFields(container, schema, values) {
  container.innerHTML = (schema || []).map((f) => fieldInput(f, values ? values[f.id] : '')).join('') || '<p class="sub">Keine konfigurierbaren Felder.</p>';
  icons();
}
function readConfigFields(container, schema) {
  const values = {};
  for (const f of schema || []) {
    const el = container.querySelector(`[data-fid="${CSS.escape(f.id)}"]`);
    if (!el) continue;
    values[f.id] = el.type === 'checkbox' ? (el.checked ? 'true' : 'false') : el.value;
  }
  return values;
}
function validateFields(schema, values) {
  const bad = [];
  for (const f of schema || []) {
    const v = (values[f.id] ?? '').trim();
    if (f.required && !v) { bad.push((f.name || f.id) + ' ist ein Pflichtfeld'); continue; }
    if (v && f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) bad.push((f.name || f.id) + ': keine gültige E-Mail');
    if (v && f.type === 'url' && !/^https?:\/\/.+\..+/.test(v)) bad.push((f.name || f.id) + ': keine gültige URL');
    if (v && f.type === 'number' && Number.isNaN(Number(v))) bad.push((f.name || f.id) + ': keine Zahl');
  }
  return bad;
}
function renderInstSteps(states) {
  $('#instSteps').innerHTML = INST_STEPS.filter(([id]) => !INST.skip.has(id)).map(([id, label]) =>
    `<li data-s="${states[id] || 'pending'}"><span class="st">${stepIcon(states[id] || 'pending')}</span><span class="lbl">${label}</span></li>`).join('');
  icons();
}
function instStage(name) {
  ['Config', 'Fields', 'Auth', 'Node', 'Progress', 'Result'].forEach((s) => $('#instStage' + s).classList.toggle('hidden', s !== name));
}

async function cleanupPrep() {
  if (INST && INST.prep && INST.prep.tmpPath && !INST.busy) {
    try { await window.studio.installDiscardTmp(INST.prep.tmpPath); } catch {}
    INST.prep = null;
  }
}

function openInstall(t) {
  CURRENT = t;
  if (INST && INST.prep && INST.prep.tmpPath) {
    const old = INST.prep.tmpPath;
    try { window.studio.installDiscardTmp(old); } catch {}
  }
  INST_GEN++;
  INST = { busy: false, preparing: false, skip: new Set(), states: {}, opts: null, unsub: null, prep: null, lastExtra: null, values: {}, gen: INST_GEN };
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
  if (INST.busy || INST.preparing) return;
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
  // Template vorbereiten (Download + config-Schema) – erst danach ggf. Formular
  INST.preparing = true;
  const startBtn = $('#instStartBtn');
  startBtn.disabled = true;
  startBtn.innerHTML = '<i data-lucide="loader" class="spin"></i>Vorbereiten …';
  icons();
  let prep;
  try {
    prep = await window.studio.installPrepare(CURRENT);
  } catch (e) {
    prep = { ok: false, error: e.message };
  }
  INST.preparing = false;
  startBtn.disabled = false;
  startBtn.innerHTML = '<i data-lucide="check"></i>Installation starten';
  icons();
  if (!prep || !prep.ok) {
    toast('Vorbereitung fehlgeschlagen: ' + ((prep && prep.error) || 'unbekannt') + (prep && prep.next ? ' – ' + prep.next : ''), 7000);
    return;
  }
  INST.prep = prep;
  if (prep.schema && prep.schema.length) {
    INST.values = { ...(prep.defaults || {}) };
    renderConfigFields($('#instFields'), prep.schema, INST.values);
    $('#instFieldsError').classList.add('hidden');
    instStage('Fields');
    return;
  }
  // Kontext-Prereqs
  if (INST.opts.createRepo && !GH.connected) { instStage('Auth'); paintSecret(); return; }
  if (needsNodeGuess(CURRENT) && !NODE.ok) { instStage('Node'); return; }
  runInstall();
}

function instFieldsNext() {
  if (!INST || INST.busy) return;
  const vals = readConfigFields($('#instFields'), INST.prep.schema);
  const bad = validateFields(INST.prep.schema, vals);
  const err = $('#instFieldsError');
  if (bad.length) {
    err.textContent = bad.join(' · ');
    err.classList.remove('hidden');
    return;
  }
  err.classList.add('hidden');
  INST.values = { ...(INST.prep.defaults || {}), ...vals };
  if (INST.opts.createRepo && !GH.connected) { instStage('Auth'); paintSecret(); return; }
  if (needsNodeGuess(CURRENT) && !NODE.ok) { instStage('Node'); return; }
  runInstall();
}

async function instAuthDone() {
  await refreshGh();
  if (!GH.connected) { toast('Noch nicht verbunden – bitte Anmeldung abschließen.', 5000); return; }
  if (needsNodeGuess(CURRENT) && !NODE.ok) { instStage('Node'); return; }
  runInstall();
}

function paintSecret() {
  const el = document.getElementById('instSecretState');
  if (el) el.textContent = (CFG && CFG.oauthHasSecret) ? '✓ Client Secret hinterlegt.' : 'Kein Client Secret hinterlegt.';
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
  const extra = INST.prep && INST.prep.tmpPath
    ? { tmpPath: INST.prep.tmpPath, values: INST.values || {}, schema: INST.prep.schema || [] }
    : (INST.lastExtra || {});
  INST.prep = null; // tmp-Verzeichnis gehört ab hier dem Main-Prozess
  INST.lastExtra = extra;
  const r = await window.studio.workflowInstall(CURRENT, INST.opts.repoName, INST.opts, extra);
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
      if (p.ok) openPv(INST.opts.repoName, p.url, p.port, null, { template: CURRENT, targetDir: r.localPath, note: p.note });
      else toast('Preview-Fehler: ' + p.error, 6000);
    });
    store.add({ repoName: INST.opts.repoName, templateId: CURRENT.id, templateName: CURRENT.name, localPath: r.localPath, repoUrl: r.repoUrl, pagesUrl: r.pagesUrl, at: new Date().toLocaleString('de-DE') });
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
  if (!INST.busy) { closeInstall(); return; }
  $('#instCancelBtn').disabled = true;
  await window.studio.installCancel();
}

async function closeInstall() {
  const gen = INST ? INST.gen : -1;
  if (INST && INST.busy) return;
  await cleanupPrep();
  // Nur schließen, wenn sich seitdem kein neuer Dialog geöffnet hat (Race-Schutz)
  if (INST && INST.gen === gen) closeOverlay('installDialog');
}

// ---------- Project-Settings (eigene View unter „Installiert“) ----------
let SET = null; // { entry, meta, schema, values, busy }

async function openSettings(entry) {
  SET = { entry: { ...entry }, meta: null, schema: [], values: {}, busy: false };
  setView('settings');
  $('#settingsContent').innerHTML = `
    <div class="back-row"><button class="btn ghost sm" id="setBack"><i data-lucide="chevron-left"></i>Zurück zu Installiert</button></div>
    <div class="tpl-hero">
      <div class="tpl-icon"><i data-lucide="settings"></i></div>
      <div class="tpl-title"><h2>${esc(entry.repoName)}</h2><p class="sub">${esc(entry.templateName || '')} · <span class="path">${esc(entry.localPath || '')}</span></p></div>
    </div>
    <div id="setBody"><div class="state"><i data-lucide="loader" class="spin"></i><b>Lädt Einstellungen …</b></div></div>`;
  icons();
  $('#setBack').addEventListener('click', () => setView('installed'));
  // Meta + frisches Schema laden
  let meta = null;
  try {
    const r = await window.studio.projectMeta(entry.localPath);
    if (r.ok) meta = r.meta;
  } catch {}
  if (!SET || SET.entry.localPath !== entry.localPath) return;
  SET.meta = meta || {};
  SET.values = { ...((meta && meta.config) || {}) };
  let schema = Array.isArray(meta && meta.configSchema) ? meta.configSchema : [];
  const tpl = (entry.templateId && TEMPLATES.find((x) => x.id === entry.templateId)) || null;
  if (tpl) {
    try {
      const r = await window.studio.templateConfig(tpl);
      if (!SET || SET.entry.localPath !== entry.localPath) return;
      if (r.ok && Array.isArray(r.schema) && r.schema.length) schema = r.schema;
    } catch {}
  }
  SET.schema = schema;
  renderSettings();
}

function renderSettings() {
  const { entry, meta, schema, values } = SET;
  const desc = (meta && meta.description) || '';
  const hasSchema = schema.length > 0;
  $('#settingsContent').innerHTML = `
    <div class="back-row"><button class="btn ghost sm" id="setBack"><i data-lucide="chevron-left"></i>Zurück zu Installiert</button></div>
    <div class="tpl-hero">
      <div class="tpl-icon"><i data-lucide="settings"></i></div>
      <div class="tpl-title"><h2>${esc(entry.repoName)}</h2><p class="sub">${esc(entry.templateName || '')} · <span class="path">${esc(entry.localPath || '')}</span>${meta && meta.templateVersion ? ` · Template v${esc(meta.templateVersion)}` : ''}</p></div>
    </div>
    <div class="set-section">
      <h3>Beschreibung</h3>
      <p class="sub small">Wird in README, <code>meta.json</code> und (falls vorhanden) als GitHub-Repo-Beschreibung gespeichert. Beim Speichern wird automatisch committet und – falls möglich – gepusht.</p>
      <textarea id="setDesc" rows="3" maxlength="350" placeholder="Kurze Projektbeschreibung …">${esc(desc)}</textarea>
      <div class="row"><div class="spacer"></div><button id="setDescSave" class="btn primary sm"><i data-lucide="check"></i>Save</button></div>
      <p id="setDescState" class="sub small"></p>
    </div>
    <div class="set-section">
      <h3>Konfiguration &amp; Migration</h3>
      ${hasSchema ? `<p class="sub small">Werte für <code>{platzhalter}</code> ändern oder auf eine neue Template-Version migrieren. Wendet das <b>aktuelle</b> Template aus dem Repo frisch an – Template-Dateien werden überschrieben (<code>meta/</code>, <code>.git</code>, <code>node_modules</code> bleiben). Danach Commit + Push.</p>
      <div id="setFields"></div>
      <p id="setFieldsError" class="error-text hidden" role="alert"></p>
      <div class="row"><div class="spacer"></div><button id="setApply" class="btn primary sm"><i data-lucide="refresh-cw"></i>Anwenden &amp; Migrieren</button></div>`
        : `<div class="hint-box">Keine Konfiguration verfügbar – ${entry.templateId ? 'das Template stellt kein config-Schema bereit.' : 'alte Installation ohne Template-Verknüpfung.'}</div>`}
    </div>
    <div class="set-section danger">
      <h3><i data-lucide="triangle-alert"></i>Danger Zone</h3>
      <div class="danger-item">
        <div><b>Vom Gerät entfernen</b><p class="sub small">Löscht nur den lokalen Ordner. Das GitHub-Repo bleibt erhalten.</p></div>
        <button id="dzLocal" class="btn ghost sm">Lokal löschen</button>
      </div>
      <div class="danger-item">
        <div><b>Von GitHub löschen</b><p class="sub small">Löscht nur das GitHub-Repo. Lokale Dateien bleiben. Braucht <code>delete_repo</code>-Scope (ggf. neu anmelden).</p></div>
        <div class="dz-confirm"><input id="dzRemoteName" placeholder="${esc(entry.repoName)} eintippen" aria-label="Repo-Name zur Bestätigung" /><button id="dzRemote" class="btn ghost sm" disabled>Von GitHub löschen</button></div>
      </div>
      <div class="danger-item">
        <div><b>Ganz löschen</b><p class="sub small">Löscht GitHub-Repo UND lokale Dateien. Nicht umkehrbar.</p></div>
        <div class="dz-confirm"><input id="dzAllName" placeholder="${esc(entry.repoName)} eintippen" aria-label="Repo-Name zur Bestätigung" /><button id="dzAll" class="btn ghost sm" disabled>Alles löschen</button></div>
      </div>
      <p id="dzState" class="sub small"></p>
    </div>`;
  icons();
  $('#setBack').addEventListener('click', () => setView('installed'));
  if (hasSchema) renderConfigFields($('#setFields'), schema, values);
  $('#setDescSave').addEventListener('click', setSaveDescription);
  const apply = $('#setApply');
  if (apply) apply.addEventListener('click', () => setApplyConfig(apply));
  $('#dzLocal').addEventListener('click', dzLocal);
  const rn = $('#dzRemoteName');
  if (rn) rn.addEventListener('input', () => { $('#dzRemote').disabled = rn.value.trim() !== entry.repoName; });
  $('#dzRemote').addEventListener('click', dzRemote);
  const an = $('#dzAllName');
  if (an) an.addEventListener('input', () => { $('#dzAll').disabled = an.value.trim() !== entry.repoName; });
  $('#dzAll').addEventListener('click', dzAll);
}

function setBusy(b) {
  if (SET) SET.busy = b;
  $$('#settingsContent button').forEach((x) => { if (x.id !== 'setBack') x.disabled = b; });
}

async function setSaveDescription() {
  if (SET.busy) return;
  const desc = $('#setDesc').value.trim();
  if (!desc) { toast('Bitte Beschreibung eingeben.'); return; }
  setBusy(true);
  $('#setDescState').textContent = 'Speichert …';
  try {
    const r = await window.studio.projectSetDescription({ localPath: SET.entry.localPath, description: desc, repoUrl: SET.entry.repoUrl, repoName: SET.entry.repoName });
    if (r.ok) {
      SET.meta = { ...(SET.meta || {}), description: desc };
      $('#setDescState').textContent = `Gespeichert${r.committed ? ' + committet' : ' (nichts zu committen)'}${r.pushed ? ' + gepusht' : ''}${r.repoUpdated ? ' + GitHub-Beschreibung aktualisiert' : ''}.`;
      toast('Beschreibung gespeichert.');
    } else {
      $('#setDescState').textContent = 'Fehler: ' + r.error;
      toast('Speichern fehlgeschlagen: ' + r.error, 6000);
    }
  } catch (e) {
    $('#setDescState').textContent = 'Fehler: ' + e.message;
  }
  setBusy(false);
}

async function setApplyConfig(btn) {
  if (SET.busy) return;
  const vals = readConfigFields($('#setFields'), SET.schema);
  const bad = validateFields(SET.schema, vals);
  const err = $('#setFieldsError');
  if (bad.length) { err.textContent = bad.join(' · '); err.classList.remove('hidden'); return; }
  err.classList.add('hidden');
  const b = btn || $('#setApply');
  if (!b.dataset.armed) {
    b.dataset.armed = '1';
    b.innerHTML = '<i data-lucide="triangle-alert"></i>Wirklich anwenden? Template-Dateien werden überschrieben.';
    icons();
    setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.innerHTML = '<i data-lucide="refresh-cw"></i>Anwenden &amp; Migrieren'; icons(); } }, 6000);
    return;
  }
  delete b.dataset.armed;
  setBusy(true);
  toast('Migriere Konfiguration …');
  try {
    const tpl = SET.entry.templateId ? TEMPLATES.find((x) => x.id === SET.entry.templateId) : null;
    if (!tpl) { toast('Template-Referenz fehlt – Migration nicht möglich.', 6000); setBusy(false); return; }
    const r = await window.studio.projectApplyConfig({ localPath: SET.entry.localPath, template: tpl, values: vals });
    if (r.ok) {
      SET.values = vals;
      toast(`Angewendet${r.version ? ' (Template v' + r.version + ')' : ''}${r.committed ? ' + committet' : ''}${r.pushed ? ' + gepusht' : ''}.`);
      const m = await window.studio.projectMeta(SET.entry.localPath);
      if (m.ok) SET.meta = m.meta || SET.meta;
    } else {
      toast('Migration fehlgeschlagen: ' + r.error + (r.next ? ' – ' + r.next : ''), 7000);
    }
  } catch (e) {
    toast('Fehler: ' + e.message, 6000);
  }
  setBusy(false);
  renderSettings();
}

function dzSay(msg) { const el = $('#dzState'); if (el) el.textContent = msg; }

async function dzLocal() {
  const b = $('#dzLocal');
  if (SET.busy) return;
  if (!b.dataset.armed) {
    b.dataset.armed = '1';
    b.textContent = 'Wirklich lokal löschen?';
    setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Lokal löschen'; } }, 6000);
    return;
  }
  setBusy(true);
  dzSay('Löscht …');
  try {
    const r = await window.studio.projectUninstallLocal(SET.entry.localPath);
    if (r.ok) {
      store.remove(SET.entry.localPath);
      toast('Lokal gelöscht (GitHub-Repo bleibt).');
      setView('installed');
    } else {
      dzSay('Fehler: ' + r.error + (r.next ? ' – ' + r.next : ''));
    }
  } catch (e) { dzSay('Fehler: ' + e.message); }
  setBusy(false);
}

function parseRepoEntry() {
  const m = String(SET.entry.repoUrl || '').match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

async function dzRemote() {
  if (SET.busy) return;
  const or = parseRepoEntry();
  if (!or) { dzSay('Kein GitHub-Repo verknüpft (nur lokal installiert).'); return; }
  setBusy(true);
  dzSay('Löscht GitHub-Repo …');
  try {
    const r = await window.studio.projectDeleteRemote(or);
    if (r.ok) {
      SET.entry.repoUrl = null;
      SET.entry.pagesUrl = null;
      dzSay('GitHub-Repo gelöscht. Lokale Dateien bleiben.');
      toast('GitHub-Repo gelöscht.');
    } else {
      dzSay('Fehler: ' + r.error + (r.next ? ' – ' + r.next : ''));
    }
  } catch (e) { dzSay('Fehler: ' + e.message); }
  setBusy(false);
}

async function dzAll() {
  if (SET.busy) return;
  const or = parseRepoEntry();
  setBusy(true);
  dzSay('Löscht alles …');
  try {
    if (or) {
      const r = await window.studio.projectDeleteRemote(or);
      if (!r.ok) { dzSay('Abbruch – Remote-Fehler: ' + r.error + (r.next ? ' – ' + r.next : '')); setBusy(false); return; }
    }
    const l = await window.studio.projectUninstallLocal(SET.entry.localPath);
    if (!l.ok) { dzSay('Remote gelöscht, lokal fehlgeschlagen: ' + l.error); setBusy(false); return; }
    store.remove(SET.entry.localPath);
    toast('Projekt ganz gelöscht.');
    setView('installed');
  } catch (e) { dzSay('Fehler: ' + e.message); }
  setBusy(false);
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
    else if (id === 'installDialog') closeInstall();
    else closeOverlay(id);
  }));
  document.querySelectorAll('.overlay').forEach((o) => o.addEventListener('click', (e) => {
    if (e.target !== o) return;
    if (o.id === 'pvModal') closePv();
    else if (o.id === 'installDialog') closeInstall();
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
    else if (!$('#installDialog').classList.contains('hidden')) closeInstall();
    else if (!$('#setupOverlay').classList.contains('hidden')) closeSetup();
    else if (VIEW === 'settings') setView('installed');
    else if (VIEW === 'detail') leaveDetailView('market');
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
  $('#instSecretSave').addEventListener('click', async () => {
    const v = $('#instSecretInput').value.trim();
    if (!v) { toast('Bitte Secret einfügen.'); return; }
    const r = await window.studio.oauthSaveSecret(v);
    if (r.ok) { $('#instSecretInput').value = ''; if (CFG) CFG.oauthHasSecret = true; paintSecret(); toast('Secret lokal gespeichert.'); }
    else toast('Fehler: ' + (r.error || 'fehlgeschlagen'), 6000);
  });
  $('#instNodeBtn').addEventListener('click', () => { openSetup(false); });
  $('#instCancelBtn').addEventListener('click', instCancel);
  $('#instRetryBtn').addEventListener('click', () => { runInstall(); });
  $('#instDoneBtn').addEventListener('click', () => closeInstall());
  $('#instFieldsNext').addEventListener('click', instFieldsNext);
  $('#instFieldsBack').addEventListener('click', () => instStage('Config'));

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
