import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'vitest';
import { buildFastify } from '../src/buildFastify.js';
import { createTestAccount } from './fixtures/createTestAccount.js';
import { buildPostTransferInject } from './utils/buildPostTransferInject.js';

const NON_EXISTENT_ACCOUNT_ID = 999;

describe('POST /transfers', () => {
  const fastify = buildFastify();

  beforeAll(async () => {
    await fastify.ready();
  });

  beforeEach(async () => {
    await fastify.pg.query(
      'TRUNCATE TABLE transfers, accounts RESTART IDENTITY',
    );
  });

  afterAll(() => {
    fastify.close();
  });

  test('Sends a new transfer', async () => {
    const sourceAccount = await createTestAccount(fastify);
    const targetAccount = await createTestAccount(fastify);

    const response = await fastify.inject(
      buildPostTransferInject({
        source_account_id: sourceAccount.id,
        target_account_id: targetAccount.id,
      }),
    );

    const body = response.json();

    expect(response.statusCode).toBe(201);
    expect(body).toHaveProperty('transfer_id');
    expect(Number.isInteger(body.transfer_id)).toBe(true);
  });

  test('Gets an error when source and target accounts are same', async () => {
    const sourceAccount = await createTestAccount(fastify);

    const response = await fastify.inject(
      buildPostTransferInject({
        source_account_id: sourceAccount.id,
        target_account_id: sourceAccount.id,
      }),
    );

    const body = response.json();

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe('Source and target accounts must be different');
  });

  test("Gets an error when source account doesn't exist", async () => {
    const targetAccount = await createTestAccount(fastify);

    const response = await fastify.inject(
      buildPostTransferInject({
        source_account_id: NON_EXISTENT_ACCOUNT_ID,
        target_account_id: targetAccount.id,
      }),
    );

    const body = response.json();

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe(
      "Source account doesn't exist or doesn't support USD currency",
    );
  });

  test('Gets an error when source account has insufficient funds', async () => {
    const sourceAccount = await createTestAccount(fastify, {
      amount_minor: 1000,
    });
    const targetAccount = await createTestAccount(fastify);

    const response = await fastify.inject(
      buildPostTransferInject({
        source_account_id: sourceAccount.id,
        target_account_id: targetAccount.id,
        amount_minor: 5000,
      }),
    );

    const body = response.json();

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe('Source account has insufficient funds');
  });

  test("Gets an error when target account doesn't exist", async () => {
    const sourceAccount = await createTestAccount(fastify);

    const response = await fastify.inject(
      buildPostTransferInject({
        source_account_id: sourceAccount.id,
        target_account_id: NON_EXISTENT_ACCOUNT_ID,
      }),
    );

    const body = response.json();

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe(
      "Target account doesn't exist or doesn't support USD currency",
    );
  });

  test('Gets an error when source and target account have different currencies', async () => {
    const sourceAccount = await createTestAccount(fastify, {
      currency_code: 'USD',
    });
    const targetAccount = await createTestAccount(fastify, {
      currency_code: 'EUR',
    });

    const firstResponse = await fastify.inject(
      buildPostTransferInject({
        idempotency_key: '1',
        source_account_id: sourceAccount.id,
        target_account_id: targetAccount.id,
        currency_code: sourceAccount.currency_code,
      }),
    );

    expect(firstResponse.statusCode).toBe(400);
    expect((await firstResponse.json()).error).toBe(
      "Target account doesn't exist or doesn't support USD currency",
    );

    const secondResponse = await fastify.inject(
      buildPostTransferInject({
        idempotency_key: '2',
        source_account_id: sourceAccount.id,
        target_account_id: targetAccount.id,
        currency_code: targetAccount.currency_code,
      }),
    );

    expect(secondResponse.statusCode).toBe(400);
    expect((await secondResponse.json()).error).toBe(
      "Source account doesn't exist or doesn't support EUR currency",
    );
  });

  test('Two concurrent requests with same idempotency_key result in one transfer', async () => {
    const sourceAccount = await createTestAccount(fastify);
    const targetAccount = await createTestAccount(fastify);

    const [firstResponse, secondResponse] = await Promise.all([
      fastify.inject(
        buildPostTransferInject({
          source_account_id: sourceAccount.id,
          target_account_id: targetAccount.id,
        }),
      ),
      fastify.inject(
        buildPostTransferInject({
          source_account_id: sourceAccount.id,
          target_account_id: targetAccount.id,
        }),
      ),
    ]);

    expect(firstResponse.statusCode).toBe(201);
    expect(secondResponse.statusCode).toBe(200);
    expect(firstResponse.body).toEqual(secondResponse.body);
  });

  test('Second request with same idempotency_key but different params gets an error', async () => {
    const sourceAccount = await createTestAccount(fastify);
    const targetAccount = await createTestAccount(fastify);

    const firstResponse = await fastify.inject(
      buildPostTransferInject({
        source_account_id: sourceAccount.id,
        target_account_id: targetAccount.id,
        amount_minor: 1000,
      }),
    );

    const secondResponse = await fastify.inject(
      buildPostTransferInject({
        source_account_id: sourceAccount.id,
        target_account_id: targetAccount.id,
        amount_minor: 2000,
        currency_code: 'EUR',
      }),
    );

    expect(firstResponse.statusCode).toBe(201);

    expect(secondResponse.statusCode).toBe(409);
    expect((await secondResponse.json()).error).toEqual(
      'Transfer with this idempotency_key already exists',
    );
  });

  test("Two concurrent requests between the same accounts in opposite directions don't deadlock", async () => {
    const sourceAccount = await createTestAccount(fastify);
    const targetAccount = await createTestAccount(fastify);

    const firstResponse = await fastify.inject(
      buildPostTransferInject({
        idempotency_key: '1',
        source_account_id: sourceAccount.id,
        target_account_id: targetAccount.id,
      }),
    );

    const secondResponse = await fastify.inject(
      buildPostTransferInject({
        idempotency_key: '2',
        source_account_id: targetAccount.id,
        target_account_id: sourceAccount.id,
      }),
    );

    expect(firstResponse.statusCode).toBe(201);
    expect(secondResponse.statusCode).toBe(201);
  });
});
