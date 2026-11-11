import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateItemDto } from '../items/items.dto';
import { PutKeysDto } from './keys.dto';

const ENC = 'v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBB==';

describe('validação: a API só aceita dados cifrados', () => {
  it('recusa item em texto puro', () => {
    const errors = validateSync(plainToInstance(CreateItemDto, { data: '{"password":"123456"}' }));
    expect(errors).not.toHaveLength(0);
  });

  it('aceita item no formato cifrado v1', () => {
    expect(validateSync(plainToInstance(CreateItemDto, { data: ENC }))).toHaveLength(0);
  });

  it('recusa Argon2id enfraquecido', () => {
    const dto = plainToInstance(PutKeysDto, {
      kdf: { alg: 'argon2id', memKiB: 1024, iterations: 1, parallelism: 1 },
      protectedUserKey: ENC,
      recoveryProtectedUserKey: ENC,
    });
    expect(validateSync(dto)).not.toHaveLength(0);
  });
});
