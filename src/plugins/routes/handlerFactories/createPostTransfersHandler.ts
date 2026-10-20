import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FromSchema } from 'json-schema-to-ts';
import { postTransfersSchema } from '../schemas/postTransfersSchema.js';
import { DatabaseError } from 'pg';
import { DatabaseErrorCodes } from '../../../types/DatabaseErrorCodes.js';

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

    if (source_account_id === target_account_id) {
      return reply
        .code(400)
        .send({ error: 'Source and target accounts must be different' });
    }

    const idempotency_key = request.headers['idempotency-key'];

    const connection = await fastify.pg.connect();

    try {
      await connection.query('BEGIN');

      const transferInsert = await connection.query(
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

      const locks = await connection.query(
        `
          SELECT * FROM accounts WHERE id IN ($1, $2) ORDER BY id FOR UPDATE
        `,
        [source_account_id, target_account_id],
      );

      if (locks.rowCount !== 2) {
        throw new Error("Source or target account doesn't exist");
      }

      const debitQuery = await connection.query(
        `
          UPDATE accounts
          SET amount_minor = amount_minor - $1
          WHERE id = $2 AND amount_minor >= $1
        `,
        [amount_minor, source_account_id],
      );

      if (!debitQuery.rowCount) {
        throw new Error(
          "Source account doesn't exist or has insufficient funds",
        );
      }

      const creditQuery = await connection.query(
        `
          UPDATE accounts
          SET amount_minor = amount_minor + $1
          WHERE id = $2
        `,
        [amount_minor, target_account_id],
      );

      if (!creditQuery.rowCount) {
        throw new Error("Target account doesn't exist");
      }

      await connection.query('COMMIT');

      return reply.code(201).send({
        transfer_id: transferInsert.rows[0].id,
      });
    } catch (error) {
      await connection.query('ROLLBACK');

      if (error instanceof DatabaseError) {
        if (
          error.code === DatabaseErrorCodes.UNIQUE_CONSTRAINT &&
          error.constraint === 'transfers_idempotency_key_key'
        ) {
          const transferQuery = await connection.query(
            'SELECT * FROM transfers WHERE idempotency_key = $1',
            [idempotency_key],
          );

          if (!transferQuery.rowCount) {
            throw error;
          }

          const [transfer] = transferQuery.rows;

          if (
            transfer.source_account_id === source_account_id &&
            transfer.target_account_id === target_account_id &&
            BigInt(transfer.amount_minor) === BigInt(amount_minor) &&
            transfer.currency_code === currency_code
          ) {
            return reply.code(200).send({
              transfer_id: transfer.id,
            });
          }

          return reply.code(409).send({
            error: 'Transfer with this idempotency_key already exists',
          });
        }
      }

      throw error;
    } finally {
      connection.release();
    }
  };
}
