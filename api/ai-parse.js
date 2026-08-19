// Recibe siempre el mismo formato normalizado desde el frontend:
//   { provider: 'claude'|'openai'|'gemini', model, system, content: [{type:'text',text} | {type:'image', source:{media_type, data}}] }
// y siempre devuelve { text: "<respuesta cruda del modelo>" } o { error }.
// Así el frontend no necesita saber los detalles de cada API.
// Requiere sesión de Supabase válida — ver _auth.js.

import { requireAuth } from './_auth.js';

async function callClaude({ apiKey, model, system, content }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Anthropic respondió ${response.status}`);
  const text = (data.content || []).map((b) => b.text || '').join('\n');
  return text;
}

async function callOpenAI({ apiKey, model, system, content }) {
  const openaiContent = content.map((b) => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'image') return { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } };
    return null;
  }).filter(Boolean);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      max_tokens: 1000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: openaiContent },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI respondió ${response.status}`);
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini({ apiKey, model, system, content }) {
  const parts = content.map((b) => {
    if (b.type === 'text') return { text: b.text };
    if (b.type === 'image') return { inline_data: { mime_type: b.source.media_type, data: b.source.data } };
    return null;
  }).filter(Boolean);

  const modelName = model || 'gemini-2.0-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        systemInstruction: { parts: [{ text: system }] },
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Gemini respondió ${response.status}`);
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') || '';
}

const PROVIDERS = {
  claude: { fn: callClaude, envKey: 'ANTHROPIC_API_KEY' },
  openai: { fn: callOpenAI, envKey: 'OPENAI_API_KEY' },
  gemini: { fn: callGemini, envKey: 'GOOGLE_API_KEY' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  if (await requireAuth(req, res)) return;

  const { provider, model, system, content } = req.body || {};
  const chosen = PROVIDERS[provider] || PROVIDERS.claude;
  const apiKey = process.env[chosen.envKey];

  if (!apiKey) {
    res.status(500).json({ error: `Falta configurar ${chosen.envKey} en las variables de entorno del proyecto en Vercel para usar el proveedor "${provider}".` });
    return;
  }
  try {
    const text = await chosen.fn({ apiKey, model, system, content });
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: 'Error al contactar la IA: ' + err.message });
  }
}
