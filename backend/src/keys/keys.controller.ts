import { Body, Controller, Get, Ip, NotFoundException, Put } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/token-verifier';
import { PutKeysDto } from './keys.dto';
import { UserKeys } from './user-keys.entity';

@Controller('keys')
export class KeysController {
  constructor(
    @InjectRepository(UserKeys) private readonly repo: Repository<UserKeys>,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const keys = await this.repo.findOneBy({ userId: user.sub });
    if (!keys) throw new NotFoundException('Cofre ainda não criado');
    const { kdf, protectedUserKey, recoveryProtectedUserKey, updatedAt } = keys;
    return { kdf, protectedUserKey, recoveryProtectedUserKey, updatedAt };
  }

  /** Criação do cofre, troca de senha mestra ou recuperação: o navegador envia as chaves já recifradas. */
  @Put()
  async put(@CurrentUser() user: AuthUser, @Body() dto: PutKeysDto, @Ip() ip: string) {
    const existing = await this.repo.findOneBy({ userId: user.sub });
    await this.repo.save(this.repo.create({ userId: user.sub, ...dto }));
    await this.audit.record({ userId: user.sub, action: existing ? 'chaves.atualizadas' : 'cofre.criado', ip });
    return { ok: true };
  }
}
