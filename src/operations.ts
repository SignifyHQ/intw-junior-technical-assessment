import { AccountType } from "./types.js";
import type { Entry } from "./types.js";
import {
  ensureControllerAccount,
  getAccount,
  getBookByName,
  getBookBalance,
  createEntryPair,
} from "./ledger.js";

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
  currency?: string,
): [Entry, Entry] {
  requireChargeAccount(chargeAccountId);
  const pendingBook = getBookByName(chargeAccountId, "pending");
  return createEntryPair(pendingBook.id, getCashBookId(), amount, currency);
}

/**
 * Reverse a pending charge: returns a previously held amount from the
 * charge account's pending book back to cash. Used when an authorization
 * is voided before settlement.
 *
 * Dual entries: debit cash, credit pending.
 */
export const reversePendingCharge = (opts: {
  chargeAccountId: string;
  amount: number;
  currency?: string;
}): [Entry, Entry] => {
  requireChargeAccount(opts.chargeAccountId);
  const pendingBook = getBookByName(opts.chargeAccountId, "pending");

  const pendingBalance = getBookBalance(pendingBook.id);
  if (pendingBalance < opts.amount) {
    throw new Error(
      `Insufficient pending balance: have ${pendingBalance}, need ${opts.amount}`,
    );
  }

  return createEntryPair(getCashBookId(), pendingBook.id, opts.amount, opts.currency);
};

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
  currency?: string,
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

  return createEntryPair(postedBook.id, pendingBook.id, amount, currency);
}

/**
 * Clear a posted amount: moves a settled charge from the charge
 * account's posted book back to cash. This represents the final
 * disbursement / clearing of funds.
 *
 * Dual entries: debit cash, credit posted.
 */
export const clearAmount = (opts: {
  chargeAccountId: string;
  amount: number;
  currency?: string;
}): [Entry, Entry] => {
  requireChargeAccount(opts.chargeAccountId);
  const postedBook = getBookByName(opts.chargeAccountId, "posted");

  const postedBalance = getBookBalance(postedBook.id);
  if (postedBalance < opts.amount) {
    throw new Error(
      `Insufficient posted balance: have ${postedBalance}, need ${opts.amount}`,
    );
  }

  return createEntryPair(getCashBookId(), postedBook.id, opts.amount, opts.currency);
};
