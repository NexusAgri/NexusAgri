// ─────────────────────────────────────────────────────────────
// NexusAgri · /api/chat.js
// OpenRouter FREE models — updated 30 March 2026
// 13-model fallback chain — 429 = rate limited → skip
// ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENROUTER_API_KEY belum diset di Vercel. Buka Vercel → Settings → Environment Variables → tambah key → Redeploy.'
    });
  }

  try {
    const { messages, max_tokens } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }

    const SYSTEM = `Kamu adalah Omega Intelligence — AI konsultan ekosistem hayati NexusAgri. Born in Mojosari, Mojokerto.
Jawab langsung, pakai angka nyata harga pasar Indonesia, tutup dengan aksi konkret.
Keahlian: Ternak, Unggas, Aquaculture, Pertanian, Hortikultura, Perkebunan, Insekta, Herbal.`;

    let systemContent = SYSTEM;
    let chatMessages = messages;
    if (messages[0]?.role === 'system') {
      systemContent = messages[0].content;
      chatMessages = messages.slice(1);
    }

    const payload = {
      messages: [{ role: 'system', content: systemContent }, ...chatMessages],
      max_tokens: max_tokens || 800,
      temperature: 0.7,
    };

    // ── 13 FREE MODELS — prioritized by reliability Maret 2026 ──
    // Tier 1: Auto-router + Gemma (paling stabil)
    // Tier 2: Llama, Mistral, Qwen (populer tapi sering 429 peak hours)
    // Tier 3: Model besar sebagai last resort
    const MODELS = [
      'openrouter/free',                                // auto-select terbaik
      'google/gemma-3-4b-it:free',                     // kecil, jarang rate-limit
      'google/gemma-3-12b-it:free',                    // medium, stabil
      'google/gemma-3-27b-it:free',                    // besar, kadang 429
      'google/gemma-3n-e4b-it:free',                   // Gemma 3n mobile
      'meta-llama/llama-3.1-8b-instruct:free',         // kecil, reliabel
      'meta-llama/llama-3.3-70b-instruct:free',        // besar, sering 429 peak
      'mistralai/mistral-small-3.1:free',              // Mistral stabil
      'qwen/qwen3-8b:free',                            // Qwen kecil
      'qwen/qwen3-235b-a22b:free',                     // Qwen besar
      'deepseek/deepseek-r1:free',                     // reasoning
      'nousresearch/hermes-3-llama-3.1-405b:free',     // last resort besar
      'microsoft/phi-4-reasoning:free',                // Microsoft Phi-4
    ];

    const SKIP_CODES = [400, 404, 429, 502, 503];
    const log = [];

    for (const model of MODELS) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 27000);

        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey,
            'HTTP-Referer': 'https://nexusagri.vercel.app',
            'X-Title': 'NexusAgri Omega Intelligence',
          },
          body: JSON.stringify({ model, ...payload }),
        });
        clearTimeout(tid);

        // API key invalid → stop total
        if (r.status === 401) {
          return res.status(401).json({
            error: 'API key tidak valid. Buat key baru di openrouter.ai → API Keys → Redeploy Vercel.'
          });
        }

        // Rate limit / unavailable → skip ke model berikutnya
        if (SKIP_CODES.includes(r.status)) {
          await r.text().catch(() => '');
          log.push(model.split('/').pop().slice(0, 20) + ':' + r.status);
          console.warn('[NexusAgri] Skip', model, r.status);
          continue;
        }

        if (!r.ok) {
          log.push(model.split('/').pop().slice(0, 20) + ':HTTP' + r.status);
          continue;
        }

        const data = await r.json();

        // OpenRouter kadang 200 tapi body punya error (rate limit tersembunyi)
        if (data.error) {
          const code = data.error?.code || data.error?.status || 0;
          if (SKIP_CODES.includes(Number(code))) {
            log.push(model.split('/').pop().slice(0, 20) + ':body' + code);
            continue;
          }
        }

        const content = data.choices?.[0]?.message?.content?.trim();
        if (!content) {
          log.push(model.split('/').pop().slice(0, 20) + ':empty');
          continue;
        }

        // ✅ SUKSES
        console.log('[NexusAgri] OK via', model);
        return res.status(200).json({
          choices: [{ message: { role: 'assistant', content } }],
          model,
        });

      } catch (e) {
        const errName = e.name === 'AbortError' ? 'timeout' : (e.message || 'err').slice(0, 20);
        log.push(model.split('/').pop().slice(0, 20) + ':' + errName);
        console.warn('[NexusAgri] Catch', model, errName);
        continue;
      }
    }

    // Semua model gagal
    console.error('[NexusAgri] All failed:', log.join(' | '));
    return res.status(503).json({
      error: 'Semua AI model sedang overload atau limit harian habis. Coba lagi dalam beberapa menit, atau tunggu reset pukul 07:00 WIB.',
      debug: log.join(' | ')
    });

  } catch (err) {
    console.error('[NexusAgri] Handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
