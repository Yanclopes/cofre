import { ConflictException, NotFoundException } from '@nestjs/common';
import { ItemsService } from './items.service';
import { VaultItem } from './vault-item.entity';

/** Repositório em memória para testar as regras sem banco. */
function fakeRepo(initial: VaultItem[] = []) {
  const rows = [...initial];
  const match = (where: Partial<VaultItem>) => (r: VaultItem) =>
    Object.entries(where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v);
  return {
    rows,
    find: async ({ where }: { where: Partial<VaultItem> }) => rows.filter(match(where)),
    findOneBy: async (where: Partial<VaultItem>) => rows.find(match(where)) ?? null,
    countBy: async (where: Partial<VaultItem>) => rows.filter(match(where)).length,
    create: (x: Partial<VaultItem>) => ({ ...x }) as VaultItem,
    save: async (x: VaultItem) => {
      if (!x.id) {
        x.id = `id-${rows.length + 1}`;
        x.revision = 1;
        rows.push(x);
      } else {
        x.revision += 1;
      }
      return x;
    },
    delete: async (where: Partial<VaultItem>) => {
      const i = rows.findIndex(match(where));
      if (i < 0) return { affected: 0 };
      rows.splice(i, 1);
      return { affected: 1 };
    },
  };
}

const audit = { record: jest.fn(async () => undefined) };
const ENC = 'v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBB==';

describe('ItemsService', () => {
  it('um usuário não lê, altera nem apaga item de outro', async () => {
    const repo = fakeRepo();
    const svc = new ItemsService(repo as never, audit as never);
    const item = await svc.create('alice', ENC);

    expect(await svc.list('bob')).toHaveLength(0);
    await expect(svc.update('bob', item.id, ENC, 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove('bob', item.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await svc.list('alice')).toHaveLength(1);
  });

  it('recusa edição com revisão desatualizada (outro dispositivo editou antes)', async () => {
    const repo = fakeRepo();
    const svc = new ItemsService(repo as never, audit as never);
    const item = await svc.create('alice', ENC);
    await svc.update('alice', item.id, ENC, 1);
    await expect(svc.update('alice', item.id, ENC, 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('registra auditoria em cada alteração', async () => {
    audit.record.mockClear();
    const svc = new ItemsService(fakeRepo() as never, audit as never);
    const item = await svc.create('alice', ENC);
    await svc.remove('alice', item.id);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });
});
