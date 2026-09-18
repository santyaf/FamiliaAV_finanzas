import { describe, it, expect } from 'vitest';
import {
  SUGGESTION_STATUSES, suggestionStatusLabel, cleanSuggestion, suggestionFromAi, TITLE_MAX, DESCRIPTION_MAX,
} from './suggestions';

describe('suggestionStatusLabel', () => {
  it('traduce cada estado y devuelve el id si no lo conoce', () => {
    expect(suggestionStatusLabel('en_revision')).toBe('En revisión');
    expect(suggestionStatusLabel('rechazada')).toBe('Rechazada');
    expect(suggestionStatusLabel('otro')).toBe('otro');
  });
  it('los estados coinciden con los permitidos en la base de datos', () => {
    expect(SUGGESTION_STATUSES.map((s) => s.id)).toEqual(
      ['nueva', 'en_revision', 'aprobada', 'en_desarrollo', 'implementada', 'rechazada'],
    );
  });
});

describe('cleanSuggestion', () => {
  it('recorta espacios y compacta los del título', () => {
    expect(cleanSuggestion({ title: '  Modo   oscuro  ', description: '  Quisiera un modo oscuro.  ' }))
      .toEqual({ title: 'Modo oscuro', description: 'Quisiera un modo oscuro.' });
  });
  it('si no hay título lo toma del inicio de la descripción', () => {
    const r = cleanSuggestion({ description: 'Sería útil poder exportar mis movimientos a Excel' });
    expect(r.title).toBe('Sería útil poder exportar mis movimientos a Excel');
    const larga = cleanSuggestion({ description: 'x'.repeat(200) });
    expect(larga.title).toHaveLength(80);
  });
  it('devuelve null si la descripción está vacía o es demasiado corta', () => {
    expect(cleanSuggestion({ title: 'Algo', description: '   ' })).toBeNull();
    expect(cleanSuggestion({ title: 'Algo', description: 'ab' })).toBeNull();
    expect(cleanSuggestion()).toBeNull();
  });
  it('respeta los máximos que exige la base de datos', () => {
    const r = cleanSuggestion({ title: 't'.repeat(500), description: 'd'.repeat(9000) });
    expect(r.title).toHaveLength(TITLE_MAX);
    expect(r.description).toHaveLength(DESCRIPTION_MAX);
  });
});

describe('suggestionFromAi', () => {
  it('convierte la respuesta de la IA', () => {
    expect(suggestionFromAi({ tipo: 'sugerencia', titulo: 'Metas por hijo', descripcion: 'Poder crear metas de ahorro para cada hijo.' }))
      .toEqual({ title: 'Metas por hijo', description: 'Poder crear metas de ahorro para cada hijo.' });
  });
  it('tolera respuestas incompletas', () => {
    expect(suggestionFromAi({ tipo: 'sugerencia' })).toBeNull();
    expect(suggestionFromAi(null)).toBeNull();
  });
});
