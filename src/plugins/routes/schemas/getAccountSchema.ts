export const getAccountSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer', minimum: 1, maximum: 2147483647 },
    },
  },
} as const;
