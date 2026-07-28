# Finanzas del Hogar

App de finanzas familiares (ingresos/gastos categorizados, recurrentes y esporádicos, objetivos de compra con votación de prioridad, presupuestos, conciliación de gastos compartidos, cuentas individuales/compartidas, y registro rápido por texto o foto de recibo con IA).

## Subir a GitHub

```bash
git init
git add .
git commit -m "Finanzas del Hogar - primera versión"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

(Crea antes el repositorio vacío en https://github.com/new)

## Desplegar en Vercel

1. Entra a https://vercel.com/new
2. Importa el repositorio que acabas de subir
3. Vercel detecta automáticamente que es un proyecto Vite (no necesitas cambiar nada del build)
4. Antes de darle a "Deploy", ve a **Environment Variables** y agrega:
   - `ANTHROPIC_API_KEY` = tu clave de la API de Anthropic (https://console.anthropic.com/settings/keys)
   - Esto es necesario únicamente para que funcione el **Registro rápido** (texto/foto con IA) en la pestaña correspondiente. El resto de la app funciona sin esta variable.
5. Dale a **Deploy**

Cada vez que hagas `git push` a `main`, Vercel volverá a desplegar automáticamente.

## Desarrollo local (opcional)

```bash
npm install
npm run dev
```

## Notas

- Los datos se guardan en el `localStorage` del navegador de cada persona que use la app (no hay base de datos compartida entre dispositivos).
- El registro rápido con IA llama a `/api/claude.js`, una función serverless que mantiene tu clave de Anthropic segura en el servidor (nunca se expone en el navegador).
