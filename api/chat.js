// ─────────────────────────────────────────────────────────────
// NexusAgri · /api/chat.js
// OpenRouter FREE models — updated 30 March 2026
// 8 model fallback chain, skip if 400/404/429/503
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

    // ── FREE MODELS — 30 March 2026 ──────────────────────────────
    // Sorted by reliability. Old/removed models excluded.
    // 404 = removed, 429 = rate limit → skip both, try next
    const MODELS = [
      'meta-llama/llama-3.1-8b-instruct:free',      // #1 most reliable
      'google/gemini-2.0-flash-exp:free',             // #2 Google, fast
      'qwen/qwen-2.5-7b-instruct:free',               // #3 good Indonesian
      'deepseek/deepseek-chat-v3-0324:free',          // #4 DeepSeek V3 (not r1)
      'google/gemma-2-9b-it:free',                    // #5 Gemma 2 (not gemma-3)
      'nousresearch/hermes-3-llama-3.1-405b:free',   // #6 large model
      'mistralai/mistral-nemo:free',                  // #7 Mistral Nemo (not 7b)
      'meta-llama/llama-3.3-70b-instruct:free',      // #8 large, may rate-limit
    ];

    const log = [];

    for (const model of MODELS) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 28000);

        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey,
            'HTTP-Referer': 'https://nexusagri.vercel.app',
            'X-Title': 'NexusAgri',
          },
          body: JSON.stringify({ model, ...payload }),
        });
        clearTimeout(tid);

        // Key invalid → stop immediately
        if (r.status === 401) {
          return res.status(401).json({ error: 'API key tidak valid. Buat key baru di openrouter.ai → API Keys.' });
        }

        // Skip unavailable/rate-limited models
        if ([400, 404, 429, 503, 502].includes(r.status)) {
          const t = await r.text().catch(() => '');
          log.push(model.split('/')[1] + ':' + r.status);
          console.warn('Skip', model, r.status);
          continue;
        }

        if (!r.ok) {
          log.push(model.split('/')[1] + ':HTTP' + r.status);
          continue;
        }

        const data = await r.json();
        const content = data.choices?.[0]?.message?.content?.trim();

        if (!content) {
          log.push(model.split('/')[1] + ':empty');
          continue;
        }

        // ✅ SUCCESS
        console.log('OK via', model);
        return res.status(200).json({
          choices: [{ message: { role: 'assistant', content } }],
          model,
        });

      } catch (e) {
        log.push(model.split('/')[1] + ':' + (e.name === 'AbortError' ? 'timeout' : e.message.slice(0,20)));
        continue;
      }
    }

    console.error('All failed:', log.join(' | '));
    return res.status(503).json({
      error: 'AI sedang overload. Coba lagi dalam 1-2 menit.',
      debug: log.join(' | ')
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
