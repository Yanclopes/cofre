import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadAppConfig } from './config';

async function bootstrap() {
  const cfg = loadAppConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(), {
    bodyParser: true,
  });

  // Atrás de CloudFront + ALB: confia no X-Forwarded-For para registrar o IP real na auditoria.
  app.set('trust proxy', cfg.production ? 2 : false);
  app.useBodyParser('json', { limit: '256kb' });

  const cognitoEndpoint = `https://cognito-idp.${cfg.awsRegion}.amazonaws.com`;
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          // 'wasm-unsafe-eval' é necessário para o Argon2id (WebAssembly) rodar no navegador.
          'script-src': ["'self'", "'wasm-unsafe-eval'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'", cognitoEndpoint],
          'font-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': cfg.production ? [] : null,
        },
      },
      strictTransportSecurity: cfg.production ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Nada de dados do cofre em cache de navegador ou de CDN.
  app.use('/api', (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  await app.listen(cfg.port, '0.0.0.0');
  Logger.log(`Cofre API ouvindo na porta ${cfg.port} (auth: ${cfg.authMode})`, 'bootstrap');
}

bootstrap();
