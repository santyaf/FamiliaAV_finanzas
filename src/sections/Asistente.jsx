import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, Camera, Image as ImageIcon, X, Lightbulb } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, inputStyle } from '../ui/theme';
import { Card, PrimaryButton, GhostButton, EmptyState, PAYMENT_KIND_LABEL } from '../ui/primitives';
import { callAiJson } from '../lib/ai';
import { matchCategory, matchMember } from '../lib/aiParse';
import { isAiFeatureEnabled } from '../lib/access';
import { detectAnomalies, describeAnomaly } from '../lib/anomalies';
import { suggestionFromAi } from '../lib/suggestions';
import { formatMoney, formatDate } from '../lib/format';
import {
  todayISO, thisMonthKey, lastMonthKeys, monthCashFlow, occurrencesInMonth,
  accountBalance, creditOutstandingBalance, goalPriorityScore, daysLeftInMonth,
} from '../lib/finance';

const SUGGESTED_QUESTIONS = [
  '¿Cuánto puedo gastar hoy?',
  '¿Cuánto llevo gastado este mes?',
  '¿Cómo voy con mis presupuestos?',
  '¿Hay algo raro en mis gastos?',
  '¿Cómo va mi objetivo de ahorro principal?',
  'Tengo una sugerencia para la app',
];
const SUGGESTED_REGISTROS = ['Pagué 30000 de mercado hoy', 'Me depositaron 500000 de nómina', 'Tengo una sugerencia para la app'];

const MAX_HISTORY_MESSAGES = 6; // últimos turnos que se le pasan como contexto a la IA
const DIGEST_MONTHS = 6; // meses de historial que se le mandan a la IA, no solo el mes actual
const RECENT_TX_DAYS = 30; // ventana de movimientos individuales (día a día), no solo totales por mes
const RECENT_TX_LIMIT = 80; // tope de movimientos individuales, para hogares muy activos

// Un solo prompt de sistema, según lo que esta persona tenga habilitado:
// - las dos cosas: la IA decide por mensaje si es pregunta o registro
// - solo registrar: cada mensaje se trata como un movimiento a extraer
// - solo preguntar: cada mensaje se trata como una pregunta sobre sus datos
// En los tres casos responde con el mismo sobre {"tipo": ...} para que el
// parseo del lado del cliente sea uno solo.
function chatSystemPrompt({ currency, categoryNames, memberNames, canAsk, canRegister }) {
  const intro = `Eres el asistente financiero dentro de una app de finanzas familiares en Colombia (Finanzas del Hogar). Hoy es ${todayISO()}. Los montos están en ${currency}.`;
  const formatoRegistro = '{"tipo":"registro","type":"income|expense","amount":number,"date":"YYYY-MM-DD o null","description":"texto corto","category":"nombre exacto de una categoría de la lista","member":"nombre de integrante si se menciona, si no null"}';
  const formatoRespuesta = '{"tipo":"respuesta","texto":"tu respuesta en español, 1 a 4 frases, tono cercano y directo, sin tecnicismos ni consejos de inversión"}';
  const formatoSugerencia = '{"tipo":"sugerencia","titulo":"resumen de máximo 80 caracteres","descripcion":"lo que pidió, redactado con claridad y con el contexto que dio"}';
  const definicionSugerencia = 'una SUGERENCIA sobre la propia app (algo que la persona propone o pide: una función nueva, una mejora, un cambio, o un problema/error de la app). No es una pregunta sobre sus finanzas. Si quiere sugerir algo pero aún no dijo qué, contesta en el formato de respuesta pidiéndole que lo cuente.';
  const categoriasYIntegrantes = `Categorías de ingreso: ${categoryNames.income.join(', ')}. Categorías de gasto: ${categoryNames.expense.join(', ')}. Integrantes del hogar: ${memberNames.join(', ')}.`;

  const notaDatos = `El bloque "DATOS" trae "movimientos_recientes" (el detalle día a día, con descripción, de los últimos ${RECENT_TX_DAYS} días) y además totales agregados por mes en "flujo_de_caja_ultimos_meses" / "gasto_por_categoria_por_mes" para un rango más largo. Para preguntas sobre un día o una compra específica, usa "movimientos_recientes"; si la fecha que preguntan ya no está ahí, usa los totales por mes si alcanzan, y si tampoco alcanzan dilo con claridad — no digas que no tienes ningún dato solo porque falte el detalle día a día de un mes viejo. Si preguntan cuánto pueden gastar hoy, usa directamente "disponible_para_gastar_hoy" de cada presupuesto (o "disponible_para_gastar_hoy_total") — ya viene calculado repartiendo lo que queda del mes entre los días que faltan ("dias_restantes_del_mes"), no lo recalcules tú. Si preguntan si hay algo raro, inusual o duplicado en sus gastos, usa "anomalias" (son los mismos avisos que ve en el Dashboard, en "Para revisar"); si está vacía, dile que no detectaste nada raro.`;

  if (canAsk && canRegister) {
    return `${intro}
Cada mensaje del usuario es UNA de estas tres cosas — decide cuál:
1) Una PREGUNTA sobre sus finanzas (gastos de un día, de una categoría, presupuestos, objetivos, cuentas, créditos, patrimonio, meses anteriores, etc.). Respóndela usando ÚNICAMENTE los datos del bloque "DATOS" — nunca inventes cifras que no estén ahí. ${notaDatos}
2) La descripción de un MOVIMIENTO que quiere registrar (ej. "pagué 30000 de mercado", "me depositaron el sueldo"). Extrae sus datos, usa null si algo no aparece.
3) ${definicionSugerencia}
Responde SIEMPRE con un único JSON válido, sin texto adicional ni backticks, con EXACTAMENTE una de estas tres formas:
- Pregunta → ${formatoRespuesta}
- Registro → ${formatoRegistro}
- Sugerencia → ${formatoSugerencia}
${categoriasYIntegrantes}`;
  }
  if (canRegister) {
    return `${intro}
Cada mensaje del usuario es UNA de estas dos cosas: (1) la descripción corta, tipo WhatsApp, de un MOVIMIENTO financiero de hogar que quiere registrar — extrae sus datos; o (2) ${definicionSugerencia}
Responde SIEMPRE con un único JSON, sin texto adicional ni backticks, con EXACTAMENTE una de estas formas:
- Registro → ${formatoRegistro}
- Sugerencia → ${formatoSugerencia}
- Solo si quiere sugerir algo pero no dijo qué → ${formatoRespuesta}
${categoriasYIntegrantes}`;
  }
  return `${intro}
Respondes preguntas del usuario sobre SUS finanzas (gastos de un día, de una categoría, presupuestos, objetivos, cuentas, créditos, patrimonio, meses anteriores, etc.) usando ÚNICAMENTE los datos del bloque "DATOS" — nunca inventes cifras. ${notaDatos}
Además, un mensaje puede ser ${definicionSugerencia}
Responde SIEMPRE con un único JSON, sin texto adicional ni backticks, con EXACTAMENTE una de estas formas:
- Pregunta → ${formatoRespuesta}
- Sugerencia → ${formatoSugerencia}`;
}

function receiptSystemPrompt(categoryNames) {
  return `Extraes datos de un recibo o factura en una foto para registrar un gasto de hogar. Hoy es ${todayISO()}. Categorías de gasto disponibles: ${categoryNames.expense.join(', ')}. Responde SIEMPRE con este único JSON, sin texto adicional ni backticks: {"tipo":"registro","type":"expense","amount":number,"date":"YYYY-MM-DD o null si no se ve","description":"nombre del comercio o resumen","category":"nombre de categoría de la lista"}`;
}

// Resumen compacto de las finanzas visibles para este usuario — se manda
// como contexto a la IA en vez de todo el historial crudo (más barato, más
// rápido, y respeta la misma privacidad que ya ve el usuario en la app: solo
// se arma con datos que el cliente ya cargó respetando RLS). Cubre varios
// meses (no solo el actual) para que pueda responder sobre meses anteriores.
function buildDigest(data, visibleTransactions) {
  const monthKeys = lastMonthKeys(DIGEST_MONTHS);
  const flujoDeCaja = monthKeys.map((key) => ({ mes: key, ...monthCashFlow(visibleTransactions, key) }));

  function gastoPorCategoria(mKey) {
    const porCategoria = {};
    visibleTransactions.forEach((t) => {
      if (t.type !== 'expense') return;
      const occ = occurrencesInMonth(t, mKey);
      if (!occ) return;
      const cat = data.categories.find((c) => c.id === t.categoryId)?.name || 'Otro';
      porCategoria[cat] = (porCategoria[cat] || 0) + t.amount * occ;
    });
    return porCategoria;
  }
  const gastoPorCategoriaPorMes = Object.fromEntries(monthKeys.map((key) => [key, gastoPorCategoria(key)]));

  // Detalle día a día de lo más reciente — los agregados por mes de arriba no
  // alcanzan para responder "¿qué gasté ayer?" o "¿en qué compré tal cosa?".
  // No incluye transferencias/settlements (no son gasto real), y las
  // transacciones recurrentes solo aparecen en su fecha de registro original,
  // no en cada repetición — limitación del modelo de datos, no de este resumen.
  const recentCutoff = new Date(todayISO() + 'T00:00:00');
  recentCutoff.setDate(recentCutoff.getDate() - RECENT_TX_DAYS);
  const movimientosRecientes = visibleTransactions
    .filter((t) => (t.type === 'expense' || t.type === 'income') && t.date && new Date(t.date + 'T00:00:00') >= recentCutoff)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_TX_LIMIT)
    .map((t) => ({
      fecha: t.date,
      tipo: t.type,
      descripcion: t.description || null,
      categoria: data.categories.find((c) => c.id === t.categoryId)?.name || 'Otro',
      monto: t.amount,
      integrante: data.members.find((m) => m.id === t.memberId)?.name || null,
      recurrente: !!t.recurring,
    }));

  const mKey = thisMonthKey();
  const diasRestantesMes = daysLeftInMonth();
  const presupuestos = data.budgets.map((b) => {
    const cat = data.categories.find((c) => c.id === b.categoryId)?.name || 'Otro';
    const gastado = data.transactions
      .filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && occurrencesInMonth(t, mKey) && (b.scope === 'household' || t.memberId === b.scope))
      .reduce((s, t) => s + t.amount * occurrencesInMonth(t, mKey), 0);
    const restante = b.limit - gastado;
    return {
      categoria: cat, limite_mensual: b.limit, gastado_este_mes: gastado,
      restante_este_mes: restante, disponible_para_gastar_hoy: Math.round((restante / diasRestantesMes) * 100) / 100,
    };
  });
  // Repartiendo lo que queda de cada presupuesto entre los días que faltan
  // del mes — si algún presupuesto ya se pasó, resta de lo disponible total
  // (no se recorta a 0, para que se note que hay que compensar en otro lado).
  const disponibleParaGastarHoyTotal = Math.round(presupuestos.reduce((s, p) => s + p.disponible_para_gastar_hoy, 0) * 100) / 100;

  const objetivos = [...data.goals]
    .sort((a, b) => goalPriorityScore(b) - goalPriorityScore(a))
    .map((g) => ({ nombre: g.name, meta: g.targetAmount, ahorrado: g.currentAmount, fecha_objetivo: g.targetDate || null }));

  const cuentas = data.accounts.map((a) => ({
    nombre: a.name, medio_de_pago: PAYMENT_KIND_LABEL[a.paymentKind || 'otro'],
    saldo: accountBalance(visibleTransactions, a.id),
  }));
  const totalEnCuentas = cuentas.reduce((s, c) => s + c.saldo, 0);
  const totalAhorradoObjetivos = objetivos.reduce((s, g) => s + g.ahorrado, 0);

  // Créditos: solo se suman a la deuda los que están en la misma moneda del
  // hogar — los créditos en UVR se listan aparte porque convertirlos requiere
  // la tasa del día (no disponible aquí), igual que en el Dashboard.
  const creditos = (data.creditsWithPayments || []).map(({ credit, payments }) => ({
    nombre: credit.name, moneda: credit.currency || data.currency,
    saldo_pendiente: creditOutstandingBalance(credit, payments),
  }));
  const deudaMismaMoneda = creditos.filter((c) => c.moneda === data.currency).reduce((s, c) => s + c.saldo_pendiente, 0);
  const deudaEnOtraMonedaNoIncluida = creditos.filter((c) => c.moneda !== data.currency);

  // Lo que el Dashboard muestra en "Para revisar" — para poder contestar
  // "¿hay algo raro en mis gastos?" con los mismos avisos que ve la persona.
  const anomalias = detectAnomalies(visibleTransactions).slice(0, 8).map((a) => {
    const d = describeAnomaly(a, {
      formatMoney: (v) => String(Math.round(v)), formatDate: (x) => x,
      categoryName: (id) => data.categories.find((c) => c.id === id)?.name || 'Otro',
    });
    return { tipo: a.type, gravedad: a.severity, titulo: d.title, detalle: d.detail };
  });

  return {
    moneda: data.currency,
    anomalias,
    movimientos_recientes: movimientosRecientes,
    ventana_movimientos_recientes_dias: RECENT_TX_DAYS,
    flujo_de_caja_ultimos_meses: flujoDeCaja,
    gasto_por_categoria_por_mes: gastoPorCategoriaPorMes,
    dias_restantes_del_mes: diasRestantesMes,
    disponible_para_gastar_hoy_total: disponibleParaGastarHoyTotal,
    presupuestos,
    objetivos,
    cuentas,
    creditos,
    patrimonio_aproximado: totalEnCuentas + totalAhorradoObjetivos - deudaMismaMoneda,
    nota_patrimonio: deudaEnOtraMonedaNoIncluida.length
      ? 'El patrimonio_aproximado no incluye la deuda de los créditos en otra moneda listados en "creditos" — menciónalo si el usuario pregunta por su patrimonio total.'
      : undefined,
  };
}

function buildDraft(data, parsed, asMember, rawLabel) {
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

function ChatPanel({ data, actions, visibleTransactions, setModal, canAsk, canRegister, variant }) {
  const [messages, setMessages] = useState([]); // { role, text?, image?, draft? }
  const [input, setInput] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [asMember, setAsMember] = useState(data.members.find((m) => m.id === actions.userId)?.id || data.members[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const categoryNames = { income: data.categories.filter((c) => c.type === 'income').map((c) => c.name), expense: data.categories.filter((c) => c.type === 'expense').map((c) => c.name) };
  const memberNames = data.members.map((m) => m.name);

  function onPickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function send(overrideText) {
    const q = (overrideText ?? input).trim();
    if (!q && !imagePreview) return;
    if (loading) return;
    setError('');
    const nextMessages = [...messages, { role: 'user', text: q, image: imagePreview }];
    setMessages(nextMessages);
    setInput('');
    const pendingImageFile = imageFile, pendingImagePreview = imagePreview;
    setImageFile(null); setImagePreview(null);
    setLoading(true);
    try {
      let parsed;
      if (pendingImagePreview) {
        const base64Data = pendingImagePreview.split(',')[1];
        const mediaType = pendingImageFile?.type || 'image/jpeg';
        parsed = await callAiJson({
          system: receiptSystemPrompt(categoryNames),
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: q || 'Extrae los datos de este recibo.' },
          ],
          provider: data.settings?.ai_provider, model: data.settings?.ai_model,
        });
      } else {
        const history = nextMessages.slice(-MAX_HISTORY_MESSAGES - 1, -1)
          .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.text || (m.draft ? '[registró un movimiento]' : m.suggestion ? '[propuso una sugerencia para la app]' : '')}`).join('\n');
        const digestBlock = canAsk ? `DATOS (JSON):\n${JSON.stringify(buildDigest(data, visibleTransactions))}\n\n` : '';
        const prompt = `${digestBlock}${history ? `Conversación previa:\n${history}\n\n` : ''}Mensaje del usuario: ${q}`;
        parsed = await callAiJson({
          system: chatSystemPrompt({ currency: data.currency, categoryNames, memberNames, canAsk, canRegister }),
          content: [{ type: 'text', text: prompt }],
          provider: data.settings.ai_provider, model: data.settings.ai_model,
        });
      }
      if (parsed.tipo === 'registro') {
        setMessages((m) => [...m, { role: 'assistant', draft: buildDraft(data, parsed, asMember, q || 'Foto de recibo') }]);
      } else if (parsed.tipo === 'sugerencia') {
        const suggestion = suggestionFromAi(parsed);
        setMessages((m) => [...m, suggestion
          ? { role: 'assistant', suggestion, suggestionState: 'pending' }
          : { role: 'assistant', text: 'Cuéntame con más detalle qué te gustaría que la app hiciera o mejorara, y lo envío al equipo.' }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', text: parsed.texto || 'No obtuve una respuesta — intenta de nuevo.' }]);
      }
    } catch (e) {
      setError(e.message || 'No se pudo contactar al asistente.');
    } finally {
      setLoading(false);
    }
  }

  function patchMessage(index, patch) {
    setMessages((list) => list.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }
  async function sendSuggestion(index) {
    patchMessage(index, { suggestionState: 'sending', suggestionError: '' });
    try {
      await actions.addSuggestion(messages[index].suggestion);
      patchMessage(index, { suggestionState: 'sent' });
    } catch (e) {
      patchMessage(index, { suggestionState: 'pending', suggestionError: 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.' });
    }
  }

  const title = canAsk && canRegister ? 'Pregúntame o cuéntame qué gastaste' : canRegister ? 'Registra tus movimientos por chat' : 'Pregúntame sobre tus finanzas';
  const subtitle = canAsk && canRegister
    ? 'Usa tus datos reales para responder, y puede registrar un movimiento si le describes uno o le mandas la foto de un recibo.'
    : canRegister
      ? 'Escribe como si le mandaras un mensaje a tu familia, o sube la foto de un recibo — tú confirmas antes de guardar.'
      : 'Responde solo con tus movimientos, presupuestos y objetivos reales.';

  const isPopup = variant === 'popup';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: isPopup ? 0 : '60vh', height: isPopup ? '100%' : undefined }}>
      {!isPopup && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={18} color={T.teal} />
            <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>{title}</p>
          </div>
          <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">{subtitle}</p>
        </>
      )}

      {canRegister && data.members.length > 1 && (
        <select style={{ ...inputStyle, marginBottom: 10, fontSize: 12.5, flexShrink: 0 }} value={asMember} onChange={(e) => setAsMember(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>Registrar como: {m.name}</option>)}
        </select>
      )}

      <div className="flex flex-col gap-2" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {messages.length === 0 && (
          <>
            <EmptyState icon={<Sparkles size={32} color={T.teal} />} title={canAsk ? 'Pregúntame lo que quieras' : 'Cuéntame qué registrar'} subtitle="Prueba con uno de estos, o escribe el tuyo abajo." />
            <div className="flex flex-col gap-2">
              {(canAsk ? SUGGESTED_QUESTIONS : SUGGESTED_REGISTROS).map((q) => (
                <button key={q} onClick={() => send(q)} className="text-left rounded-xl p-3" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{q}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            {m.suggestion ? (
              <Card style={{ padding: 12 }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Lightbulb size={14} color={T.gold} />
                  <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }}>Sugerencia para la app</p>
                </div>
                <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>{m.suggestion.title}</p>
                <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY, whiteSpace: 'pre-wrap' }} className="mb-2">{m.suggestion.description}</p>
                {(m.suggestionState === 'pending' || m.suggestionState === 'sending') && (
                  <div className="flex gap-2">
                    <PrimaryButton onClick={() => sendSuggestion(i)} style={{ opacity: m.suggestionState === 'sending' ? 0.6 : 1 }}>
                      {m.suggestionState === 'sending' ? 'Enviando…' : 'Enviar al equipo'}
                    </PrimaryButton>
                    <GhostButton onClick={() => patchMessage(i, { suggestionState: 'dismissed' })}>Descartar</GhostButton>
                  </div>
                )}
                {m.suggestionError && <p style={{ fontSize: 12, color: T.danger, fontFamily: FONT_BODY }} className="mt-2">{m.suggestionError}</p>}
                {m.suggestionState === 'sent' && (
                  <p style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY }}>
                    Enviada, gracias. Te avisaremos cuando la revisen; también puedes ver su estado en Ajustes → Mis sugerencias.
                  </p>
                )}
                {m.suggestionState === 'dismissed' && <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>Descartada — no se envió.</p>}
              </Card>
            ) : m.draft ? (
              <Card style={{ padding: 12 }}>
                <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-1">Detecté este movimiento:</p>
                <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>
                  {m.draft.description || (data.categories.find((c) => c.id === m.draft.categoryId)?.name)} — {m.draft.amount ? formatMoney(m.draft.amount, data.currency) : '—'}
                </p>
                <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">
                  {data.categories.find((c) => c.id === m.draft.categoryId)?.name} · {formatDate(m.draft.date)}
                </p>
                <PrimaryButton onClick={() => setModal({ type: 'transaction', payload: m.draft })}>Revisar y guardar</PrimaryButton>
              </Card>
            ) : (
              <Card style={{ background: m.role === 'user' ? T.teal : T.surface, padding: '10px 14px' }}>
                {m.image && <img src={m.image} alt="Adjunta" className="rounded-lg mb-2" style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain' }} />}
                {m.text && <p style={{ fontSize: 13.5, color: m.role === 'user' ? '#fff' : T.ink, fontFamily: FONT_BODY, whiteSpace: 'pre-wrap' }}>{m.text}</p>}
              </Card>
            )}
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

      {error && <p style={{ color: T.danger, fontSize: 12.5, fontFamily: FONT_BODY, flexShrink: 0 }} className="mt-2">{error}</p>}

      {imagePreview && (
        <div className="flex items-center gap-2 mt-3 rounded-xl p-2" style={{ background: T.bg, flexShrink: 0 }}>
          <img src={imagePreview} alt="Foto adjunta" className="rounded-lg" style={{ width: 44, height: 44, objectFit: 'cover' }} />
          <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="flex-1">Foto lista para enviar</span>
          <button onClick={() => { setImageFile(null); setImagePreview(null); }} aria-label="Quitar foto" className="flex items-center justify-center" style={{ width: 28, height: 28 }}>
            <X size={16} color={T.inkSoft} />
          </button>
        </div>
      )}

      <div className="flex gap-2 mt-3" style={{ flexShrink: 0 }}>
        {canRegister && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickImage} />
            <button onClick={() => fileInputRef.current?.click()} disabled={loading} aria-label="Adjuntar foto de recibo"
              className="flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, width: 44, height: 44, flexShrink: 0, opacity: loading ? 0.5 : 1 }}>
              {imagePreview ? <ImageIcon size={18} color={T.teal} /> : <Camera size={18} color={T.ink} />}
            </button>
          </>
        )}
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder={canRegister && canAsk ? 'Escribe una pregunta o un movimiento…' : canRegister ? 'Ej. "Pagué 350 de gasolina hoy"' : 'Ej. ¿Cuánto llevo en restaurantes este mes?'}
          disabled={loading}
        />
        <button onClick={() => send()} disabled={loading || (!input.trim() && !imagePreview)} aria-label="Enviar"
          className="flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: T.teal, borderRadius: 10, width: 44, height: 44, flexShrink: 0, opacity: loading || (!input.trim() && !imagePreview) ? 0.5 : 1 }}>
          {loading ? <Loader2 size={18} color="#fff" className="animate-spin" /> : <Send size={18} color="#fff" />}
        </button>
      </div>
    </div>
  );
}

// Punto de entrada único del Asistente: un solo chat que, según el acceso de
// cada quien (controlado en Admin, por función), puede responder preguntas,
// registrar movimientos por texto o foto de recibo, o ambas cosas a la vez
// dejando que la IA decida qué es cada mensaje.
export function Asistente({ data, actions, visibleTransactions, setModal, variant = 'page' }) {
  const aiProviderConfigured = data.settings?.ai_provider && data.settings.ai_provider !== 'none';
  const canAsk = aiProviderConfigured && isAiFeatureEnabled(data.settings?.assistant_access, actions.userId);
  const canRegister = aiProviderConfigured && isAiFeatureEnabled(data.settings?.quick_capture_access, actions.userId);

  if (!canAsk && !canRegister) return null;

  return (
    <div className={variant === 'popup' ? 'flex flex-col h-full' : 'pb-4 pt-2'}>
      <ChatPanel data={data} actions={actions} visibleTransactions={visibleTransactions} setModal={setModal} canAsk={canAsk} canRegister={canRegister} variant={variant} />
    </div>
  );
}
