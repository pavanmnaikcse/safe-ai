/* =====================================================
   SAFESCAN AI — AI SERVICE LAYER (aiService.js)
   Powered by Groq Cloud API (OpenAI-compatible)
   Model: llama3-70b-8192
   Exposed as window.AiService
===================================================== */

'use strict';

const AiService = (() => {
  const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
  const MODEL = 'llama3-70b-8192';

  // ─── API KEY ──────────────────────────────────
  function getApiKey() {
    return (
      localStorage.getItem('AI_API_KEY') ||
      localStorage.getItem('safescan_api_key') ||
      null
    );
  }

  function requireKey() {
    const key = getApiKey();
    if (!key) throw _err('API key not set. Add your Groq API key in Settings.', 'NO_KEY');
    return key;
  }

  // ─── CORE FETCH ───────────────────────────────
  /**
   * Send a messages array to Groq and return the assistant reply text.
   * @param {string}   key      - Groq API key (gsk_...)
   * @param {object[]} messages - [{role, content}, ...]
   */
  async function _fetch(key, messages) {
    // Validate: strip whitespace and reject empty content
    messages = messages.map(m => ({
      role: m.role,
      content: String(m.content || '').trim(),
    }));

    const emptyMsg = messages.find(m => !m.content);
    if (emptyMsg) {
      console.error('[SafeScan] Message content is empty for role:', emptyMsg.role);
      throw _err('Message content is empty — cannot send empty prompt.', 'INVALID_REQUEST');
    }

    const body = {
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 700,
    };

    // Debug logging
    console.log('[SafeScan] Sending messages:', JSON.stringify(messages, null, 2));
    console.log('[SafeScan] Using API key:', key.slice(0, 8) + '...' + key.slice(-4));
    console.log('[SafeScan] Endpoint:', ENDPOINT);

    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      console.error('[SafeScan] Network error:', e.message);
      throw _err('Network error — check your internet connection.', 'NETWORK_ERROR');
    }

    console.log('[SafeScan] Response status:', res.status);
    console.log('[SafeScan] Response object:', res);

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        msg = j?.error?.message || msg;
        console.error('[SafeScan] API error body:', JSON.stringify(j?.error || j));
      } catch { }
      const code =
        res.status === 400 ? 'INVALID_REQUEST' :
          res.status === 401 ? 'INVALID_KEY' :
            res.status === 403 ? 'KEY_FORBIDDEN' :
              res.status === 429 ? 'QUOTA_EXCEEDED' :
                'API_ERROR';
      throw _err(msg, code);
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw _err('Could not parse API response.', 'PARSE_ERROR');
    }
    console.log('[SafeScan] Response data:', JSON.stringify(data, null, 2));

    if (!data.choices || !data.choices.length) {
      console.error('[SafeScan] No choices in response. Invalid request format.');
      throw _err('Invalid request format — no choices returned.', 'INVALID_REQUEST');
    }

    const text = data.choices[0]?.message?.content;
    if (!text) throw _err('Empty response from AI. Try again.', 'EMPTY_RESPONSE');
    console.log('[SafeScan] Raw response text:', text);
    console.log('[SafeScan] Response length:', text.length, 'chars');
    return text;
  }

  function _err(message, code) {
    return Object.assign(new Error(message), { code });
  }

  // ─── JSON PARSER ──────────────────────────────
  function _parseJSON(text) {
    console.log('[SafeScan] Parsing JSON from text:', text.slice(0, 120));
    try { return JSON.parse(text); } catch { }
    // Strip markdown code fences
    const stripped = text
      .replace(/^```json\s*/im, '')
      .replace(/^```\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();
    try { return JSON.parse(stripped); } catch { }
    // Extract first { ... } block
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { } }
    console.error('[SafeScan] JSON parse failed. Raw text:', text);
    throw _err('AI response format invalid — could not extract JSON.', 'PARSE_ERROR');
  }

  // ─── RESULT NORMALIZER ────────────────────────
  function _normalize(raw) {
    const score = Math.min(100, Math.max(0, Math.round(Number(raw.score) || 0)));
    const risk =
      raw.risk === 'high' ? 'high' :
        raw.risk === 'medium' ? 'medium' :
          raw.risk === 'low' ? 'low' :
            score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low';
    const highlights = (raw.highlights || raw.flags || raw.reasons || [])
      .filter(Boolean).slice(0, 6);
    return {
      score,
      risk,
      explanation: raw.explanation || raw.summary || 'No explanation provided.',
      highlights,
    };
  }

  // ─── PUBLIC FUNCTIONS ─────────────────────────

  async function analyzeURL(url) {
    const key = requireKey();
    const reply = await _fetch(key, [{
      role: 'user',
      content: `You are a cybersecurity expert. Analyze this URL for phishing, malware, scam indicators, and suspicious patterns.

URL: ${url}

Return ONLY a pure JSON object. Do NOT include any text outside the JSON. Do NOT use markdown or code blocks. Your response MUST start with { and end with }.
{"score":<integer 0-100>,"risk":"<low|medium|high>","explanation":"<2-3 sentences>","highlights":["<issue1>","<issue2>"]}`,
    }]);
    return _normalize(_parseJSON(reply));
  }

  async function analyzeEmail(emailText) {
    const key = requireKey();
    const reply = await _fetch(key, [{
      role: 'user',
      content: `You are a cybersecurity expert. Analyze this email for phishing, urgency tactics, fake authority, and social engineering.

Email:
"""
${emailText.slice(0, 3000)}
"""

Return ONLY a pure JSON object. Do NOT include any text outside the JSON. Do NOT use markdown or code blocks. Your response MUST start with { and end with }.
{"score":<integer 0-100>,"risk":"<low|medium|high>","explanation":"<2-3 sentences>","highlights":["<red flag 1>","<red flag 2>"]}`,
    }]);
    return _normalize(_parseJSON(reply));
  }

  async function analyzeText(text) {
    const key = requireKey();
    const reply = await _fetch(key, [{
      role: 'user',
      content: `Analyze this text for scams, OTP fraud, harassment, or suspicious intent.

Text: "${text.slice(0, 2000)}"

Return ONLY a pure JSON object. Do NOT include any text outside the JSON. Do NOT use markdown or code blocks. Your response MUST start with { and end with }.
{"score":<integer 0-100>,"risk":"<low|medium|high>","explanation":"<2-3 sentences>","highlights":["<flag1>","<flag2>"]}`,
    }]);
    return _normalize(_parseJSON(reply));
  }

  async function analyzeFile(fileName, fileExt, mimeType) {
    const key = requireKey();
    const reply = await _fetch(key, [{
      role: 'user',
      content: `You are a cybersecurity expert. Assess this file's security risk based on metadata only.

File name: ${fileName}
Extension: ${fileExt || 'unknown'}
MIME type: ${mimeType || 'unknown'}

Return ONLY a pure JSON object. Do NOT include any text outside the JSON. Do NOT use markdown or code blocks. Your response MUST start with { and end with }.
{"score":<integer 0-100>,"risk":"<low|medium|high>","explanation":"<2-3 sentences>","highlights":["<risk factor 1>","<risk factor 2>"]}`,
    }]);
    return _normalize(_parseJSON(reply));
  }

  async function getScamAlerts() {
    const key = requireKey();
    const reply = await _fetch(key, [{
      role: 'user',
      content: `List 6 of the most dangerous and currently active cybersecurity scams and phishing campaigns in 2025.

Return ONLY a pure JSON object. Do NOT include any text outside the JSON. Do NOT use markdown or code blocks. Your response MUST start with { and end with }.
{"alerts":[{"title":"<name>","description":"<2 sentences>","level":"<high|medium|low>"}]}`,
    }]);
    const data = _parseJSON(reply);
    return Array.isArray(data.alerts) ? data.alerts : [];
  }

  async function chatWithAI(message, history = []) {
    const key = requireKey();

    // Groq supports multi-turn natively via messages array
    const messages = [
      {
        role: 'system',
        content:
          'You are SafeScan AI, an expert cybersecurity assistant. Be helpful, accurate, and concise. Keep responses under 180 words. Only discuss cybersecurity topics.',
      },
    ];

    // Append last 10 turns of history
    for (const turn of history.slice(-10)) {
      messages.push({
        role: turn.role === 'user' ? 'user' : 'assistant',
        content: turn.content,
      });
    }

    messages.push({ role: 'user', content: message });
    return _fetch(key, messages);
  }

  async function testConnection() {
    const key = requireKey();
    console.log('[SafeScan] Testing Groq API connection with prompt: "Hello"');
    const reply = await _fetch(key, [{ role: 'user', content: 'Hello' }]);
    console.log('[SafeScan] Test reply received:', reply);
    return reply;
  }

  // ─── PUBLIC API ───────────────────────────────
  return {
    getApiKey,
    analyzeURL,
    analyzeEmail,
    analyzeText,
    analyzeFile,
    getScamAlerts,
    chatWithAI,
    testConnection,
  };
})();

window.AiService = AiService;
