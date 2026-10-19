import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FromSchema } from 'json-schema-to-ts';
import { postTransfersSchema } from '../schemas/postTransfersSchema.js';

type PostTransfersRoute = {
  Body: FromSchema<typeof postTransfersSchema.body>;
  Headers: FromSchema<typeof postTransfersSchema.headers>;
};

export function createPostTransfersHandler(fastify: FastifyInstance) {
  return async (
    request: FastifyRequest<PostTransfersRoute>,
    reply: FastifyReply<PostTransfersRoute>,
  ) => {
    const {
      amount_minor,
      currency_code,
      source_account_id,
      target_account_id,
    } = request.body;

    const idempotency_key = request.headers['idempotency-key'];

    const connection = await fastify.pg.connect();

    try {
      await connection.query('BEGIN');

      await connection.query(
        `
          INSERT INTO transfers (
            idempotency_key,
            source_account_id,
            target_account_id,
            amount_minor,
            currency_code
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [
          idempotency_key,
          source_account_id,
          target_account_id,
          amount_minor,
          currency_code,
        ],
      );

      const debit = await connection.query(
        `
          UPDATE accounts
          SET amount_minor = amount_minor - $1
          WHERE id = $2 AND amount_minor >= $1
        `,
        [amount_minor, source_account_id],
      );

      if (!debit.rowCount) {
        throw new Error(
          "Source account doesn't exist or has insufficient funds",
        );
      }

      const credit = await connection.query(
        `
          UPDATE accounts
          SET amount_minor = amount_minor + $1
          WHERE id = $2
        `,
        [amount_minor, target_account_id],
      );

      if (!credit.rowCount) {
        throw new Error("Target account doesn't exist");
      }

      await connection.query('COMMIT');
    } catch (error) {
      await connection.query('ROLLBACK');

      throw error;
    } finally {
      connection.release();
    }
  };
}
