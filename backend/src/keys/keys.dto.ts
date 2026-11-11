import { Type } from 'class-transformer';
import { Equals, IsInt, Matches, Max, Min, ValidateNested } from 'class-validator';
import { ENC_STRING_REGEX } from '../common/enc-string';

export class KdfDto {
  @Equals('argon2id')
  alg: 'argon2id';

  // Mínimos do OWASP para Argon2id; impede o cliente de enfraquecer a derivação.
  @IsInt() @Min(19456) @Max(1048576)
  memKiB: number;

  @IsInt() @Min(2) @Max(10)
  iterations: number;

  @IsInt() @Min(1) @Max(16)
  parallelism: number;
}

export class PutKeysDto {
  @ValidateNested()
  @Type(() => KdfDto)
  kdf: KdfDto;

  @Matches(ENC_STRING_REGEX, { message: 'protectedUserKey precisa estar cifrada (formato v1)' })
  protectedUserKey: string;

  @Matches(ENC_STRING_REGEX, { message: 'recoveryProtectedUserKey precisa estar cifrada (formato v1)' })
  recoveryProtectedUserKey: string;
}
