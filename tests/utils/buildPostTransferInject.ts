export function buildPostTransferInject({
  source_account_id,
  target_account_id,
  idempotency_key = 'abc123',
  amount_minor = 1000,
  currency_code = 'USD',
}: {
  idempotency_key?: string;
  source_account_id: number;
  target_account_id: number;
  amount_minor?: number;
  currency_code?: string;
}) {
  return {
    method: 'POST',
    url: '/transfers',
    headers: {
      'idempotency-key': idempotency_key,
    },
    body: {
      source_account_id,
      target_account_id,
      amount_minor,
      currency_code,
    },
  };
}
