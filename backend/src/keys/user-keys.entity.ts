import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export interface KdfParams {
  alg: 'argon2id';
  memKiB: number;
  iterations: number;
  parallelism: number;
}

/**
 * Material de chave do usuário, todo cifrado no navegador:
 * - protectedUserKey: a chave do cofre cifrada com a chave derivada da senha mestra.
 * - recoveryProtectedUserKey: a mesma chave cifrada com a chave de recuperação (kit do usuário).
 * Sem a senha mestra ou o kit, nada aqui abre o cofre.
 */
@Entity({ name: 'user_keys' })
export class UserKeys {
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 64 })
  userId: string;

  @Column({ type: 'jsonb' })
  kdf: KdfParams;

  @Column({ name: 'protected_user_key', type: 'text' })
  protectedUserKey: string;

  @Column({ name: 'recovery_protected_user_key', type: 'text' })
  recoveryProtectedUserKey: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
