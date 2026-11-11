import { FormEvent, useState } from 'react';
import { generatePassword, GeneratorOptions, ItemData } from '../crypto';
import { ErrorBox, Strength } from './ui';

interface Props {
  initial: ItemData | null;
  onSave: (item: ItemData) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

const EMPTY: ItemData = { name: '', username: '', password: '', url: '', notes: '' };

export function ItemEditor({ initial, onSave, onDelete, onClose }: Props) {
  const [item, setItem] = useState<ItemData>(initial ?? EMPTY);
  const [show, setShow] = useState(false);
  const [gen, setGen] = useState<GeneratorOptions>({ length: 20, upper: true, lower: true, digits: true, symbols: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof ItemData) => (e: { target: { value: string } }) => setItem({ ...item, [k]: e.target.value });

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    act(() => onSave(item));
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <form className="card modal" onSubmit={submit}>
        <h2>{initial ? 'Editar acesso' : 'Novo acesso'}</h2>
        <label>
          Nome
          <input value={item.name} onChange={set('name')} placeholder="Ex.: Banco, e-mail do trabalho" required maxLength={200} />
        </label>
        <label>
          Endereço (URL)
          <input value={item.url} onChange={set('url')} placeholder="https://" maxLength={2000} />
        </label>
        <label>
          Usuário / e-mail
          <input value={item.username} onChange={set('username')} autoComplete="off" maxLength={500} />
        </label>
        <div className="field">
          <label htmlFor="item-password">Senha</label>
          <div className="row">
            <input
              id="item-password"
              type={show ? 'text' : 'password'}
              value={item.password}
              onChange={set('password')}
              autoComplete="new-password"
              maxLength={1000}
            />
            <button type="button" onClick={() => setShow(!show)}>
              {show ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </div>
        <Strength password={item.password} />

        <fieldset className="generator">
          <legend>Gerar senha</legend>
          <div className="row wrap">
            <label className="inline">
              Tamanho
              <input
                type="number"
                min={8}
                max={128}
                value={gen.length}
                onChange={(e) => setGen({ ...gen, length: Math.max(8, Math.min(128, Number(e.target.value) || 8)) })}
              />
            </label>
            {(['upper', 'lower', 'digits', 'symbols'] as const).map((k) => (
              <label className="check" key={k}>
                <input type="checkbox" checked={gen[k]} onChange={(e) => setGen({ ...gen, [k]: e.target.checked })} />
                {{ upper: 'A-Z', lower: 'a-z', digits: '0-9', symbols: '!@#' }[k]}
              </label>
            ))}
            <button
              type="button"
              onClick={() => {
                try {
                  setItem({ ...item, password: generatePassword(gen) });
                  setShow(true);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Gerar
            </button>
          </div>
        </fieldset>

        <label>
          Notas
          <textarea rows={3} value={item.notes} onChange={set('notes')} maxLength={10000} />
        </label>
        <ErrorBox error={error} />
        <div className="row spread">
          {onDelete ? (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Excluir "${item.name}"?`)) act(onDelete);
              }}
            >
              Excluir
            </button>
          ) : (
            <span />
          )}
          <div className="row">
            <button type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
