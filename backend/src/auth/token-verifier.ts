import { CognitoJwtVerifier } from 'aws-jwt-verify';
import * as jwt from 'jsonwebtoken';
import type { AppConfig } from '../config';

export interface AuthUser {
  sub: string;
}

export abstract class TokenVerifier {
  abstract verify(token: string): Promise<AuthUser>;
}

export const LOCAL_ISSUER = 'cofre-local';
export const LOCAL_AUDIENCE = 'cofre-api';

/** Valida o access token emitido pelo Cognito (assinatura, emissor, client_id e expiração). */
export class CognitoTokenVerifier extends TokenVerifier {
  private readonly verifier;

  constructor(cfg: AppConfig) {
    super();
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: cfg.cognitoUserPoolId,
      clientId: cfg.cognitoClientId,
      tokenUse: 'access',
    });
  }

  async verify(token: string): Promise<AuthUser> {
    const payload = await this.verifier.verify(token);
    return { sub: payload.sub };
  }
}

/** Modo de desenvolvimento: tokens HS256 emitidos pela própria API (rota /api/dev-auth). */
export class LocalTokenVerifier extends TokenVerifier {
  constructor(private readonly secret: string) {
    super();
  }

  async verify(token: string): Promise<AuthUser> {
    const payload = jwt.verify(token, this.secret, {
      algorithms: ['HS256'],
      issuer: LOCAL_ISSUER,
      audience: LOCAL_AUDIENCE,
    }) as jwt.JwtPayload;
    if (!payload.sub) throw new Error('token sem sub');
    return { sub: payload.sub };
  }
}
