import React, { useState } from 'react';
import { MessageCircle, Camera, Loader2, Image as ImageIcon, Info } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, inputStyle } from '../ui/theme';
import { Card, PrimaryButton, GhostButton, Field } from '../ui/primitives';
import { todayISO } from '../lib/finance';
import { supabase } from '../lib/supabaseClient';

export function matchCategory(guessName, type, categories) {
  const pool = categories.filter((c) => c.type === type);
  if (!guessName) return pool[0]?.id;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const g = norm(guessName);
  let found = pool.find((c) => norm(c.name) === g);
  if (!found) found = pool.find((c) => norm(c.name).includes(g) || g.includes(norm(c.name)));
  return (found || pool[0])?.id;
}
export function matchMember(guessName, members) {
  if (!guessName) return null;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const g = norm(guessName);
  const found = members.find((m) => norm(m.name) === g || g.includes(norm(m.name)) || norm(m.name).includes(g));
  return found?.id || null;
}
export function stripJsonFences(text) {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

export async function callAI({ system, content, provider, model }) {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch('/api/ai-parse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ provider, model, system, content }),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error);
  return JSON.parse(stripJsonFences(json.text || ''));
}

export function QuickCapture({ data, actions, setModal }) {
  const [mode, setMode] = useState('texto'); // texto | foto
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [asMember, setAsMember] = useState(data.members[0]?.id || '');

  const categoryNames = { income: data.categories.filter((c) => c.type === 'income').map((c) => c.name), expense: data.categories.filter((c) => c.type === 'expense').map((c) => c.name) };
  const memberNames = data.members.map((m) => m.name);

  function buildDraft(parsed, rawLabel) {
    const type = parsed.type === 'income' ? 'income' : 'expense';
    const categoryId = matchCategory(parsed.category, type, data.categories);
    const memberId = matchMember(parsed.member, data.members) || asMember || data.members[0]?.id;
    const account = data.accounts.find((a) => a.ownerIds?.includes(memberId)) || data.accounts[0];
    return {
      type,
      description: parsed.description || parsed.merchant || '',
      amount: parsed.amount || '',
      categoryId,
      accountId: account?.id,
      memberId,
      date: parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : todayISO(),
      source: 'quick',
      raw: rawLabel,
    };
  }

  async function analyzeText() {
    if (!text.trim()) return;
    setLoading(true); setError('');
    try {
      const system = `Extraes datos de un movimiento financiero de hogar a partir de un mensaje corto tipo WhatsApp, escrito por: ${asMember ? data.members.find(m=>m.id===asMember)?.name : 'un integrante'}. Hoy es ${todayISO()}. Categorías de ingreso disponibles: ${categoryNames.income.join(', ')}. Categorías de gasto disponibles: ${categoryNames.expense.join(', ')}. Integrantes del hogar: ${memberNames.join(', ')}. Responde SOLO con JSON válido, sin texto adicional, con este formato exacto: {"type":"income|expense","amount":number,"date":"YYYY-MM-DD","description":"texto corto","category":"nombre de categoría de la lista","member":"nombre del integrante si se menciona, si no null"}`;
      const parsed = await callAI({ system, content: [{ type: 'text', text }], provider: data.settings?.ai_provider, model: data.settings?.ai_model });
      setModal({ type: 'transaction', payload: buildDraft(parsed, text) });
      setText('');
    } catch (e) {
      setError('No se pudo interpretar el mensaje. Intenta de nuevo o descríbelo distinto.');
    } finally {
      setLoading(false);
    }
  }

  function onPickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function analyzeImage() {
    if (!imagePreview) return;
    setLoading(true); setError('');
    try {
      const base64Data = imagePreview.split(',')[1];
      const mediaType = imageFile.type || 'image/jpeg';
      const system = `Extraes datos de un recibo o factura en una foto para registrar un gasto de hogar. Hoy es ${todayISO()}. Categorías de gasto disponibles: ${categoryNames.expense.join(', ')}. Responde SOLO con JSON válido, sin texto adicional, con este formato exacto: {"type":"expense","amount":number,"date":"YYYY-MM-DD o null si no se ve","description":"nombre del comercio o resumen","category":"nombre de categoría de la lista"}`;
      const parsed = await callAI({
        system,
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: 'Extrae los datos de este recibo.' },
        ],
        provider: data.settings?.ai_provider, model: data.settings?.ai_model,
      });
      setModal({ type: 'transaction', payload: buildDraft(parsed, 'Foto de recibo') });
      setImageFile(null); setImagePreview(null);
    } catch (e) {
      setError('No se pudo leer el recibo. Intenta con una foto más clara o regístralo manualmente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pb-4 pt-2">
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }} className="mb-1">Registro rápido</p>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">
        Escribe como si le mandaras un mensaje a tu familia, o sube la foto de un recibo. La IA detecta el monto, la categoría y la fecha; tú confirmas antes de guardar.
      </p>

      <div className="flex items-start gap-2 rounded-xl p-3 mb-4" style={{ background: T.tealSoft }}>
        <Info size={14} color={T.teal} style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontSize: 11.5, color: T.ink, fontFamily: FONT_BODY }}>
          Esta app aún no recibe mensajes directamente desde el WhatsApp de cada integrante (eso requiere un servidor conectado a WhatsApp Business). Mientras tanto, cualquiera puede abrir esta pestaña desde su celular y registrar igual de rápido.
        </p>
      </div>

      <Field label="Registrar como">
        <select style={inputStyle} value={asMember} onChange={(e) => setAsMember(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>

      <div className="flex rounded-xl p-1 mb-4" style={{ background: T.bg }}>
        <button onClick={() => setMode('texto')} className="flex-1 rounded-lg py-2 flex items-center justify-center gap-1.5" style={{ background: mode === 'texto' ? T.surface : 'transparent', border: mode === 'texto' ? `1px solid ${T.border}` : 'none' }}>
          <MessageCircle size={15} color={T.ink} /><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Mensaje</span>
        </button>
        <button onClick={() => setMode('foto')} className="flex-1 rounded-lg py-2 flex items-center justify-center gap-1.5" style={{ background: mode === 'foto' ? T.surface : 'transparent', border: mode === 'foto' ? `1px solid ${T.border}` : 'none' }}>
          <Camera size={15} color={T.ink} /><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Foto de recibo</span>
        </button>
      </div>

      {mode === 'texto' && (
        <Card>
          <textarea
            style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
            placeholder='Ej. "Pagué 350 de gasolina hoy" o "Me depositaron 8000 de nómina"'
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <PrimaryButton full onClick={analyzeText} style={{ marginTop: 12 }}>
            {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Analizando…</span> : 'Detectar movimiento'}
          </PrimaryButton>
        </Card>
      )}

      {mode === 'foto' && (
        <Card>
          {imagePreview ? (
            <img src={imagePreview} alt="Recibo" className="w-full rounded-xl mb-3" style={{ maxHeight: 260, objectFit: 'contain', background: T.bg }} />
          ) : (
            <label className="flex flex-col items-center justify-center rounded-xl py-8 cursor-pointer" style={{ border: `1.5px dashed ${T.border}`, background: T.bg }}>
              <ImageIcon size={28} color={T.inkSoft} />
              <span style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">Toca para elegir o tomar una foto</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickImage} />
            </label>
          )}
          {imagePreview && (
            <div className="flex gap-2">
              <GhostButton onClick={() => { setImageFile(null); setImagePreview(null); }}>Cambiar foto</GhostButton>
              <PrimaryButton full onClick={analyzeImage}>
                {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Leyendo recibo…</span> : 'Leer recibo'}
              </PrimaryButton>
            </div>
          )}
        </Card>
      )}

      {error && <p style={{ fontSize: 12.5, color: T.danger, fontFamily: FONT_BODY }} className="mt-3">{error}</p>}
    </div>
  );
}
