// Funciones puras de parseo/emparejamiento para las respuestas de IA — sin
// dependencias de red ni de Supabase, para que se puedan testear sin tocar
// variables de entorno (a diferencia de lib/ai.js, que sí las necesita).

export function stripJsonFences(text) {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

export function matchCategory(guessName, type, categories) {
  const pool = categories.filter((c) => c.type === type);
  if (!guessName) return pool[0]?.id;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const g = norm(guessName);
  let found = pool.find((c) => norm(c.name) === g);
  if (!found) found = pool.find((c) => norm(c.name).includes(g) || g.includes(norm(c.name)));
  return (found || pool[0])?.id;
}

export function matchMember(guessName, members) {
  if (!guessName) return null;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const g = norm(guessName);
  const found = members.find((m) => norm(m.name) === g || g.includes(norm(m.name)) || norm(m.name).includes(g));
  return found?.id || null;
}
