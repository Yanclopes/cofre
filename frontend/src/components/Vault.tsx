import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api';
import { decryptItem, encryptItem, ItemData } from '../crypto';
import type { Session } from '../session';
import { AuditLog } from './AuditLog';
import { ItemEditor } from './ItemEditor';
import { Settings } from './Settings';
import { copySecret, ErrorBox } from './ui';

interface OpenItem extends ItemData {
  id: string;
  revision: number;
}

interface Props {
  session: Session;
  onLock: () => void;
  onLogout: () => void;
  onSessionChange: (s: Session, newRecoveryCode: string) => void;
}

type Tab = 'items' | 'settings' | 'audit';

export function Vault({ session, onLock, onLogout, onSessionChange }: Props) {
  const [tab, setTab] = useState<Tab>('items');
  const [items, setItems] = useState<OpenItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<OpenItem | 'new' | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState<string | null>(null);

  /** Baixa os itens cifrados e decifra cada um aqui no navegador. */
  const load = useCallback(async () => {
    try {
      const stored = await session.api.listItems();
      const open = await Promise.all(
        stored.map(async (s) => ({ id: s.id, revision: s.revision, ...(await decryptItem(session.userKey, s.data)) })),
      );
      setItems(open.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!items) return [];
    if (!q) return items;
    return items.filter((i) => [i.name, i.username, i.url].some((f) => f.toLowerCase().includes(q)));
  }, [items, query]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2500);
  };

  const save = async (data: ItemData) => {
    const enc = await encryptItem(session.userKey, data);
    try {
      if (editing === 'new') await session.api.createItem(enc);
      else if (editing) await session.api.updateItem(editing.id, enc, editing.revision);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await load();
        throw new Error('Este acesso foi alterado em outro dispositivo. Recarreguei a lista; abra de novo para editar.');
      }
      throw e;
    }
    await load();
    flash('Salvo e cifrado');
  };

  const remove = async () => {
    if (editing && editing !== 'new') {
      await session.api.deleteItem(editing.id);
      await load();
      flash('Excluído');
    }
  };

  const copy = async (value: string, what: string) => {
    try {
      await copySecret(value);
      flash(`${what} (a área de transferência é limpa em 30 s)`);
    } catch {
      flash('Não foi possível copiar');
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">●</span> Cofre
        </div>
        <nav className="tabs">
          <button className={tab === 'items' ? 'active' : ''} onClick={() => setTab('items')}>
            Acessos
          </button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            Segurança
          </button>
          <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
            Atividade
          </button>
        </nav>
        <div className="row">
          <span className="muted small">{session.email}</span>
          <button onClick={onLock} title="Apaga as chaves da memória">
            Bloquear
          </button>
          <button onClick={onLogout} title="Encerra a sessão em todos os dispositivos">
            Sair
          </button>
        </div>
      </header>

      <main className="content">
        {tab === 'items' && (
          <>
            <div className="row spread">
              <input className="search" placeholder="Buscar por nome, usuário ou site" value={query} onChange={(e) => setQuery(e.target.value)} />
              <button className="primary" onClick={() => setEditing('new')}>
                + Novo acesso
              </button>
            </div>
            <ErrorBox error={error} />
            {items === null ? (
              <p className="muted">Decifrando…</p>
            ) : filtered.length === 0 ? (
              <div className="empty">
                <p>{items.length === 0 ? 'Nenhum acesso guardado ainda.' : 'Nada encontrado.'}</p>
                {items.length === 0 && <p className="muted small">Tudo que você salvar é cifrado neste navegador antes de ir para o servidor.</p>}
              </div>
            ) : (
              <ul className="items">
                {filtered.map((i) => (
                  <li key={i.id}>
                    <div className="avatar">{i.name.slice(0, 1).toUpperCase()}</div>
                    <div className="info">
                      <b>{i.name}</b>
                      <span className="muted small">{i.username || i.url || '—'}</span>
                      {revealed === i.id && <code className="reveal">{i.password}</code>}
                    </div>
                    <div className="row">
                      {i.username && <button onClick={() => copy(i.username, 'Usuário copiado')}>Copiar usuário</button>}
                      {i.password && <button onClick={() => copy(i.password, 'Senha copiada')}>Copiar senha</button>}
                      {i.password && (
                        <button onClick={() => setRevealed(revealed === i.id ? null : i.id)}>{revealed === i.id ? 'Ocultar' : 'Ver'}</button>
                      )}
                      <button onClick={() => setEditing(i)}>Editar</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {tab === 'settings' && <Settings session={session} onSessionChange={onSessionChange} />}
        {tab === 'audit' && <AuditLog session={session} />}
      </main>

      {editing && (
        <ItemEditor
          initial={editing === 'new' ? null : editing}
          onSave={save}
          onDelete={editing === 'new' ? undefined : remove}
          onClose={() => setEditing(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
