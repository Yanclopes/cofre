import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from 'typeorm';

/**
 * Um acesso guardado (site, usuário, senha, notas). O servidor só vê "data",
 * que é o JSON do item cifrado com AES-256-GCM no navegador.
 */
@Entity({ name: 'vault_items' })
@Index(['userId'])
export class VaultItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId: string;

  @Column({ type: 'text' })
  data: string;

  /** Controle de concorrência: evita que um dispositivo sobrescreva a edição de outro. */
  @VersionColumn()
  revision: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
