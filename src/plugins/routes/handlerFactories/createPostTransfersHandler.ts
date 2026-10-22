import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FromSchema } from 'json-schema-to-ts';
import { postTransfersSchema } from '../schemas/postTransfersSchema.js';
import { DatabaseError } from 'pg';
import { DatabaseErrorCodes } from '../../../types/DatabaseErrorCodes.js';
import { TransferError } from '../../../types/TransferError.js';
import { TransferErrorCodes } from '../../../types/TransferErrorCodes.js';

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
          SELECT * FROM accounts WHERE id IN ($1, $2) ORDER BY id FOR NO KEY UPDATE
        `,
        [source_account_id, target_account_id],
      );

      if (locks.rowCount !== 2) {
        throw new TransferError(TransferErrorCodes.TRANSFER_INSERT);
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
        throw new TransferError(TransferErrorCodes.UPDATE_DEBIT);
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
        throw new TransferError(TransferErrorCodes.UPDATE_CREDIT);
      }

      await connection.query('COMMIT');

      return reply.code(201).send({
        transfer_id: transferInsert.rows[0].id,
      });
    } catch (error) {
      try {
        await connection.query('ROLLBACK');
      } catch (e) {
        return reply
          .code(500)
          .send({ error: 'Database connection failed. Retry operation.' });
      }

      if (error instanceof TransferError) {
        switch (error.code) {
          case TransferErrorCodes.TRANSFER_INSERT:
            return reply
              .code(400)
              .send({ error: "Source or target account doesn't exist" });
          case TransferErrorCodes.UPDATE_DEBIT:
            return reply.code(400).send({
              error: "Source account doesn't exist or has insufficient funds",
            });
          case TransferErrorCodes.UPDATE_CREDIT:
            return reply
              .code(400)
              .send({ error: "Target account doesn't exist" });
          default:
            throw error;
        }
      } else if (error instanceof DatabaseError) {
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
