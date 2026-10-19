export const postTransfersSchema = {
  body: {
    type: 'object',
    properties: {
      source_account_id: { type: 'integer', minimum: 1 },
      target_account_id: { type: 'integer', minimum: 1 },
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
      'idempotency-key': { type: 'string', minLength: 1, maxLength: 40 },
    },
    required: ['idempotency-key'],
  },
} as const;
