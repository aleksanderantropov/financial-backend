BEGIN;

CREATE TABLE accounts(
  id            integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name          varchar(40) NOT NULL CHECK (name <> ''),
  amount_minor  bigint NOT NULL CHECK (amount_minor >= 0),
  currency      char(3) NOT NULL CHECK (currency <> '')
);

CREATE TABLE transfers(
  id              integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  idempotency_key varchar(40) UNIQUE NOT NULL CHECK (idempotencyKey <> ''),
  sourceid        integer REFERENCES accounts(id) NOT NULL,
  targetid        integer REFERENCES accounts(id) NOT NULL,
  amount_minor    bigint NOT NULL CHECK (amount_minor > 0),
  CHECK           (sourceid <> targetid)
);

COMMIT;