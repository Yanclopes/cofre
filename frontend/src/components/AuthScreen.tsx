import { FormEvent, useState } from 'react';
import type { AuthProvider, LoginStep } from '../auth';
import { deriveMasterKeys, estimateEntropyBits, normalizeEmail } from '../crypto';
import { openVault, OpenResult } from '../openVault';
import { MIN_MASTER_LENGTH } from '../session';
import { ErrorBox, QrCode, Strength, useBusy } from './ui';

type Mode = 'login' | 'register' | 'reset';

interface Props {
  auth: AuthProvider;
  onResult: (r: OpenResult) => void;
}

function validateNewMaster(pw: string, confirm: string): string | null {
  if (pw.length < MIN_MASTER_LENGTH) return `A senha mestra precisa de pelo menos ${MIN_MASTER_LENGTH} caracteres`;
  if (estimateEntropyBits(pw) < 60) return 'Senha mestra fraca: use uma frase longa ou misture tipos de caractere';
  if (pw !== confirm) return 'As senhas não conferem';
  return null;
}

export function AuthScreen({ auth, onResult }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'form' | 'emailCode' | 'resetCode' | 'resetDone'>('form');
  const [mfa, setMfa] = useState<Exclude<LoginStep, { kind: 'ok' }> | null>(null);
  const [encKey, setEncKey] = useState<CryptoKey | null>(null);
  const [status, setStatus] = useState('');
  const { busy, error, setError, run } = useBusy();

  const reset = (m: Mode) => {
    setMode(m);
    setStage('form');
    setPassword('');
    setConfirm('');
    setCode('');
    setMfa(null);
    setError(null);
  };

  const derive = async (pw: string) => {
    setStatus('Derivando a chave no seu navegador (Argon2id)…');
    try {
      return await deriveMasterKeys(pw, email);
    } finally {
      setStatus('');
    }
  };

  const afterLogin = async (step: LoginStep, key: CryptoKey) => {
    if (step.kind !== 'ok') {
      setMfa(step);
      setCode('');
      return;
    }
    setStatus('Abrindo o cofre…');
    onResult(await openVault(auth, normalizeEmail(email), key));
  };

  const submitLogin = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const mk = await derive(password);
      setEncKey(mk.encKey);
      await afterLogin(await auth.login(normalizeEmail(email), mk.authPassword), mk.encKey);
    });
  };

  const submitRegister = (e: FormEvent) => {
    e.preventDefault();
    const invalid = validateNewMaster(password, confirm);
    if (invalid) return setError(invalid);
    run(async () => {
      const mk = await derive(password);
      setEncKey(mk.encKey);
      const res = await auth.register(normalizeEmail(email), mk.authPassword);
      if (res === 'confirm') {
        setStage('emailCode');
        return;
      }
      await afterLogin(await auth.login(normalizeEmail(email), mk.authPassword), mk.encKey);
    });
  };

  const submitEmailCode = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await auth.confirm(normalizeEmail(email), code.trim());
      const mk = await derive(password);
      await afterLogin(await auth.login(normalizeEmail(email), mk.authPassword), mk.encKey);
    });
  };

  const submitMfa = (e: FormEvent) => {
    e.preventDefault();
    if (!mfa || !encKey) return;
    run(async () => afterLogin(await mfa.submit(code.trim()), encKey));
  };

  const startReset = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await auth.startReset(normalizeEmail(email));
      setStage('resetCode');
    });
  };

  const finishReset = (e: FormEvent) => {
    e.preventDefault();
    const invalid = validateNewMaster(password, confirm);
    if (invalid) return setError(invalid);
    run(async () => {
      const mk = await derive(password);
      await auth.finishReset(normalizeEmail(email), code.trim(), mk.authPassword);
      setStage('resetDone');
      setPassword('');
      setConfirm('');
    });
  };

  // ------------------------------------------------------------ MFA
  if (mfa) {
    return (
      <form className="card narrow" onSubmit={submitMfa}>
        <h1>Verificação em duas etapas</h1>
        {mfa.kind === 'mfaSetup' ? (
          <>
            <p>O MFA é obrigatório. Escaneie o QR code com um aplicativo autenticador (Google Authenticator, Authy, 1Password…).</p>
            <QrCode text={mfa.otpauthUrl} />
            <p className="muted small">
              Ou digite a chave: <code>{mfa.secret}</code>
            </p>
          </>
        ) : (
          <p>Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
        )}
        <label>
          Código
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        <ErrorBox error={error} />
        <button className="primary" disabled={busy}>
          {busy ? 'Verificando…' : 'Confirmar'}
        </button>
      </form>
    );
  }

  return (
    <div className="card narrow">
      <div className="brand">
        <span className="logo">●</span> Cofre
      </div>
      <nav className="tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => reset('login')} type="button">
          Entrar
        </button>
        <button className={mode === 'register' ? 'active' : ''} onClick={() => reset('register')} type="button">
          Criar conta
        </button>
        <button className={mode === 'reset' ? 'active' : ''} onClick={() => reset('reset')} type="button">
          Esqueci a senha
        </button>
      </nav>

      {mode === 'login' && (
        <form onSubmit={submitLogin}>
          <label>
            E-mail
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Senha mestra
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <ErrorBox error={error} />
          {status && <p className="muted small">{status}</p>}
          <button className="primary" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar e abrir o cofre'}
          </button>
          <p className="muted small">A senha mestra nunca sai deste navegador.</p>
        </form>
      )}

      {mode === 'register' && stage === 'form' && (
        <form onSubmit={submitRegister}>
          <label>
            E-mail
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Senha mestra
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <Strength password={password} />
          <label>
            Confirme a senha mestra
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
          <p className="warn small">
            Ninguém consegue recuperar a senha mestra, nem a equipe do sistema. Você vai receber um kit de recuperação a seguir.
          </p>
          <ErrorBox error={error} />
          {status && <p className="muted small">{status}</p>}
          <button className="primary" disabled={busy}>
            {busy ? 'Criando…' : 'Criar conta'}
          </button>
        </form>
      )}

      {mode === 'register' && stage === 'emailCode' && (
        <form onSubmit={submitEmailCode}>
          <p>Enviamos um código para {email}.</p>
          <label>
            Código do e-mail
            <input value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <ErrorBox error={error} />
          <button className="primary" disabled={busy}>
            Confirmar
          </button>
        </form>
      )}

      {mode === 'reset' && stage === 'form' && (
        <form onSubmit={startReset}>
          <p className="muted">
            Isto redefine apenas a senha de <b>login</b>. Para abrir o cofre depois, você vai precisar do <b>kit de recuperação</b>.
          </p>
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <ErrorBox error={error} />
          <button className="primary" disabled={busy}>
            Continuar
          </button>
        </form>
      )}

      {mode === 'reset' && stage === 'resetCode' && (
        <form onSubmit={finishReset}>
          {auth.needsEmailCode && (
            <label>
              Código enviado por e-mail
              <input value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
          )}
          <label>
            Nova senha mestra
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <Strength password={password} />
          <label>
            Confirme a nova senha mestra
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
          <ErrorBox error={error} />
          {status && <p className="muted small">{status}</p>}
          <button className="primary" disabled={busy}>
            Redefinir
          </button>
        </form>
      )}

      {mode === 'reset' && stage === 'resetDone' && (
        <div>
          <p>Senha de login redefinida. Entre com a nova senha mestra; em seguida o sistema vai pedir o código do kit de recuperação.</p>
          <button className="primary" onClick={() => reset('login')}>
            Ir para o login
          </button>
        </div>
      )}
    </div>
  );
}
