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
import { verifyAccountBalance } from './utils/verifyAccountBalance.js';
import { verifyTransfersCount } from './utils/verifyTransfersCount.js';

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

  afterAll(async () => {
    await fastify.close();
  });

  test('Sends a new transfer', async () => {
    const sourceAccount = await createTestAccount(fastify, {
      amount_minor: 1000,
    });
    const targetAccount = await createTestAccount(fastify, { amount_minor: 0 });

    const transferResponse = await fastify.inject(
      buildPostTransferInject({
        source_account_id: sourceAccount.id,
        target_account_id: targetAccount.id,
      }),
    );

    const body = transferResponse.json();

    expect(transferResponse.statusCode).toBe(201);
    expect(body).toHaveProperty('transfer_id');
    expect(Number.isInteger(body.transfer_id)).toBe(true);

    await verifyAccountBalance({
      fastify,
      accountId: sourceAccount.id,
      balance: 0,
    });

    await verifyAccountBalance({
      fastify,
      accountId: targetAccount.id,
      balance: 1000,
    });
  });

  test('Gets an error when source and target accounts are same', async () => {
    const sourceAccount = await createTestAccount(fastify, {
      amount_minor: 1000,
    });

    const response = await fastify.inject(
      buildPostTransferInject({
        source_account_id: sourceAccount.id,
        target_account_id: sourceAccount.id,
      }),
    );

    const body = response.json();

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe('Source and target accounts must be different');

    await verifyAccountBalance({
      fastify,
      accountId: sourceAccount.id,
      balance: 1000,
    });
  });

  test("Gets an error when source account doesn't exist", async () => {
    const targetAccount = await createTestAccount(fastify, { amount_minor: 0 });

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

    await verifyAccountBalance({
      fastify,
      accountId: targetAccount.id,
      balance: 0,
    });
  });

  test('Gets an error when source account has insufficient funds', async () => {
    const sourceAccount = await createTestAccount(fastify, {
      amount_minor: 1000,
    });
    const targetAccount = await createTestAccount(fastify, { amount_minor: 0 });

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

    await verifyAccountBalance({
      fastify,
      accountId: sourceAccount.id,
      balance: 1000,
    });

    await verifyAccountBalance({
      fastify,
      accountId: targetAccount.id,
      balance: 0,
    });
  });

  test("Gets an error when target account doesn't exist", async () => {
    const sourceAccount = await createTestAccount(fastify, {
      amount_minor: 1000,
    });

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

    await verifyAccountBalance({
      fastify,
      accountId: sourceAccount.id,
      balance: 1000,
    });
  });

  test('Gets an error when source and target account have different currencies', async () => {
    const sourceAccount = await createTestAccount(fastify, {
      amount_minor: 1000,
      currency_code: 'USD',
    });
    const targetAccount = await createTestAccount(fastify, {
      amount_minor: 0,
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

    await verifyAccountBalance({
      fastify,
      accountId: sourceAccount.id,
      balance: 1000,
    });

    await verifyAccountBalance({
      fastify,
      accountId: targetAccount.id,
      balance: 0,
    });
  });

  test('Two concurrent requests with same idempotency_key result in one transfer', async () => {
    const sourceAccount = await createTestAccount(fastify, {
      amount_minor: 2000,
    });
    const targetAccount = await createTestAccount(fastify, { amount_minor: 0 });

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

    expect(
      [firstResponse.statusCode, secondResponse.statusCode].sort(
        (a, b) => a - b,
      ),
    ).toEqual([200, 201]);
    expect(firstResponse.body).toEqual(secondResponse.body);

    await verifyTransfersCount(fastify, 1);

    await verifyAccountBalance({
      fastify,
      accountId: sourceAccount.id,
      balance: 1000,
    });

    await verifyAccountBalance({
      fastify,
      accountId: targetAccount.id,
      balance: 1000,
    });
  });

  test('Two valid concurrent requests with insufficient funds result in one transfer', async () => {
    const sourceAccount = await createTestAccount(fastify, {
      amount_minor: 1000,
    });
    const targetAccount = await createTestAccount(fastify, { amount_minor: 0 });

    const [firstResponse, secondResponse] = await Promise.all([
      fastify.inject(
        buildPostTransferInject({
          idempotency_key: '1',
          source_account_id: sourceAccount.id,
          target_account_id: targetAccount.id,
          amount_minor: 800,
        }),
      ),
      fastify.inject(
        buildPostTransferInject({
          idempotency_key: '2',
          source_account_id: sourceAccount.id,
          target_account_id: targetAccount.id,
          amount_minor: 800,
        }),
      ),
    ]);

    expect(
      [firstResponse.statusCode, secondResponse.statusCode].sort(
        (a, b) => a - b,
      ),
    ).toEqual([201, 400]);

    await verifyTransfersCount(fastify, 1);

    await verifyAccountBalance({
      fastify,
      accountId: sourceAccount.id,
      balance: 200,
    });

    await verifyAccountBalance({
      fastify,
      accountId: targetAccount.id,
      balance: 800,
    });
  });

  test('Second request with same idempotency_key but different params gets an error', async () => {
    const sourceAccount = await createTestAccount(fastify, {
      amount_minor: 2000,
    });
    const targetAccount = await createTestAccount(fastify, { amount_minor: 0 });

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

    await verifyTransfersCount(fastify, 1);

    await verifyAccountBalance({
      fastify,
      accountId: sourceAccount.id,
      balance: 1000,
    });

    await verifyAccountBalance({
      fastify,
      accountId: targetAccount.id,
      balance: 1000,
    });
  });

  test("Two concurrent requests between the same accounts in opposite directions don't deadlock", async () => {
    const sourceAccount = await createTestAccount(fastify, {
      amount_minor: 1000,
    });
    const targetAccount = await createTestAccount(fastify, {
      amount_minor: 1000,
    });

    const [firstResponse, secondResponse] = await Promise.all([
      fastify.inject(
        buildPostTransferInject({
          idempotency_key: '1',
          source_account_id: sourceAccount.id,
          target_account_id: targetAccount.id,
        }),
      ),
      fastify.inject(
        buildPostTransferInject({
          idempotency_key: '2',
          source_account_id: targetAccount.id,
          target_account_id: sourceAccount.id,
        }),
      ),
    ]);

    expect(firstResponse.statusCode).toBe(201);
    expect(secondResponse.statusCode).toBe(201);

    await verifyAccountBalance({
      fastify,
      accountId: sourceAccount.id,
      balance: 1000,
    });

    await verifyAccountBalance({
      fastify,
      accountId: targetAccount.id,
      balance: 1000,
    });
  });

  test('50 concurrent requests in one direction succeed', async () => {
    const sourceAccount = await createTestAccount(fastify, {
      amount_minor: 10000,
    });

    const targetAccount = await createTestAccount(fastify, {
      amount_minor: 0,
    });

    const transfers = Array.from({ length: 50 }, (_, i) =>
      fastify.inject(
        buildPostTransferInject({
          idempotency_key: 'concurrent-' + i,
          source_account_id: sourceAccount.id,
          target_account_id: targetAccount.id,
          amount_minor: 100,
        }),
      ),
    );

    const responses = await Promise.all(transfers);

    expect(responses.every((res) => res.statusCode === 201)).toBe(true);

    await verifyTransfersCount(fastify, 50);

    await verifyAccountBalance({
      fastify,
      accountId: sourceAccount.id,
      balance: 5000,
    });

    await verifyAccountBalance({
      fastify,
      accountId: targetAccount.id,
      balance: 5000,
    });
  });

  test('50 concurrent requests in opposite directions succeed', async () => {
    const sourceAccount = await createTestAccount(fastify, {
      amount_minor: 5000,
    });

    const targetAccount = await createTestAccount(fastify, {
      amount_minor: 5000,
    });

    const transfers = Array.from({ length: 50 }, (_, i) =>
      fastify.inject(
        buildPostTransferInject({
          idempotency_key: 'concurrent-' + i,
          source_account_id: i % 2 ? sourceAccount.id : targetAccount.id,
          target_account_id: i % 2 ? targetAccount.id : sourceAccount.id,
          amount_minor: 100,
        }),
      ),
    );

    const responses = await Promise.all(transfers);

    expect(responses.every((res) => res.statusCode === 201)).toBe(true);

    await verifyTransfersCount(fastify, 50);

    await verifyAccountBalance({
      fastify,
      accountId: sourceAccount.id,
      balance: 5000,
    });

    await verifyAccountBalance({
      fastify,
      accountId: targetAccount.id,
      balance: 5000,
    });
  });
});
