/** Sichere Brücke zwischen Renderer und Hauptprozess. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('schablone', {
  isElectron: true,
  version: process.env.npm_package_version || '',
  saveFile: (name, data) => ipcRenderer.invoke('dialog:save-file', name, data),
  openImage: () => ipcRenderer.invoke('dialog:open-image'),
  saveProject: (name, json) => ipcRenderer.invoke('dialog:save-project', name, json),
  openProject: () => ipcRenderer.invoke('dialog:open-project'),
  print: () => ipcRenderer.invoke('app:print'),
  onMenu: (channel, handler) => {
    const allowed = [
      'menu:open-image',
      'menu:open-project',
      'menu:save-project',
      'menu:export-zip',
      'menu:export-pdf',
      'menu:shortcuts',
    ];
    if (!allowed.includes(channel)) return () => {};
    const listener = () => handler();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
