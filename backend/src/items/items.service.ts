import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { VaultItem } from './vault-item.entity';

export const MAX_ITEMS_PER_USER = 5000;

export type ItemView = Pick<VaultItem, 'id' | 'data' | 'revision' | 'updatedAt'>;

function view(i: VaultItem): ItemView {
  return { id: i.id, data: i.data, revision: i.revision, updatedAt: i.updatedAt };
}

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(VaultItem) private readonly repo: Repository<VaultItem>,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string): Promise<ItemView[]> {
    const items = await this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
    return items.map(view);
  }

  async create(userId: string, data: string, ip?: string): Promise<ItemView> {
    if ((await this.repo.countBy({ userId })) >= MAX_ITEMS_PER_USER) {
      throw new UnprocessableEntityException('Limite de itens atingido');
    }
    const item = await this.repo.save(this.repo.create({ userId, data }));
    await this.audit.record({ userId, action: 'item.criado', targetId: item.id, ip });
    return view(item);
  }

  async update(userId: string, id: string, data: string, revision: number, ip?: string): Promise<ItemView> {
    // Sempre filtra pelo dono: um usuário nunca alcança item de outro (resposta 404, sem revelar existência).
    const item = await this.repo.findOneBy({ id, userId });
    if (!item) throw new NotFoundException();
    if (item.revision !== revision) throw new ConflictException('O item foi alterado em outro dispositivo');
    item.data = data;
    const saved = await this.repo.save(item);
    await this.audit.record({ userId, action: 'item.alterado', targetId: id, ip });
    return view(saved);
  }

  async remove(userId: string, id: string, ip?: string): Promise<void> {
    const res = await this.repo.delete({ id, userId });
    if (!res.affected) throw new NotFoundException();
    await this.audit.record({ userId, action: 'item.excluido', targetId: id, ip });
  }
}
