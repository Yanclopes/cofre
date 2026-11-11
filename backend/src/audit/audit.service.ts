import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from './audit-event.entity';

export interface AuditInput {
  userId: string;
  action: string;
  targetId?: string | null;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('audit');

  constructor(@InjectRepository(AuditEvent) private readonly repo: Repository<AuditEvent>) {}

  /**
   * Grava no banco (para o usuário consultar) e escreve uma linha JSON no log da aplicação,
   * que o agente do CloudWatch envia para o bucket com Object Lock.
   */
  async record(input: AuditInput): Promise<void> {
    const event = this.repo.create({
      userId: input.userId,
      action: input.action,
      targetId: input.targetId ?? null,
      ip: input.ip ?? null,
    });
    await this.repo.save(event);
    this.logger.log(JSON.stringify({ type: 'audit', ...input, at: new Date().toISOString() }));
  }

  listForUser(userId: string): Promise<AuditEvent[]> {
    return this.repo.find({ where: { userId }, order: { at: 'DESC' }, take: 100 });
  }
}
