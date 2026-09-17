// Control de acceso a funciones de IA (Registro rápido, Asistente
// financiero...): cada una puede estar activada para todos, para nadie, o
// para una lista específica de personas — para probar con un grupo chico
// antes de activarla para toda la plataforma.

export const DEFAULT_AI_ACCESS = { mode: 'none', userIds: [] };

export function isAiFeatureEnabled(access, userId) {
  if (!access || !userId) return false;
  if (access.mode === 'all') return true;
  if (access.mode === 'selected') return Array.isArray(access.userIds) && access.userIds.includes(userId);
  return false; // 'none' o cualquier valor no reconocido
}
