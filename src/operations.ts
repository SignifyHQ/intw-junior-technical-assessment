import { randomUUID } from "node:crypto";
import { AccountType } from "./types.js";
import type { Entry } from "./types.js";
import {
  ensureControllerAccount,
  getAccount,
  getBookByName,
  getBookBalance,
  createEntryPair,
} from "./ledger.js";
import { store } from "./store.js";

function getCashBookId(): string {
  return ensureControllerAccount().cashBook.id;
}

function requireChargeAccount(chargeAccountId: string): void {
  const account = getAccount(chargeAccountId);
  if (account.type !== AccountType.Charge) {
    throw new Error(
      `Account ${chargeAccountId} is not a charge account`,
    );
  }
}

/**
 * Capture a pending charge: moves amount from cash into the charge
 * account's pending book. This represents an authorized hold.
 *
 * Dual entries: debit pending, credit cash.
 */
export function capturePendingCharge(
  chargeAccountId: string,
  amount: number,
): [Entry, Entry] {
  requireChargeAccount(chargeAccountId);
  const pendingBook = getBookByName(chargeAccountId, "pending");
  return createEntryPair(pendingBook.id, getCashBookId(), amount);
}

/**
 * Reverse a pending charge: returns a previously held amount from the
 * charge account's pending book back to cash. Used when an authorization
 * is voided before settlement.
 *
 * Dual entries: debit cash, credit pending.
 */
export function reversePendingCharge(
  chargeAccountId: string,
  amount: number,
): [Entry, Entry] {
  requireChargeAccount(chargeAccountId);
  const pendingBook = getBookByName(chargeAccountId, "pending");

  const pendingBalance = getBookBalance(pendingBook.id);
  if (pendingBalance < amount) {
    throw new Error(
      `Insufficient pending balance: have ${pendingBalance}, need ${amount}`,
    );
  }

  return createEntryPair(getCashBookId(), pendingBook.id, amount);
}

/**
 * Post a charge: finalizes a pending amount by moving it from the
 * charge account's pending book to its posted book. This represents
 * settlement of the authorized hold.
 *
 * Dual entries: debit posted, credit pending.
 */
export function postCharge(
  chargeAccountId: string,
  amount: number,
): [Entry, Entry] {
  requireChargeAccount(chargeAccountId);
  const pendingBook = getBookByName(chargeAccountId, "pending");
  const postedBook = getBookByName(chargeAccountId, "posted");

  const pendingBalance = getBookBalance(pendingBook.id);
  if (pendingBalance < amount) {
    throw new Error(
      `Insufficient pending balance: have ${pendingBalance}, need ${amount}`,
    );
  }

  return createEntryPair(postedBook.id, pendingBook.id, amount);
}

/**
 * Clear a posted amount: moves a settled charge from the charge
 * account's posted book back to cash. This represents the final
 * disbursement / clearing of funds.
 *
 * Dual entries: debit cash, credit posted.
 */
export function clearAmount(
  chargeAccountId: string,
  amount: number,
): [Entry, Entry] {
  requireChargeAccount(chargeAccountId);
  const postedBook = getBookByName(chargeAccountId, "posted");

  const postedBalance = getBookBalance(postedBook.id);
  if (postedBalance < amount) {
    throw new Error(
      `Insufficient posted balance: have ${postedBalance}, need ${amount}`,
    );
  }

  return createEntryPair(getCashBookId(), postedBook.id, amount);
}

/**
 * Refund a posted charge: returns a previously settled amount from the
 * charge account's posted book back to cash. Supports full and partial
 * refunds against the same original entry.
 *
 * originalEntryId must be the debit entry from a prior postCharge call
 * on this account's posted book — this link is stored on both new entries
 * as `refundOf` for audit purposes. A shared `refundId` groups the pair.
 *
 * Dual entries: debit cash, credit posted.
 */
export function refundPostedCharge(
  chargeAccountId: string,
  amount: number,
  originalEntryId: string,
): [Entry, Entry] {
  requireChargeAccount(chargeAccountId);
  const postedBook = getBookByName(chargeAccountId, "posted");

  const originalEntry = store.entries.get(originalEntryId);
  if (!originalEntry || originalEntry.bookId !== postedBook.id) {
    throw new Error(
      `Entry ${originalEntryId} not found in posted book of account ${chargeAccountId}`,
    );
  }

  const postedBalance = getBookBalance(postedBook.id);
  if (postedBalance < amount) {
    throw new Error(
      `Insufficient posted balance: have ${postedBalance}, need ${amount}`,
    );
  }

  const refundId = randomUUID();
  return createEntryPair(getCashBookId(), postedBook.id, amount, refundId, originalEntryId);
}
