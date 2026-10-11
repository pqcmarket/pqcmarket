-- Post-quantum pool positions. Idempotent.
-- A position is a chain of pqc-vault vaults owned by a pool identity. Only the
-- chain's first vault is recorded: the server walks tombstones (each names the
-- next vault) to find where the position lives now, and pays yield there.
--
-- `root_vault` = PDA("vault", 0x01, pk_hash) under the vault program; the API
-- checks that derivation, so every row is a real WOTS-locked vault. Nothing here
-- is secret and nothing here can move funds.
create table if not exists pqc_pool_positions (
  root_vault text primary key,
  pk_hash text not null unique,
  created_at timestamptz not null default now()
);

-- Server-only (service role). No anon policies: the public API serves the data.
alter table pqc_pool_positions enable row level security;
