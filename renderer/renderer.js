const $ = (s) => document.querySelector(s);

const FALLBACK = [
  { id: 'test-template', name: 'Test Template', zip: 'test-template.zip', verified: true, version: '1.0.0', description: 'Minimaler HTML-Starter (Offline-Fallback).', author: 'Lokrogaming', updated: '2026-10-09', type: 'html', languages: ['HTML', 'CSS', 'JavaScript'], entry: 'index.html' },
];

let CFG = null;
let TEMPLATES = [];
let CURRENT = null;
let LAST_INSTALL_PATH = null;
let PREVIEW_PORT = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, ms = 4000) {
  const el = $('#status');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function verifiedBadge(t, big = false) {
  if (t.verified === true) {
    return `<span class="badge-verified" title="Verifiziertes Template">✔ verifiziert${big ? ' · geprüft' : ''}</span>`;
  }
  return `<span class="badge-unverified" title="Nicht verifiziert">○ community</span>`;
}

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

function renderGrid() {
  const q = ($('#search').value || '').toLowerCase();
  const grid = $('#grid');
  grid.innerHTML = '';
  TEMPLATES.filter((t) => (t.name + ' ' + (t.description || '') + ' ' + t.id).toLowerCase().includes(q)).forEach((t) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${esc(t.name)} ${verifiedBadge(t)}</h3>
      <div class="meta"><span>v${esc(t.version || '?')}</span><span>·</span><span>${esc(t.type || '?')}</span><span>·</span><span>${esc((t.languages || []).join(', '))}</span></div>
      <p class="desc">${esc(t.description || '')}</p>
      <div class="meta"><span>by ${esc(t.author || '?')}</span><span>·</span><span>updated ${esc(t.updated || '?')}</span></div>
      <div class="row">
        <button class="btn primary" data-act="use">Nutzen</button>
        <button class="btn ghost" data-act="more">Mehr …</button>
      </div>`;
    card.querySelector('[data-act="use"]').addEventListener('click', () => openUse(t));
    card.querySelector('[data-act="more"]').addEventListener('click', () => openDetail(t));
    grid.appendChild(card);
  });
  if (!grid.children.length) grid.innerHTML = '<p class="hint">Keine Templates gefunden.</p>';
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
  if (r.ok) toast('Gespeichert: ' + r.path + ' – bitte entpacken. Deploy-Anleitung in Detailseite (“Mehr …”).', 6000);
  else toast('Download fehlgeschlagen: ' + r.error, 6000);
  hide('useModal');
}

// ---------- Detail ----------
function openDetail(t) {
  CURRENT = t;
  $('#dName').textContent = t.name;
  $('#dVerified').innerHTML = verifiedBadge(t, true);
  const rows = [
    ['Art / Typ', t.type], ['Sprachen', (t.languages || []).join(', ')],
    ['Description', t.description], ['Version', t.version],
    ['Author', t.author], ['Latest updated', t.updated],
    ['Zip im Repo', 'templates/' + t.zip], ['Entry', t.entry || 'index.html'],
    ['Verifiziert', t.verified === true ? 'ja (verified: true im Mapping)' : 'nein'],
  ];
  $('#dBody').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v || '–')}</dd>`).join('');
  show('detailModal');
}

// ---------- Workflow ----------
async function openFlow() {
  hide('useModal');
  hide('detailModal');
  $('#fTitle').textContent = 'Workflow: ' + (CURRENT ? CURRENT.name : '');
  $('#flowLog').textContent = '';
  $('#flowLinks').innerHTML = '';
  $('#previewUrl').textContent = '';
  $('#previewView').classList.add('hidden');
  $('#previewFrame').classList.add('hidden');
  $('#previewStopBtn').classList.add('hidden');
  $('#previewBtn').disabled = true;
  LAST_INSTALL_PATH = null;
  PREVIEW_PORT = null;
  $('#repoInput').value = (CURRENT ? CURRENT.id + '-website' : 'meine-website').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  show('flowModal');
  await refreshGh();
  await refreshNode();
}

async function refreshGh() {
  $('#ghState').textContent = 'Prüfe GitHub-Verknüpfung …';
  const s = await window.studio.githubStatus();
  const pill = $('#ghPill');
  if (s.connected) {
    pill.textContent = 'GitHub: ' + s.user.login;
    pill.className = 'pill ok';
    $('#ghState').innerHTML = `✓ Verbunden als <b>${esc(s.user.login)}</b>${s.ghCli ? ' (gh CLI erkannt)' : ''}`;
    $('#ghLoginBox').classList.add('hidden');
    $('#ghLogout').classList.remove('hidden');
  } else {
    pill.textContent = 'GitHub: nicht verbunden';
    pill.className = 'pill bad';
    $('#ghState').textContent = '✗ Nicht verbunden. ' + (s.hint || '');
    $('#ghLoginBox').classList.remove('hidden');
    $('#ghLogout').classList.add('hidden');
  }
  return s;
}

async function refreshNode() {
  $('#nodeState').textContent = 'Prüfe Node.js & npm …';
  const s = await window.studio.nodeStatus();
  const pill = $('#nodePill');
  if (s.ok) {
    pill.textContent = `Node ${s.node} · npm ${s.npm}`;
    pill.className = 'pill ok';
    $('#nodeState').textContent = `✓ Gefunden: node ${s.node}, npm ${s.npm}`;
    $('#nodeInstallBtn').classList.add('hidden');
  } else {
    pill.textContent = 'Node: fehlt';
    pill.className = 'pill bad';
    $('#nodeState').textContent = `✗ Node.js/npm nicht gefunden (node: ${s.node || '–'}, npm: ${s.npm || '–'}). Für HTML-Preview optional, für Node-Templates Pflicht.`;
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
    const mk = (label, url) => {
      const b = document.createElement('button');
      b.className = 'btn ghost'; b.textContent = label;
      b.addEventListener('click', () => window.studio.openExternal(url));
      return b;
    };
    if (r.repoUrl) $('#flowLinks').appendChild(mk('GitHub-Repo öffnen', r.repoUrl));
    if (r.pagesUrl) $('#flowLinks').appendChild(mk('Pages-Seite öffnen', r.pagesUrl));
    const ordner = document.createElement('button');
    ordner.className = 'btn ghost'; ordner.textContent = 'Ordner öffnen';
    ordner.addEventListener('click', () => window.studio.openFolder(r.localPath));
    $('#flowLinks').appendChild(ordner);
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
  // webview bevorzugen, iframe als Fallback
  try {
    wv.src = r.url;
    wv.classList.remove('hidden');
    $('#previewFrame').classList.add('hidden');
  } catch {
    const f = $('#previewFrame');
    f.src = r.url;
    f.classList.remove('hidden');
  }
  $('#previewStopBtn').classList.remove('hidden');
  toast('Preview läuft: ' + r.url);
}

async function stopPreview() {
  if (PREVIEW_PORT != null) await window.studio.previewStop(PREVIEW_PORT);
  PREVIEW_PORT = null;
  $('#previewView').classList.add('hidden');
  $('#previewFrame').classList.add('hidden');
  $('#previewStopBtn').classList.add('hidden');
  $('#previewBtn').disabled = false;
  $('#previewUrl').textContent = '';
}

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

// ---------- Events ----------
document.addEventListener('DOMContentLoaded', () => {
  loadTemplates();
  refreshGh(); refreshNode();
  $('#search').addEventListener('input', renderGrid);
  $('#refreshBtn').addEventListener('click', loadTemplates);
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => hide(b.dataset.close)));
  document.querySelectorAll('.overlay').forEach((o) => o.addEventListener('click', (e) => { if (e.target === o) o.classList.add('hidden'); }));

  $('#useWorkflowBtn').addEventListener('click', openFlow);
  $('#useZipBtn').addEventListener('click', useZip);
  $('#dUseBtn').addEventListener('click', () => { hide('detailModal'); openUse(CURRENT); });

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
