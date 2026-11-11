import { FormEvent, useState } from 'react';
import { deriveMasterKeys, estimateEntropyBits, rewrapUserKey } from '../crypto';
import { MIN_MASTER_LENGTH, Session } from '../session';
import { ErrorBox, Strength, useBusy } from './ui';

interface Props {
  session: Session;
  onSessionChange: (s: Session, newRecoveryCode: string) => void;
}

export function Settings({ session, onSessionChange }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const pw = useBusy();
  const kit = useBusy();

  /** Troca a senha mestra: o Cognito confere a atual e a chave do cofre é recifrada no navegador. */
  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    if (next.length < MIN_MASTER_LENGTH || estimateEntropyBits(next) < 60) {
      return pw.setError(`Nova senha fraca: mínimo de ${MIN_MASTER_LENGTH} caracteres e boa variedade`);
    }
    if (next !== confirm) return pw.setError('As senhas não conferem');
    pw.run(async () => {
      const oldMk = await deriveMasterKeys(current, session.email);
      const newMk = await deriveMasterKeys(next, session.email);
      // Confere a senha atual localmente antes de mexer no login: se ela não abre o cofre, para aqui.
      const vault = await rewrapUserKey({ encKey: oldMk.encKey }, session.keys, newMk.encKey).catch(() => {
        throw new Error('Senha mestra atual incorreta');
      });
      await session.auth.changePassword(session.email, oldMk.authPassword, newMk.authPassword);
      await session.api.putKeys(vault.keys);
      setCurrent('');
      setNext('');
      setConfirm('');
      onSessionChange({ ...session, encKey: newMk.encKey, userKey: vault.userKey, keys: vault.keys }, vault.recoveryCode);
    });
  };

  /** Gera um código de recuperação novo e invalida o anterior (ex.: se o papel foi perdido). */
  const newKit = () =>
    kit.run(async () => {
      const vault = await rewrapUserKey({ encKey: session.encKey }, session.keys, session.encKey);
      await session.api.putKeys(vault.keys);
      onSessionChange({ ...session, userKey: vault.userKey, keys: vault.keys }, vault.recoveryCode);
    });

  return (
    <div className="stack">
      <form className="card" onSubmit={changePassword}>
        <h2>Trocar senha mestra</h2>
        <label>
          Senha mestra atual
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label>
          Nova senha mestra
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </label>
        <Strength password={next} />
        <label>
          Confirme a nova senha
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        <ErrorBox error={pw.error} />
        <button className="primary" disabled={pw.busy}>
          {pw.busy ? 'Trocando…' : 'Trocar senha'}
        </button>
      </form>

      <div className="card">
        <h2>Kit de recuperação</h2>
        <p className="muted">Gera um código novo. O código antigo deixa de funcionar na hora.</p>
        <ErrorBox error={kit.error} />
        <button onClick={newKit} disabled={kit.busy}>
          Gerar novo kit
        </button>
      </div>
    </div>
  );
}
