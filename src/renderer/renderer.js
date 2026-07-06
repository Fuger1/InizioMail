// ---------------------------------------------------------------------------
// InizioMail renderer
// ---------------------------------------------------------------------------
const api = window.inizio;

let templates = [];
let current = null;          // active template object
let connectedEmail = null;

const el = (id) => document.getElementById(id);

// ---- Placeholder replacement -------------------------------------------------
function fillTemplate(str, values) {
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = values[key];
    return (v === undefined || v === '') ? `<span style="opacity:.35">${key.replace(/_/g,' ')}</span>` : escapeHtml(v);
  });
}
function fillPlain(str, values) {
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => values[key] || '');
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- Read current form values ------------------------------------------------
function currentValues() {
  const values = {};
  if (!current) return values;
  current.fields.forEach((f) => {
    const input = el('f_' + f.key);
    const raw = input ? input.value : '';
    // Blank field falls back to the template's default copy, if any.
    values[f.key] = (raw === '' && f.default !== undefined) ? f.default : raw;
  });
  return values;
}

// ---- Preview -----------------------------------------------------------------
function renderPreview() {
  if (!current) return;
  const html = fillTemplate(current.html, currentValues());
  el('preview').srcdoc = html;
}

// ---- Build dynamic form ------------------------------------------------------
function openTemplate(tpl) {
  current = tpl;
  el('editorTitle').textContent = tpl.name;
  el('subjectInput').value = tpl.subject || tpl.name;
  const form = el('fieldForm');
  form.innerHTML = '';
  tpl.fields.forEach((f) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    label.textContent = f.label;
    label.setAttribute('for', 'f_' + f.key);
    const input = f.type === 'textarea'
      ? document.createElement('textarea')
      : document.createElement('input');
    input.id = 'f_' + f.key;
    if (f.placeholder) input.placeholder = f.placeholder;
    input.addEventListener('input', renderPreview);
    wrap.appendChild(label);
    wrap.appendChild(input);
    form.appendChild(wrap);
  });
  setStatus('', '');
  renderPreview();
  el('view-templates').classList.add('hidden');
  el('view-editor').classList.remove('hidden');
}

// ---- Template grid -----------------------------------------------------------
function renderGrid() {
  const grid = el('templateGrid');
  grid.innerHTML = '';
  templates.forEach((tpl) => {
    const card = document.createElement('div');
    card.className = 'tpl-card';
    card.innerHTML =
      `<div class="tpl-icon">${tpl.icon || '✦'}</div>` +
      `<div class="tpl-name">${tpl.name}</div>` +
      `<div class="tpl-desc">${tpl.desc || ''}</div>`;
    card.addEventListener('click', () => openTemplate(tpl));
    grid.appendChild(card);
  });
}

// ---- Status ------------------------------------------------------------------
function setStatus(msg, kind) {
  const s = el('sendStatus');
  s.textContent = msg;
  s.className = 'status-msg' + (kind ? ' ' + kind : '');
}

// ---- Auth --------------------------------------------------------------------
function paintAuth(email) {
  connectedEmail = email || null;
  const dot = el('statusDot');
  const label = el('accountLabel');
  const btn = el('connectBtn');
  if (email) {
    dot.classList.add('on');
    label.textContent = email;
    btn.textContent = 'Disconnect';
  } else {
    dot.classList.remove('on');
    label.textContent = 'Not connected';
    btn.textContent = 'Connect Gmail';
  }
}

async function refreshAuth() {
  const res = await api.authStatus();
  paintAuth(res.connected ? res.email : null);
}

el('connectBtn').addEventListener('click', async () => {
  if (connectedEmail) {
    await api.disconnect();
    paintAuth(null);
    return;
  }
  el('connectBtn').textContent = 'Connecting…';
  const res = await api.connect();
  if (res.ok) {
    paintAuth(res.email);
  } else {
    el('connectBtn').textContent = 'Connect Gmail';
    alert('Gmail connection failed:\n\n' + res.error);
  }
});

// ---- Send --------------------------------------------------------------------
async function doSend(mode) {
  if (!connectedEmail) {
    const res = await api.connect();
    if (!res.ok) { setStatus('Connect Gmail first: ' + res.error, 'err'); return; }
    paintAuth(res.email);
  }

  const to = mode === 'preview' ? connectedEmail : el('recipient').value.trim();
  if (!to) { setStatus('Enter a recipient email.', 'err'); return; }

  const values = currentValues();
  const html = fillPlain(current.html, values);
  const subjectRaw = el('subjectInput').value.trim() || current.subject || current.name;
  const subject = fillPlain(subjectRaw, values);

  el('sendBtn').disabled = true;
  el('sendPreviewBtn').disabled = true;
  setStatus(mode === 'preview' ? 'Sending test to yourself…' : 'Sending…', 'info');

  const res = await api.send({ to, subject, html });
  el('sendBtn').disabled = false;
  el('sendPreviewBtn').disabled = false;

  if (res.ok) {
    setStatus(mode === 'preview'
      ? `Preview sent to ${to} ✓`
      : `Sent to ${to} ✓`, 'ok');
  } else {
    setStatus('Failed: ' + res.error, 'err');
  }
}

el('sendPreviewBtn').addEventListener('click', () => doSend('preview'));
el('sendBtn').addEventListener('click', () => {
  if (el('skipPreview').checked) return doSend('send');
  doSend('send');
});
el('backBtn').addEventListener('click', () => {
  el('view-editor').classList.add('hidden');
  el('view-templates').classList.remove('hidden');
});

// ---- Boot --------------------------------------------------------------------
(async function init() {
  templates = await api.loadTemplates();
  renderGrid();
  await refreshAuth();
})();
