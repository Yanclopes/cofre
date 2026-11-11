/**
 * Criptografia do cofre. TUDO aqui roda no navegador; a senha mestra e as chaves
 * nunca são enviadas ao servidor. Modelo inspirado no Bitwarden:
 *
 *   senha mestra ──Argon2id──► chave mestra ──HKDF──┬─► encKey  (abre a chave do cofre)
 *                                                    └─► authPassword (só prova identidade ao Cognito)
 *
 *   userKey (256 bits aleatórios) cifra cada item com AES-256-GCM.
 *   userKey é guardada no servidor cifrada duas vezes: com encKey e com a chave de recuperação.
 */
import { argon2id } from 'hash-wasm';

export interface KdfParams {
  alg: 'argon2id';
  memKiB: number;
  iterations: number;
  parallelism: number;
}

/** 64 MiB, 3 iterações: acima do mínimo recomendado pelo OWASP para Argon2id. */
export const DEFAULT_KDF: KdfParams = { alg: 'argon2id', memKiB: 65536, iterations: 3, parallelism: 1 };

const AAD_USER_KEY = 'cofre:user-key:v1';
const AAD_RECOVERY = 'cofre:recovery:v1';
const AAD_ITEM = 'cofre:item:v1';

const te = new TextEncoder();
const td = new TextDecoder();

export class DecryptionError extends Error {
  constructor() {
    super('Não foi possível decifrar (chave errada ou dado adulterado)');
  }
}

// ---------------------------------------------------------------- codificação
export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toB64Url(bytes: Uint8Array): string {
  return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(s: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of s) {
    const idx = B32.indexOf(c);
    if (idx < 0) throw new Error('Código de recuperação inválido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------- primitivas
async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  // Chave não-extraível: nem um script na página consegue exportar os bytes depois.
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function hkdf(ikm: Uint8Array, info: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: te.encode(info) },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function encrypt(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: te.encode(aad) },
    key,
    plaintext as BufferSource,
  );
  return `v1.${toB64(iv)}.${toB64(new Uint8Array(ct))}`;
}

export async function decrypt(key: CryptoKey, enc: string, aad: string): Promise<Uint8Array> {
  const [version, ivB64, ctB64] = enc.split('.');
  if (version !== 'v1' || !ivB64 || !ctB64) throw new DecryptionError();
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(ivB64) as BufferSource, additionalData: te.encode(aad) },
      key,
      fromB64(ctB64) as BufferSource,
    );
    return new Uint8Array(pt);
  } catch {
    throw new DecryptionError();
  }
}

// ---------------------------------------------------------------- senha mestra
export interface MasterKeys {
  /** Abre a chave do cofre. Nunca sai do navegador. */
  encKey: CryptoKey;
  /** Senha enviada ao Cognito. Derivada, irreversível: não revela a senha mestra nem a encKey. */
  authPassword: string;
}

export async function deriveMasterKeys(password: string, email: string, kdf: KdfParams = DEFAULT_KDF): Promise<MasterKeys> {
  const salt = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(`cofre:salt:${normalizeEmail(email)}`)));
  const masterKey = (await argon2id({
    password: password.normalize('NFKC'),
    salt,
    parallelism: kdf.parallelism,
    iterations: kdf.iterations,
    memorySize: kdf.memKiB,
    hashLength: 32,
    outputType: 'binary',
  })) as Uint8Array;

  const encRaw = await hkdf(masterKey, 'cofre:enc');
  const authRaw = await hkdf(masterKey, 'cofre:auth');
  masterKey.fill(0);

  const encKey = await importAesKey(encRaw);
  encRaw.fill(0);
  // Prefixo fixo garante que a senha derivada atende a qualquer política de senha do Cognito.
  const authPassword = `Cf1!${toB64Url(authRaw)}`;
  authRaw.fill(0);
  return { encKey, authPassword };
}

// ---------------------------------------------------------------- chave do cofre e recuperação
export interface WrappedKeys {
  kdf: KdfParams;
  protectedUserKey: string;
  recoveryProtectedUserKey: string;
}

/** 256 bits em base32, em grupos de 4: fácil de imprimir e digitar. */
export function formatRecoveryCode(raw: Uint8Array): string {
  return toBase32(raw).match(/.{1,4}/g)!.join('-');
}

export function parseRecoveryCode(code: string): Uint8Array {
  const clean = code.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const raw = fromBase32(clean);
  if (raw.length !== 32) throw new Error('Código de recuperação incompleto');
  return raw;
}

async function wrap(userKeyRaw: Uint8Array, encKey: CryptoKey) {
  const recoveryRaw = crypto.getRandomValues(new Uint8Array(32));
  const recoveryCode = formatRecoveryCode(recoveryRaw);
  const recoveryKey = await importAesKey(recoveryRaw);
  recoveryRaw.fill(0);
  const keys: WrappedKeys = {
    kdf: DEFAULT_KDF,
    protectedUserKey: await encrypt(encKey, userKeyRaw, AAD_USER_KEY),
    recoveryProtectedUserKey: await encrypt(recoveryKey, userKeyRaw, AAD_RECOVERY),
  };
  return { keys, recoveryCode };
}

export interface NewVault {
  userKey: CryptoKey;
  keys: WrappedKeys;
  recoveryCode: string;
}

/** Cadastro: gera a chave do cofre e um código de recuperação novo. */
export async function createVaultKeys(encKey: CryptoKey): Promise<NewVault> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const { keys, recoveryCode } = await wrap(raw, encKey);
  const userKey = await importAesKey(raw);
  raw.fill(0);
  return { userKey, keys, recoveryCode };
}

/** Login normal: abre a chave do cofre com a senha mestra. */
export async function unlockUserKey(encKey: CryptoKey, keys: WrappedKeys): Promise<CryptoKey> {
  const raw = await decrypt(encKey, keys.protectedUserKey, AAD_USER_KEY);
  const key = await importAesKey(raw);
  raw.fill(0);
  return key;
}

/**
 * Troca de senha mestra (com a antiga) ou recuperação (com o kit): recifra a MESMA chave do cofre
 * com a nova senha e gera um código de recuperação novo. Os itens não precisam ser recifrados.
 */
export async function rewrapUserKey(
  source: { encKey: CryptoKey } | { recoveryCode: string },
  keys: WrappedKeys,
  newEncKey: CryptoKey,
): Promise<NewVault> {
  let raw: Uint8Array;
  if ('encKey' in source) {
    raw = await decrypt(source.encKey, keys.protectedUserKey, AAD_USER_KEY);
  } else {
    const recoveryRaw = parseRecoveryCode(source.recoveryCode);
    const recoveryKey = await importAesKey(recoveryRaw);
    recoveryRaw.fill(0);
    raw = await decrypt(recoveryKey, keys.recoveryProtectedUserKey, AAD_RECOVERY);
  }
  const { keys: newKeys, recoveryCode } = await wrap(raw, newEncKey);
  const userKey = await importAesKey(raw);
  raw.fill(0);
  return { userKey, keys: newKeys, recoveryCode };
}

// ---------------------------------------------------------------- itens
export interface ItemData {
  name: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

export async function encryptItem(userKey: CryptoKey, item: ItemData): Promise<string> {
  return encrypt(userKey, te.encode(JSON.stringify(item)), AAD_ITEM);
}

export async function decryptItem(userKey: CryptoKey, data: string): Promise<ItemData> {
  return JSON.parse(td.decode(await decrypt(userKey, data, AAD_ITEM))) as ItemData;
}

// ---------------------------------------------------------------- gerador e força de senha
export interface GeneratorOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
}

/** Sorteio sem viés (rejection sampling) com o gerador criptográfico do navegador. */
export function generatePassword(opts: GeneratorOptions): string {
  const sets = [
    opts.upper && 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    opts.lower && 'abcdefghijkmnopqrstuvwxyz',
    opts.digits && '23456789',
    opts.symbols && '!@#$%&*-_=+?',
  ].filter(Boolean) as string[];
  if (sets.length === 0) throw new Error('Escolha ao menos um tipo de caractere');
  const all = sets.join('');

  const pick = (alphabet: string): string => {
    const limit = 256 - (256 % alphabet.length);
    const buf = new Uint8Array(1);
    for (;;) {
      crypto.getRandomValues(buf);
      if (buf[0] < limit) return alphabet[buf[0] % alphabet.length];
    }
  };

  for (;;) {
    let out = '';
    for (let i = 0; i < opts.length; i++) out += pick(all);
    // Garante ao menos um caractere de cada tipo escolhido.
    if (sets.every((s) => [...out].some((c) => s.includes(c)))) return out;
  }
}

/** Estimativa simples de entropia em bits (tamanho × log2 do alfabeto usado). */
export function estimateEntropyBits(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  if (pool === 0) return 0;
  const repeated = new Set(pw).size < pw.length / 2;
  return Math.round(pw.length * Math.log2(pool) * (repeated ? 0.5 : 1));
}
