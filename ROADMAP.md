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
- **Fase 12 — Medio de pago en Cuentas** — cada cuenta se marca como efectivo, tarjeta débito, cuenta de ahorros o tarjeta de crédito (`accounts.payment_kind`); Cuentas muestra disponible (o gastado, para tarjeta de crédito) agrupado por medio de pago. Tarjeta de crédito es solo informativa por ahora, sin cupo/límite.
- **Fase 12 — Obligaciones** — nuevo módulo en Gestión para pagos recurrentes (arriendo, servicios, suscripciones) con recordatorio push propio (`obligations` + `obligation_sent_log`, cron `send-reminders.js` extendido). Monto opcional (vacío = variable). El aviso, al tocarlo, navega a `#/movimientos?ob=<id>` y abre el registro del gasto ya prellenado con categoría/cuenta/monto/integrante.
- **Fase 12 — Medio de pago por transacción** — el medio de pago de la cuenta ahora es solo un *default*: cada movimiento puede anularlo (`transactions.payment_kind`, nullable). El selector del formulario se autocompleta con el de la cuenta elegida y sigue seguiendo ese default mientras no lo toques a mano.
- **Fase 12 — "Próximos pagos" unificado** — el widget del Dashboard mostraba solo transacciones recurrentes; ahora también incluye las Obligaciones próximas a vencer (14 días) en la misma lista, y tocar una obligación abre el registro del gasto ya prellenado (mismo flujo que el aviso push). Se mantienen ambos conceptos por separado a propósito: las recurrentes siguen sirviendo para que el presupuesto cuente un gasto de monto fijo automáticamente sin pedir confirmación (ej. mercado semanal); Obligaciones es el camino recomendado para cualquier recordatorio nuevo, incluidos los de monto variable (que una recurrente no puede representar).
- **Bugs arreglados (heredados de partir `App.jsx`)** — `AdminPanel.jsx` y `Ajustes.jsx` usaban `TAP_MIN` sin importarlo (rompían el panel de Admin y el selector de ícono de categorías); `NotificationsPanel.jsx` usaba `Trash2` sin importarlo (rompía la campana en cuanto había alguna notificación). El build no los detecta porque un identificador JSX sin importar no es un error de compilación, solo revienta en tiempo de ejecución. Verificado con un chequeo estático de todo `src/` que no quedan más casos.

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
| ~~**Cola offline de escrituras**~~ ✅ | Agregar un movimiento sin señal ya no se pierde: se guarda en el dispositivo (localStorage, `lib/offlineQueue.js`) con un id propio, aparece en la lista como "Pendiente de sincronizar" y se reenvía solo al volver la señal / al reabrir la app / cada 20 s. Reintentar nunca duplica (mismo id → el servidor responde 23505 → se da por enviado). Un rechazo real del servidor deja el movimiento marcado "No se pudo guardar" para descartarlo o reintentar. Al abrir la app sin señal se muestran los últimos datos guardados (snapshot) en vez de quedarse cargando. Franja de estado arriba (`OfflineBanner`). Tests con jsdom del flujo completo. **Alcance:** solo *agregar* movimientos se encola; editar, borrar y el resto de acciones necesitan conexión y avisan con un mensaje claro. Pendiente opcional: encolar más acciones (aportes a objetivos, abonos). | L |
| ~~**Migraciones versionadas**~~ ✅ | `supabase-schema.sql` (1.030 líneas, sin versionar por fase) partido en 11 archivos numerados en `supabase/migrations/` (uno por fase real: 1, 3, 3a, 3c, 4×2, 5, 6, 7, 9, 10). Los dos últimos conservan los timestamps reales de `supabase_migrations.schema_migrations`. Verificado: la concatenación de los 11 archivos es idéntica (sin comentarios/blancos) al `supabase-schema.sql` original. `supabase-schema.sql` se mantiene como snapshot de bootstrap para proyectos nuevos. | — |
| ~~**`package-lock.json`**~~ ✅ | Generado (lockfile v3, Node 20) y commiteado; `ci.yml` ahora usa `npm ci`. Se pudo hacer sin GitHub Actions porque Docker corre en la máquina de desarrollo (`docker run node:20 npm install`) — ya no hace falta correr el workflow manual `generate-lockfile.yml` (queda por si algún día cambian dependencias sin acceso a Docker). | — |

---

## Fase 12 — Captura sin fricción (lo que hace que la app "se use")

El mayor predictor de que una app de finanzas sobreviva es qué tan fácil es meter los datos.

- **Importar extractos** — subir CSV/Excel del banco, mapear columnas, deduplicar contra lo ya registrado.
- **Pegar SMS / correo del banco** — los bancos colombianos mandan SMS por cada compra. Una caja de "pega aquí el mensaje" que reusa la IA de Registro rápido para extraer monto/comercio/fecha. Android share-target para mandarlo directo desde la app de mensajes.
- ~~**Recurrentes automáticas**~~ ✅ — módulo **Obligaciones** dentro de Gestión: recordatorio push por integrante o de todo el hogar (frecuencia, hora, monto opcional — vacío = variable, nota); al tocar el aviso abre el registro del gasto ya prellenado (`#/movimientos?ob=<id>`).
- **Adjuntar el recibo** — hoy la foto solo se usa para parsear y se descarta. Guardarla en Supabase Storage ligada al movimiento (útil para garantías, reembolsos, renta).
- **Plantillas / favoritos** — "Mercado D1", "Gasolina", "Almuerzo" con un toque.
- **Multi-moneda** — un ahorro en USD, gastos de viaje. Hoy el hogar tiene una sola moneda.
- **iOS Shortcuts / widget** — "Agregar gasto" desde la pantalla de inicio del celular.

---

## Fase 13 — Inteligencia y análisis (lo que la hace "la mejor")

- ~~**Dashboards de tendencia**~~ ✅ — nueva sección **Tendencias** en Gestión: flujo de caja mensual (barras ingresos/gastos de los últimos 6 meses, SVG a mano) y gasto por categoría mes a mes (últimos 4 meses, top 6 categorías). Falta: calendario/heatmap de gasto diario.
- ~~**Patrimonio neto**~~ ✅ — tarjeta al inicio del Dashboard: activos (saldo de cuentas + ahorrado en objetivos) menos pasivos (saldo pendiente de créditos activos, con conversión UVR→COP a la última tasa conocida). Falta: inversiones/propiedades manuales y su **evolución en el tiempo** (necesitaría una tabla de snapshots periódicos — no es trivial reconstruirlo del histórico de transacciones).
- ~~**Asistente financiero con IA**~~ ✅ — nueva sección Asistente en Gestión: chat que responde con base en un resumen de flujo de caja (6 meses), gasto por categoría por mes, movimientos individuales de los últimos 30 días (para preguntas sobre un día o compra puntual), presupuestos con "disponible para gastar hoy" (lo que queda del presupuesto repartido entre los días que faltan del mes), objetivos, cuentas y créditos/patrimonio aproximado (nunca inventa cifras — instrucción explícita en el prompt). Reusa el mismo endpoint `/api/ai-parse` y proveedor de Registro rápido.
- ~~**Control de acceso por función de IA**~~ ✅ — Registro rápido y el Asistente se activan por separado desde Admin, cada uno para *todos*, *nadie*, o una lista específica de personas (`app_settings.quick_capture_access` / `assistant_access`, `{mode, userIds}`) — para probar una función nueva con un grupo chico antes de abrirla a todo el mundo. Si el proveedor de IA está en "Ninguna", ninguna de las dos funciona sin importar el acceso configurado.
- ~~**Unificar Registro rápido + Asistente en un solo chat**~~ ✅ — un único chat (tarjeta "Asistente" en Gestión + botón flotante) donde la IA decide por mensaje si es una pregunta o un movimiento a registrar; también acepta la foto de un recibo con un botón de cámara junto al de enviar. Si la persona solo tiene acceso a una de las dos funciones, el chat se limita a esa (sin selector de modo). El botón flotante de agregar movimiento manual se movió a la barra inferior (antes era "Registro rápido"). El control de acceso sigue siendo independiente por función — solo se unificó la interfaz, no el permiso.
- ~~**Detección de anomalías**~~ ✅ — tarjeta **"Para revisar"** en el Dashboard (`lib/anomalies.js`, lógica pura con 34 tests). Cinco reglas sobre gastos: *duplicados* (mismo monto + descripción + integrante en ≤1 día), *gasto inusual* (muy por encima de lo normal de su categoría — mediana + MAD, mínimo 5 gastos previos), *subida de precio* de un cobro mensual estable (Netflix 15.000 → 18.000), *categoría disparada* este mes vs. el promedio de los 3 anteriores, y *4+ cobros que se repiten cada mes* en la misma categoría. Cada aviso se puede descartar (se recuerda en el dispositivo) y el Asistente también los conoce ("¿hay algo raro en mis gastos?"). Las reglas necesitan historia: con pocos meses de datos la tarjeta no aparece, que es lo esperado. Falta: alertas push de anomalías y ajustar umbrales con datos reales.
- ~~**"Disponible para gastar hoy"**~~ ✅ (en el Asistente) — cálculo (`daysLeftInMonth` en `lib/finance.js`) disponible en el resumen del Asistente, por presupuesto y total. Falta: tarjeta propia en el Dashboard (hoy solo se puede preguntar por chat).
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
