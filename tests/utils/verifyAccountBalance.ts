import { FastifyInstance } from 'fastify';
import { expect } from 'vitest';

export async function verifyAccountBalance({
  fastify,
  balance,
  accountId,
}: {
  fastify: FastifyInstance;
  balance: number;
  accountId: number;
}) {
  const response = await fastify.inject({
    method: 'GET',
    url: `/accounts/${accountId}`,
  });

  expect((await response.json()).amount_minor).toBe(balance.toString());
}
