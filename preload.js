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
  nodeInstall: () => ipcRenderer.invoke('node-install'),
  downloadZip: (template) => ipcRenderer.invoke('download-zip', template),
  workflowInstall: (template, repoName) => ipcRenderer.invoke('workflow-install', template, repoName),
  previewStart: (localPath) => ipcRenderer.invoke('preview-start', localPath),
  previewStop: (port) => ipcRenderer.invoke('preview-stop', port),
  previewTemplate: (template) => ipcRenderer.invoke('preview-template', template),
  previewTemplateStop: (port, tmpPath) => ipcRenderer.invoke('preview-template-stop', port, tmpPath),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
