import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/token-verifier';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** O usuário vê os próprios eventos (quando e de onde o cofre foi usado). */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const events = await this.audit.listForUser(user.sub);
    return events.map(({ action, targetId, ip, at }) => ({ action, targetId, ip, at }));
  }
}
