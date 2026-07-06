// ---------------------------------------------------------------------------
// Update notifier (renderer overlay)
//
// Loaded from preload.js so it works on any window (admin.html / index.html)
// without touching their markup or styles. Everything is namespaced under
// #inizio-updater and rendered with inline styles, so it cannot collide with
// or alter the host page's UI. It only appears when there is something to say.
// ---------------------------------------------------------------------------
'use strict';

function initUpdaterUI(ipcRenderer) {
  let root = null;

  function ensureRoot() {
    if (root && document.body.contains(root)) return root;
    root = document.createElement('div');
    root.id = 'inizio-updater';
    root.style.cssText = [
      'position:fixed', 'right:20px', 'bottom:20px', 'z-index:2147483647',
      'width:300px', 'max-width:calc(100vw - 40px)',
      'background:#121216', 'color:#fff',
      'border:1px solid rgba(255,255,255,0.10)', 'border-radius:12px',
      'box-shadow:0 12px 40px rgba(0,0,0,0.45)',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
      'font-size:13px', 'line-height:1.5', 'padding:14px 16px',
      'opacity:0', 'transform:translateY(8px)',
      'transition:opacity .2s ease,transform .2s ease'
    ].join(';');
    document.body.appendChild(root);
    requestAnimationFrame(() => {
      root.style.opacity = '1';
      root.style.transform = 'translateY(0)';
    });
    return root;
  }

  function hide() {
    if (!root) return;
    root.style.opacity = '0';
    root.style.transform = 'translateY(8px)';
    const node = root;
    root = null;
    setTimeout(() => { if (node && node.parentNode) node.parentNode.removeChild(node); }, 220);
  }

  function progressBar(percent) {
    return (
      '<div style="height:6px;background:rgba(255,255,255,0.10);border-radius:999px;overflow:hidden;margin-top:10px;">' +
      '<div style="height:100%;width:' + percent + '%;background:linear-gradient(135deg,#ffffff,#cfcfcf);transition:width .2s ease;"></div>' +
      '</div>'
    );
  }

  function title(text) {
    return '<div style="font-weight:600;color:#fff;">' + text + '</div>';
  }
  function sub(text) {
    return '<div style="color:#9a9aa2;margin-top:2px;">' + text + '</div>';
  }

  function render(state) {
    const el = ensureRoot();
    el.innerHTML = state.html;
    if (state.onRestart) {
      const b = el.querySelector('#inizio-updater-restart');
      if (b) b.addEventListener('click', state.onRestart);
    }
    if (state.onLater) {
      const b = el.querySelector('#inizio-updater-later');
      if (b) b.addEventListener('click', state.onLater);
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  ipcRenderer.on('updater:status', (_evt, msg) => {
    switch (msg.status) {
      case 'available':
        render({ html: title('Update available') + sub('Downloading v' + esc(msg.version) + '…') + progressBar(0) });
        break;

      case 'downloading':
        render({
          html: title('Downloading update') + sub(esc(msg.percent) + '%') + progressBar(msg.percent)
        });
        break;

      case 'downloaded':
        render({
          html:
            title('Update ready') +
            sub('v' + esc(msg.version) + ' will install on restart.') +
            '<div style="display:flex;gap:8px;margin-top:12px;">' +
            '<button id="inizio-updater-restart" style="flex:1;padding:9px 12px;border:0;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;background:linear-gradient(135deg,#ffffff,#cfcfcf);color:#0b0b0d;">Restart Now</button>' +
            '<button id="inizio-updater-later" style="padding:9px 12px;border:1px solid rgba(255,255,255,0.14);border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;background:transparent;color:#e8e8ea;">Later</button>' +
            '</div>',
          onRestart: () => ipcRenderer.send('updater:restart'),
          onLater: hide
        });
        break;

      case 'error':
        render({ html: title('Update check failed') + sub(esc(msg.message)) });
        setTimeout(hide, 6000);
        break;

      case 'dev':
        render({ html: title('Development build') + sub('Updates are only available in packaged builds.') });
        setTimeout(hide, 5000);
        break;

      case 'idle':
        // Surfaced only for an explicit manual check; brief confirmation.
        if (msg.manual) {
          render({ html: title('You’re up to date') });
          setTimeout(hide, 4000);
        }
        break;

      // 'checking' is intentionally silent to stay non-intrusive on launch.
      default:
        break;
    }
  });
}

module.exports = { initUpdaterUI };
