/* =============================================
   SAFESCAN AI — APP.JS
   Pure JavaScript — No frameworks, no backend
============================================= */

'use strict';

// ─── STATE ────────────────────────────────────
const state = {
  apiKey: null,
  safetyMode: false,
  safetyInterval: null,
  notifications: false,
  activePanel: 'url',
  sidebarOpen: false,
};

// ─── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  renderScamAlerts();
  updateApiStatusBadge();
  initDraggables();
});

function loadSettings() {
  state.apiKey = localStorage.getItem('safescan_api_key') || null;
  const accent1 = localStorage.getItem('safescan_accent1');
  const accent2 = localStorage.getItem('safescan_accent2');
  if (accent1 && accent2) applyAccent(accent1, accent2);

  const safetyOn = localStorage.getItem('safescan_safety') === 'true';
  if (safetyOn) {
    const toggle = document.getElementById('safety-toggle');
    if (toggle) { toggle.checked = true; startSafetyMode(); }
  }

  const notifOn = localStorage.getItem('safescan_notif') === 'true';
  if (notifOn) {
    state.notifications = true;
    const notifToggle = document.getElementById('notif-toggle');
    if (notifToggle) notifToggle.checked = true;
  }

  const apiInput = document.getElementById('api-key-input');
  if (apiInput && state.apiKey) apiInput.value = state.apiKey;
}

// ─── SIDEBAR TOGGLE ───────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const fab = document.getElementById('fab');
  state.sidebarOpen = !state.sidebarOpen;

  if (state.sidebarOpen) {
    // Position sidebar near FAB if not yet manually placed
    if (!sidebar.dataset.positioned) {
      const fabRect = fab.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const sw = sidebar.offsetWidth || 380;
      const sh = Math.min(sidebar.offsetHeight || 680, vh * 0.88);

      // Try to place above and to the left of the FAB
      let left = fabRect.left - sw - 12;
      let top  = fabRect.top - sh + fabRect.height;

      // Clamp to viewport
      if (left < 8) left = Math.min(8, fabRect.right + 12);
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
}

function showPanel(panelId) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const panel = document.getElementById('panel-' + panelId);
  const btn = document.querySelector(`.nav-btn[data-panel="${panelId}"]`);

  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
  state.activePanel = panelId;
}

// ─── DRAGGABLE ENGINE ─────────────────────────
/**
 * makeDraggable(el, handle)
 * el     — the element to move (must be position:fixed)
 * handle — the element to drag from (defaults to el itself)
 *
 * Uses left/top positioning. Clamps to viewport.
 * Distinguishes click from drag via 4px movement threshold.
 */
function makeDraggable(el, handle) {
  handle = handle || el;

  let startX, startY;    // mouse coords on mousedown
  let startL, startT;    // element left/top on mousedown
  let dragging = false;
  let hasMoved = false;  // true once we exceed click threshold

  // Capture real rendered position in left/top so drag starts correctly.
  // Works even if the element was positioned via CSS (bottom/right/transform).
  function syncPosition() {
    const r = el.getBoundingClientRect();
    el.style.left   = r.left + 'px';
    el.style.top    = r.top  + 'px';
    el.style.right  = 'auto';
    el.style.bottom = 'auto';
    // Do NOT clear transform here — CSS hover/active may still use it.
    // We only update left/top from here on.
  }

  handle.addEventListener('mousedown', (e) => {
    // Let interactive children (close btn, inputs) handle their own events
    if (e.target !== handle && e.target.closest('button, input, textarea, a, select')) return;

    syncPosition();

    dragging  = true;
    hasMoved  = false;
    startX    = e.clientX;
    startY    = e.clientY;
    startL    = parseFloat(el.style.left)  || 0;
    startT    = parseFloat(el.style.top)   || 0;

    el.classList.add('is-dragging');
    handle.classList.add('is-dragging');
    setBodySelect(false);
    e.preventDefault();   // stop text selection + default drag-image
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!hasMoved && Math.hypot(dx, dy) < 4) return;   // 4px threshold
    hasMoved = true;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w  = el.offsetWidth;
    const h  = el.offsetHeight;

    el.style.left = Math.max(0, Math.min(startL + dx, vw - w)) + 'px';
    el.style.top  = Math.max(0, Math.min(startT + dy, vh - h)) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    handle.classList.remove('is-dragging');
    setBodySelect(true);
  });

  // Expose hasMoved so callers can gate click handlers
  return { getHasMoved: () => hasMoved, reset: () => { hasMoved = false; } };
}

function initDraggables() {
  const fab     = document.getElementById('fab');
  const sidebar = document.getElementById('sidebar');
  const header  = document.getElementById('sidebar-header');

  // ── Place FAB at bottom-right on load ──
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  fab.style.left   = (vw - 64 - 32) + 'px';
  fab.style.top    = (vh - 64 - 32) + 'px';
  fab.style.right  = 'auto';
  fab.style.bottom = 'auto';

  // Wire FAB click via JS (NOT inline onclick) so drag guard works
  const fabDrag = makeDraggable(fab);
  fab.addEventListener('click', () => {
    if (fabDrag.getHasMoved()) { fabDrag.reset(); return; }  // was a drag — ignore click
    toggleSidebar();
  });

  makeDraggable(sidebar, header);
}

function setBodySelect(on) {
  document.body.style.userSelect       = on ? '' : 'none';
  document.body.style.webkitUserSelect = on ? '' : 'none';
}

// ─── API STATUS ───────────────────────────────
function updateApiStatusBadge() {
  const badge = document.getElementById('api-status-badge');
  if (!badge) return;
  if (state.apiKey) {
    badge.className = 'api-badge connected';
    badge.textContent = '🟢 AI Connected';
  } else {
    badge.className = 'api-badge basic';
    badge.textContent = '⚪ Basic Mode';
  }
}

// ─── URL SCANNER ──────────────────────────────
const URL_RISK_KEYWORDS = [
  { kw: 'login', score: 15 }, { kw: 'verify', score: 18 }, { kw: 'update', score: 12 },
  { kw: 'account', score: 10 }, { kw: 'secure', score: 10 }, { kw: 'banking', score: 20 },
  { kw: 'password', score: 18 }, { kw: 'confirm', score: 12 }, { kw: 'free', score: 15 },
  { kw: 'click', score: 10 }, { kw: 'urgent', score: 20 }, { kw: 'paypal', score: 22 },
  { kw: 'amazon', score: 10 }, { kw: 'apple', score: 10 }, { kw: 'microsoft', score: 10 },
  { kw: 'prize', score: 22 }, { kw: 'winner', score: 22 }, { kw: 'gift', score: 15 },
  { kw: 'reward', score: 15 }, { kw: 'bit.ly', score: 30 }, { kw: 'tinyurl', score: 25 },
  { kw: 'goo.gl', score: 25 }, { kw: 'ow.ly', score: 25 },
];

const URL_SUSPICIOUS_TLDS = ['.xyz', '.top', '.club', '.click', '.link', '.tk', '.gq', '.ga', '.cf', '.ml'];
const URL_SAFE_DOMAINS = ['google.com', 'github.com', 'microsoft.com', 'apple.com', 'amazon.com',
  'wikipedia.org', 'mozilla.org', 'stackoverflow.com', 'youtube.com', 'linkedin.com'];

function analyzeURLLocal(url) {
  let score = 0;
  const reasons = [];
  const lower = url.toLowerCase();

  // IP address used as domain
  if (/https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(lower)) {
    score += 40; reasons.push('IP address used instead of domain name');
  }

  // Suspicious TLD
  if (URL_SUSPICIOUS_TLDS.some(tld => lower.includes(tld))) {
    score += 20; reasons.push('Suspicious top-level domain detected');
  }

  // No HTTPS
  if (lower.startsWith('http://')) {
    score += 15; reasons.push('Insecure HTTP connection (no HTTPS)');
  }

  // Too many subdomains
  try {
    const hostname = new URL(url).hostname;
    if (hostname.split('.').length > 4) {
      score += 20; reasons.push('Excessive subdomain nesting detected');
    }
    // Check safe list
    if (URL_SAFE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      score = Math.max(0, score - 25);
      reasons.push('Domain appears on trusted list');
    }
  } catch { /* not a valid URL */ }

  // Long URL
  if (url.length > 100) { score += 10; reasons.push('Unusually long URL'); }

  // Keyword checks
  URL_RISK_KEYWORDS.forEach(({ kw, score: s }) => {
    if (lower.includes(kw)) { score += s; reasons.push(`Suspicious keyword: "${kw}"`); }
  });

  // Multiple @ symbols
  if ((url.match(/@/g) || []).length > 1) { score += 25; reasons.push('Multiple @ symbols in URL'); }

  score = Math.min(100, Math.max(0, score));
  return { score, reasons };
}

async function scanURL() {
  const urlInput = document.getElementById('url-input');
  const url = urlInput.value.trim();

  if (!url) { showToast('Please enter a URL to scan.', 'warn'); return; }
  if (!/^https?:\/\//i.test(url)) { showToast('Please enter a URL starting with http:// or https://', 'warn'); return; }

  setLoadingState('url', true);
  await sleep(700);

  let score, reasons;

  if (state.apiKey) {
    try {
      const result = await callGeminiAPI(
        `You are a cybersecurity expert. Analyze this URL for phishing, malware, or scam indicators:\n${url}\n\nRespond ONLY with valid JSON:\n{"score": <0-100 risk score>, "reasons": ["reason1", "reason2"], "summary": "one sentence verdict"}`
      );
      const data = JSON.parse(result);
      score = Math.min(100, Math.max(0, data.score || 0));
      reasons = data.reasons || [];
      reasons.push('(Analysis by Gemini AI)');
    } catch {
      const local = analyzeURLLocal(url);
      score = local.score; reasons = local.reasons;
      reasons.push('(AI unavailable — local analysis used)');
    }
  } else {
    const local = analyzeURLLocal(url);
    score = local.score; reasons = local.reasons;
  }

  setLoadingState('url', false);
  displayResult('url', score, reasons);
}

// ─── EMAIL SCANNER ────────────────────────────
const EMAIL_PATTERNS = [
  { pattern: /urgent|immediately|act now|respond now|time.sensitive/i, label: 'Urgency tactics', score: 20 },
  { pattern: /your account (has been|will be|is) (suspended|closed|limited|locked)/i, label: 'Account threat', score: 25 },
  { pattern: /verify your (account|identity|email|information)/i, label: 'Verification request', score: 18 },
  { pattern: /click (here|this link|the link|below)/i, label: 'Suspicious CTA', score: 12 },
  { pattern: /congratulations|you.ve (won|been selected|been chosen)/i, label: 'Prize/lottery scam', score: 28 },
  { pattern: /dear (customer|user|member|friend)/i, label: 'Generic salutation', score: 10 },
  { pattern: /bank (account|details|transfer|wire)/i, label: 'Banking reference', score: 20 },
  { pattern: /password|login credentials/i, label: 'Credential request', score: 22 },
  { pattern: /\$[\d,]+|\d+ (dollars|usd|gbp|eur)/i, label: 'Financial incentive', score: 15 },
  { pattern: /nigeria|prince|inheritance|million dollars/i, label: 'Nigerian prince scam', score: 40 },
  { pattern: /irs|tax refund|government (grant|payment)/i, label: 'Government impersonation', score: 30 },
  { pattern: /invoice (attached|enclosed)|payment (due|overdue)/i, label: 'Fake invoice', score: 20 },
];

function analyzeEmailLocal(text) {
  let score = 0;
  const found = [];
  EMAIL_PATTERNS.forEach(({ pattern, label, score: s }) => {
    if (pattern.test(text)) { score += s; found.push(label); }
  });

  // Check for suspicious links
  const linkCount = (text.match(/https?:\/\//g) || []).length;
  if (linkCount > 3) { score += 10; found.push(`Multiple URLs (${linkCount}) detected`); }

  score = Math.min(100, score);
  return { score, found };
}

async function scanEmail() {
  const emailText = document.getElementById('email-input').value.trim();
  if (!emailText || emailText.length < 20) { showToast('Please paste a full email to analyze.', 'warn'); return; }

  setLoadingState('email', true);
  await sleep(800);

  let score, found, explanation;

  if (state.apiKey) {
    try {
      const result = await callGeminiAPI(
        `You are a cybersecurity email analyst. Analyze this email for phishing, scams, and suspicious patterns:\n\n${emailText.slice(0, 2000)}\n\nRespond ONLY with valid JSON:\n{"score": <0-100 risk score>, "flags": ["flag1","flag2"], "summary": "one sentence verdict"}`
      );
      const data = JSON.parse(result);
      score = Math.min(100, Math.max(0, data.score || 0));
      found = data.flags || [];
      explanation = data.summary || '';
    } catch {
      const local = analyzeEmailLocal(emailText);
      score = local.score; found = local.found;
    }
  } else {
    const local = analyzeEmailLocal(emailText);
    score = local.score; found = local.found;
  }

  setLoadingState('email', false);

  const resultBox = document.getElementById('email-result');
  const scoreLabel = document.getElementById('email-score-label');
  const progressBar = document.getElementById('email-progress');
  const verdictEl = document.getElementById('email-verdict');
  const highlightsEl = document.getElementById('email-highlights');
  const explanationEl = document.getElementById('email-explanation');

  resultBox.classList.remove('hidden');
  scoreLabel.textContent = score + '%';
  setTimeout(() => {
    progressBar.style.width = score + '%';
    progressBar.style.background = getRiskGradient(score);
  }, 50);

  const { label, cls } = getVerdictLabel(score, true);
  verdictEl.textContent = label;
  verdictEl.className = 'verdict ' + cls;

  highlightsEl.innerHTML = found.map(f => `<span class="highlight-tag">⚠ ${f}</span>`).join('');

  if (!explanation) {
    if (score === 0) explanation = 'No suspicious patterns detected. Email appears safe.';
    else if (score < 30) explanation = 'Minor indicators found. Exercise normal caution.';
    else if (score < 60) explanation = 'Multiple phishing indicators detected. Do not click links or share personal data.';
    else explanation = 'High-risk email detected! This is very likely a phishing or scam attempt. Do not interact with it.';
  }

  explanationEl.textContent = explanation;
}

// ─── FILE CHECKER ─────────────────────────────
const DANGEROUS_EXTENSIONS = [
  { ext: '.exe', level: 'high', label: 'Windows Executable — can run malicious code' },
  { ext: '.bat', level: 'high', label: 'Batch Script — can execute system commands' },
  { ext: '.cmd', level: 'high', label: 'Windows Command Script' },
  { ext: '.ps1', level: 'high', label: 'PowerShell Script' },
  { ext: '.apk', level: 'high', label: 'Android Package — verify before installing' },
  { ext: '.vbs', level: 'high', label: 'Visual Basic Script — commonly used in malware' },
  { ext: '.jar', level: 'medium', label: 'Java Archive — can execute code on your system' },
  { ext: '.msi', level: 'medium', label: 'Windows Installer' },
  { ext: '.scr', level: 'high', label: 'Screen Saver — often used to disguise malware' },
  { ext: '.dmg', level: 'medium', label: 'macOS Disk Image' },
  { ext: '.sh', level: 'medium', label: 'Shell Script' },
  { ext: '.iso', level: 'low', label: 'Disk Image — can contain malicious installers' },
  { ext: '.zip', level: 'low', label: 'Archive — may contain hidden malicious files' },
  { ext: '.rar', level: 'low', label: 'Archive — inspect contents before extracting' },
  { ext: '.docm', level: 'medium', label: 'Word Document with Macros — macros can be malicious' },
  { ext: '.xlsm', level: 'medium', label: 'Excel with Macros' },
];

const SAFE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
  '.mp4', '.mp3', '.wav', '.pdf', '.txt', '.csv', '.xlsx', '.docx'];

function checkFile(input) {
  const file = input.files[0];
  if (!file) return;

  const name = file.name;
  const ext = '.' + name.split('.').pop().toLowerCase();
  const resultBox = document.getElementById('file-result');
  const nameDisplay = document.getElementById('file-name-display');
  const verdictEl = document.getElementById('file-verdict');
  const explanationEl = document.getElementById('file-explanation');

  resultBox.classList.remove('hidden');
  nameDisplay.textContent = '📄 ' + name;

  const dangerous = DANGEROUS_EXTENSIONS.find(d => d.ext === ext);
  const safe = SAFE_EXTENSIONS.includes(ext);

  if (dangerous) {
    const level = dangerous.level;
    verdictEl.textContent = level === 'high' ? '🚨 HIGH RISK FILE' : level === 'medium' ? '⚠️ MEDIUM RISK FILE' : '⚠️ LOW RISK FILE';
    verdictEl.className = 'verdict ' + level;
    explanationEl.textContent = dangerous.label + '. Extension: ' + ext.toUpperCase();
    showToast(`⚠️ Risky file detected: ${name}`, 'danger');
  } else if (safe) {
    verdictEl.textContent = '✅ File Appears Safe';
    verdictEl.className = 'verdict safe';
    explanationEl.textContent = `"${ext.toUpperCase()}" is a generally safe file type. Always verify file source.`;
  } else {
    verdictEl.textContent = '🔍 Unknown File Type';
    verdictEl.className = 'verdict medium';
    explanationEl.textContent = `Unknown extension "${ext.toUpperCase()}". Cannot determine safety. Proceed with caution.`;
  }
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
  const statusText = document.getElementById('safety-status-text');
  if (statusText) statusText.textContent = '🟢 Actively monitoring this page';
  checkCurrentPage();
  state.safetyInterval = setInterval(checkCurrentPage, 15000);
}

function stopSafetyMode() {
  state.safetyMode = false;
  clearInterval(state.safetyInterval);
  const statusText = document.getElementById('safety-status-text');
  if (statusText) statusText.textContent = 'Protection is currently OFF';
  const resultBox = document.getElementById('safety-result');
  if (resultBox) resultBox.classList.add('hidden');
}

function checkCurrentPage() {
  const currentURL = window.location.href;
  const { score, reasons } = analyzeURLLocal(currentURL);

  const resultBox = document.getElementById('safety-result');
  const scoreLabel = document.getElementById('safety-score-label');
  const progressBar = document.getElementById('safety-progress');
  const verdictEl = document.getElementById('safety-verdict');
  const urlDisplay = document.getElementById('safety-url-display');

  if (resultBox) {
    resultBox.classList.remove('hidden');
    scoreLabel.textContent = score + '%';
    setTimeout(() => {
      progressBar.style.width = score + '%';
      progressBar.style.background = getRiskGradient(score);
    }, 50);
    const { label, cls } = getVerdictLabel(score);
    verdictEl.textContent = label;
    verdictEl.className = 'verdict ' + cls;
    urlDisplay.textContent = '📍 ' + currentURL.slice(0, 80) + (currentURL.length > 80 ? '…' : '');
  }

  if (score >= 60) {
    showModal(
      '⚠️ Potentially Unsafe Page',
      `This page scored ${score}% risk. Suspicious patterns were detected. Exercise caution and do not enter sensitive information.`
    );
  }
}

// ─── SCAM ALERTS DATA ─────────────────────────
const SCAM_ALERTS = [
  {
    title: 'Fake IRS Tax Refund Email Campaign',
    desc: 'Cybercriminals are sending mass emails impersonating the IRS, offering fake tax refunds to steal SSNs and banking info.',
    level: 'high',
    date: 'Mar 2025',
  },
  {
    title: 'AI Voice Cloning Phone Scams',
    desc: 'Scammers are using AI-cloned voices of family members to urgently request wire transfers or gift cards.',
    level: 'high',
    date: 'Mar 2025',
  },
  {
    title: 'Fake Package Delivery SMS',
    desc: 'SMS phishing (smishing) campaigns pretend to be FedEx, UPS, or USPS asking you to click a link to reschedule delivery.',
    level: 'high',
    date: 'Feb 2025',
  },
  {
    title: 'Crypto Investment "Pig Butchering" Scams',
    desc: 'Long-term romance scams lure victims into fake crypto investment platforms before draining accounts.',
    level: 'high',
    date: 'Feb 2025',
  },
  {
    title: 'LinkedIn Job Offer Phishing',
    desc: 'Fake recruiters on LinkedIn send malicious file attachments disguised as job offers containing malware.',
    level: 'medium',
    date: 'Jan 2025',
  },
  {
    title: 'Browser Notification Hijacking',
    desc: 'Malicious sites trick users into enabling notifications, then use them to display fake virus alerts.',
    level: 'medium',
    date: 'Jan 2025',
  },
  {
    title: 'Google Docs Phishing via Sharing',
    desc: 'Attackers share Google Docs with embedded malicious links, bypassing email spam filters.',
    level: 'medium',
    date: 'Dec 2024',
  },
  {
    title: 'Public Wi-Fi Evil Twin Attacks',
    desc: 'Attackers set up fake hotspots mimicking public Wi-Fi to intercept your network traffic.',
    level: 'low',
    date: 'Dec 2024',
  },
];

function renderScamAlerts() {
  const list = document.getElementById('scam-alerts-list');
  if (!list) return;
  list.innerHTML = SCAM_ALERTS.map(alert => `
    <div class="scam-card">
      <div class="scam-card-head">
        <div class="scam-card-title">${alert.title}</div>
        <span class="scam-badge ${alert.level}">${alert.level}</span>
      </div>
      <div class="scam-card-desc">${alert.desc} <span style="color: var(--text-dim); font-size: 0.7rem;">(${alert.date})</span></div>
    </div>
  `).join('');

  // Show notification if enabled
  if (state.notifications) {
    setTimeout(() => {
      showToast('🚨 ' + SCAM_ALERTS[0].title, 'warn');
    }, 1000);
  }
}

function toggleNotifications(checkbox) {
  state.notifications = checkbox.checked;
  localStorage.setItem('safescan_notif', checkbox.checked ? 'true' : 'false');
  if (checkbox.checked) {
    showToast('🔔 Scam alert notifications enabled!', 'success');
    setTimeout(() => showToast('🚨 ' + SCAM_ALERTS[0].title, 'warn'), 1500);
  } else {
    showToast('Notifications disabled.', 'info');
  }
}

// ─── AI CHATBOT ───────────────────────────────
const MOCK_RESPONSES = [
  "That's a great question about cybersecurity! Generally, always use strong unique passwords and enable two-factor authentication wherever possible.",
  "Phishing emails often create urgency to make you act without thinking. Look for generic greetings, misspelled domains, and suspicious links.",
  "For safe browsing: keep your browser updated, use HTTPS sites, and consider a reputable VPN on public Wi-Fi.",
  "A strong password should be at least 12 characters long, mixing uppercase, lowercase, numbers, and symbols. A password manager can help!",
  "Ransomware encrypts your files and demands payment. Prevention: regular backups, updated software, and not opening unknown attachments.",
  "Two-factor authentication (2FA) adds a second verification step — even if someone steals your password, they can't log in without your phone.",
  "Public Wi-Fi networks can be dangerous. Avoid accessing sensitive accounts on public networks, or use a VPN to encrypt your traffic.",
  "Software updates often include critical security patches. Always keep your OS and applications up to date to protect against known vulnerabilities.",
];

let mockIndex = 0;

async function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  appendChatMsg(msg, 'user');

  const typing = appendTypingIndicator();
  await sleep(state.apiKey ? 500 : 900);

  let response;
  if (state.apiKey) {
    try {
      response = await callGeminiAPI(
        `You are SafeScan AI, a friendly and knowledgeable cybersecurity assistant. Provide helpful, accurate, and concise advice. Keep responses under 150 words.\n\nUser: ${msg}`
      );
    } catch (e) {
      response = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length];
      mockIndex++;
    }
  } else {
    response = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length];
    mockIndex++;
  }

  typing.remove();
  appendChatMsg(response, 'bot');
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
  div.innerHTML = `
    <div class="chat-typing">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

// ─── SETTINGS ─────────────────────────────────
function saveApiKey() {
  const input = document.getElementById('api-key-input');
  const key = input.value.trim();
  const statusEl = document.getElementById('api-key-status');

  if (!key) {
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(255,56,96,0.12)';
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = '❌ Please enter a valid API key.';
    return;
  }

  localStorage.setItem('safescan_api_key', key);
  state.apiKey = key;
  updateApiStatusBadge();

  statusEl.style.display = 'block';
  statusEl.style.background = 'rgba(0,233,106,0.1)';
  statusEl.style.color = 'var(--success)';
  statusEl.textContent = '✅ API Key saved! AI features are now active.';
  showToast('🔑 API key saved — AI mode enabled!', 'success');
}

function clearAllData() {
  localStorage.clear();
  state.apiKey = null;
  state.safetyMode = false;
  clearInterval(state.safetyInterval);

  const apiInput = document.getElementById('api-key-input');
  if (apiInput) apiInput.value = '';
  const safetyToggle = document.getElementById('safety-toggle');
  if (safetyToggle) safetyToggle.checked = false;
  const notifToggle = document.getElementById('notif-toggle');
  if (notifToggle) notifToggle.checked = false;
  const safetyResult = document.getElementById('safety-result');
  if (safetyResult) safetyResult.classList.add('hidden');
  const safetyStatus = document.getElementById('safety-status-text');
  if (safetyStatus) safetyStatus.textContent = 'Protection is currently OFF';

  updateApiStatusBadge();
  showToast('🗑️ All saved data cleared.', 'info');
  applyAccent('#00c8ff', '#7b2fff');
}

function setAccent(c1, c2) {
  localStorage.setItem('safescan_accent1', c1);
  localStorage.setItem('safescan_accent2', c2);
  applyAccent(c1, c2);
  showToast('🎨 Accent color updated!', 'success');
}

function applyAccent(c1, c2) {
  document.documentElement.style.setProperty('--accent-1', c1);
  document.documentElement.style.setProperty('--accent-2', c2);
  document.documentElement.style.setProperty('--accent-grad', `linear-gradient(135deg, ${c1}, ${c2})`);
}

// ─── GEMINI API ───────────────────────────────
async function callGeminiAPI(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${state.apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error('API request failed: ' + response.status);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─── DISPLAY HELPERS ──────────────────────────
function displayResult(type, score, reasons) {
  const resultBox = document.getElementById(type + '-result');
  const scoreLabel = document.getElementById(type + '-score-label');
  const progressBar = document.getElementById(type + '-progress');
  const verdictEl = document.getElementById(type + '-verdict');
  const explanationEl = document.getElementById(type + '-explanation');

  resultBox.classList.remove('hidden');
  scoreLabel.textContent = score + '%';

  setTimeout(() => {
    progressBar.style.width = score + '%';
    progressBar.style.background = getRiskGradient(score);
  }, 50);

  const { label, cls } = getVerdictLabel(score);
  verdictEl.textContent = label;
  verdictEl.className = 'verdict ' + cls;

  if (score >= 70) {
    showToast('🚨 High-risk URL detected!', 'danger');
  } else if (score >= 40) {
    showToast('⚠️ Suspicious URL — proceed with caution.', 'warn');
  } else {
    showToast('✅ URL appears relatively safe.', 'success');
  }

  explanationEl.innerHTML = reasons.map(r => `• ${r}`).join('<br/>');
}

function getVerdictLabel(score, invert = false) {
  // For email: invert=true means high score = more risky (same logic but label changes)
  if (score === 0) return { label: '✅ No threats detected', cls: 'safe' };
  if (score < 30) return { label: '✅ Low Risk — Appears Safe', cls: 'low' };
  if (score < 60) return { label: '⚠️ Medium Risk — Proceed Carefully', cls: 'medium' };
  return { label: '🚨 High Risk — Potential Threat', cls: 'high' };
}

function getRiskGradient(score) {
  if (score < 30) return 'linear-gradient(90deg, #00e96a, #7fffc4)';
  if (score < 60) return 'linear-gradient(90deg, #ffbd2e, #ff8c00)';
  return 'linear-gradient(90deg, #ff3860, #7b2fff)';
}

function setLoadingState(type, loading) {
  const btn = document.getElementById(type + '-scan-btn');
  const btnText = document.getElementById(type + '-btn-text');
  const spinner = document.getElementById(type + '-spinner');
  if (!btn) return;
  btn.disabled = loading;
  if (btnText) btnText.style.display = loading ? 'none' : 'inline';
  if (spinner) spinner.classList.toggle('hidden', !loading);
}

// ─── TOAST ────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const icons = { success: '✅', warn: '⚠️', danger: '🚨', info: 'ℹ️' };
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHTML(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─── MODAL ────────────────────────────────────
function showModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// Click outside modal to close
document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ─── UTILITIES ────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
