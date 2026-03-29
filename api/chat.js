// ─────────────────────────────────────────────────────────
// NexusAgri · /api/chat.js
// OpenRouter FREE models — verified working March 2026
// Auto-fallback: tries each model, skips if unavailable
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
      error: 'OPENROUTER_API_KEY belum diset. Buka Vercel → Settings → Environment Variables → tambah OPENROUTER_API_KEY → klik Redeploy.'
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

STANDAR JAWABAN: Langsung ke inti. Angka nyata. Aksi konkret. Max 400 kata kecuali diminta lebih panjang.`;

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

    // ── FREE MODELS — verified March 2026 ──
    // Ordered by reliability. HTTP 400/404/429/503 → skip to next.
    const MODELS = [
      'meta-llama/llama-3.1-8b-instruct:free',   // Most reliable free model
      'google/gemini-2.0-flash-exp:free',          // Google, fast
      'qwen/qwen-2.5-7b-instruct:free',            // Good for Indonesian
      'microsoft/phi-3-mini-128k-instruct:free',   // Small but reliable
      'google/gemini-flash-1.5-8b:free',           // Backup Google
      'nousresearch/hermes-3-llama-3.1-405b:free', // Large fallback
    ];

    let lastErr = null;
    let attemptLog = [];

    for (const model of MODELS) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 25000); // 25s timeout

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

        // API key invalid — stop all retries immediately
        if (r.status === 401) {
          return res.status(401).json({
            error: 'API key tidak valid atau expired. Buat key baru di openrouter.ai → API Keys, lalu update di Vercel Environment Variables.'
          });
        }

        // Skip: model not found, rate limit, service unavailable, bad request
        if (r.status === 400 || r.status === 404 || r.status === 429 || r.status === 503) {
          const txt = await r.text().catch(() => '');
          lastErr = `${model}: HTTP ${r.status}`;
          attemptLog.push(lastErr);
          console.warn('Skipping model:', lastErr, txt.slice(0, 80));
          continue;
        }

        if (!r.ok) {
          const txt = await r.text().catch(() => '');
          lastErr = `${model}: HTTP ${r.status}`;
          attemptLog.push(lastErr);
          console.error('Model error:', lastErr, txt.slice(0, 80));
          continue;
        }

        const data = await r.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content || content.trim() === '') {
          lastErr = `${model}: empty response`;
          attemptLog.push(lastErr);
          continue;
        }

        // ✅ Success
        console.log(`AI success via ${model}`);
        return res.status(200).json({
          choices: [{ message: { role: 'assistant', content } }],
          model,
          usage: data.usage || {}
        });

      } catch (e) {
        lastErr = `${model}: ${e.name === 'AbortError' ? 'timeout 25s' : e.message}`;
        attemptLog.push(lastErr);
        console.warn('Model exception:', lastErr);
        continue;
      }
    }

    // All models failed
    console.error('All models failed:', attemptLog);
    return res.status(503).json({
      error: 'AI sedang overload. Semua server penuh sekarang. Coba lagi dalam 1-2 menit.',
      detail: attemptLog.join(' | ')
    });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
