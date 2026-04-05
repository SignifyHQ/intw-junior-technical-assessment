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
| `refundPostedCharge` | posted → cash | Refund a settled charge (full or partial) |

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

# Refund a posted charge (full or partial)
# originalEntryId is the debit entry ID printed by the `post` command
npm run ledger -- refund <accountId> 50.25 <originalEntryId>

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

## Test Runner

`tests/runner.py` is a Python script that drives the CLI through end-to-end scenarios. It requires no dependencies beyond the standard library — just Python 3 and a built project.

```bash
# Run all scenarios against a clean ledger
rm -f .ledger-data.json && python3 tests/runner.py
```

Four scenarios are included:

| Scenario | What it tests |
|---|---|
| C | Full refund of a posted charge — all books return to zero |
| D | Partial refund — remainder stays in posted |
| E | Invalid refunds — bad entry ID and over-amount, state must be unchanged |
| F | Three partial refunds against the same original entry |

To add a new scenario, define a function in `runner.py` and call it from `__main__`. Use `_run_expect_error` for commands that should fail, and parse entry IDs from `post` output with the returned dict:

```python
entries = post("my-account", 100.00)   # returns {"debit": "...", "credit": "..."}
refund("my-account", 40.00, entries["debit"])
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
