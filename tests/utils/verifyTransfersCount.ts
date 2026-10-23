import { FastifyInstance } from 'fastify';
import { expect } from 'vitest';

export async function verifyTransfersCount(
  fastify: FastifyInstance,
  expectedCount: number,
) {
  const transfersResponse = await fastify.pg.query('SELECT * FROM transfers');
  expect(transfersResponse.rowCount).toBe(expectedCount);
}
