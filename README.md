# Finanzas del Hogar — v2 (Fase 1: Auth + Supabase + Invitación por QR)

## Qué cambió respecto a v1
- Ya no se usa `localStorage`: todos los datos viven en **Supabase** (Postgres + Auth + RLS), así que se comparten entre todos los dispositivos de los integrantes del hogar.
- **Login real** (correo + contraseña) con Supabase Auth.
- Un integrante **crea el hogar**; para sumar a los demás, genera una **invitación por QR** desde Ajustes → Invitar. Quien escanea el código con la cámara de su celular se registra/inicia sesión y queda automáticamente dentro del hogar.
- **Row Level Security**: cada tabla filtra automáticamente por los hogares a los que pertenece el usuario autenticado. Nadie puede leer ni escribir datos de un hogar del que no es integrante.
- Unirse a un hogar **siempre requiere una invitación válida** (no es posible insertarse a un hogar solo conociendo su ID).

## 1. Crear el proyecto en Supabase
1. Ve a https://supabase.com/dashboard → **New project**
2. Cuando esté listo, abre **SQL Editor** → pega el contenido completo de `supabase-schema.sql` → **Run**
3. Ve a **Project Settings → API** y copia:
   - `Project URL` → será tu `VITE_SUPABASE_URL`
   - `anon public key` → será tu `VITE_SUPABASE_ANON_KEY`
4. (Opcional pero recomendado mientras pruebas) En **Authentication → Providers → Email**, puedes desactivar temporalmente "Confirm email" para no depender de la bandeja de correo durante las pruebas.

## 2. Variables de entorno
Copia `.env.example` a `.env.local` para desarrollo local, y agrega las mismas variables en **Vercel → Settings → Environment Variables**:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY` (solo para el Registro rápido con IA)

## 3. Desarrollo local
```bash
npm install
npm run dev
```

## 4. Subir a GitHub y desplegar en Vercel
```bash
git init
git add .
git commit -m "Finanzas del Hogar v2 - Fase 1"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```
Luego impórtalo en https://vercel.com/new y agrega las variables de entorno del paso 2 antes de desplegar.

## 5. Probar el flujo de invitación por QR
1. Crea tu cuenta y tu hogar
2. Ve a **Ajustes → Invitar** — verás un QR y un enlace (algo como `https://tuapp.vercel.app/?token=abc123`)
3. Con el celular de otro integrante, escanea el QR (o abre el enlace) → se registra o inicia sesión → queda unido automáticamente
4. La invitación vence en 3 días y es de un solo uso por defecto; puedes generar una nueva cuando quieras

## Qué falta (fases siguientes, ya planeadas)
- ~~**Fase 2**: edición de movimientos con confirmación + histórico de cambios~~ ✅ Completada
- ~~**Fase 3**: módulo de créditos (COP/UVR, amortización, seguros) conectado al valor UVR~~ ✅ Completada

## Fase 3 — Créditos, PWA, privacidad y mejoras de cuenta

**Módulo de créditos**
- Crea créditos en COP o UVR, con tasa efectiva anual, seguros mensuales, plazo y sistema de amortización (francés o alemán)
- Tabla de amortización completa generada automáticamente
- "Pagar cuota" registra el gasto automáticamente en Movimientos, categoría "Deudas y préstamos"
- **Abonos a capital**, con dos estrategias a elegir: reducir plazo (misma cuota, terminas antes) o reducir cuota (mismo plazo, cuota más baja) — recalcula toda la tabla restante
- Valor UVR consultado automáticamente (portal de datos abiertos del Estado colombiano, dataset certificado por el Banco de la República) con caché y entrada manual de respaldo en Ajustes — **importante**: no pude confirmar con 100% de certeza el nombre exacto de las columnas de esa API externa, así que la función `/api/uvr.js` detecta los campos por heurística; si falla, no rompe nada, simplemente usa el último valor guardado o el que ingreses a mano

**Privacidad individual vs. familiar**
- Cuentas y movimientos **individuales** ahora solo los puede ver su dueño (a nivel de base de datos, con RLS — no es solo una restricción visual)
- Cuentas y movimientos **compartidos** (cuenta compartida o gasto marcado como "compartido") los ven todos los integrantes implicados
- El Dashboard ahora muestra un bloque separado de "Familiar/compartido" y "Mis finanzas personales"

**Cuenta**
- Confirmación de contraseña al registrarse
- "¿Olvidaste tu contraseña?" con recuperación por correo

**PWA**
- La app se puede instalar en el celular (ícono, pantalla completa, funciona sin barra del navegador)
- Botón "Instalar app" en Ajustes cuando el navegador lo permite
- Funciona parcialmente offline (el shell de la app se cachea; los datos siempre se piden frescos a Supabase cuando hay internet)

### ⚠️ Importante: vuelve a correr `supabase-schema.sql` completo
Esta fase agrega tablas nuevas y **cambia políticas de seguridad existentes** (privacidad de cuentas/movimientos). Corre el script completo de nuevo en el SQL Editor — sigue siendo seguro re-ejecutarlo.

## Fase 3a — Superusuario, panel admin y proveedores de IA

**Cómo activar tu primer superusuario** (solo se hace una vez, directo por SQL — no hay forma de hacerlo desde la app, a propósito, por seguridad):
1. Corre el `supabase-schema.sql` actualizado (ya incluye la tabla `platform_admins` y `app_settings`)
2. En el SQL Editor, corre esto reemplazando tu correo:
   ```sql
   insert into platform_admins (user_id)
   select id from auth.users where email = 'tu-correo@ejemplo.com';
   ```
3. Cierra sesión y vuelve a entrar en la app — te debería aparecer la pestaña **"Admin"**
4. Desde ahí puedes promover a otros superusuarios por correo (ya no necesitas volver al SQL Editor)

**Qué hay en el panel Admin:**
- Apagar/prender el **Registro rápido con IA** para toda la plataforma
- Elegir el **proveedor de IA** activo: Claude, ChatGPT o Gemini — el cambio aplica al instante, sin redeploy
- Gestionar superusuarios
- Ver la lista de hogares de la plataforma (solo metadatos: nombre, fecha, # de integrantes — nunca el detalle financiero)

**Variables de entorno nuevas** (solo necesitas la del proveedor que realmente vayas a usar; si un proveedor no tiene su clave configurada, la app simplemente muestra un error claro al intentar usarlo, sin romper nada más):
- `OPENAI_API_KEY` — para ChatGPT (https://platform.openai.com/api-keys)
- `GOOGLE_API_KEY` — para Gemini (https://aistudio.google.com/apikey)
- `ANTHROPIC_API_KEY` — la que ya tenías, para Claude

**Cambio técnico**: `api/claude.js` fue reemplazado por `api/ai-parse.js`, que recibe siempre el mismo formato normalizado y adapta la llamada según el proveedor activo. Si tenías algo apuntando directo a `/api/claude`, ya no existe.

## Fase 3c — Notificaciones (bandeja dentro de la app)

Un ícono de campana 🔔 en la parte superior (con contador de no leídas) abre la bandeja de notificaciones.

**Motor de detección** — corre en el navegador, una vez por sesión, cada vez que alguien abre la app (no es un cron en el servidor; ver nota abajo). Revisa:
- **Proyección temprana de presupuesto**: si al ritmo de gasto actual vas a terminar el mes por encima del límite, avisa *antes* de llegar al 100%, no después
- **Ritmo de objetivos**: si a un objetivo le quedan 30 días o menos y el avance va por debajo del 90%
- **Ingreso extraordinario**: detecta un ingreso bastante mayor a tu promedio histórico y sugiere destinarlo al objetivo de mayor prioridad o a un abono a capital
- **Cuotas de crédito** que vencen en los próximos 7 días
- **Excedente familiar del mes** (con más de la mitad del mes ya transcurrida, para que el dato sea confiable) — sugiere reforzar un objetivo o abonar a capital

Cada alerta se genera **una sola vez** por período (mes, o por movimiento/cuota específica) gracias a una clave de deduplicación en la base de datos — no se repite cada vez que abres la app.

**Por qué "bandeja en la app" y no push todavía**: como definiste, esta fase no requiere infraestructura nueva (VAPID keys, permisos del navegador, etc.) — el motor de detección ya queda construido y probado; agregar push más adelante sería solo cambiar el "canal de entrega" sin tocar la lógica de qué alertar.

**Limitación honesta**: como el motor corre en el navegador al abrir la app (no hay un cron real en el servidor en esta fase), si nadie abre la app en varios días, esas alertas no se generan hasta que alguien entre. Para alertas verdaderamente independientes de que alguien abra la app, se necesitaría un Vercel Cron Job llamando a una función serverless — técnicamente posible en un salto futuro si se vuelve necesario.

## Refresco de UX y diseño

Tras una auditoría completa de la app (ver hallazgos abajo), apliqué:

**Críticos:**
- **Confirmación antes de eliminar** en todos lados — antes solo existía en Créditos, "Salir del hogar" y "Quitar superusuario"; ahora también en Movimientos, Objetivos, Presupuestos, Cuentas y Categorías
- **Área táctil accesible (40×40px mínimo)** en todo ícono interactivo de la app, vía un componente `IconButton` nuevo — antes había íconos de 10-18px sin padding, muy por debajo del mínimo recomendado (44×44px)
- **Emoji reemplazados por íconos SVG** (Lucide) en categorías — con compatibilidad hacia atrás: si ya tenías categorías creadas con emoji, se siguen viendo bien, no se rompe nada

**Refresco visual:**
- Tipografía de cuerpo: **IBM Plex Sans** (antes Inter) — catalogada específicamente como "financial, trustworthy" en la base de datos de diseño consultada
- Paleta ajustada: ámbar más cálido en vez del dorado apagado, mejor contraste en textos secundarios
- Instalación en iPhone corregida: ahora detecta iOS/Safari y muestra el paso a paso ("Compartir → Agregar a inicio") directamente en la app, en vez de no mostrar nada

## Notas técnicas
- `src/lib/supabaseClient.js` — cliente de Supabase
- `src/lib/db.js` — toda la lógica de acceso a datos (auth, hogar, invitaciones, CRUD)
- El QR se genera vía `api.qrserver.com` (sin dependencias extra); si prefieres generarlo 100% localmente puedo cambiarlo por una librería como `qrcode`.
- El canje de invitaciones se hace con una función de base de datos (`redeem_invite`, `security definer`) para que sea atómico y no dependa de una política RLS abierta.
