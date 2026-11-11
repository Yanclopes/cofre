import { useEffect, useState } from 'react';
import type { AuditEntry } from '../api';
import type { Session } from '../session';
import { ErrorBox } from './ui';

const LABELS: Record<string, string> = {
  'cofre.criado': 'Cofre criado',
  'chaves.atualizadas': 'Senha mestra ou kit alterados',
  'item.criado': 'Acesso adicionado',
  'item.alterado': 'Acesso alterado',
  'item.excluido': 'Acesso excluído',
  'login.sucesso': 'Login',
  'login.falha': 'Tentativa de login falhou',
  'login.senha_redefinida': 'Senha de login redefinida',
};

export function AuditLog({ session }: { session: Session }) {
  const [events, setEvents] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    session.api.audit().then(setEvents, (e: Error) => setError(e.message));
  }, [session]);

  return (
    <div className="card">
      <h2>Atividade da conta</h2>
      <p className="muted small">Registro somente-inclusão: nem a aplicação consegue alterar ou apagar estes eventos.</p>
      <ErrorBox error={error} />
      {events && (
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Evento</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev, i) => (
              <tr key={i}>
                <td>{new Date(ev.at).toLocaleString('pt-BR')}</td>
                <td>{LABELS[ev.action] ?? ev.action}</td>
                <td>{ev.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
