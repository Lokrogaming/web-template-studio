const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  githubStatus: () => ipcRenderer.invoke('github-status'),
  githubSaveToken: (token) => ipcRenderer.invoke('github-save-token', token),
  githubLogout: () => ipcRenderer.invoke('github-logout'),
  oauthStart: () => ipcRenderer.invoke('github-oauth-start'),
  oauthCancel: () => ipcRenderer.invoke('github-oauth-cancel'),
  oauthSaveSecret: (s) => ipcRenderer.invoke('github-oauth-save-secret', s),
  nodeStatus: () => ipcRenderer.invoke('node-status'),
  nodeSetupStart: () => ipcRenderer.invoke('node-setup-start'),
  nodeSetupState: () => ipcRenderer.invoke('node-setup-state'),
  nodeSetupCancel: () => ipcRenderer.invoke('node-setup-cancel'),
  onNodeSetup: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('node-setup-progress', h);
    return () => ipcRenderer.removeListener('node-setup-progress', h);
  },
  downloadZip: (template) => ipcRenderer.invoke('download-zip', template),
  workflowInstall: (template, repoName, options) => ipcRenderer.invoke('workflow-install', template, repoName, options),
  installCancel: () => ipcRenderer.invoke('install-cancel'),
  onInstallProgress: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('install-progress', h);
    return () => ipcRenderer.removeListener('install-progress', h);
  },
  pickFolder: (defPath) => ipcRenderer.invoke('pick-folder', defPath),
  previewStart: (localPath) => ipcRenderer.invoke('preview-start', localPath),
  previewStop: (port) => ipcRenderer.invoke('preview-stop', port),
  previewTemplate: (template) => ipcRenderer.invoke('preview-template', template),
  previewTemplateStop: (port, tmpPath) => ipcRenderer.invoke('preview-template-stop', port, tmpPath),
  previewCapture: (payload) => ipcRenderer.invoke('preview-capture', payload),
  metaList: (payload) => ipcRenderer.invoke('meta-list', payload),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
