BEGIN

INSERT INTO accounts (name, amount_minor, currency_code) VALUES
  ('A', 10000, 'USD'),
  ('B', 5000, 'USD');

COMMIT;