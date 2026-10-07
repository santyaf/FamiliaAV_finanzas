// TRM (Tasa Representativa del Mercado) del Banco de la República, por los datos abiertos del Gobierno.
// Compartido por /api/market (pantalla) y /api/send-reminders (alerta del dólar).
const TRM_URL = 'https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=30';

export async function fetchTrm(fetchImpl = fetch) {
  const res = await fetchImpl(TRM_URL, { headers: { Accept: 'application/json', 'User-Agent': 'FinanzasHogar/1.0' } });
  if (!res.ok) throw Object.assign(new Error(`Datos abiertos (TRM) respondió ${res.status}`), { status: 502 });
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) throw Object.assign(new Error('Sin datos de TRM'), { status: 502 });
  const series = rows
    .map((r) => ({ date: String(r.vigenciadesde).slice(0, 10), value: parseFloat(r.valor) }))
    .filter((p) => Number.isFinite(p.value))
    .reverse();
  if (!series.length) throw Object.assign(new Error('Sin datos de TRM'), { status: 502 });
  const last = series[series.length - 1];
  return { value: last.value, date: last.date, series };
}
