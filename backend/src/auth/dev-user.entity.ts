import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Usuários do modo local de desenvolvimento. Em produção o login é do Amazon Cognito. */
@Entity({ name: 'dev_users' })
export class DevUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 320, unique: true })
  email: string;

  /** scrypt do "auth hash" que o navegador deriva da senha mestra (nunca a senha mestra). */
  @Column({ name: 'auth_hash', type: 'varchar', length: 255 })
  authHash: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
