import { useState } from 'react';
import { copySecret } from './ui';

interface Props {
  email: string;
  code: string;
  onDone: () => void;
}

/**
 * Mostra o código de recuperação UMA vez. O servidor guarda só a chave do cofre cifrada com ele;
 * se o usuário perder o código e a senha mestra, ninguém consegue abrir o cofre.
 */
export function RecoveryKit({ email, code, onDone }: Props) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const download = () => {
    const text = [
      'COFRE - KIT DE RECUPERAÇÃO',
      '',
      `Conta: ${email}`,
      `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
      '',
      'Código de recuperação:',
      code,
      '',
      'Guarde em local seguro e offline (impresso, por exemplo).',
      'Com este código você define uma nova senha mestra se esquecer a atual.',
      'Ninguém do suporte consegue recuperar o seu cofre sem ele.',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cofre-kit-de-recuperacao.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card narrow">
      <h1>Seu kit de recuperação</h1>
      <p>
        Este código é a <b>única</b> forma de recuperar o cofre se você esquecer a senha mestra. Ele não fica salvo
        em lugar nenhum além de onde você guardar.
      </p>
      <pre className="code">{code}</pre>
      <div className="row">
        <button
          type="button"
          onClick={async () => {
            await copySecret(code);
            setCopied(true);
          }}
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        <button type="button" onClick={download}>
          Baixar .txt
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Guardei o código em um lugar seguro
      </label>
      <button className="primary" disabled={!saved} onClick={onDone}>
        Abrir o cofre
      </button>
    </div>
  );
}
