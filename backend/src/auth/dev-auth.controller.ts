import { Body, Controller, HttpCode, Post, UnauthorizedException, ConflictException, Ip } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Length } from 'class-validator';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import * as jwt from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { loadAppConfig } from '../config';
import { Public } from './public.decorator';
import { DevUser } from './dev-user.entity';
import { LOCAL_AUDIENCE, LOCAL_ISSUER } from './token-verifier';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

class CredentialsDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(20, 200)
  authHash: string;
}

class ResetDto extends CredentialsDto {}

async function hash(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const out = await scrypt(secret, salt, 32);
  return `${salt.toString('base64')}:${out.toString('base64')}`;
}

async function verify(secret: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(':');
  const expected = Buffer.from(hashB64, 'base64');
  const out = await scrypt(secret, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(out, expected);
}

/**
 * Login simulado, SÓ para rodar o projeto na máquina sem uma conta AWS.
 * Imita o papel do Cognito: recebe o "auth hash" (derivado da senha mestra no navegador)
 * e devolve um access token. O módulo nem é carregado quando AUTH_MODE=cognito.
 */
@Public()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('dev-auth')
export class DevAuthController {
  private readonly secret = loadAppConfig().localJwtSecret;

  constructor(
    @InjectRepository(DevUser) private readonly users: Repository<DevUser>,
    private readonly audit: AuditService,
  ) {}

  @Post('register')
  async register(@Body() dto: CredentialsDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.findOneBy({ email })) throw new ConflictException('E-mail já cadastrado');
    const user = await this.users.save(this.users.create({ email, authHash: await hash(dto.authHash) }));
    return { accessToken: this.issue(user.id) };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: CredentialsDto, @Ip() ip: string) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findOneBy({ email });
    // Mesma mensagem para e-mail inexistente e senha errada (não revela quem tem conta).
    if (!user || !(await verify(dto.authHash, user.authHash))) {
      await this.audit.record({ userId: user?.id ?? 'desconhecido', action: 'login.falha', ip });
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }
    await this.audit.record({ userId: user.id, action: 'login.sucesso', ip });
    return { accessToken: this.issue(user.id) };
  }

  /** Equivale ao "esqueci a senha" do Cognito: troca só a senha de login; o cofre continua cifrado. */
  @Post('reset')
  @HttpCode(200)
  async reset(@Body() dto: ResetDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findOneBy({ email });
    if (user) {
      user.authHash = await hash(dto.authHash);
      await this.users.save(user);
      await this.audit.record({ userId: user.id, action: 'login.senha_redefinida' });
    }
    return { ok: true };
  }

  private issue(sub: string): string {
    return jwt.sign({}, this.secret, {
      algorithm: 'HS256',
      subject: sub,
      issuer: LOCAL_ISSUER,
      audience: LOCAL_AUDIENCE,
      expiresIn: '15m',
    });
  }
}
