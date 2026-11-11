import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1731300000000 implements MigrationInterface {
  name = 'Init1731300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS user_keys (
      user_id varchar(64) PRIMARY KEY,
      kdf jsonb NOT NULL,
      protected_user_key text NOT NULL,
      recovery_protected_user_key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);

    await q.query(`CREATE TABLE IF NOT EXISTS vault_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar(64) NOT NULL,
      data text NOT NULL,
      revision integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_vault_items_user ON vault_items (user_id)`);

    await q.query(`CREATE TABLE IF NOT EXISTS audit_events (
      id bigserial PRIMARY KEY,
      user_id varchar(64) NOT NULL,
      action varchar(64) NOT NULL,
      target_id uuid NULL,
      ip varchar(64) NULL,
      at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_audit_user_at ON audit_events (user_id, at)`);

    // Trilha de auditoria append-only: o banco recusa UPDATE e DELETE, mesmo vindo da aplicação.
    await q.query(`CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_events é somente inserção';
      END;
    $$ LANGUAGE plpgsql`);
    await q.query(`DROP TRIGGER IF EXISTS trg_audit_append_only ON audit_events`);
    await q.query(`CREATE TRIGGER trg_audit_append_only BEFORE UPDATE OR DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION audit_events_append_only()`);

    await q.query(`CREATE TABLE IF NOT EXISTS dev_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar(320) NOT NULL UNIQUE,
      auth_hash varchar(255) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS dev_users`);
    await q.query(`DROP TRIGGER IF EXISTS trg_audit_append_only ON audit_events`);
    await q.query(`DROP FUNCTION IF EXISTS audit_events_append_only`);
    await q.query(`DROP TABLE IF EXISTS audit_events`);
    await q.query(`DROP TABLE IF EXISTS vault_items`);
    await q.query(`DROP TABLE IF EXISTS user_keys`);
  }
}
