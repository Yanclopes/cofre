import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { estimateEntropyBits } from '../crypto';
import { CLIPBOARD_CLEAR_MS } from '../session';

export function ErrorBox({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}

export function Strength({ password }: { password: string }) {
  if (!password) return null;
  const bits = estimateEntropyBits(password);
  const [label, cls] =
    bits >= 80 ? ['forte', 'ok'] : bits >= 60 ? ['razoável', 'mid'] : ['fraca', 'bad'];
  return (
    <div className={`strength ${cls}`}>
      <div className="bar" style={{ width: `${Math.min(100, (bits / 100) * 100)}%` }} />
      <span>
        Força: {label} (~{bits} bits)
      </span>
    </div>
  );
}

export function QrCode({ text }: { text: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: 200 }).then(setSrc);
  }, [text]);
  return src ? <img className="qr" src={src} alt="QR code para o aplicativo autenticador" /> : null;
}

/** Copia e limpa a área de transferência depois de 30 s. */
export async function copySecret(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  window.setTimeout(() => {
    navigator.clipboard.writeText('').catch(() => undefined);
  }, CLIPBOARD_CLEAR_MS);
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
