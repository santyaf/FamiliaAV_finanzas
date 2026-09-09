// Valor diario de la UVR (Unidad de Valor Real), fuente oficial: Banco de la
// República, servicio web SDMX.
//
// Historia: antes se consultaba el portal de datos abiertos del Estado
// (datos.gov.co, dataset mtic-nvgq). Ese dataset dejó de ser tabular
// ("no row or column access to non-tabular tables" / HTTP 403), así que la
// API SODA /resource/ ya no sirve. Ahora se usa el servicio SDMX del Banco
// de la República directamente.
//
// Endpoint:  https://totoro.banrep.gov.co/nsi-jax-ws/rest/data
// FlowRef:   ESTAT,DF_UVR_DAILY_LATEST,1.0   (últimos ~30 días + días ya
//            publicados del período vigente; la UVR se publica por
//            adelantado cada mes)
// El flujo trae DOS series: UNIT_MEASURE=CRVU (pesos por UVR, lo que
// necesitamos) y UNIT_MEASURE=APC (variación % anual). Tomamos CRVU.
//
// Respdta: SDMX-ML (XML). El servicio responde 406 si se pide JSON, así que
// se parsea el XML con expresiones regulares (el XML es generado por máquina
// y su estructura es estable).

import { requireAuth } from './_auth.js';

const SDMX_BASE = 'https://totoro.banrep.gov.co/nsi-jax-ws/rest/data';
const HEADERS = {
  // el servidor tiene detección de bots (perfdrive); un User-Agent de
  // navegador basta para pasar.
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/xml,text/xml,*/*',
};

function iso(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// Extrae las observaciones (fecha, valor) de la serie con UNIT_MEASURE=CRVU.
function parseCrvuObservations(xml) {
  const seriesBlocks = xml.match(/<generic:Series\b[\s\S]*?<\/generic:Series>/g) || [];
  for (const block of seriesBlocks) {
    if (!/id="UNIT_MEASURE"\s+value="CRVU"/.test(block)) continue;
    const obs = [];
    const re = /<generic:ObsDimension value="(\d{8})"\s*\/>\s*<generic:ObsValue value="([\d.]+)"/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      const value = parseFloat(m[2]);
      if (!isNaN(value)) obs.push({ date: m[1], value });
    }
    if (obs.length) return obs;
  }
  return [];
}

async function fetchFlow(flowId, params = '') {
  const url = `${SDMX_BASE}/ESTAT,${flowId},1.0/all/ALL/?dimensionAtObservation=TIME_PERIOD&detail=full${params}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Banco de la República respondió ${res.status} para ${flowId}`);
  return res.text();
}

export default async function handler(req, res) {
  if (await requireAuth(req, res)) return;

  try {
    let obs = [];
    try {
      obs = parseCrvuObservations(await fetchFlow('DF_UVR_DAILY_LATEST'));
    } catch (e) {
      // si "LATEST" falla, se intenta el histórico acotado a los últimos ~45 días
      const start = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
      obs = parseCrvuObservations(await fetchFlow('DF_UVR_DAILY_HIST', `&startPeriod=${start}`));
    }

    if (!obs.length) throw new Error('No se encontró la serie CRVU en la respuesta del Banco de la República');

    obs.sort((a, b) => a.date.localeCompare(b.date));
    const todayKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    // el valor vigente hoy: la última observación con fecha <= hoy
    // (el flujo incluye días futuros ya publicados del período en curso).
    const vigente = [...obs].reverse().find((o) => o.date <= todayKey) || obs[obs.length - 1];

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({
      date: iso(vigente.date),
      value: vigente.value,
      source: 'banrep.gov.co (SDMX)',
      series: 'DF_UVR_DAILY_LATEST/CRVU',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
