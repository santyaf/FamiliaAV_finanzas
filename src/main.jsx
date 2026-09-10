import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Busca actualización del SW al abrir la app.
      reg.update?.().catch(() => {});
    }).catch(() => {});

    // Cuando un SW nuevo toma el control (nuevo despliegue), recarga una vez
    // para que la página use el HTML y los assets nuevos — evita la "pantalla
    // en blanco" por index.html viejo apuntando a chunks que ya no existen.
    // Solo si ya había un SW controlando (o sea, es una actualización, no la
    // primera instalación).
    if (navigator.serviceWorker.controller) {
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    }
  });
}
