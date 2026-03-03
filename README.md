# Dual-Entry Ledger

An in-memory, single-currency dual-entry ledger built in TypeScript. Every financial operation produces exactly two entries — a debit and a credit — ensuring the books always balance.

## Concepts

**Accounts** come in two types:

- **Controller** — a system-level account that holds a single **cash** book. Created automatically on first use.
- **Charge** — a user-created account with two books: **pending** (authorized holds) and **posted** (settled charges).

**Books** belong to an account and contain entries. Each book's balance is the sum of its debits minus its credits.

**Entries** always exist in pairs. Every entry references its corresponding entry in the other book, preserving the dual-entry invariant.

## Operations

| Function | Direction | Purpose |
|---|---|---|
| `capturePendingCharge` | cash → pending | Authorize a hold on funds |
| `reversePendingCharge` | pending → cash | Void an authorization before settlement |
| `postCharge` | pending → posted | Settle a held charge |
| `clearAmount` | posted → cash | Disburse / clear settled funds |

## Setup

```bash
npm install
```

## CLI Usage

Run commands via `npm run ledger`:

```bash
# Create a charge account
npm run ledger -- create-account "merchant-acme"

# Capture a pending charge of 100.50
npm run ledger -- capture <accountId> 100.50

# Reverse a pending charge
npm run ledger -- reverse <accountId> 50.25

# Post a charge (move from pending to posted)
npm run ledger -- post <accountId> 50.25

# Clear a posted amount (move from posted to cash)
npm run ledger -- clear <accountId> 50.25

# View all account balances
npm run ledger -- status
```

## Programmatic API

```typescript
import {
  createChargeAccount,
  ensureControllerAccount,
  capturePendingCharge,
  reversePendingCharge,
  postCharge,
  clearAmount,
  getBookBalance,
} from "intw-junior-technical-assessment";

// Controller account is created automatically
ensureControllerAccount();

// Create a charge account (provisions pending + posted books)
const { account } = createChargeAccount("merchant-acme");

// Authorize a hold
capturePendingCharge(account.id, 100.50);

// Settle the charge
postCharge(account.id, 100.50);

// Disburse
clearAmount(account.id, 100.50);
```

## Persistence

Ledger state is stored in `.ledger-data.json` in the working directory. This file is gitignored. Delete it to reset the ledger to a clean state.

## Architecture

```
src/
  types.ts        Type definitions (Account, Book, Entry)
  store.ts        In-memory store with JSON disk persistence
  ledger.ts       Core engine (create accounts/books, paired entries, balances)
  operations.ts   The four charge lifecycle operations
  index.ts        Package entry point (re-exports public API)
  cli.ts          Commander-based CLI
```
