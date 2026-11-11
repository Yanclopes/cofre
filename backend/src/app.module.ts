import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import { AuditModule } from './audit/audit.module';
import { AuthGuard } from './auth/auth.guard';
import { DevAuthController } from './auth/dev-auth.controller';
import { DevUser } from './auth/dev-user.entity';
import { CognitoTokenVerifier, LocalTokenVerifier, TokenVerifier } from './auth/token-verifier';
import { loadAppConfig, loadDatabaseOptions } from './config';
import { HealthController } from './health/health.controller';
import { ItemsModule } from './items/items.module';
import { KeysModule } from './keys/keys.module';

@Module({})
export class AppModule {
  static forRoot(): DynamicModule {
    const cfg = loadAppConfig();
    const local = cfg.authMode === 'local';

    // O front (build do React) é servido pela própria API: um único artefato publicado nas EC2.
    const staticModules = existsSync(cfg.frontendDir)
      ? [ServeStaticModule.forRoot({ rootPath: cfg.frontendDir, exclude: ['/api/{*path}'] })]
      : [];

    return {
      module: AppModule,
      imports: [
        TypeOrmModule.forRootAsync({ useFactory: loadDatabaseOptions }),
        // Limite global por IP (o WAF limita antes; isto é a segunda camada).
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
        AuditModule,
        KeysModule,
        ItemsModule,
        ...(local ? [TypeOrmModule.forFeature([DevUser])] : []),
        ...staticModules,
      ],
      controllers: [HealthController, ...(local ? [DevAuthController] : [])],
      providers: [
        {
          provide: TokenVerifier,
          useFactory: () => (local ? new LocalTokenVerifier(cfg.localJwtSecret) : new CognitoTokenVerifier(cfg)),
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }
}
