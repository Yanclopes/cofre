import type { Api } from './api';
import type { AuthProvider } from './auth';
import type { WrappedKeys } from './crypto';

/** Estado de um cofre aberto. Vive só em memória; bloquear o cofre descarta tudo. */
export interface Session {
  email: string;
  encKey: CryptoKey;
  userKey: CryptoKey;
  keys: WrappedKeys;
  api: Api;
  auth: AuthProvider;
}

/** Bloqueio automático após inatividade. */
export const AUTO_LOCK_MS = 5 * 60 * 1000;
/** A área de transferência é limpa depois de copiar uma senha. */
export const CLIPBOARD_CLEAR_MS = 30 * 1000;
export const MIN_MASTER_LENGTH = 12;
