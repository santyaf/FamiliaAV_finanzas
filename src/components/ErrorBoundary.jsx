import React from 'react';

// Evita la "pantalla en blanco": si algún componente lanza un error al
// renderizar, se muestra un mensaje amable con opción de recargar en vez de
// dejar la app muerta y sin rastro.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Punto único para enganchar un servicio de reporte (Sentry, etc.) más adelante.
    console.error('ErrorBoundary capturó un error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif", color: '#2A2D2A',
        background: '#F4F1E9', textAlign: 'center',
      }}>
        <p style={{ fontSize: 44 }}>😵‍💫</p>
        <p style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700, fontSize: 18 }}>
          Algo salió mal
        </p>
        <p style={{ fontSize: 13.5, color: '#6B6F68', maxWidth: 320 }}>
          La app tuvo un problema al mostrar esta pantalla. Tus datos están a salvo en
          la nube; recarga para volver a intentarlo.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 4, padding: '10px 20px', borderRadius: 12, border: 'none',
            background: '#2F6E68', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
          Recargar
        </button>
      </div>
    );
  }
}
