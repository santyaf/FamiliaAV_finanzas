// Consulta el valor UVR más reciente desde el portal de datos abiertos del
// Estado colombiano (dataset certificado por el Banco de la República).
// No se pudo confirmar con 100% de certeza el nombre exacto de las columnas
// del JSON, así que se detectan por heurística en vez de asumir nombres fijos.
// Si algo fallara, el frontend cae a valores en caché (uvr_rates) o entrada manual.

export default async function handler(req, res) {
  try {
    const response = await fetch('https://www.datos.gov.co/resource/mtic-nvgq.json?$order=:id%20DESC&$limit=5');
    if (!response.ok) throw new Error(`Respuesta ${response.status} del portal de datos abiertos`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('Sin datos en la respuesta');

    const row = rows[0];
    let dateKey = Object.keys(row).find((k) => /vigen|fecha|date/i.test(k));
    let valueKey = Object.keys(row).find((k) => /valor|uvr|value/i.test(k) && k !== dateKey);

    if (!valueKey) {
      // último recurso: primer campo numérico que no sea la fecha
      valueKey = Object.keys(row).find((k) => k !== dateKey && !isNaN(parseFloat(row[k])));
    }
    if (!valueKey) throw new Error('No se pudo identificar el campo de valor en la respuesta');

    const value = parseFloat(row[valueKey]);
    const date = dateKey ? String(row[dateKey]).slice(0, 10) : new Date().toISOString().slice(0, 10);

    if (!value || isNaN(value)) throw new Error('Valor UVR inválido');

    res.status(200).json({ date, value, source: 'datos.gov.co', raw_field: valueKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
