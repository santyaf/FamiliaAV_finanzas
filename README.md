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
- **Fase 2**: edición de movimientos con confirmación + histórico de cambios
- **Fase 3**: módulo de créditos (COP/UVR, amortización, seguros) conectado al valor UVR

## Notas técnicas
- `src/lib/supabaseClient.js` — cliente de Supabase
- `src/lib/db.js` — toda la lógica de acceso a datos (auth, hogar, invitaciones, CRUD)
- El QR se genera vía `api.qrserver.com` (sin dependencias extra); si prefieres generarlo 100% localmente puedo cambiarlo por una librería como `qrcode`.
- El canje de invitaciones se hace con una función de base de datos (`redeem_invite`, `security definer`) para que sea atómico y no dependa de una política RLS abierta.
