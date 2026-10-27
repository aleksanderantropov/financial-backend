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

    let connection;
    let connectionBroken = false;

    try {
      connection = await fastify.pg.connect();

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

      await connection.query(
        `
          SELECT * FROM accounts WHERE id IN ($1, $2) ORDER BY id FOR NO KEY UPDATE
        `,
        [source_account_id, target_account_id],
      );

      const debitQuery = await connection.query(
        `
          UPDATE accounts
          SET amount_minor = amount_minor - $1
          WHERE id = $2 AND amount_minor >= $1
        `,
        [amount_minor, source_account_id],
      );

      if (!debitQuery.rowCount) {
        throw new TransferError(TransferErrorCodes.INSUFFICIENT_FUNDS);
      }

      await connection.query(
        `
          UPDATE accounts
          SET amount_minor = amount_minor + $1
          WHERE id = $2
        `,
        [amount_minor, target_account_id],
      );

      await connection.query('COMMIT');

      return reply.code(201).send({
        transfer_id: transferInsert.rows[0].id,
      });
    } catch (error) {
      request.log.error(error);

      if (!connection) {
        connectionBroken = true;

        return reply
          .code(503)
          .send({ error: 'Database temporary unavailable.' });
      }

      await connection.query('ROLLBACK');

      if (error instanceof TransferError) {
        switch (error.code) {
          case TransferErrorCodes.INSUFFICIENT_FUNDS:
            return reply.code(400).send({
              error: 'Source account has insufficient funds',
            });
          default:
            throw error;
        }
      } else if (error instanceof DatabaseError) {
        switch (error.code) {
          case DatabaseErrorCodes.UNIQUE_CONSTRAINT:
            if (error.constraint !== 'transfers_idempotency_key_key') {
              throw error;
            }

            if (!connection) {
              throw error;
            }

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

          case DatabaseErrorCodes.FOREIGN_KEY_CONSTRAINT:
            switch (error.constraint) {
              case 'transfers_source_account_id_currency_code_fkey':
                return reply.code(400).send({
                  error: `Source account doesn't exist or doesn't support ${currency_code} currency`,
                });
              case 'transfers_target_account_id_currency_code_fkey':
                return reply.code(400).send({
                  error: `Target account doesn't exist or doesn't support ${currency_code} currency`,
                });
            }

            throw error;
        }
      }

      throw error;
    } finally {
      connection?.release(connectionBroken);
    }
  };
}
