// NexusAgri · /api/chat.js
// OpenRouter FREE Models — auto-fallback

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KEY = process.env.OPENROUTER_API_KEY;

  // ── Debug: cek apakah key ada ──
  if (!KEY) {
    console.error('OPENROUTER_API_KEY is not set');
    return res.status(500).json({
      error: 'API key tidak ditemukan di server. Set OPENROUTER_API_KEY di Vercel Environment Variables lalu Redeploy.'
    });
  }
  console.log('Key present:', KEY.slice(0, 12) + '...');

  // Free models — dari yang terbaru gue lihat di OpenRouter
  const MODELS = [
    'mistralai/mistral-7b-instruct:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'qwen/qwen-2.5-7b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
    'minimax/minimax-m2.7:free',
    'xiaomi/mimo-v2-omni:free',
  ];

  try {
    const { messages, max_tokens } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }

    const SYSTEM = `Kamu adalah Omega Intelligence — AI konsultan NexusAgri. Ahli ternak, pertanian, aquaculture, dan agribisnis Indonesia. Jawab singkat, padat, pakai angka nyata. Tutup dengan 1 aksi konkret.`;

    let sysContent = SYSTEM;
    let chatMsgs = messages;
    if (messages[0]?.role === 'system') {
      sysContent = messages[0].content;
      chatMsgs = messages.slice(1);
    }

    const body = {
      messages: [
        { role: 'system', content: sysContent },
        ...chatMsgs.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      ],
      max_tokens: max_tokens || 800,
      temperature: 0.7,
    };

    const errors = [];

    for (const model of MODELS) {
      console.log('Trying model:', model);
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${KEY}`,
            'HTTP-Referer': 'https://nexusagri.vercel.app',
            'X-Title': 'NexusAgri',
          },
          body: JSON.stringify({ ...body, model }),
          signal: AbortSignal.timeout(20000),
        });

        const text = await r.text();
        console.log(`${model} → ${r.status}: ${text.slice(0, 200)}`);

        if (r.status === 429) { errors.push(`${model}: rate limited`); continue; }
        if (!r.ok) { errors.push(`${model}: HTTP ${r.status} — ${text.slice(0, 100)}`); continue; }

        let data;
        try { data = JSON.parse(text); } catch(e) { errors.push(`${model}: invalid JSON`); continue; }

        const content = data.choices?.[0]?.message?.content;
        if (!content) { errors.push(`${model}: empty content`); continue; }

        console.log('Success with model:', model);
        return res.status(200).json({
          choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
          model: data.model || model,
        });

      } catch (e) {
        errors.push(`${model}: ${e.message}`);
        continue;
      }
    }

    // Semua model gagal — return detail error untuk debugging
    console.error('All models failed:', errors);
    return res.status(503).json({
      error: 'Semua AI model sedang tidak tersedia. Coba lagi dalam beberapa menit.',
      debug: errors, // hapus ini setelah production
    });

  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: e.message });
  }
}
