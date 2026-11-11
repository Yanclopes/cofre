/**
 * Login. Em produção: Amazon Cognito (SRP + MFA TOTP obrigatório).
 * Em desenvolvimento: rotas /api/dev-auth da própria API, que imitam o Cognito.
 * Nos dois casos a senha enviada é o authPassword derivado, nunca a senha mestra.
 */
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
  ICognitoStorage,
} from 'amazon-cognito-identity-js';

export interface PublicConfig {
  authMode: 'cognito' | 'local';
  region: string;
  userPoolId: string;
  clientId: string;
}

export type LoginStep =
  | { kind: 'ok' }
  | { kind: 'mfa'; submit: (code: string) => Promise<LoginStep> }
  | { kind: 'mfaSetup'; secret: string; otpauthUrl: string; submit: (code: string) => Promise<LoginStep> };

export interface AuthProvider {
  /** 'confirm' = precisa do código enviado por e-mail. */
  register(email: string, authPassword: string): Promise<'confirm' | 'done'>;
  confirm(email: string, code: string): Promise<void>;
  login(email: string, authPassword: string): Promise<LoginStep>;
  getToken(): Promise<string>;
  /** Esqueci a senha: troca a senha de LOGIN. O cofre continua cifrado. */
  startReset(email: string): Promise<void>;
  finishReset(email: string, code: string, newAuthPassword: string): Promise<void>;
  changePassword(email: string, oldAuth: string, newAuth: string): Promise<void>;
  /** global = revoga os refresh tokens em todos os dispositivos. */
  logout(global: boolean): Promise<void>;
  needsEmailCode: boolean;
}

export class AuthError extends Error {}

function friendly(err: unknown): Error {
  const e = err as { code?: string; name?: string; message?: string };
  const code = e.code ?? e.name ?? '';
  const map: Record<string, string> = {
    NotAuthorizedException: 'E-mail ou senha incorretos',
    UserNotFoundException: 'E-mail ou senha incorretos',
    UsernameExistsException: 'Este e-mail já está cadastrado',
    CodeMismatchException: 'Código incorreto',
    ExpiredCodeException: 'Código expirado, peça outro',
    EnableSoftwareTokenMFAException: 'Código do autenticador incorreto',
    LimitExceededException: 'Muitas tentativas. Aguarde alguns minutos',
    TooManyRequestsException: 'Muitas tentativas. Aguarde alguns minutos',
    UserNotConfirmedException: 'Confirme o e-mail antes de entrar',
  };
  return new AuthError(map[code] ?? e.message ?? 'Erro de autenticação');
}

/** Tokens só em memória: fechar a aba ou bloquear o cofre apaga tudo (nada em localStorage). */
class MemoryStorage implements ICognitoStorage {
  private data = new Map<string, string>();
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}

class CognitoAuth implements AuthProvider {
  needsEmailCode = true;
  private storage = new MemoryStorage();
  private pool: CognitoUserPool;
  private user: CognitoUser | null = null;

  constructor(cfg: PublicConfig) {
    this.pool = new CognitoUserPool({ UserPoolId: cfg.userPoolId, ClientId: cfg.clientId, Storage: this.storage });
  }

  private cognitoUser(email: string) {
    return new CognitoUser({ Username: email, Pool: this.pool, Storage: this.storage });
  }

  register(email: string, authPassword: string): Promise<'confirm' | 'done'> {
    return new Promise((resolve, reject) => {
      this.pool.signUp(email, authPassword, [new CognitoUserAttribute({ Name: 'email', Value: email })], [], (err, res) =>
        err ? reject(friendly(err)) : resolve(res?.userConfirmed ? 'done' : 'confirm'),
      );
    });
  }

  confirm(email: string, code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cognitoUser(email).confirmRegistration(code, true, (err) => (err ? reject(friendly(err)) : resolve()));
    });
  }

  login(email: string, authPassword: string): Promise<LoginStep> {
    const user = this.cognitoUser(email);
    const details = new AuthenticationDetails({ Username: email, Password: authPassword });

    const handlers = (resolve: (s: LoginStep) => void, reject: (e: Error) => void) => ({
      onSuccess: (_s: CognitoUserSession) => {
        this.user = user;
        resolve({ kind: 'ok' });
      },
      onFailure: (err: unknown) => reject(friendly(err)),
      // Login com MFA já configurado: pede o código de 6 dígitos do autenticador.
      totpRequired: () =>
        resolve({
          kind: 'mfa',
          submit: (code) =>
            new Promise((res, rej) => user.sendMFACode(code, handlers(res, rej), 'SOFTWARE_TOKEN_MFA')),
        }),
      // Primeiro login: o Cognito exige cadastrar o autenticador (MFA obrigatório no user pool).
      mfaSetup: () =>
        user.associateSoftwareToken({
          associateSecretCode: (secret: string) =>
            resolve({
              kind: 'mfaSetup',
              secret,
              otpauthUrl: `otpauth://totp/Cofre:${encodeURIComponent(email)}?secret=${secret}&issuer=Cofre`,
              submit: (code) =>
                new Promise((res, rej) =>
                  user.verifySoftwareToken(code, 'Cofre', {
                    onSuccess: () => {
                      this.user = user;
                      res({ kind: 'ok' });
                    },
                    onFailure: (err) => rej(friendly(err)),
                  }),
                ),
            }),
          onFailure: (err) => reject(friendly(err)),
        }),
    });

    return new Promise((resolve, reject) => user.authenticateUser(details, handlers(resolve, reject)));
  }

  getToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.user) return reject(new AuthError('Sessão encerrada'));
      // getSession renova o access token (15 min) com o refresh token guardado em memória.
      this.user.getSession((err: Error | null, session: CognitoUserSession | null) =>
        err || !session ? reject(new AuthError('Sessão encerrada')) : resolve(session.getAccessToken().getJwtToken()),
      );
    });
  }

  startReset(email: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cognitoUser(email).forgotPassword({
        onSuccess: () => resolve(),
        onFailure: (err) => reject(friendly(err)),
        inputVerificationCode: () => resolve(),
      });
    });
  }

  finishReset(email: string, code: string, newAuthPassword: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cognitoUser(email).confirmPassword(code, newAuthPassword, {
        onSuccess: () => resolve(),
        onFailure: (err) => reject(friendly(err)),
      });
    });
  }

  changePassword(_email: string, oldAuth: string, newAuth: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.user) return reject(new AuthError('Sessão encerrada'));
      this.user.changePassword(oldAuth, newAuth, (err) => (err ? reject(friendly(err)) : resolve()));
    });
  }

  async logout(global: boolean): Promise<void> {
    const user = this.user;
    this.user = null;
    if (user && global) {
      await new Promise<void>((resolve) => user.globalSignOut({ onSuccess: () => resolve(), onFailure: () => resolve() }));
    }
    user?.signOut();
    this.storage.clear();
  }
}

class LocalAuth implements AuthProvider {
  needsEmailCode = false;
  private token: string | null = null;

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`/api/dev-auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new AuthError((json as { message?: string }).message ?? 'Erro de autenticação');
    return json as T;
  }

  async register(email: string, authPassword: string): Promise<'done'> {
    await this.post('register', { email, authHash: authPassword });
    return 'done';
  }
  async confirm(): Promise<void> {}

  async login(email: string, authPassword: string): Promise<LoginStep> {
    const { accessToken } = await this.post<{ accessToken: string }>('login', { email, authHash: authPassword });
    this.token = accessToken;
    return { kind: 'ok' };
  }

  async getToken(): Promise<string> {
    if (!this.token) throw new AuthError('Sessão encerrada');
    return this.token;
  }

  async startReset(): Promise<void> {}
  async finishReset(email: string, _code: string, newAuthPassword: string): Promise<void> {
    await this.post('reset', { email, authHash: newAuthPassword });
  }

  async changePassword(email: string, oldAuth: string, newAuth: string): Promise<void> {
    await this.login(email, oldAuth); // confere a senha atual
    await this.post('reset', { email, authHash: newAuth });
  }

  async logout(): Promise<void> {
    this.token = null;
  }
}

export async function createAuth(): Promise<{ auth: AuthProvider; config: PublicConfig }> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Não foi possível carregar a configuração');
  const config = (await res.json()) as PublicConfig;
  return { auth: config.authMode === 'local' ? new LocalAuth() : new CognitoAuth(config), config };
}
