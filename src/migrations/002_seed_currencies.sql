BEGIN;

INSERT INTO currencies (code, name)
VALUES
  ('USD', 'US Dollar'),
  ('EUR', 'Euro'),
  ('GBP', 'British Pound');

COMMIT;