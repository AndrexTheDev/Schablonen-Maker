/**
 * Schablonen Maker – Electron-Hauptprozess (Windows-Desktop-App).
 *
 * Die Oberfläche ist eine normale Web-App; sie wird über ein eigenes
 * "app://"-Protokoll geladen. Das hat zwei Vorteile:
 *   - ES-Module und Web-Worker funktionieren (bei file:// nicht),
 *   - die Seite gilt als sicherer Kontext, damit die Kamera (getUserMedia)
 *     für "Foto aufnehmen" überhaupt erlaubt ist.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session, shell, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

const IS_DEV = !!process.env.VITE_DEV_SERVER_URL;
const DIST = path.join(__dirname, '..', 'dist');
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

let mainWindow = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: '#0d0f12',
    show: false,
    title: 'Schablonen Maker',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (IS_DEV) {
    await mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadURL('app://bundle/index.html');
  }

  // Externe Links im Systembrowser öffnen
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const allowed = IS_DEV ? url.startsWith(DEV_URL) : url.startsWith('app://');
    if (!allowed) e.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  buildMenu();
}

function buildMenu() {
  const send = (channel) => {
    if (mainWindow) mainWindow.webContents.send(channel);
  };
  const template = [
    {
      label: 'Datei',
      submenu: [
        { label: 'Bild öffnen…', accelerator: 'CmdOrCtrl+O', click: () => send('menu:open-image') },
        { label: 'Projekt öffnen…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('menu:open-project') },
        { type: 'separator' },
        { label: 'Projekt speichern (.schablone)', accelerator: 'CmdOrCtrl+S', click: () => send('menu:save-project') },
        { label: 'Alles exportieren (ZIP)…', accelerator: 'CmdOrCtrl+E', click: () => send('menu:export-zip') },
        { label: 'Druck-PDF erzeugen…', accelerator: 'CmdOrCtrl+P', click: () => send('menu:export-pdf') },
        { type: 'separator' },
        { label: 'Beenden', role: 'quit' },
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { label: 'Rückgängig', role: 'undo' },
        { label: 'Wiederholen', role: 'redo' },
        { type: 'separator' },
        { label: 'Ausschneiden', role: 'cut' },
        { label: 'Kopieren', role: 'copy' },
        { label: 'Einfügen', role: 'paste' },
        { label: 'Alles auswählen', role: 'selectAll' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        { label: 'Vergrößern', role: 'zoomIn' },
        { label: 'Verkleinern', role: 'zoomOut' },
        { label: 'Originalgröße', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Vollbild', role: 'togglefullscreen' },
        { label: 'Entwicklerwerkzeuge', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Hilfe',
      submenu: [
        {
          label: 'Über Schablonen Maker',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Über Schablonen Maker',
              message: 'Schablonen Maker',
              detail:
                `Version ${app.getVersion()}\n\n` +
                'Fotos werden lokal in mehrlagige Sprühschablonen (Banksy-Stil) umgerechnet.\n' +
                'Es werden keine Bilder hochgeladen – alles rechnet auf diesem Rechner.\n\n' +
                'Ausgabe: SVG, DXF, PNG und maßstabsgetreue Druck-PDFs mit Passmarken.',
              buttons: ['OK'],
            }),
        },
        { label: 'Tastenkürzel', click: () => send('menu:shortcuts') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------- app://-Protokoll ---------------- */

app.whenReady().then(async () => {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (!rel || rel === '/') rel = '/index.html';
      const filePath = path.normalize(path.join(DIST, rel));
      if (!filePath.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return new Response(data, {
        status: 200,
        headers: { 'content-type': MIME[ext] || 'application/octet-stream' },
      });
    } catch {
      // SPA-Fallback
      try {
        const html = await fs.readFile(path.join(DIST, 'index.html'));
        return new Response(html, { status: 200, headers: { 'content-type': MIME['.html'] } });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    }
  });

  // Kamera für "Foto aufnehmen" erlauben
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(['media', 'mediaKeySystem', 'clipboard-read'].includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' || permission === 'clipboard-read');

  app.setAppUserModelId('de.schablonenmaker.app');
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------------- IPC ---------------- */

const IMAGE_FILTERS = [
  { name: 'Bilder', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'avif'] },
  { name: 'Alle Dateien', extensions: ['*'] },
];

ipcMain.handle('dialog:save-file', async (_e, name, bytes) => {
  const ext = path.extname(name).replace('.', '') || 'bin';
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Speichern',
    defaultPath: path.join(app.getPath('downloads'), name),
    filters: [
      { name: ext.toUpperCase(), extensions: [ext] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  await fs.writeFile(res.filePath, Buffer.from(bytes));
  return { ok: true, path: res.filePath };
});

ipcMain.handle('dialog:open-image', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Bild öffnen',
    properties: ['openFile'],
    filters: IMAGE_FILTERS,
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const data = await fs.readFile(res.filePaths[0]);
  return { name: path.basename(res.filePaths[0]), data: new Uint8Array(data) };
});

ipcMain.handle('dialog:save-project', async (_e, name, json) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Projekt speichern',
    defaultPath: path.join(app.getPath('documents'), name),
    filters: [{ name: 'Schablonen-Projekt', extensions: ['schablone'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  await fs.writeFile(res.filePath, json, 'utf8');
  return { ok: true, path: res.filePath };
});

ipcMain.handle('dialog:open-project', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Projekt öffnen',
    properties: ['openFile'],
    filters: [{ name: 'Schablonen-Projekt', extensions: ['schablone', 'json'] }],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const json = await fs.readFile(res.filePaths[0], 'utf8');
  return { name: path.basename(res.filePaths[0]), json };
});

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:print', async () => {
  if (mainWindow) mainWindow.webContents.print({ silent: false, printBackground: true });
});
