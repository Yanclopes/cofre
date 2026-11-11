import { Api } from './api';
import type { AuthProvider } from './auth';
import { createVaultKeys, DecryptionError, unlockUserKey, WrappedKeys } from './crypto';
import type { Session } from './session';

export type OpenResult =
  | { kind: 'unlocked'; session: Session }
  | { kind: 'newVault'; session: Session; recoveryCode: string }
  /** Login aceito, mas a senha mestra não abre o cofre (a senha de login foi redefinida). Precisa do kit. */
  | { kind: 'needsRecovery'; email: string; encKey: CryptoKey; keys: WrappedKeys; api: Api; auth: AuthProvider };

/** Depois do login: busca as chaves cifradas e tenta abrir o cofre no navegador. */
export async function openVault(auth: AuthProvider, email: string, encKey: CryptoKey): Promise<OpenResult> {
  const api = new Api(auth);
  const keys = await api.getKeys();

  if (!keys) {
    const vault = await createVaultKeys(encKey);
    await api.putKeys(vault.keys);
    return {
      kind: 'newVault',
      recoveryCode: vault.recoveryCode,
      session: { email, encKey, userKey: vault.userKey, keys: vault.keys, api, auth },
    };
  }

  try {
    const userKey = await unlockUserKey(encKey, keys);
    return { kind: 'unlocked', session: { email, encKey, userKey, keys, api, auth } };
  } catch (e) {
    if (e instanceof DecryptionError) return { kind: 'needsRecovery', email, encKey, keys, api, auth };
    throw e;
  }
}
