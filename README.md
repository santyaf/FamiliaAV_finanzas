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

## Notas técnicas
- `src/lib/supabaseClient.js` — cliente de Supabase
- `src/lib/db.js` — toda la lógica de acceso a datos (auth, hogar, invitaciones, CRUD)
- El QR se genera vía `api.qrserver.com` (sin dependencias extra); si prefieres generarlo 100% localmente puedo cambiarlo por una librería como `qrcode`.
- El canje de invitaciones se hace con una función de base de datos (`redeem_invite`, `security definer`) para que sea atómico y no dependa de una política RLS abierta.
