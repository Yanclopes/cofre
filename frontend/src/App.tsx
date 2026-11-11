import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, createAuth } from './auth';
import { AuthScreen } from './components/AuthScreen';
import { RecoverVault } from './components/RecoverVault';
import { RecoveryKit } from './components/RecoveryKit';
import { Vault } from './components/Vault';
import type { OpenResult } from './openVault';
import { AUTO_LOCK_MS, Session } from './session';

type View =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'auth' }
  | { name: 'kit'; session: Session; code: string; then: 'vault' }
  | { name: 'recover'; pending: Extract<OpenResult, { kind: 'needsRecovery' }> }
  | { name: 'vault'; session: Session };

export function App() {
  const [auth, setAuth] = useState<AuthProvider | null>(null);
  const [view, setView] = useState<View>({ name: 'loading' });
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    createAuth().then(
      (created) => {
        setAuth(created.auth);
        setView({ name: 'auth' });
      },
      (e: Error) => setView({ name: 'error', message: e.message }),
    );
  }, []);

  /** Bloquear = descartar chaves e tokens da memória. Para voltar, só com a senha mestra. */
  const lock = useCallback(
    async (global = false) => {
      window.clearTimeout(timer.current);
      await auth?.logout(global);
      setView({ name: 'auth' });
    },
    [auth],
  );

  // Bloqueio automático por inatividade enquanto o cofre está aberto.
  const vaultOpen = view.name === 'vault' || view.name === 'kit';
  useEffect(() => {
    if (!vaultOpen) return;
    const reset = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => lock(false), AUTO_LOCK_MS);
    };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer.current);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [vaultOpen, lock]);

  const onResult = (r: OpenResult) => {
    if (r.kind === 'unlocked') setView({ name: 'vault', session: r.session });
    else if (r.kind === 'newVault') setView({ name: 'kit', session: r.session, code: r.recoveryCode, then: 'vault' });
    else setView({ name: 'recover', pending: r });
  };

  const showKit = (session: Session, code: string) => setView({ name: 'kit', session, code, then: 'vault' });

  switch (view.name) {
    case 'loading':
      return <div className="center muted">Carregando…</div>;
    case 'error':
      return <div className="center error">{view.message}</div>;
    case 'auth':
      return (
        <div className="center">
          <AuthScreen auth={auth!} onResult={onResult} />
        </div>
      );
    case 'recover':
      return (
        <div className="center">
          <RecoverVault pending={view.pending} onRecovered={showKit} onCancel={() => lock(false)} />
        </div>
      );
    case 'kit':
      return (
        <div className="center">
          <RecoveryKit email={view.session.email} code={view.code} onDone={() => setView({ name: 'vault', session: view.session })} />
        </div>
      );
    case 'vault':
      return <Vault session={view.session} onLock={() => lock(false)} onLogout={() => lock(true)} onSessionChange={showKit} />;
  }
}
