/* =====================================================
   SAFESCAN — Detection Engine (detectionEngine.js)
   Pure rule-based, keyword-driven analysis. No AI.
   Exposed as window.DetectionEngine
===================================================== */
'use strict';

const DetectionEngine = (() => {

  // ─── URL ANALYSIS ─────────────────────────────
  const URL_KEYWORDS = ['login','verify','bank','secure','update','free','win',
    'account','password','confirm','suspended','paypal','apple','amazon',
    'microsoft','netflix','ebay','claim','reward','signin','wallet'];
  const BAD_TLDS = ['.xyz','.tk','.ml','.ga','.cf','.click','.download','.top','.gq','.buzz'];

  function analyzeURL(url) {
    if (!url) return { score:0, risk:'low', explanation:'No URL provided.', highlights:[] };
    let score = 0;
    const flags = [];
    const low = url.toLowerCase();

    if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(url)) {
      score += 35; flags.push('Contains IP address instead of a domain name');
    }
    if (url.includes('@')) {
      score += 25; flags.push('@ symbol in URL — classic phishing redirection trick');
    }
    let kw = 0;
    for (const w of URL_KEYWORDS) {
      if (low.includes(w) && kw < 30) { kw += 10; flags.push(`Suspicious keyword: "${w}"`); }
    }
    score += kw;
    try {
      const h = new URL(url).hostname;
      const parts = h.split('.');
      if (parts.length > 3) { score += 20; flags.push(`Excessive subdomains (${parts.length-2} levels)`); }
      if ((h.match(/-/g)||[]).length >= 3) { score += 10; flags.push('Excessive hyphens in domain'); }
    } catch {}
    if (url.length > 100) { score += 15; flags.push(`Unusually long URL (${url.length} chars)`); }
    if (url.startsWith('http://')) { score += 10; flags.push('Unencrypted HTTP — no SSL'); }
    if (BAD_TLDS.some(t => low.endsWith(t) || low.includes(t+'/'))) {
      score += 20; flags.push('Suspicious top-level domain');
    }

    score = Math.min(100, score);
    const risk = score >= 70 ? 'high' : score >= 30 ? 'medium' : 'low';
    const exp = {
      low:    'This URL appears safe. No significant red flags detected.',
      medium: 'This URL has suspicious characteristics. Verify before clicking.',
      high:   'This URL shows multiple high-risk indicators — likely phishing or scam. Do NOT visit.',
    };
    return { score, risk, explanation: exp[risk], highlights: flags };
  }

  // ─── EMAIL ANALYSIS ───────────────────────────
  const URGENT = ['urgent','immediate action','verify your account','account suspended',
    'password reset','limited time','expires soon','act now','click here immediately',
    'unusual sign-in','confirm your identity','unauthorized access','your account will be'];
  const OTP_PHRASES = ['otp','one-time password','share your password','your pin',
    'verification code','enter the code','bank account number','send money'];

  function analyzeEmail(text) {
    if (!text || text.length < 10) return { score:0, risk:'low', explanation:'Too little text.', highlights:[] };
    let score = 0;
    const flags = [];
    const low = text.toLowerCase();

    let us = 0;
    for (const p of URGENT) { if (low.includes(p) && us < 40) { us += 12; flags.push(`Urgency phrase: "${p}"`); } }
    score += us;

    let os = 0;
    for (const p of OTP_PHRASES) { if (low.includes(p) && os < 35) { os += 20; flags.push(`Credential request: "${p}"`); } }
    score += os;

    const links = (text.match(/https?:\/\//g)||[]).length;
    if (links > 3) { score += 15; flags.push(`${links} links found — unusual for legitimate email`); }

    const caps = (text.match(/\b[A-Z]{4,}\b/g)||[]).filter(w=>!['HTML','HTTP','HTTPS','FROM','DKIM'].includes(w));
    if (caps.length > 2) { score += 10; flags.push(`${caps.length} ALL-CAPS words — urgency tactic`); }

    if (low.includes('do not reply') || low.includes('this is an automated')) {
      score += 5; flags.push('Automated no-reply email — harder to verify');
    }

    score = Math.min(100, score);
    const risk = score >= 70 ? 'high' : score >= 30 ? 'medium' : 'low';
    const exp = {
      low:    'This email appears legitimate. No significant phishing indicators found.',
      medium: 'This email has suspicious patterns. Verify the sender before clicking any links.',
      high:   'Strong phishing indicators detected. Do NOT click links or share any information.',
    };
    return { score, risk, explanation: exp[risk], highlights: flags };
  }

  // ─── FILE ANALYSIS ────────────────────────────
  const HIGH_RISK = new Set(['exe','bat','cmd','vbs','ps1','jar','apk','dmg',
    'sh','msi','scr','com','pif','reg','dll','hta','wsf']);
  const MED_RISK  = new Set(['zip','rar','7z','tar','gz','iso','docm','xlsm',
    'pptm','js','lnk','cab']);

  function analyzeFile(fileName) {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    if (HIGH_RISK.has(ext)) {
      return { score:88, risk:'high',
        explanation: `.${ext} files can execute code directly and are commonly used to deliver ransomware, trojans, and spyware.`,
        highlights: [`High-risk executable type (.${ext})`, 'Only open from verified, trusted sources'] };
    }
    if (MED_RISK.has(ext)) {
      return { score:52, risk:'medium',
        explanation: `.${ext} files may contain hidden executables or macros. Scan with antivirus before opening.`,
        highlights: [`Potentially risky file type (.${ext})`, 'Archives can bundle malicious executables'] };
    }
    return { score:8, risk:'low',
      explanation: `${ext.toUpperCase() || 'This'} files are generally safe. Always verify the source.`,
      highlights: ['Common safe file format'] };
  }

  // ─── PHONE ANALYSIS ───────────────────────────
  const SCAM_PREFIXES = ['190','191','900','976','809','876','284','268',
    '473','664','649','767','784','868','869','758','242','246'];

  function analyzePhone(raw) {
    const digits = raw.replace(/\D/g, '');
    const flags = [];
    let score = 0;

    if (digits.length < 10 || digits.length > 15) {
      return { valid:false, score:75, risk:'high',
        explanation:`Phone number has ${digits.length} digit(s). Valid numbers are 10–15 digits.`,
        highlights:['Invalid number length'] };
    }
    if (/^(\d)\1+$/.test(digits))  { score += 70; flags.push('All identical digits — likely fake'); }
    if (/01234567|12345678|23456789|98765432|87654321/.test(digits)) {
      score += 35; flags.push('Sequential digit pattern — common in test/fake numbers');
    }
    const p3 = digits.slice(0,3);
    if (SCAM_PREFIXES.includes(p3)) {
      score += 40; flags.push(`Area code ${p3} associated with premium-rate or scam calls`);
    }
    if (digits === '0'.repeat(digits.length)) { score += 80; flags.push('All zeros — invalid'); }

    score = Math.min(100, score);
    const risk = score >= 70 ? 'high' : score >= 30 ? 'medium' : 'low';
    const exp = {
      low:    'This number appears valid with no suspicious patterns.',
      medium: 'Some unusual patterns detected. Exercise caution with calls from this number.',
      high:   'Strong indicators this number is fake or used in scam operations.',
    };
    return { valid:true, score, risk, explanation: exp[risk], highlights: flags };
  }

  // ─── CHATBOT FAQ ──────────────────────────────
  const FAQ = [
    { kw:['phishing','phish','fake email','fake website'],
      ans:'🎣 Phishing is a cyber attack where criminals impersonate trusted organizations via email, SMS, or websites to steal your credentials. Always verify the sender\'s email domain and check for HTTPS before entering any data.' },
    { kw:['otp','one time password','share otp','otp scam'],
      ans:'🔐 NEVER share your OTP with anyone — not even your bank. Banks and apps will NEVER ask for OTP over phone, email, or chat. If asked, hang up immediately and report.' },
    { kw:['password','strong password','password tips'],
      ans:'🔑 A strong password: (1) is 12+ characters, (2) mixes uppercase, lowercase, numbers & symbols, (3) is unique per account. Use a password manager like Bitwarden or 1Password.' },
    { kw:['scam','identify scam','detect scam','scam call'],
      ans:'🚨 Signs of a scam: (1) Unexpected urgency or pressure, (2) Requests for money, gift cards, or OTP, (3) Too-good-to-be-true offers. Hang up and verify independently.' },
    { kw:['malware','virus','trojan','ransomware'],
      ans:'🦠 Malware includes viruses, trojans, ransomware & spyware. Only install software from official sources, keep your OS updated, and use reputable antivirus software.' },
    { kw:['vpn','what is vpn'],
      ans:'🛡️ A VPN encrypts your internet traffic and hides your IP. It\'s especially important on public Wi-Fi. Trusted options: ProtonVPN, Mullvad, NordVPN.' },
    { kw:['safe browsing','internet safety','browse safely'],
      ans:'✅ Safe browsing: (1) Always check for HTTPS, (2) Don\'t click unknown links, (3) Use an ad-blocker, (4) Keep your browser updated, (5) Use private mode for sensitive sessions.' },
    { kw:['two factor','2fa','authenticator','two step'],
      ans:'🔒 2FA adds a second verification step beyond your password. Enable it everywhere — use an authenticator app (Google Authenticator / Authy) instead of SMS when possible.' },
    { kw:['url','check link','suspicious link','safe link'],
      ans:'🔗 To check a URL: (1) Hover before clicking to see the real destination, (2) Look for misspellings (paypa1.com), (3) Avoid IP-based URLs, (4) Use our URL Scanner above!' },
    { kw:['social engineering','manipulation','pretexting'],
      ans:'🎭 Social engineering manipulates people into revealing confidential info via fake scenarios, urgency pressure, or too-good offers. Always verify requests through official channels.' },
    { kw:['hello','hi','hey','help'],
      ans:'👋 Hi! I\'m SafeScan\'s security assistant. Ask me about phishing, OTP scams, strong passwords, malware, VPN, safe browsing, or 2FA!' },
  ];

  function chatWithBot(message) {
    if (!message || !message.trim()) return 'Please type a cybersecurity question.';
    const low = message.toLowerCase().trim();
    for (const entry of FAQ) {
      if (entry.kw.some(k => low.includes(k))) return entry.ans;
    }
    return '🤔 I didn\'t find a match. Try asking about: phishing, OTP scams, malware, passwords, VPN, 2FA, or safe browsing!';
  }

  // ─── SCAM ALERTS (static) ─────────────────────
  function getScamAlerts() {
    return [
      { title:'Fake Bank OTP Scam',         description:'Fraudsters call posing as bank staff to steal OTP codes. Your bank will NEVER ask for your OTP over phone or email.',          level:'high'   },
      { title:'Lottery / Prize Scam',        description:'Messages claiming you won a prize ask for fees or personal info. Legitimate lotteries never require upfront payment.',          level:'high'   },
      { title:'AI Voice Cloning Scam',       description:'Criminals clone family voices using AI to urgently request money transfers. Verify by calling back on known numbers.',          level:'high'   },
      { title:'Fake Package Delivery SMS',   description:'Smishing texts impersonate couriers to steal credentials via fake tracking links. Verify deliveries on the official site.',      level:'high'   },
      { title:'Job Offer Phishing',          description:'Too-good-to-be-true job offers collect personal data or install malware through resume-request emails and attachments.',         level:'medium' },
      { title:'QR Code Scams',               description:'Malicious QR codes at restaurants or parking meters redirect to phishing sites or silently initiate payment requests.',         level:'medium' },
      { title:'Public Wi-Fi Eavesdropping',  description:'Attackers on unsecured Wi-Fi intercept unencrypted traffic. Always use a VPN on public networks.',                              level:'medium' },
      { title:'Browser Notification Hijack', description:'Malicious sites request push notification permissions then blast fake virus alerts to generate ad revenue or spread malware.',   level:'low'    },
    ];
  }

  // ─── PUBLIC API ───────────────────────────────
  return { analyzeURL, analyzeEmail, analyzeFile, analyzePhone, chatWithBot, getScamAlerts };
})();

window.DetectionEngine = DetectionEngine;
