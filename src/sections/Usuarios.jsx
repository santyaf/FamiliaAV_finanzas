import React, { useState, useEffect } from 'react';
import { Download, UserX, UserCheck, ShieldAlert, Users } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, GhostButton, PrimaryButton } from '../ui/primitives';
import { AuthShell } from './auth';
import { formatDate } from '../lib/format';
import { todayISO } from '../lib/finance';
import { buildUserExport, transactionsToCsv, exportFileName } from '../lib/dataExport';

function downloadFile(name, text, mime) {
  const blob = new Blob(['﻿' + text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Ajustes → "Mi cuenta": descargar mis datos y desactivar mi cuenta (no borra nada).
export function MiCuentaCard({ data, actions }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function exportJson() {
    const out = buildUserExport({ data, userId: actions.userId, exportedAt: new Date().toISOString() });
    downloadFile(exportFileName('mis-datos-finanzas', todayISO(), 'json'), JSON.stringify(out, null, 2), 'application/json');
  }
  function exportCsv() {
    downloadFile(exportFileName('mis-movimientos', todayISO(), 'csv'), transactionsToCsv(data), 'text/csv');
  }
  async function deactivate() {
    setBusy(true); setError('');
    try {
      await actions.deactivateMyAccount();
      window.location.reload();
    } catch (e) {
      setError(e.message || 'No se pudo desactivar la cuenta.');
      setBusy(false);
    }
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }} className="mb-1">Mi cuenta</p>
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Descarga una copia de lo que ves en la app (tus cuentas, movimientos, créditos y objetivos).</p>
      <div className="flex gap-2 mb-3">
        <GhostButton onClick={exportJson} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', fontSize: 13 }}><Download size={14} /> Todo (JSON)</GhostButton>
        <GhostButton onClick={exportCsv} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', fontSize: 13 }}><Download size={14} /> Movimientos (CSV)</GhostButton>
      </div>

      {!confirming ? (
        <button onClick={() => setConfirming(true)} className="flex items-center gap-1.5 py-1.5">
          <UserX size={14} color={T.danger} /><span style={{ fontSize: 12.5, color: T.danger, fontFamily: FONT_BODY, fontWeight: 500 }}>Desactivar mi cuenta</span>
        </button>
      ) : (
        <div className="rounded-xl p-3" style={{ background: T.coralSoft }}>
          <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }} className="mb-2">
            Al desactivar tu cuenta dejas de ver los datos de tus hogares y se cierra tu sesión. <strong>No se borra nada</strong>: tus movimientos y los de tu hogar se conservan, y puedes reactivarla cuando quieras entrando con tu correo. Si eres quien lleva las finanzas de un hogar, avísale a los demás integrantes antes.
          </p>
          <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-1">Escribe <strong>DESACTIVAR</strong> para confirmar:</p>
          <input style={inputStyle} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DESACTIVAR" aria-label="Confirmación" />
          {error && <p style={{ color: T.danger, fontSize: 12 }} className="mt-2">{error}</p>}
          <div className="flex gap-2 mt-3">
            <GhostButton onClick={() => { setConfirming(false); setTyped(''); setError(''); }} style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}>Cancelar</GhostButton>
            <button onClick={deactivate} disabled={typed.trim().toUpperCase() !== 'DESACTIVAR' || busy}
              className="rounded-xl" style={{ flex: 1, padding: '8px 12px', fontSize: 13, background: T.danger, color: '#fff', opacity: typed.trim().toUpperCase() === 'DESACTIVAR' && !busy ? 1 : 0.4, fontFamily: FONT_BODY, fontWeight: 600 }}>
              {busy ? 'Desactivando…' : 'Desactivar'}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// Pantalla que ve una cuenta desactivada o suspendida en lugar de la app.
export function AccountStatusScreen({ status, onReactivate, onSignOut }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function reactivate() {
    setBusy(true); setError('');
    try { await onReactivate(); } catch (e) { setError(e.message || 'No se pudo reactivar la cuenta.'); setBusy(false); }
  }
  return (
    <AuthShell>
      <Card>
        {status === 'suspended' ? (
          <>
            <div className="flex items-center gap-2 mb-2"><ShieldAlert size={18} color={T.danger} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Cuenta suspendida</p></div>
            <p style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">Un administrador de la plataforma suspendió esta cuenta. Tus datos están a salvo y no se han borrado. Contacta al administrador para que la reactive.</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2"><UserX size={18} color={T.gold} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Tu cuenta está desactivada</p></div>
            <p style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">Desactivaste tu cuenta. No se borró nada: al reactivarla vuelves a ver tus hogares y tus datos tal como estaban.</p>
            <PrimaryButton full onClick={reactivate}>{busy ? 'Reactivando…' : 'Reactivar mi cuenta'}</PrimaryButton>
          </>
        )}
        {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mt-3">{error}</p>}
        <GhostButton full onClick={onSignOut} style={{ marginTop: 10 }}>Cerrar sesión</GhostButton>
      </Card>
    </AuthShell>
  );
}

const STATUS_LABEL = { active: 'Activa', deactivated: 'Desactivada', suspended: 'Suspendida' };
const STATUS_COLOR = { active: T.teal, deactivated: T.gold, suspended: T.danger };

// Admin → Usuarios: estado, último acceso y suspender / reactivar.
export function UsuariosAdmin({ actions }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try { setUsers(await actions.adminListUsers()); } catch (e) { setError(e.message || 'No se pudo cargar la lista de usuarios.'); }
  }
  useEffect(() => { load(); }, []);

  async function setStatus(u, status) {
    let reason = null;
    if (status === 'suspended') {
      reason = window.prompt(`Suspender a ${u.name}. Motivo (opcional):`, '');
      if (reason === null) return;
    } else if (!window.confirm(`¿Reactivar la cuenta de ${u.name}?`)) return;
    setBusyId(u.userId); setError('');
    try { await actions.adminSetUserStatus(u.userId, status, reason || null); await load(); }
    catch (e) { setError(e.message || 'No se pudo cambiar el estado.'); }
    finally { setBusyId(null); }
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <div className="flex items-center gap-2 mb-1">
        <Users size={15} color={T.ink} />
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Usuarios {users ? `(${users.length})` : ''}</p>
      </div>
      <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Suspender bloquea el acceso a los datos sin borrar nada. Cada persona también puede desactivar su propia cuenta desde Ajustes.</p>
      {error && <p style={{ color: T.danger, fontSize: 12 }} className="mb-2">{error}</p>}
      {!users && !error && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Cargando…</p>}
      {users?.map((u) => (
        <div key={u.userId} className="mb-3 pb-3" style={{ borderBottom: `1px solid ${T.border}` }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{u.name}{u.isAdmin ? ' · superusuario' : ''}</p>
              <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_MONO, wordBreak: 'break-all' }}>{u.email}</p>
            </div>
            <span className="rounded-full px-2 py-0.5 flex-shrink-0" style={{ fontSize: 10.5, fontFamily: FONT_BODY, fontWeight: 600, color: STATUS_COLOR[u.status] || T.ink, background: T.bg }}>{STATUS_LABEL[u.status] || u.status}</span>
          </div>
          <p style={{ fontSize: 10.5, color: T.inkSoft }} className="mt-0.5">
            {u.households || 'Sin hogar'} · último acceso {u.lastSeenAt ? formatDate(u.lastSeenAt.slice(0, 10)) : 'nunca registrado'} · alta {formatDate(u.createdAt.slice(0, 10))}
          </p>
          {u.userId !== actions.userId && (
            <div className="mt-1.5">
              {u.status === 'active' ? (
                <button disabled={busyId === u.userId} onClick={() => setStatus(u, 'suspended')} className="flex items-center gap-1 py-1"><UserX size={13} color={T.danger} /><span style={{ fontSize: 12, color: T.danger, fontFamily: FONT_BODY, fontWeight: 500 }}>Suspender</span></button>
              ) : (
                <button disabled={busyId === u.userId} onClick={() => setStatus(u, 'active')} className="flex items-center gap-1 py-1"><UserCheck size={13} color={T.teal} /><span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>Reactivar</span></button>
              )}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
