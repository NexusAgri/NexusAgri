// ─────────────────────────────────────────────────────────
// NexusAgri · /api/chat.js
// OpenRouter FREE models - auto fallback chain
// ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'OPENROUTER_API_KEY belum diset. Buka Vercel → Settings → Environment Variables → tambah OPENROUTER_API_KEY → Redeploy.' 
    });
  }

  try {
    const { messages, max_tokens } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }

    const SYSTEM = `Kamu adalah Omega Intelligence — AI konsultan ekosistem hayati & kecerdasan bumi NexusAgri. Born in Mojosari, Mojokerto, Jawa Timur.

IDENTITAS: Konsultan agrikultur senior. Akrab dengan pasar hewan Jawa Timur: Mojosari, Krian, Porong. Jawab mendalam, berikan angka nyata harga pasar Indonesia, contoh dari lapangan, tutup dengan aksi konkret.

KEAHLIAN: Ternak (sapi, kambing, domba, kuda, kerbau), Unggas (ayam, bebek, puyuh), Aquaculture (lele, nila, udang, gurame, kerapu), Pertanian (padi, jagung, kedelai), Hortikultura (cabai, tomat, bawang), Perkebunan (sawit, kopi, kakao, karet), Insekta (maggot BSF, lebah, jangkrik), Herbal (jahe, kunyit, temulawak).

PLATFORM: NexusAgri punya fitur QR Tag hewan, Health Screening AI, Market Intelligence, Marketplace, ROI Calculator, AI Chat. Tier: STARTER (gratis), PETANI (Rp149rb), PETERNAK PRO (Rp299rb), OMEGA ELITE (Rp599rb).

STANDAR JAWABAN: Langsung ke inti. Angka nyata. Aksi konkret. Max 400 kata kecuali diminta lebih.`;

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

    // Free models - tested working March 2026
    // Try in order, skip if rate limited or unavailable
    const MODELS = [
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'qwen/qwen-2.5-7b-instruct:free',
      'google/gemini-flash-1.5-8b:free',
      'meta-llama/llama-3.2-3b-instruct:free',
      'microsoft/phi-3-mini-128k-instruct:free',
    ];

    let lastErr = null;
    for (const model of MODELS) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 20000); // 20s timeout per model
        
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

        // Invalid key - stop immediately
        if (r.status === 401) {
          return res.status(401).json({ 
            error: 'API key tidak valid. Cek OPENROUTER_API_KEY di Vercel Environment Variables.' 
          });
        }

        // Model unavailable or rate limited - try next
        if (r.status === 404 || r.status === 429 || r.status === 503) {
          lastErr = model + ': HTTP ' + r.status;
          console.warn('Skipping', model, r.status);
          continue;
        }

        if (!r.ok) {
          const errText = await r.text();
          lastErr = model + ': HTTP ' + r.status + ' - ' + errText.slice(0, 100);
          console.error(lastErr);
          continue;
        }

        const data = await r.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) {
          lastErr = model + ': empty response';
          continue;
        }

        // Success
        console.log('AI responded via', model);
        return res.status(200).json({
          choices: [{ message: { role: 'assistant', content } }],
          model: model,
          usage: data.usage || {}
        });

      } catch (e) {
        lastErr = model + ': ' + e.message;
        console.warn('Model error:', lastErr);
        continue;
      }
    }

    // All models failed
    console.error('All models failed. Last error:', lastErr);
    return res.status(503).json({
      error: 'AI sedang sibuk (semua server penuh). Coba lagi dalam 2-3 menit.',
      detail: lastErr,
    });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
