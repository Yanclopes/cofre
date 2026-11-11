import { FormEvent, useState } from 'react';
import { DecryptionError, rewrapUserKey } from '../crypto';
import type { OpenResult } from '../openVault';
import type { Session } from '../session';
import { ErrorBox, useBusy } from './ui';

type Pending = Extract<OpenResult, { kind: 'needsRecovery' }>;

interface Props {
  pending: Pending;
  onRecovered: (session: Session, newRecoveryCode: string) => void;
  onCancel: () => void;
}

/**
 * A senha de login foi redefinida, então a nova senha mestra ainda não abre o cofre.
 * O kit de recuperação abre a chave do cofre no navegador e ela é recifrada com a nova senha.
 */
export function RecoverVault({ pending, onRecovered, onCancel }: Props) {
  const [code, setCode] = useState('');
  const { busy, error, run } = useBusy();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      try {
        const vault = await rewrapUserKey({ recoveryCode: code }, pending.keys, pending.encKey);
        await pending.api.putKeys(vault.keys);
        onRecovered(
          { email: pending.email, encKey: pending.encKey, userKey: vault.userKey, keys: vault.keys, api: pending.api, auth: pending.auth },
          vault.recoveryCode,
        );
      } catch (err) {
        if (err instanceof DecryptionError) throw new Error('Código de recuperação incorreto');
        throw err;
      }
    });
  };

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>Recuperar o cofre</h1>
      <p>
        Esta senha mestra não abre o cofre (a senha foi redefinida). Digite o código do seu <b>kit de recuperação</b>.
      </p>
      <label>
        Código de recuperação
        <textarea rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-…" required />
      </label>
      <ErrorBox error={error} />
      <div className="row">
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button className="primary" disabled={busy}>
          {busy ? 'Recuperando…' : 'Recuperar'}
        </button>
      </div>
      <p className="muted small">Sem a senha mestra antiga e sem este código, ninguém consegue abrir o cofre, nem o suporte.</p>
    </form>
  );
}
