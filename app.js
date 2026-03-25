/* =====================================================
   SAFESCAN — Main Application (app.js)
   Rule-based detection, no AI/API required
===================================================== */
'use strict';

// ─── STATE ────────────────────────────────────
const state = {
  safetyMode: false,
  safetyInterval: null,
  notifications: false,
  activePanel: 'url',
  sidebarOpen: false,
  scamAlertsLoaded: false,
};

// ─── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initDraggables();
  initCrossTabSync();

  const savedPanel  = localStorage.getItem('safescan_active_panel');
  const savedSafety = localStorage.getItem('safescan_safety') === 'true';
  const savedNotif  = localStorage.getItem('safescan_notif')  === 'true';
  const savedAccent = localStorage.getItem('safescan_accent');

  if (savedPanel)  showPanel(savedPanel, true);
  if (savedSafety) { const t = document.getElementById('safety-toggle'); if (t) { t.checked = true; startSafetyMode(); } }
  if (savedNotif)  { const t = document.getElementById('notif-toggle');  if (t) t.checked = true; state.notifications = true; }
  if (savedAccent) { try { const a = JSON.parse(savedAccent); applyAccent(a[0], a[1]); } catch {} }

  renderScamAlerts(DetectionEngine.getScamAlerts());
  state.scamAlertsLoaded = true;

  // Welcome message
  appendChatMsg('👋 Hi! I\'m SafeScan\'s security assistant. Ask me anything about cybersecurity — phishing, OTP scams, malware, password safety, and more!', 'bot');
});

// ─── CROSS-TAB SYNC ───────────────────────────
function broadcastTabState() {
  try {
    localStorage.setItem('safescan_tab_state', JSON.stringify({
      sidebarOpen: state.sidebarOpen, activePanel: state.activePanel, ts: Date.now(),
    }));
  } catch { }
}

function initCrossTabSync() {
  try {
    const saved = JSON.parse(localStorage.getItem('safescan_tab_state') || '{}');
    if (saved.activePanel) showPanel(saved.activePanel, true);
  } catch { }

  window.addEventListener('storage', e => {
    if (e.key === 'safescan_tab_state') {
      try {
        const d = JSON.parse(e.newValue || '{}');
        if (d.activePanel && d.activePanel !== state.activePanel) {
          showPanel(d.activePanel, true);
          if (!state.sidebarOpen) toggleSidebar();
          showToast('🔄 Panel synced from another tab', 'info');
        }
      } catch { }
    }
  });
}

// ─── SIDEBAR ──────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const fab = document.getElementById('fab');
  state.sidebarOpen = !state.sidebarOpen;

  if (state.sidebarOpen) {
    if (!sidebar.dataset.positioned) {
      const fr = fab.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const sw = 380, sh = Math.min(680, vh * 0.88);
      let left = fr.left - sw - 12;
      let top  = fr.top - sh + fr.height;
      if (left < 8) left = Math.min(8, fr.right + 12);
      if (top  < 8) top  = 8;
      if (left + sw > vw - 8) left = vw - sw - 8;
      if (top  + sh > vh - 8) top  = vh - sh - 8;
      sidebar.style.left = left + 'px';
      sidebar.style.top  = top  + 'px';
      sidebar.dataset.positioned = '1';
    }
    sidebar.classList.add('open');
  } else {
    sidebar.classList.remove('open');
  }
  broadcastTabState();
}

function showPanel(panelId, silent = false) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('panel-' + panelId);
  const btn   = document.querySelector(`.nav-btn[data-panel="${panelId}"]`);
  if (panel) panel.classList.add('active');
  if (btn)   btn.classList.add('active');
  state.activePanel = panelId;
  if (!silent) broadcastTabState();
}

// ─── DRAG ENGINE ──────────────────────────────
function makeDraggable(el, handle) {
  handle = handle || el;
  let dragging = false, hasMoved = false, startX, startY, startL, startT;

  function syncPosition() {
    const r = el.getBoundingClientRect();
    el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
    el.style.right = 'auto'; el.style.bottom = 'auto';
  }

  handle.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    syncPosition(); dragging = true; hasMoved = false;
    startX = e.clientX; startY = e.clientY;
    startL = parseFloat(el.style.left) || 0;
    startT = parseFloat(el.style.top)  || 0;
    el.classList.add('is-dragging'); handle.classList.add('is-dragging');
    setBodySelect(false); e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!hasMoved && Math.hypot(dx, dy) < 4) return;
    hasMoved = true;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(0, Math.min(startL + dx, vw - w)) + 'px';
    el.style.top  = Math.max(0, Math.min(startT + dy, vh - h)) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging'); handle.classList.remove('is-dragging');
    setBodySelect(true);
  });

  return { wasDragged: () => hasMoved };
}

function initDraggables() {
  const fab     = document.getElementById('fab');
  const sidebar = document.getElementById('sidebar');
  const header  = document.getElementById('sidebar-header');
  const vw = window.innerWidth, vh = window.innerHeight;
  fab.style.left = (vw - 64 - 32) + 'px'; fab.style.top = (vh - 64 - 32) + 'px';
  fab.style.right = 'auto'; fab.style.bottom = 'auto';
  const fabDrag = makeDraggable(fab);
  fab.addEventListener('click', () => { if (!fabDrag.wasDragged()) toggleSidebar(); });
  makeDraggable(sidebar, header);
}

function setBodySelect(on) {
  document.body.style.userSelect = on ? '' : 'none';
  document.body.style.webkitUserSelect = on ? '' : 'none';
}

// ─── RESULT DISPLAY ───────────────────────────
function displayResult(type, result) {
  const { score, risk, explanation, highlights = [] } = result;
  const scoreEl    = document.getElementById(type + '-score-label');
  const progressEl = document.getElementById(type + '-progress');
  const verdictEl  = document.getElementById(type + '-verdict');
  const explEl     = document.getElementById(type + '-explanation');
  const hlEl       = document.getElementById(type + '-highlights');
  const resultBox  = document.getElementById(type + '-result');
  if (!resultBox) return;
  resultBox.classList.remove('hidden');

  if (scoreEl) scoreEl.textContent = score + '% Risk';
  if (progressEl) {
    progressEl.style.width = '0%';
    progressEl.style.background = getRiskGradient(score);
    requestAnimationFrame(() => {
      progressEl.style.transition = 'width 0.8s cubic-bezier(.4,0,.2,1)';
      progressEl.style.width = score + '%';
    });
  }
  const { label, cls } = getVerdictLabel(risk);
  if (verdictEl) { verdictEl.textContent = label; verdictEl.className = 'verdict ' + cls; }
  if (explEl)    explEl.textContent = explanation;
  if (hlEl) hlEl.innerHTML = highlights.length
    ? '<ul>' + highlights.map(h => `<li>${escapeHTML(h)}</li>`).join('') + '</ul>'
    : '';

  if (risk === 'high')        showToast('🚨 High-risk content detected!', 'danger');
  else if (risk === 'medium') showToast('⚠️ Suspicious content found.', 'warn');
  else                        showToast('✅ Content appears safe.', 'success');
}

function displayFileResult(result) {
  const { risk, explanation, highlights = [] } = result;
  const verdictEl = document.getElementById('file-verdict');
  const explEl    = document.getElementById('file-explanation');
  let hlEl        = document.getElementById('file-highlights');
  const box       = document.getElementById('file-result');
  if (!hlEl && box) { hlEl = document.createElement('ul'); hlEl.id = 'file-highlights'; hlEl.className = 'highlights'; box.appendChild(hlEl); }
  const { label, cls } = getVerdictLabel(risk);
  if (verdictEl) { verdictEl.textContent = label; verdictEl.className = 'verdict ' + cls; }
  if (explEl)    explEl.textContent = explanation;
  if (hlEl)      hlEl.innerHTML = highlights.map(h => `<li>${escapeHTML(h)}</li>`).join('');
  if (risk === 'high')        showToast('🚨 Dangerous file detected!', 'danger');
  else if (risk === 'medium') showToast('⚠️ File may be risky.', 'warn');
  else                        showToast('✅ File appears safe.', 'success');
}

function getVerdictLabel(risk) {
  if (risk === 'high')   return { label:'🚨 High Risk — Potential Threat',    cls:'high'   };
  if (risk === 'medium') return { label:'⚠️ Medium Risk — Proceed Carefully', cls:'medium' };
  return                        { label:'✅ Low Risk — Appears Safe',          cls:'low'    };
}

function getRiskGradient(score) {
  if (score < 35) return 'linear-gradient(90deg,#00c8ff,#00e96a)';
  if (score < 65) return 'linear-gradient(90deg,#ffbd2e,#ff8c00)';
  return 'linear-gradient(90deg,#ff3860,#c62a88)';
}

function setLoadingState(type, loading) {
  const btn    = document.getElementById(type + '-scan-btn');
  const btnTxt = document.getElementById(type + '-btn-text');
  const spinner = document.getElementById(type + '-spinner');
  if (!btn) return;
  btn.disabled = loading;
  if (btnTxt)  btnTxt.style.display = loading ? 'none' : 'inline';
  if (spinner) spinner.classList.toggle('hidden', !loading);
}

// ─── URL SCANNER ──────────────────────────────
function scanURL() {
  const urlInput = document.getElementById('url-input');
  let url = urlInput.value.trim();
  if (!url) { showToast('Please enter a URL to scan.', 'warn'); return; }

  // Auto-prefix https:// if needed
  if (!/^https?:\/\//i.test(url)) {
    try { new URL('https://' + url); url = 'https://' + url; }
    catch { /* will be caught by analyzeURL */ }
  }

  setLoadingState('url', true);
  const result = DetectionEngine.analyzeURL(url);
  setLoadingState('url', false);
  displayResult('url', result);
}

// ─── EMAIL SCANNER ────────────────────────────
function scanEmail() {
  const text = document.getElementById('email-input').value.trim();
  if (!text || text.length < 15) { showToast('Please paste email content to analyze.', 'warn'); return; }
  setLoadingState('email', true);
  const result = DetectionEngine.analyzeEmail(text);
  setLoadingState('email', false);
  displayResult('email', result);
}

// ─── FILE CHECKER ─────────────────────────────
function checkFile(input) {
  const file = input.files[0];
  if (!file) return;
  const nameDisplay = document.getElementById('file-name-display');
  const verdictEl   = document.getElementById('file-verdict');
  const resultBox   = document.getElementById('file-result');
  resultBox.classList.remove('hidden');
  if (nameDisplay) nameDisplay.textContent = '📄 ' + file.name;
  if (verdictEl)   { verdictEl.textContent = 'Checking file…'; verdictEl.className = 'verdict'; }
  const result = DetectionEngine.analyzeFile(file.name);
  displayFileResult(result);
}

// ─── PHONE CHECKER ────────────────────────────
function checkPhone() {
  const input = document.getElementById('phone-input');
  const raw = (input ? input.value.trim() : '');
  if (!raw) { showToast('Please enter a phone number.', 'warn'); return; }
  const result = DetectionEngine.analyzePhone(raw);
  displayResult('phone', result);
  const box = document.getElementById('phone-result');
  if (box) box.classList.remove('hidden');
  if (!result.valid || result.risk === 'high')   showToast('🚨 Suspicious phone number!', 'danger');
  else if (result.risk === 'medium')              showToast('⚠️ Some suspicious patterns found.', 'warn');
  else                                            showToast('✅ Phone number appears valid.', 'success');
}

// ─── SAFETY MODE ──────────────────────────────
function toggleSafetyMode(checkbox) {
  if (checkbox.checked) {
    startSafetyMode();
    localStorage.setItem('safescan_safety', 'true');
    showToast('🛡️ Safety Mode activated!', 'success');
  } else {
    stopSafetyMode();
    localStorage.setItem('safescan_safety', 'false');
    showToast('Safety Mode disabled.', 'info');
  }
}

function startSafetyMode() {
  state.safetyMode = true;
  const txt = document.getElementById('safety-status-text');
  if (txt) txt.textContent = '🟢 Actively monitoring this page';
  runSafetyCheck();
  state.safetyInterval = setInterval(runSafetyCheck, 20000);
}

function stopSafetyMode() {
  state.safetyMode = false;
  clearInterval(state.safetyInterval);
  const txt = document.getElementById('safety-status-text');
  if (txt) txt.textContent = 'Protection is currently OFF';
  const box = document.getElementById('safety-result');
  if (box) box.classList.add('hidden');
}

function runSafetyCheck() {
  const currentURL = window.location.href;
  const box        = document.getElementById('safety-result');
  const urlDisplay = document.getElementById('safety-url-display');
  if (box) {
    box.classList.remove('hidden');
    if (urlDisplay) urlDisplay.textContent = '📍 ' + currentURL.slice(0, 90) + (currentURL.length > 90 ? '…' : '');
  }
  const result = DetectionEngine.analyzeURL(currentURL);
  const sl = document.getElementById('safety-score-label');
  const pb = document.getElementById('safety-progress');
  const vl = document.getElementById('safety-verdict');
  if (sl) sl.textContent = result.score + '% Risk';
  if (pb) { pb.style.background = getRiskGradient(result.score); pb.style.width = result.score + '%'; }
  const { label, cls } = getVerdictLabel(result.risk);
  if (vl) { vl.textContent = label; vl.className = 'verdict ' + cls; }
  if (result.risk === 'high' && state.notifications) showToast('🚨 Safety Mode: High-risk page!', 'danger');
}

// ─── SCAM ALERTS ──────────────────────────────
function loadScamAlerts() {
  if (state.scamAlertsLoaded) return;
  renderScamAlerts(DetectionEngine.getScamAlerts());
  state.scamAlertsLoaded = true;
}

function renderScamAlerts(alerts) {
  const container = document.getElementById('scam-list');
  if (!container) return;
  container.innerHTML = alerts.map(a => `
    <div class="scam-card ${a.level}">
      <div class="scam-header">
        <span class="scam-badge ${a.level}">${a.level.toUpperCase()}</span>
        <span class="scam-title">${escapeHTML(a.title)}</span>
      </div>
      <p class="scam-desc">${escapeHTML(a.description)}</p>
    </div>`).join('');
}

function toggleNotifications(checkbox) {
  state.notifications = checkbox.checked;
  localStorage.setItem('safescan_notif', checkbox.checked ? 'true' : 'false');
  if (checkbox.checked) {
    showToast('🔔 Scam alert notifications enabled!', 'success');
    setTimeout(() => showToast('🚨 ' + DetectionEngine.getScamAlerts()[0].title, 'warn'), 1500);
  } else {
    showToast('Notifications disabled.', 'info');
  }
}

// ─── CHATBOT (FAQ) ────────────────────────────
function sendChat() {
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = '';
  appendChatMsg(msg, 'user');
  const typing = appendTypingIndicator();
  setTimeout(() => {
    typing.remove();
    appendChatMsg(DetectionEngine.chatWithBot(msg), 'bot');
  }, 350);
}

function appendChatMsg(text, role) {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + role;
  div.innerHTML = `<div class="chat-bubble">${escapeHTML(text)}</div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function appendTypingIndicator() {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.innerHTML = `<div class="chat-typing"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

// ─── SETTINGS ─────────────────────────────────
function clearAllData() {
  localStorage.clear();
  state.safetyMode = false;
  state.scamAlertsLoaded = false;
  clearInterval(state.safetyInterval);
  const safetyToggle = document.getElementById('safety-toggle');
  const notifToggle  = document.getElementById('notif-toggle');
  const safetyResult = document.getElementById('safety-result');
  const safetyStatus = document.getElementById('safety-status-text');
  if (safetyToggle) safetyToggle.checked = false;
  if (notifToggle)  notifToggle.checked  = false;
  if (safetyResult) safetyResult.classList.add('hidden');
  if (safetyStatus) safetyStatus.textContent = 'Protection is currently OFF';
  applyAccent('#00c8ff', '#7b2fff');
  showToast('🗑️ All saved data cleared.', 'info');
}

// ─── APPEARANCE ───────────────────────────────
function setAccent(c1, c2) { applyAccent(c1, c2); localStorage.setItem('safescan_accent', JSON.stringify([c1, c2])); }

function applyAccent(c1, c2) {
  document.documentElement.style.setProperty('--accent-1', c1);
  document.documentElement.style.setProperty('--accent-2', c2);
}

// ─── TOAST ────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container') || (() => {
    const d = document.createElement('div'); d.id = 'toast-container'; document.body.appendChild(d); return d;
  })();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3200);
}

// ─── MODAL ────────────────────────────────────
function showModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent  = body;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ─── UTILS ────────────────────────────────────
function escapeHTML(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _showErrorInResult(type, title, detail) {
  const box = document.getElementById(type + '-result');
  if (!box) return;
  box.classList.remove('hidden');
  box.innerHTML = `<div class="error-result"><div class="error-icon">⚠️</div><div class="error-title">${title}</div><div class="error-detail">${detail}</div></div>`;
}
