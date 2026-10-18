BEGIN;

DROP TABLE IF EXISTS accounts, transfers;

CREATE TABLE accounts(
  id            integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name          varchar(40) NOT NULL CHECK (name <> ''),
  amountMinor   bigint NOT NULL CHECK (amountMinor > 0),
  currency      varchar(3) NOT NULL CHECK (currency <> '')
);

CREATE TABLE transfers(
  id              integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  idempotencyKey  varchar(20) UNIQUE NOT NULL CHECK (idempotencyKey <> ''),
  sourceId        integer REFERENCES accounts(id) NOT NULL,
  targetId        integer REFERENCES accounts(id) NOT NULL,
  amountMinor     bigint NOT NULL CHECK (amountMinor > 0)
);

COMMIT;