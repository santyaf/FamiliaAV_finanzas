# Cómo aplicar los ajustes de seguridad (próximos pasos 1-3 de la revisión de código)

Estos cambios cierran las 3 brechas críticas/altas que se detectaron: la aprobación
unánime de retiros de objetivos familiares se puede saltar desde el cliente, los
votos de aprobación se pueden falsificar entre hogares, y el endpoint de IA se
puede usar sin sesión.

## 1. Base de datos (Supabase → SQL Editor)

Abre tu proyecto en supabase.com → **SQL Editor** → pega y ejecuta **todo** el
archivo `supabase-schema.sql` actualizado (es idéntico al que ya tenías, solo se
agregó la sección **FASE 8** al final). El script es idempotente — usa
`create or replace` / `drop policy if exists` / `drop trigger if exists` — así
que ejecutarlo completo de nuevo no duplica nada ni rompe los datos existentes.

Qué agrega la Fase 8:

- Corrige las políticas de `goal_votes` y `goal_change_votes` para exigir que
  quien vota realmente pertenezca al hogar del objetivo/solicitud (antes solo
  se exigía que el voto fuera "de uno mismo", sin validar el hogar).
- Agrega dos *triggers* (`guard_family_goal_changes` en `goals` y
  `guard_family_goal_withdraw_tx` en `transactions`) que bloquean, **dentro de
  la base de datos**, cualquier intento de editar la meta o retirar saldo de un
  objetivo **familiar** que no pase por el flujo de aprobación. Los aportes
  (depósitos) y los objetivos **individuales** siguen funcionando exactamente
  igual que antes — no se toca ese flujo.
- Agrega la función seguridad `vote_and_resolve_goal_request(request_id, approve)`,
  que registra el voto, cuenta solo votos de integrantes reales del hogar, y si
  hay unanimidad aplica el cambio ella misma, todo en una sola transacción
  atómica. Reemplaza la lógica que antes vivía en el navegador.

**Importante**: si ya tienes solicitudes `pending` con votos "falsos" de otro
hogar colados antes de este fix, no hay que limpiarlos a mano — la nueva
función los ignora automáticamente al contar (solo cuenta votos de gente que
sí es `household_member` del hogar de la solicitud).

## 2. Variables de entorno en Vercel (ya deberían existir)

Los endpoints `api/ai-parse.js` y `api/uvr.js` ahora validan la sesión usando
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` — las mismas que ya tienes
configuradas para el frontend. No hace falta agregar ninguna variable nueva.

## 3. Código (ya está en esta carpeta, listo para desplegar)

Archivos modificados:

- `api/_auth.js` **(nuevo)** — helper de verificación de sesión.
- `api/ai-parse.js` — ahora exige `Authorization: Bearer <token>` válido.
- `api/uvr.js` — ídem.
- `src/lib/db.js` — `voteOnGoalRequest` ahora llama al RPC seguro;
  `getLatestUvr` envía el token de sesión.
- `src/App.jsx` — la acción `voteOnGoalRequest` ya no cuenta votos en el
  cliente; `callAI` envía el token de sesión al endpoint de IA.

Después de copiar estos archivos a tu carpeta del proyecto: `git add -A`,
commit, y push — Vercel construye y despliega automáticamente si tienes la
integración con tu repo. Si despliegas manual, `vercel --prod` desde la
carpeta del proyecto.

## 4. Cómo probar que quedó bien

1. Como integrante A: crea un objetivo **familiar** (sin dueño), pide un
   retiro. Sin que nadie más apruebe, intenta en la consola del navegador
   (DevTools) hacer `supabase.from('goals').update({current_amount:0}).eq('id', GOAL_ID)`
   directamente — debe fallar con el mensaje "Retirar saldo de un objetivo
   familiar requiere aprobación unánime del hogar."
2. Como integrante B: aprueba la solicitud desde la UI normal (Objetivos →
   Solicitudes pendientes) — con 2 integrantes en el hogar, debería aplicarse
   de inmediato tras el segundo voto.
3. Abre la app sin haber iniciado sesión (o borra el `Authorization`
   header con DevTools) y llama a `/api/ai-parse` o `/api/uvr` directamente
   (por ejemplo con `fetch('/api/uvr')` desde la consola de un navegador sin
   sesión) — debe responder `401 { error: "No autenticado..." }`.
