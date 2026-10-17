-- Quantum holder rewards. Idempotent.
-- A launch can opt into holder rewards: `reward_share_bps` of its creator fees
-- (which still accrue to the treasury) are paid out to holders who keep the coin
-- in a pqc-vault, i.e. behind a WOTS signature verified on-chain.
alter table pqc_launches add column if not exists reward_mode text;        -- null | 'holders'
alter table pqc_launches add column if not exists reward_share_bps int;    -- e.g. 5000 = 50%

-- Personal vault chains that have opted in to rewards, by their first vault.
-- `root_vault` = PDA("vault", 0x01, pk_hash); the API derives it from the hash,
-- so every row is a real WOTS-locked vault. Nothing here can move funds.
create table if not exists pqc_vault_roots (
  root_vault text primary key,
  pk_hash text not null unique,
  created_at timestamptz not null default now()
);

-- Server-only (service role). No anon policies: the public API serves the data.
alter table pqc_vault_roots enable row level security;
