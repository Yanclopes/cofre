import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from '../auth/public.decorator';
import { loadAppConfig } from '../config';

@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  private readonly cfg = loadAppConfig();

  constructor(private readonly db: DataSource) {}

  /** Usado pelo health check do ALB e pelo ValidateService do CodeDeploy. */
  @Get('health')
  async health() {
    try {
      await this.db.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'db_indisponivel' });
    }
  }

  /** Configuração pública que o front precisa para falar com o Cognito (nada secreto). */
  @Get('config')
  config() {
    return {
      authMode: this.cfg.authMode,
      region: this.cfg.awsRegion,
      userPoolId: this.cfg.cognitoUserPoolId,
      clientId: this.cfg.cognitoClientId,
    };
  }
}
