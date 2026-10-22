# Financial Backend

## What it does

A small REST API for reading account balances and transferring money between accounts in the same currency. This backend learning project focuses on database consistency, concurrent balance updates, and safe request retries.

## Architecture

**Stack:** TypeScript, Node.js, Fastify, PostgreSQL, and `pg`.

```mermaid
flowchart LR
  Client --> Routes["Fastify routes and JSON Schema validation"]
  Routes --> Handlers["Account and transfer handlers"]
  Handlers --> Pool["PostgreSQL connection pool"]
  Pool --> Database["Accounts, currencies, transfers"]
```

- `src/index.ts` registers the database and route plugins and starts the server.
- `src/plugins/routes/schemas/` defines request validation; TypeScript request types are derived from the schemas.
- Handler factories receive the Fastify instance, keeping route registration separate from database operations.
- SQL migrations define accounts, currencies, transfers, constraints, and a trigger that prevents account currency changes.
- A transfer inserts its record, locks both accounts in ID order, debits the source, credits the target, and commits within one transaction.

| Endpoint | Behavior |
| --- | --- |
| `GET /accounts/:id` | Returns an account, or `404` when it does not exist. |
| `POST /transfers` | Requires an `Idempotency-Key` header; returns `201` for a new transfer. |
| Repeated transfer request | Returns `200` with the original transfer ID when the key and payload match; `409` when the key is reused with different details. |

## Engineering challenges

- **Concurrent transfers:** the handler requests account row locks in ID order to coordinate balance updates. Lock interactions under contention remain an area for improvement; see the current limitations below.
- **Atomic balance changes:** the transfer record, debit, and credit share a transaction, so a failed operation rolls back the entire transfer.
- **Retry safety:** a unique database constraint arbitrates duplicate idempotency keys, including competing requests. After rollback, the handler compares the stored transfer with the requested payload.
- **Money representation:** balances and transfers use integer minor units in PostgreSQL `bigint` columns. The request schema currently caps each transfer at `2147483647`; PostgreSQL bigint values returned by `pg` are strings by default.
- **Database invariants:** nonnegative balances, positive transfer amounts, distinct accounts, and matching currencies are enforced by constraints as well as request validation where applicable.

These mechanisms are implemented in the code; an automated concurrency test suite has not yet been added.

## How to run it

Prerequisites: Node.js 22.12+ with npm, a running PostgreSQL server, and the `psql` CLI. Use an empty development database.

```bash
git clone https://github.com/aleksanderantropov/financial-backend.git
cd financial-backend
npm install
createdb financial_backend
```

Create a local `.env` file, adjusting credentials for your PostgreSQL installation:

```dotenv
DATABASE_URL=postgresql://localhost:5432/financial_backend
PORT=3000
```

Set the same connection URL in your shell for the database commands:

```bash
export DATABASE_URL='postgresql://localhost:5432/financial_backend'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/migrations/001_initial.sql
```

Currency and account fixtures are defined in `src/migrations/002_seed_currencies.sql` and `src/seeds/development.sql`. Their current syntax issue is listed under [Current limitations](#current-limitations); prepare valid currency and account records before trying transfers.

```bash
npm run dev
```

The server listens locally on port 3000 by default. For a compiled run:

```bash
npm run typecheck
npm run build
npm start
```

### Try the API

These examples assume two USD accounts with IDs 1 and 2, and at least 500 minor units in the source account:

```bash
curl http://localhost:3000/accounts/1

curl -X POST http://localhost:3000/transfers \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-transfer-1' \
  -d '{"source_account_id":1,"target_account_id":2,"amount_minor":500,"currency_code":"USD"}'
```

Repeat the POST with the same key and body to retrieve the original transfer ID without moving money again. Fetch both accounts to inspect the updated balances.

## Current limitations

- Only balance lookup and same-currency transfers are exposed. Account creation, authentication, authorization, transaction history, and currency conversion are not implemented.
- Insufficient funds and several database failures currently surface as generic server errors. Map these to explicit domain errors and documented HTTP responses.
- Concurrent distinct transfers can currently return server errors under contention. Review the interaction between transfer foreign-key checks and account row locks.
- Integration tests remain planned, with concurrent transfers and idempotent retries as priorities, followed by rollback, invalid currencies, and insufficient funds.
- The currency and development-account seed scripts are missing a semicolon after `BEGIN` and cannot currently run as written. Migration automation and a reproducible database setup remain future work.
- Add operational controls such as graceful shutdown, request limits, and deadlock retry handling before expanding deployment scope.
