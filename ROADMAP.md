# Finanzas del Hogar — Plan para ser la mejor app de finanzas personales y familiares

Estado a 2026-09-09. Continúa la numeración de fases del README (la última fue la Fase 10).

---

## Ya hecho en esta ronda (Fases 9–10 + arreglos)

- **Fase 9** — Notificaciones push con recordatorios parametrizables por usuario.
- **Fase 10** — Guardas a nivel de base de datos para objetivos familiares.
- **Repo al día** — `supabase-schema.sql` y `.env.example` versionados; tabla de variables de entorno en el README.
- **Registro rápido arreglado** — el modelo `gemini-2.0-flash` fue descontinuado por Google; se cambió a `gemini-3.6-flash` (código + base). Verificado contra producción.
- **UVR arreglado** — `datos.gov.co` dejó de exponer el dataset como tabla; ahora `api/uvr.js` consulta el servicio SDMX oficial del Banco de la República (`DF_UVR_DAILY_LATEST`, serie CRVU). Verificado: UVR 2026-09-09 = 417.9009.
- **Endpoints `/api` re-protegidos** — la Fase 9/10 había dejado `/api/ai-parse` y `/api/uvr` sin verificación de sesión (cualquiera con la URL podía gastar la cuota de IA). Vuelven a exigir `Authorization: Bearer <token>` de Supabase. Se eliminó `api/claude.js` (legado, sin auth, sin uso). Verificado: sin token → 401.
- **Navegación + rendimiento** — barra inferior de 5: Inicio · Movimientos · Registro rápido · **Gestión** · Ajustes. "Gestión" agrupa Créditos/Objetivos/Presupuestos/Conciliación/Cuentas en un grid con descripción. Admin pasó a Ajustes. Se eliminó `recharts` (bundle ~923 KB → ~565 KB; gzip 250 → 152).
- **Recordatorios push funcionando** — modelo Gemini + UVR + endpoints re-protegidos + VAPID + `REMINDER_CRON_SECRET` configurados. Envío periódico por **cron-job.org**; el workflow de GitHub quedó como botón manual (`dry`/`force`). `send-reminders.js` con diagnóstico. Verificado: llega la notificación al iPhone.
- **Pantalla en blanco arreglada** — el service worker v1 servía el HTML cache-first para siempre → apuntaba a chunks que ya no existían. SW v3 network-first para el HTML + auto-reload al detectar despliegue nuevo.
- **Fase 11 (cimientos)** — ✅ tests de la lógica pura (`amortization`, `finance`, `notifications` — ~50 casos), ✅ CI en cada push (`npm test` + build), ✅ error boundary, ✅ routing por hash con deep-links y botón atrás. En progreso: partir `App.jsx` en `src/sections/`.

### Pendiente de configuración

Nada — todo configurado y verificado. (Si algún día rotas las claves VAPID, marca las variables en Vercel para *todos* los entornos, no solo Production.)

---

## Fase 11 — Cimientos técnicos (habilita todo lo demás)

Sin esto, cada fase siguiente es más lenta y más riesgosa.
**Lo grueso está hecho** (endpoints, tests, CI, error boundary, routing, partir App.jsx). Quedan 3 ítems de menor urgencia:

| Ítem | Por qué | Esfuerzo |
|---|---|---|
| ~~**Re-proteger `/api/ai-parse` y `/api/uvr`**~~ ✅ | Ya exigen sesión de Supabase (`requireAuth`). Pendiente opcional: rate-limit por usuario además de la auth. | — |
| ~~**Tests de la lógica pura**~~ ✅ | `amortization.js`, `finance.js` y `notifications.js` (`buildNotificationCandidates`) con ~50 casos Vitest, positivos y negativos. Corren en CI en cada push. | — |
| ~~**Partir `App.jsx`**~~ ✅ | `src/lib/` (finance, format, notifications, amortization + tests), `src/ui/` (theme, primitives), `src/sections/` (12 archivos con sus modales), `src/components/` (ErrorBoundary). **App.jsx: 3.978 → 495 líneas (−88%)** — solo orquestación (App, HouseholdApp, MainApp, useHashRoute). | — |
| ~~**Routing real con deep-links**~~ ✅ | `useHashRoute` — cada sección tiene su URL (`#/creditos`), el botón "atrás" del celular funciona, se pueden compartir enlaces a una sección. | — |
| ~~**Error boundary**~~ ✅ | `src/components/ErrorBoundary.jsx` — ante un error de render muestra "Recargar" en vez de pantalla en blanco. Pendiente: enganchar Sentry (free tier) en `componentDidCatch`. | S |
| ~~**CI en cada push/PR**~~ ✅ | `.github/workflows/ci.yml` corre `npm test` + `npm run build` en cada push. Actions activado. | — |
| **Cola offline de escrituras** | La app se usa "en la calle". Hoy si no hay señal, guardar un movimiento falla en silencio. IndexedDB + reintento al recuperar conexión. | L |
| **Migraciones versionadas** | Hoy el esquema se aplica corriendo `supabase-schema.sql` completo a mano. Pasar a `supabase/migrations/*.sql` numeradas (como ya lo hace el otro proyecto del repo). | M |
| **`package-lock.json`** | El repo no tiene lockfile → los builds no son 100% reproducibles. Generar uno (`npm install`) y commitearlo; luego el CI puede usar `npm ci`. | S |

---

## Fase 12 — Captura sin fricción (lo que hace que la app "se use")

El mayor predictor de que una app de finanzas sobreviva es qué tan fácil es meter los datos.

- **Importar extractos** — subir CSV/Excel del banco, mapear columnas, deduplicar contra lo ya registrado.
- **Pegar SMS / correo del banco** — los bancos colombianos mandan SMS por cada compra. Una caja de "pega aquí el mensaje" que reusa la IA de Registro rápido para extraer monto/comercio/fecha. Android share-target para mandarlo directo desde la app de mensajes.
- **Recurrentes automáticas** — hoy "Próximos pagos" solo muestra; que el día del vencimiento pregunte "¿ya pagaste el arriendo?" y con un toque lo registre.
- **Adjuntar el recibo** — hoy la foto solo se usa para parsear y se descarta. Guardarla en Supabase Storage ligada al movimiento (útil para garantías, reembolsos, renta).
- **Plantillas / favoritos** — "Mercado D1", "Gasolina", "Almuerzo" con un toque.
- **Multi-moneda** — un ahorro en USD, gastos de viaje. Hoy el hogar tiene una sola moneda.
- **iOS Shortcuts / widget** — "Agregar gasto" desde la pantalla de inicio del celular.

---

## Fase 13 — Inteligencia y análisis (lo que la hace "la mejor")

- **Dashboards de tendencia** — flujo de caja mensual, ingresos vs gastos en el tiempo, categorías mes a mes, calendario/heatmap de gasto. (Con `recharts` fuera: o una librería liviana cargada bajo demanda, o SVG a mano para un set curado.)
- **Patrimonio neto** — activos (cuentas + saldos de objetivos + inversiones + propiedades que el usuario registre) menos pasivos (créditos), con su evolución. Hoy no existe la vista consolidada.
- **Asistente financiero con IA** — ya tienes el proveedor conectado. Un chat que responda "¿cuánto llevo en restaurantes este mes?", "¿me alcanza para $X?", "¿cómo voy con la meta del carro?". Diferenciador enorme.
- **Detección de anomalías** — cobro inusual, duplicado, "pagas 4 servicios de streaming", subida de precio de una suscripción.
- **"Disponible para gastar hoy"** — dado el presupuesto y lo que falta del mes.
- **Proyección a fin de mes** — ¿vas a llegar a la quincena? (parte ya está en el motor de notificaciones).
- **Estrategias de pago de deuda a nivel portafolio** — avalancha vs bola de nieve entre todos los créditos, simulador "si abono $X/mes". Hoy el simulador es por crédito individual.
- **Tasa de ahorro y puntaje de salud financiera**.

---

## Fase 14 — Familia de verdad (el diferenciador frente a apps individuales)

- **Cuentas de menores + mesada** — perfil "hijo/a" con visibilidad limitada, mesada automática programada, tareas → recompensa, metas de ahorro infantiles con celebración.
- **Aprobaciones generalizadas** — hoy solo los objetivos familiares requieren aprobación unánime. Extenderlo a gastos grandes ("cualquier gasto > $X necesita OK de otro integrante").
- **Privacidad por movimiento/categoría** — marcar algo como "solo yo lo veo" incluso dentro del hogar.
- **Calendario financiero del hogar** — quincena, arriendo, matrícula, cuota del crédito, en una sola vista compartida.
- **Modo "reunión mensual"** — una pantalla para revisar el mes juntos: qué se cumplió, qué se pasó, decisiones para el próximo mes.
- **Múltiples hogares** — apoyar a los papás, un fondo con amigos, etc.

---

## Fase 15 — Confianza, seguridad y cumplimiento

- **Auditoría de RLS y advisors de Supabase** — hay 11 funciones `SECURITY DEFINER` ejecutables por `anon`; revisar una por una. Activar "Leaked Password Protection". Suite de tests de RLS.
- **2FA / MFA** en el login.
- **Exportar todos mis datos** (CSV/JSON) y **borrar la cuenta** — expectativa básica hoy en día.
- **Rate-limit real** en los endpoints de IA (ver Fase 11).
- **Backups / PITR** configurados y verificados en Supabase.
- **Ayuda para declaración de renta** (Colombia) — marcar categorías deducibles, resumen anual descargable, certificados.
- **Bloqueo con biométrico / PIN** al abrir la app.

---

## Fase 16 — Alcance y pulido

- **Onboarding guiado** — crear hogar → agregar cuentas → primer presupuesto → invitar a la familia, con progreso.
- **i18n + multi-país** — hoy es 100% es-CO. Scaffold es/en, otras monedas y reglas (UVR es solo Colombia).
- **Modo oscuro**.
- **App en las tiendas** — envolver la PWA en TWA (Play Store) y Capacitor (App Store). Desbloquea push real en iOS, biométrico, widgets nativos.
- **Digest mensual** por push/correo — reusa la infra de `send-reminders`.
- **Referidos / compartir**.

---

## Transversal (en paralelo a todas las fases)

- **Accesibilidad** — labels en todos los campos, foco atrapado en los modales, contraste, lectores de pantalla.
- **Rendimiento** — virtualizar la lista de movimientos cuando crezca; memoizar `computeBalances`/`simplifyDebts` (hoy corren en cada render).
- **Observabilidad del cron** — alerta si los recordatorios dejan de enviarse (GitHub desactiva workflows tras 60 días sin commits).
- **Documentación** — mantener el README y este archivo al día por fase.
