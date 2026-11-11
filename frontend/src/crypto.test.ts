import { describe, expect, it } from 'vitest';
import {
  createVaultKeys,
  decryptItem,
  deriveMasterKeys,
  encryptItem,
  generatePassword,
  KdfParams,
  parseRecoveryCode,
  rewrapUserKey,
  unlockUserKey,
} from './crypto';

// Parâmetros leves só para o teste ficar rápido.
const FAST: KdfParams = { alg: 'argon2id', memKiB: 1024, iterations: 2, parallelism: 1 };
const item = { name: 'Banco', username: 'ana', password: 's3nh@!', url: 'https://banco.exemplo', notes: '' };

describe('cofre de conhecimento zero', () => {
  it('a mesma senha + e-mail gera o mesmo authPassword; senha diferente gera outro', async () => {
    const a = await deriveMasterKeys('senha mestra longa', 'Ana@Exemplo.com', FAST);
    const b = await deriveMasterKeys('senha mestra longa', 'ana@exemplo.com', FAST);
    const c = await deriveMasterKeys('outra senha mestra', 'ana@exemplo.com', FAST);
    expect(a.authPassword).toBe(b.authPassword);
    expect(a.authPassword).not.toBe(c.authPassword);
    expect(a.authPassword).not.toContain('senha mestra');
  });

  it('cifra e decifra um item; outra chave não abre', async () => {
    const mk = await deriveMasterKeys('senha mestra longa', 'ana@exemplo.com', FAST);
    const vault = await createVaultKeys(mk.encKey);
    const data = await encryptItem(vault.userKey, item);
    expect(data).toMatch(/^v1\./);
    expect(data).not.toContain('s3nh@!');
    expect(await decryptItem(vault.userKey, data)).toEqual(item);

    const other = await createVaultKeys(mk.encKey);
    await expect(decryptItem(other.userKey, data)).rejects.toThrow();
  });

  it('senha mestra errada não abre a chave do cofre', async () => {
    const mk = await deriveMasterKeys('senha mestra longa', 'ana@exemplo.com', FAST);
    const vault = await createVaultKeys(mk.encKey);
    const wrong = await deriveMasterKeys('senha errada', 'ana@exemplo.com', FAST);
    await expect(unlockUserKey(wrong.encKey, vault.keys)).rejects.toThrow();
  });

  it('o kit de recuperação abre o cofre com uma senha nova e os itens antigos continuam legíveis', async () => {
    const mk = await deriveMasterKeys('senha esquecida', 'ana@exemplo.com', FAST);
    const vault = await createVaultKeys(mk.encKey);
    const data = await encryptItem(vault.userKey, item);

    const nova = await deriveMasterKeys('senha nova', 'ana@exemplo.com', FAST);
    const typed = vault.recoveryCode.toLowerCase().replace(/-/g, ' ');
    const recovered = await rewrapUserKey({ recoveryCode: typed }, vault.keys, nova.encKey);

    expect(recovered.recoveryCode).not.toBe(vault.recoveryCode);
    const userKey = await unlockUserKey(nova.encKey, recovered.keys);
    expect(await decryptItem(userKey, data)).toEqual(item);
  });

  it('código de recuperação errado é recusado', async () => {
    const mk = await deriveMasterKeys('x senha', 'ana@exemplo.com', FAST);
    const vault = await createVaultKeys(mk.encKey);
    const other = await createVaultKeys(mk.encKey);
    await expect(rewrapUserKey({ recoveryCode: other.recoveryCode }, vault.keys, mk.encKey)).rejects.toThrow();
    expect(() => parseRecoveryCode('ABCD-EFGH')).toThrow();
  });

  it('gerador respeita tamanho e tipos', () => {
    const pw = generatePassword({ length: 24, upper: true, lower: true, digits: true, symbols: true });
    expect(pw).toHaveLength(24);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[0-9]/);
    expect(pw).toMatch(/[^A-Za-z0-9]/);
  });
});
