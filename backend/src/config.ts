import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { DataSourceOptions } from 'typeorm';

export type AuthMode = 'cognito' | 'local';

export interface AppConfig {
  port: number;
  production: boolean;
  authMode: AuthMode;
  awsRegion: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  localJwtSecret: string;
  frontendDir: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}

export function loadAppConfig(): AppConfig {
  const production = process.env.NODE_ENV === 'production';
  const authMode = (process.env.AUTH_MODE ?? 'cognito') as AuthMode;
  if (authMode !== 'cognito' && authMode !== 'local') {
    throw new Error('AUTH_MODE deve ser "cognito" ou "local"');
  }
  // O modo local (login simulado, sem Cognito) existe só para desenvolvimento.
  if (production && authMode === 'local') {
    throw new Error('AUTH_MODE=local não é permitido com NODE_ENV=production');
  }
  const awsRegion = process.env.AWS_REGION ?? 'sa-east-1';
  return {
    port: Number(process.env.PORT ?? 3000),
    production,
    authMode,
    awsRegion,
    cognitoUserPoolId: authMode === 'cognito' ? required('COGNITO_USER_POOL_ID') : '',
    cognitoClientId: authMode === 'cognito' ? required('COGNITO_CLIENT_ID') : '',
    localJwtSecret: authMode === 'local' ? required('LOCAL_JWT_SECRET') : '',
    frontendDir: process.env.FRONTEND_DIR ?? join(__dirname, '..', 'public'),
  };
}

/**
 * Opções do banco. Em produção a senha vem do Secrets Manager (segredo gerenciado
 * pelo próprio RDS) e a conexão usa TLS validando o certificado da AWS.
 */
export async function loadDatabaseOptions(): Promise<DataSourceOptions> {
  const base = {
    type: 'postgres' as const,
    entities: [join(__dirname, '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'database', 'migrations', '*.{ts,js}')],
    migrationsRun: true,
    synchronize: false,
    logging: ['error' as const],
  };

  if (process.env.DATABASE_URL) {
    return { ...base, url: process.env.DATABASE_URL };
  }

  let username = process.env.DB_USER ?? '';
  let password = process.env.DB_PASSWORD ?? '';
  const secretArn = process.env.DB_SECRET_ARN;
  if (secretArn) {
    const sm = new SecretsManagerClient({ region: process.env.AWS_REGION });
    const out = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const secret = JSON.parse(out.SecretString ?? '{}') as { username?: string; password?: string };
    username = secret.username ?? username;
    password = secret.password ?? password;
  }

  const caPath = process.env.DB_CA_PATH;
  return {
    ...base,
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'cofre',
    username,
    password,
    ssl: caPath ? { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true } : undefined,
  };
}
