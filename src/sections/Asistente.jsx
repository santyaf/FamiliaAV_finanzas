import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, Camera, MessageCircle } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, inputStyle } from '../ui/theme';
import { Card, EmptyState, PAYMENT_KIND_LABEL } from '../ui/primitives';
import { callAiApi } from '../lib/ai';
import { isAiFeatureEnabled } from '../lib/access';
import { thisMonthKey, lastMonthKeys, monthCashFlow, occurrencesInMonth, accountBalance, goalPriorityScore } from '../lib/finance';
import { QuickCapture } from './QuickCapture';

const SUGGESTED_QUESTIONS = [
  '¿Cuánto llevo gastado este mes?',
  '¿Cómo voy con mis presupuestos?',
  '¿Me alcanza para llegar a fin de mes?',
  '¿Cómo va mi objetivo de ahorro principal?',
];

const MAX_HISTORY_MESSAGES = 6; // últimos turnos que se le pasan como contexto a la IA

function systemPrompt(currency) {
  return `Eres el asistente financiero dentro de una app de finanzas familiares en Colombia (Finanzas del Hogar).
Respondes preguntas del usuario sobre SUS finanzas usando ÚNICAMENTE los datos que te paso en el bloque "DATOS" — nunca inventes cifras ni asumas datos que no estén ahí.
Si no puedes responder con esos datos, dilo con claridad y sugiere en qué sección de la app puede revisarlo (Movimientos, Presupuestos, Objetivos, Tendencias).
Responde siempre en español, en 1 a 4 frases, tono cercano y directo, sin rodeos. Los montos están en ${currency}. No des consejos de inversión ni uses tecnicismos innecesarios.`;
}

// Resumen compacto de las finanzas visibles para este usuario — se manda
// como contexto a la IA en vez de todo el historial crudo (más barato,
// más rápido, y respeta la misma privacidad que ya ve el usuario en la app:
// solo se arma con datos que el cliente ya cargó respetando RLS).
function buildDigest(data, visibleTransactions) {
  const mKey = thisMonthKey();
  const months = lastMonthKeys(3).map((key) => ({ mes: key, ...monthCashFlow(visibleTransactions, key) }));

  const gastoPorCategoria = {};
  visibleTransactions.forEach((t) => {
    if (t.type !== 'expense') return;
    const occ = occurrencesInMonth(t, mKey);
    if (!occ) return;
    const cat = data.categories.find((c) => c.id === t.categoryId)?.name || 'Otro';
    gastoPorCategoria[cat] = (gastoPorCategoria[cat] || 0) + t.amount * occ;
  });

  const presupuestos = data.budgets.map((b) => {
    const cat = data.categories.find((c) => c.id === b.categoryId)?.name || 'Otro';
    const gastado = data.transactions
      .filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && occurrencesInMonth(t, mKey) && (b.scope === 'household' || t.memberId === b.scope))
      .reduce((s, t) => s + t.amount * occurrencesInMonth(t, mKey), 0);
    return { categoria: cat, limite_mensual: b.limit, gastado_este_mes: gastado };
  });

  const objetivos = [...data.goals]
    .sort((a, b) => goalPriorityScore(b) - goalPriorityScore(a))
    .map((g) => ({ nombre: g.name, meta: g.targetAmount, ahorrado: g.currentAmount, fecha_objetivo: g.targetDate || null }));

  const cuentas = data.accounts.map((a) => ({
    nombre: a.name, medio_de_pago: PAYMENT_KIND_LABEL[a.paymentKind || 'otro'],
    saldo: accountBalance(visibleTransactions, a.id),
  }));

  return { moneda: data.currency, flujo_de_caja_ultimos_3_meses: months, gasto_por_categoria_este_mes: gastoPorCategoria, presupuestos, objetivos, cuentas };
}

function ChatPanel({ data, actions, visibleTransactions }) {
  const [messages, setMessages] = useState([]); // { role: 'user'|'assistant', text }
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  async function ask(question) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput(''); setError('');
    const nextMessages = [...messages, { role: 'user', text: q }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const digest = buildDigest(data, visibleTransactions);
      const history = nextMessages.slice(-MAX_HISTORY_MESSAGES - 1, -1)
        .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.text}`).join('\n');
      const prompt = `DATOS (JSON):\n${JSON.stringify(digest)}\n\n${history ? `Conversación previa:\n${history}\n\n` : ''}Pregunta del usuario: ${q}`;
      const text = await callAiApi({
        system: systemPrompt(data.currency),
        content: [{ type: 'text', text: prompt }],
        provider: data.settings.ai_provider,
        model: data.settings.ai_model,
      });
      setMessages((m) => [...m, { role: 'assistant', text: text.trim() || 'No obtuve una respuesta — intenta de nuevo.' }]);
    } catch (e) {
      setError(e.message || 'No se pudo contactar al asistente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '60vh' }}>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} color={T.teal} />
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Asistente financiero</p>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">
        Pregúntale sobre tus gastos, presupuestos y objetivos — responde solo con tus datos reales.
      </p>

      <div className="flex gap-2 mb-3">
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
          placeholder="Ej. ¿Cuánto llevo en restaurantes este mes?"
          disabled={loading}
        />
        <button onClick={() => ask()} disabled={loading || !input.trim()} aria-label="Preguntar"
          className="flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: T.teal, borderRadius: 10, width: 44, height: 44, flexShrink: 0, opacity: loading || !input.trim() ? 0.5 : 1 }}>
          {loading ? <Loader2 size={18} color="#fff" className="animate-spin" /> : <Send size={18} color="#fff" />}
        </button>
      </div>

      {messages.length === 0 && (
        <>
          <EmptyState icon={<Sparkles size={32} color={T.teal} />} title="Pregúntame lo que quieras" subtitle="Uso tus movimientos, presupuestos y objetivos para responder." />
          <div className="flex flex-col gap-2 mt-3">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button key={q} onClick={() => ask(q)} className="text-left rounded-xl p-3" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{q}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-col gap-2" style={{ flex: 1 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <Card style={{ background: m.role === 'user' ? T.teal : T.surface, padding: '10px 14px' }}>
              <p style={{ fontSize: 13.5, color: m.role === 'user' ? '#fff' : T.ink, fontFamily: FONT_BODY, whiteSpace: 'pre-wrap' }}>{m.text}</p>
            </Card>
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start' }}>
            <Card style={{ padding: '10px 14px' }}>
              <Loader2 size={15} color={T.inkSoft} className="animate-spin" />
            </Card>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <p style={{ color: T.danger, fontSize: 12.5, fontFamily: FONT_BODY }} className="mt-2">{error}</p>}
    </div>
  );
}

// Punto de entrada único: "Preguntar" (chat sobre las finanzas) y
// "Registrar" (Registro rápido por chat o foto de recibo, sin cambios —
// se reusa QuickCapture tal cual) viven en la misma pantalla, cada uno
// habilitado según su propio control de acceso en Admin. Si la persona
// solo tiene acceso a uno de los dos, no se muestra el selector y entra
// directo a ese.
export function Asistente({ data, actions, visibleTransactions, setModal }) {
  const aiProviderConfigured = data.settings?.ai_provider && data.settings.ai_provider !== 'none';
  const canAsk = aiProviderConfigured && isAiFeatureEnabled(data.settings?.assistant_access, actions.userId);
  const canRegister = aiProviderConfigured && isAiFeatureEnabled(data.settings?.quick_capture_access, actions.userId);
  const [mode, setMode] = useState(canAsk ? 'preguntar' : 'registrar');

  if (!canAsk && !canRegister) return null;

  return (
    <div className="pb-4 pt-2">
      {canAsk && canRegister && (
        <div className="flex rounded-xl p-1 mb-4" style={{ background: T.bg }}>
          <button onClick={() => setMode('preguntar')} className="flex-1 rounded-lg py-2 flex items-center justify-center gap-1.5" style={{ background: mode === 'preguntar' ? T.surface : 'transparent', border: mode === 'preguntar' ? `1px solid ${T.border}` : 'none' }}>
            <MessageCircle size={15} color={T.ink} /><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Preguntar</span>
          </button>
          <button onClick={() => setMode('registrar')} className="flex-1 rounded-lg py-2 flex items-center justify-center gap-1.5" style={{ background: mode === 'registrar' ? T.surface : 'transparent', border: mode === 'registrar' ? `1px solid ${T.border}` : 'none' }}>
            <Camera size={15} color={T.ink} /><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Registrar</span>
          </button>
        </div>
      )}
      {mode === 'preguntar' && canAsk && <ChatPanel data={data} actions={actions} visibleTransactions={visibleTransactions} />}
      {mode === 'registrar' && canRegister && <QuickCapture data={data} actions={actions} setModal={setModal} />}
    </div>
  );
}
