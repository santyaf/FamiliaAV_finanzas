import React from 'react';
import { T, FONT_BODY } from '../ui/theme';
import { GhostButton } from '../ui/primitives';

const CHUNK_ERROR = /Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i;
const FLAG = 'fam_chunk_reload_v1';

export const isChunkLoadError = (error) => CHUNK_ERROR.test(String(error?.message || error || ''));

// Las secciones se cargan bajo demanda. Tras un despliegue nuevo, una pestaña abierta busca archivos con
// nombres viejos que ya no existen: se recarga sola una vez para traer la versión nueva.
export class LazyBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) {
    if (!isChunkLoadError(error)) return;
    try {
      if (sessionStorage.getItem(FLAG) !== '1') { sessionStorage.setItem(FLAG, '1'); window.location.reload(); }
    } catch { /* sin sessionStorage: se muestra el botón */ }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="py-10 px-4 text-center">
        <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY }} className="mb-3">
          {isChunkLoadError(this.state.error) ? 'Hay una versión nueva de la app. Recarga para verla.' : 'No se pudo cargar esta pantalla.'}
        </p>
        <GhostButton onClick={() => window.location.reload()}>Recargar</GhostButton>
      </div>
    );
  }
}

// React.lazy para un export con nombre: lazyNamed(() => import('./sections/Creditos'), 'Creditos')
export const lazyNamed = (loader, name) => React.lazy(() => loader().then((m) => ({ default: m[name] })));
