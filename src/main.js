const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');
const { initUpdater } = require('./updater');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const USER_DIR = app.getPath('userData');
const CREDENTIALS_PATH = path.join(USER_DIR, 'credentials.json'); // user-provided OAuth client
const TOKEN_PATH = path.join(USER_DIR, 'token.json');             // stored after first login
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid'
];

let mainWindow = null;
let oAuthClient = null;

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#07070c',
    title: 'InizioWeb Admin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  // Premium admin panel (Supabase auth + Gmail sending + hosting telemetry).
  // The legacy single-flow sender still ships at renderer/index.html.
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'admin.html'));
}

app.whenReady().then(() => {
  createWindow();
  // Start auto-update once the window's content has loaded so update
  // notifications reach the renderer overlay.
  mainWindow.webContents.once('did-finish-load', () => initUpdater(() => mainWindow));
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------
function loadClientConfig() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'Missing credentials.json. Create a Google Cloud OAuth 2.0 Client (type "Desktop app"), ' +
      'download the JSON, and place it at:\n' + CREDENTIALS_PATH
    );
  }
  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const cfg = raw.installed || raw.web;
  if (!cfg) throw new Error('credentials.json is not a valid OAuth client file.');
  return cfg;
}

function buildOAuthClient(redirectUri) {
  const cfg = loadClientConfig();
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, redirectUri);
}

function saveToken(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

// True only if the stored token grants every scope the app now needs.
function tokenCoversScopes(tokens) {
  if (!tokens || !tokens.scope) return false;
  const granted = new Set(tokens.scope.split(' '));
  return SCOPES.every((s) => granted.has(s));
}

// Returns an authorized client if a valid stored token exists, else null.
function getStoredClient() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  // Stale token from an older scope set → force a fresh consent.
  if (!tokenCoversScopes(tokens)) {
    try { fs.unlinkSync(TOKEN_PATH); } catch (_) {}
    return null;
  }
  const client = buildOAuthClient('http://127.0.0.1'); // redirect not used for refresh
  client.setCredentials(tokens);
  client.on('tokens', (t) => {
    const merged = { ...tokens, ...t };
    saveToken(merged);
  });
  return client;
}

// Interactive loopback OAuth flow. Resolves with an authorized client.
function runAuthFlow() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}`;
      const client = buildOAuthClient(redirectUri);
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES
      });

      server.on('request', async (req, res) => {
        try {
          const u = new URL(req.url, redirectUri);
          const code = u.searchParams.get('code');
          const err = u.searchParams.get('error');
          if (err) throw new Error('Authorization denied: ' + err);
          if (!code) { res.writeHead(400); res.end('No code.'); return; }
          const { tokens } = await client.getToken(code);
          client.setCredentials(tokens);
          saveToken(tokens);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body style="background:#0b0b0d;color:#fff;font-family:sans-serif;text-align:center;padding-top:80px"><h2>InizioMail connected ✓</h2><p>You can close this tab and return to the app.</p></body></html>');
          server.close();
          resolve(client);
        } catch (e) {
          res.writeHead(500); res.end('Auth error.');
          server.close();
          reject(e);
        }
      });

      shell.openExternal(authUrl);
    });
    server.on('error', reject);
  });
}

async function ensureAuth() {
  if (oAuthClient) return oAuthClient;
  const stored = getStoredClient();
  if (stored) { oAuthClient = stored; return oAuthClient; }
  oAuthClient = await runAuthFlow();
  return oAuthClient;
}

// ---------------------------------------------------------------------------
// MIME + send
// ---------------------------------------------------------------------------
function buildRawMessage({ to, subject, html }) {
  // No From header — Gmail sets it to the authenticated account automatically.
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const lines = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64')
  ];
  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendEmail({ to, subject, html }) {
  const auth = await ensureAuth();
  const gmail = google.gmail({ version: 'v1', auth });
  const from = await getAccount();
  const raw = buildRawMessage({ to, from, subject, html });
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  return { id: res.data.id, from };
}

async function getAccount() {
  const auth = await ensureAuth();
  // userinfo works with the openid + userinfo.email scopes and does NOT
  // require a Gmail read scope (gmail.send alone can't call getProfile).
  const oauth2 = google.oauth2({ version: 'v2', auth });
  const info = await oauth2.userinfo.get();
  return info.data.email;
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('auth:status', async () => {
  try {
    const email = await getAccount();
    return { connected: true, email };
  } catch (e) {
    return { connected: false, error: e.message };
  }
});

ipcMain.handle('auth:connect', async () => {
  try {
    await ensureAuth();
    const email = await getAccount();
    return { ok: true, email };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('auth:disconnect', async () => {
  oAuthClient = null;
  if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
  return { ok: true };
});

ipcMain.handle('mail:send', async (_evt, payload) => {
  try {
    const result = await sendEmail(payload);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('templates:load', async () => {
  const p = path.join(__dirname, 'templates.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
});
