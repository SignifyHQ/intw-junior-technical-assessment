# Dual-Entry Ledger

An in-memory, multi-currency dual-entry ledger built in TypeScript. Every financial operation produces exactly two entries — a debit and a credit — ensuring the books always balance.

## Concepts

**Accounts** come in two types:

- **Controller** — a system-level account that holds a single **cash** book (USD). Created automatically on first use.
- **Charge** — a user-created account with two books: **pending** (authorized holds) and **posted** (settled charges). Each charge account operates in a specified currency.

**Books** belong to an account and contain entries. Each book has an associated currency and its balance is the sum of its debits minus its credits.

**Entries** always exist in pairs. Every entry references its corresponding entry in the other book, preserving the dual-entry invariant. When books are in different currencies, amounts are converted at the current exchange rate.

**Currencies** — the system supports USD, EUR, GBP, JPY, CAD, and AUD. Cross-currency operations convert amounts using built-in exchange rates relative to USD.

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
# Create a charge account (defaults to USD)
npm run ledger -- create-account "merchant-acme"

# Create a charge account in EUR
npm run ledger -- create-account "merchant-eu" --currency EUR

# Capture a pending charge of 100.50
npm run ledger -- capture <accountId> 100.50

# Capture in a specific currency
npm run ledger -- capture <accountId> 100.50 --currency EUR

# Reverse a pending charge
npm run ledger -- reverse <accountId> 50.25

# Post a charge (move from pending to posted)
npm run ledger -- post <accountId> 50.25

# Clear a posted amount (move from posted to cash)
npm run ledger -- clear <accountId> 50.25

# List supported currencies
npm run ledger -- currencies

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
  getSupportedCurrencies,
} from "intw-junior-technical-assessment";

// Controller account is created automatically
ensureControllerAccount();

// Create a charge account in EUR
const { account } = createChargeAccount("merchant-eu", "EUR");

// Authorize a hold
capturePendingCharge(account.id, 100.50, "EUR");

// Settle the charge
postCharge(account.id, 100.50, "EUR");

// Disburse
clearAmount({ chargeAccountId: account.id, amount: 100.50, currency: "EUR" });
```

## Persistence

Ledger state is stored in `.ledger-data.json` in the working directory. This file is gitignored. Delete it to reset the ledger to a clean state.

## Architecture

```
src/
  types.ts        Type definitions (Account, Book, Entry)
  store.ts        In-memory store with JSON disk persistence
  currency.ts     Currency conversion and exchange rates
  ledger.ts       Core engine (create accounts/books, paired entries, balances)
  operations.ts   The four charge lifecycle operations
  index.ts        Package entry point (re-exports public API)
  cli.ts          Commander-based CLI
```
