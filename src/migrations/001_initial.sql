BEGIN;

CREATE TABLE currencies(
  code  VARCHAR(3) PRIMARY KEY,
  name  VARCHAR(40) NOT NULL
);

CREATE TABLE accounts(
  id            INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name          VARCHAR(40) NOT NULL CHECK (name <> ''),
  amount_minor  bigint NOT NULL CHECK (amount_minor >= 0),
  currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
  UNIQUE        (id, currency_code)
);

CREATE TABLE transfers(
  id                INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  idempotency_key   VARCHAR(40) UNIQUE NOT NULL CHECK (idempotency_key <> ''),
  source_account_id INTEGER NOT NULL,
  target_account_id INTEGER NOT NULL,
  amount_minor      bigint NOT NULL CHECK (amount_minor > 0),
  currency_code     VARCHAR(3) NOT NULL,
  CHECK             (source_account_id <> target_account_id),
  FOREIGN KEY       (source_account_id, currency_code) REFERENCES accounts (id, currency_code),
  FOREIGN KEY       (target_account_id, currency_code) REFERENCES accounts (id, currency_code)
);

CREATE FUNCTION prevent_account_currency_code_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.currency_code IS DISTINCT FROM NEW.currency_code THEN
    RAISE EXCEPTION 'accounts.currency_code cannot change';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER account_currency_code_immutable
BEFORE UPDATE OF currency_code ON accounts
FOR EACH ROW
EXECUTE FUNCTION prevent_account_currency_code_change();

COMMIT;