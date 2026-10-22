import { FastifyInstance } from 'fastify';

export async function createTestAccount(
  fastify: FastifyInstance,
  {
    name = 'A',
    amount_minor = 1000,
    currency_code = 'USD',
  }: { name?: string; amount_minor?: number; currency_code?: string } = {},
) {
  const response = await fastify.pg.query(
    'INSERT INTO accounts (name, amount_minor, currency_code) VALUES ($1, $2, $3) RETURNING *',
    [name, amount_minor, currency_code],
  );

  return response.rows[0];
}
