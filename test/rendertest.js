// Renderer-Flow-Test mit jsdom: Grid, Install-Dialog (Stages), Node-Gate, Setup-Overlay, Guards, Esc.
// Aufruf: npm run test:renderer
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PROJ = path.join(__dirname, '..');
const html = fs.readFileSync(PROJ + '/renderer/index.html', 'utf8');
const js = fs.readFileSync(PROJ + '/renderer/renderer.js', 'utf8');

const TPL_HTML = { id: 'test-template', name: 'Test Template', zip: 'test-template.zip', verified: true, version: '1.0.0', description: 'd', author: 'a', updated: '2026-10-09', type: 'html', languages: ['HTML'], entry: 'index.html', deploy: ['github-pages'] };
const TPL_NODE = { id: 'node-app', name: 'Node App', zip: 'node-app.zip', verified: false, version: '1.0.0', description: 'd', author: 'a', updated: '2026-10-09', type: 'node', languages: ['JS'], entry: 'server.js', deploy: [] };

let ghConnected = false;
let nodeOk = true;
let installCalls = 0;
let captureCalls = 0;
let galleryStore = [];
const calls = { pickFolder: 0 };

const studio = {
  getConfig: async () => ({ appName: 'SiteSmith', oauthConfigured: true, oauthHasSecret: false, templateRepo: 'r', branch: 'main', mappingUrl: 'https://x/y.json', zipBaseUrl: 'https://x/', rawBaseUrl: 'https://x/', workspace: 'C:/WS', downloads: 'C:/DL' }),
  githubStatus: async () => (ghConnected ? { connected: true, user: { login: 'tester' }, ghCli: false } : { connected: false, user: null, ghCli: false, hint: 'Kein Token.' }),
  githubSaveToken: async () => { ghConnected = true; return { ok: true, user: { login: 'tester' } }; },
  githubLogout: async () => { ghConnected = false; return { ok: true }; },
  oauthStart: async () => ({ ok: false, error: 'abgebrochen-test' }),
  oauthCancel: async () => ({ ok: true }),
  nodeStatus: async () => (nodeOk ? { ok: true, node: 'v24.19.0', npm: '11.0.0', source: 'system' } : { ok: false, node: null, npm: null, source: 'none', minMajor: 20 }),
  nodeSetupStart: async () => { nodeOk = true; return { ok: true, node: 'v24.21.0', npm: '11.0.0', source: 'bundled', version: 'v24.21.0' }; },
  nodeSetupState: async () => ({ running: false }),
  nodeSetupCancel: async () => ({ ok: true }),
  onNodeSetup: () => () => {},
  downloadZip: async () => ({ ok: true, path: 'C:/DL/x.zip' }),
  workflowInstall: async () => { installCalls++; await new Promise((r) => setTimeout(r, 30)); return { ok: true, logs: ['a'], localPath: 'C:/WS/p', repoUrl: 'https://github.com/t/p', pagesUrl: 'https://t.github.io/p/' }; },
  installCancel: async () => ({ ok: true }),
  onInstallProgress: () => () => {},
  pickFolder: async () => { calls.pickFolder++; return { ok: true, path: 'C:/Picked' }; },
  previewStart: async () => ({ ok: true, url: 'http://127.0.0.1:1', port: 1 }),
  previewStop: async () => ({ ok: true }),
  previewTemplate: async () => ({ ok: true, url: 'http://127.0.0.1:2', port: 2, tmpPath: null }),
  previewTemplateStop: async () => ({ ok: true }),
  previewCapture: async () => { captureCalls++; const id = 'uuid-test-' + captureCalls; galleryStore.unshift({ previewId: id, at: 'now', dataUrl: 'data:image/png;base64,eHh4' }); return { ok: true, previewId: id, thumbId: 't', path: 'p', dataUrl: 'data:image/png;base64,eHh4' }; },
  metaList: async () => ({ ok: true, entries: galleryStore }),
  openFolder: async () => ({ ok: true }),
  openExternal: async () => ({ ok: true }),
};

const results = [];
const t = (name, cond) => { results.push([cond ? 'PASS' : 'FAIL', name]); };

(async () => {
  process.on('unhandledRejection', (e) => console.log('UNHANDLED:', e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : String(e)));
  const dom = new JSDOM(html, { url: 'https://localhost/', runScripts: 'outside-only' });
  const { window } = dom;
  window.lucide = { createIcons: () => {} };
  window.studio = studio;
  window.fetch = async () => ({ ok: true, json: async () => [TPL_HTML, TPL_NODE] });
  require('vm').runInContext(js, dom.getInternalVMContext());
  const $ = (s) => window.document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(150); // init() läuft

  t('Grid rendert 2 Cards', window.document.querySelectorAll('#grid .card').length === 2);
  t('Verified-Badge vorhanden', !!window.document.querySelector('.badge-verified'));
  t('Stack-Badges vorhanden', window.document.querySelectorAll('.stack').length >= 2);
  t('GH-Seitenstatus negativ', $('#ghSide').textContent.includes('nicht verbunden'));
  t('Node-Seitenstatus ok', $('#nodeSide').textContent.includes('v24.19.0'));

  // Suche / Empty-State
  $('#search').value = 'zzz-nix';
  $('#search').dispatchEvent(new window.Event('input', { bubbles: true }));
  t('Empty-State bei Suche', !$('#gridState').classList.contains('hidden'));
  $('#search').value = '';
  $('#search').dispatchEvent(new window.Event('input', { bubbles: true }));
  t('Grid nach Reset wieder da', window.document.querySelectorAll('#grid .card').length === 2);

  // Install-Dialog öffnet erst nach Klick (Config-Stage)
  t('Dialog initial versteckt', $('#installDialog').classList.contains('hidden'));
  window.document.querySelector('#grid .card [data-act="install"]').click();
  await sleep(30);
  t('Dialog nach Klick offen', !$('#installDialog').classList.contains('hidden'));
  t('Config-Stage sichtbar', !$('#instStageConfig').classList.contains('hidden'));
  t('Repo-Default gesetzt', $('#repoInput').value === 'test-template-website');
  t('Zielordner-Default', $('#targetInput').value === 'C:/WS');

  // Ordnerwahl
  $('#targetBrowse').click();
  await sleep(20);
  t('Ordnerwahl übernimmt Pfad', $('#targetInput').value === 'C:/Picked' && calls.pickFolder === 1);

  // Start ohne GH -> Auth-Stage (kontextabhängig)
  $('#instStartBtn').click();
  await sleep(30);
  t('Auth-Stage bei fehlendem GH', !$('#instStageAuth').classList.contains('hidden'));
  t('Noch kein Install-Aufruf', installCalls === 0);

  // PAT-Login -> weiter zu Progress -> Erfolg
  $('#instTokenInput').value = 'ghp_test';
  $('#instTokenSave').click();
  await sleep(120);
  t('Install nach Auth gestartet & erfolgreich', installCalls === 1 && !$('#instStageResult').classList.contains('hidden'));
  t('Erfolgs-Box sichtbar', !!window.document.querySelector('#instResult.result.ok'));
  t('Installiert-Zähler gesetzt', $('#installedCount').textContent === '1');
  $('#instDoneBtn').click();
  t('Dialog nach Fertig geschlossen', $('#installDialog').classList.contains('hidden'));

  // Installiert-View
  window.document.querySelector('.nav-item[data-view="installed"]').click();
  t('Installiert-Eintrag da', window.document.querySelectorAll('.inst-item').length === 1);
  window.document.querySelector('.nav-item[data-view="market"]').click();

  // Node-Gate: Node-Template ohne Node -> Node-Stage
  nodeOk = false;
  window.document.querySelectorAll('#grid .card')[1].querySelector('[data-act="install"]').click();
  await sleep(30);
  $('#instStartBtn').click();
  await sleep(30);
  t('Node-Stage bei fehlendem Node', !$('#instStageNode').classList.contains('hidden'));
  t('Weiterhin kein Install-Aufruf', installCalls === 1);
  // Setup aus Dialog: simuliere Erfolgspfad direkt über Setup-Run? Setup-Overlay öffnen:
  $('#instNodeBtn').click();
  t('Setup-Overlay offen', !$('#setupOverlay').classList.contains('hidden'));
  $('#setupStart').click();
  await sleep(60);
  t('Setup-Erfolg setzt Node ok', nodeOk === true);
  // Auto-Fortsetzung: Install-Dialog war offen -> runInstall lief
  await sleep(120);
  t('Auto-Fortsetzung nach Setup', installCalls === 2);
  $('#instDoneBtn').click();

  // Doppelklick-Schutz: Start zweimal
  window.document.querySelector('#grid .card [data-act="install"]').click();
  await sleep(20);
  const before = installCalls;
  $('#instStartBtn').click(); $('#instStartBtn').click();
  await sleep(150);
  t('Kein Doppel-Install', installCalls === before + 1);
  $('#instDoneBtn').click();

  // Detailseite (echte View, kein Overlay/Drawer)
  window.document.querySelector('#grid .card [data-act="more"]').click();
  await sleep(80);
  t('Detail-View offen', !$('#view-detail').classList.contains('hidden') && !!window.document.querySelector('#detailContent .tpl-hero'));
  t('Hero mit Install-Button', !!$('#dInstall'));
  t('Features gerendert', window.document.querySelectorAll('#detailContent .feat li').length >= 1);
  t('Versionen gerendert', window.document.querySelectorAll('#detailContent .versions li').length >= 1);
  t('Live-Preview im Header gestartet', ($('#dPvUrl').textContent || '').includes('http'));
  $('#dPvView').dispatchEvent(new window.Event('did-finish-load'));
  await sleep(60);
  t('Auto-Capture mit UUID', captureCalls === 1);
  t('Thumbnail in Galerie', window.document.querySelectorAll('#dGallery .thumb').length === 1);
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(30);
  t('Esc zurück zur Übersicht', !$('#view-market').classList.contains('hidden'));

  // Validierung: leerer Repo-Name blockiert
  window.document.querySelector('#grid .card [data-act="install"]').click();
  await sleep(20);
  $('#repoInput').value = '   ';
  const c0 = installCalls;
  $('#instStartBtn').click();
  await sleep(20);
  t('Leerer Repo-Name blockiert', installCalls === c0 && !$('#instStageConfig').classList.contains('hidden'));
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  t('Esc schließt Config-Dialog', $('#installDialog').classList.contains('hidden'));

  // Konto-Dialog
  $('#accountBtn').click();
  await sleep(30);
  t('Konto-Dialog offen (verbunden)', !$('#accountDialog').classList.contains('hidden'));

  let fails = 0;
  for (const [s, n] of results) { console.log(s + '  ' + n); if (s === 'FAIL') fails++; }
  console.log(fails ? `RENDERER-TEST: ${fails} FEHLER` : 'RENDERER-TEST OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('TEST-CRASH:', e); process.exit(1); });
