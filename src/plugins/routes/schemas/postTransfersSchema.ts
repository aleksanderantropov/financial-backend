export const postTransfersSchema = {
  body: {
    type: 'object',
    properties: {
      source_account_id: { type: 'integer' },
      target_account_id: { type: 'integer' },
      currency_code: { type: 'string', pattern: '^[A-Z]{3}$' },
      amount_minor: { type: 'integer', minimum: 1, maximum: 2147483647 },
    },
    required: [
      'source_account_id',
      'target_account_id',
      'currency_code',
      'amount_minor',
    ],
  },
  headers: {
    type: 'object',
    properties: {
      'idempotency-key': { type: 'string', minLength: 1 },
    },
    required: ['idempotency-key'],
  },
} as const;
