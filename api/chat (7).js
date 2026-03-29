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

    // ── MODELS: Only confirmed-existing per Vercel logs 30 Mar 2026 ──
    // 429 = model EXISTS but rate limited → retry after delay
    // 404 = model removed → skip forever
    const MODELS = [
      'nousresearch/hermes-3-llama-3.1-405b:free',  // confirmed 429 = exists
      'meta-llama/llama-3.3-70b-instruct:free',      // confirmed 429 = exists
      'nousresearch/hermes-3-llama-3.1-405b:free',  // retry #1
      'meta-llama/llama-3.3-70b-instruct:free',      // retry #2
      'nousresearch/hermes-3-llama-3.1-405b:free',  // retry #3
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

        // Skip removed models
        if ([400, 404].includes(r.status)) {
          const t = await r.text().catch(() => '');
          log.push(model.split('/')[1].slice(0,20) + ':' + r.status);
          console.warn('Skip', model, r.status);
          continue;
        }

        // Rate limited → wait 1s then continue to next
        if (r.status === 429) {
          log.push(model.split('/')[1].slice(0,20) + ':429');
          console.warn('Rate limited', model, '- waiting 1s');
          await new Promise(resolve => setTimeout(resolve, 1000));
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
