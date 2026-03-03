import { randomUUID } from "node:crypto";
import { store } from "./store.js";
import { AccountType, EntryDirection } from "./types.js";
import type { Account, Book, Entry } from "./types.js";
import { convertAmount, getBookCurrency } from "./currency.js";

// ── Account helpers ──────────────────────────────────────────────

export function createAccount(name: string, type: AccountType): Account {
  const account: Account = { id: randomUUID(), name, type };
  store.accounts.set(account.id, account);
  store.save();
  return account;
}

export function getAccount(accountId: string): Account {
  const account = store.accounts.get(accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);
  return account;
}

// ── Book helpers ─────────────────────────────────────────────────

export function createBook(
  name: string,
  accountId: string,
  currency: string = "USD",
): Book {
  const book: Book = { id: randomUUID(), name, accountId, currency };
  store.books.set(book.id, book);
  store.save();
  return book;
}

export function getBookByName(accountId: string, bookName: string): Book {
  const book = store
    .booksForAccount(accountId)
    .find((b) => b.name === bookName);
  if (!book)
    throw new Error(
      `Book "${bookName}" not found on account ${accountId}`,
    );
  return book;
}

// ── Entry helpers ────────────────────────────────────────────────

/**
 * Creates a matched pair of entries — the fundamental dual-entry invariant.
 * Every financial movement touches exactly two books: one receives a debit,
 * the other a credit, for the same amount. When books are in different
 * currencies, the amount is converted at the current exchange rate.
 */
export function createEntryPair(
  debitBookId: string,
  creditBookId: string,
  amount: number,
  currency?: string,
): [Entry, Entry] {
  if (amount <= 0) throw new Error("Entry amount must be positive");

  const debitBook = store.books.get(debitBookId);
  const creditBook = store.books.get(creditBookId);

  if (!debitBook || !creditBook) {
    throw new Error("One or both books not found");
  }

  const entryCurrency = currency ?? getBookCurrency(debitBook);
  const debitCurrency = getBookCurrency(debitBook);
  const creditCurrency = getBookCurrency(creditBook);

  const debitAmount = convertAmount(amount, entryCurrency, debitCurrency);
  const creditAmount = convertAmount(amount, entryCurrency, creditCurrency);

  const debitId = randomUUID();
  const creditId = randomUUID();
  const now = new Date().toISOString();

  const debit: Entry = {
    id: debitId,
    amount: debitAmount,
    currency: debitCurrency,
    direction: EntryDirection.Debit,
    bookId: debitBookId,
    correspondingEntryId: creditId,
    createdAt: now,
  };

  const credit: Entry = {
    id: creditId,
    amount: creditAmount,
    currency: creditCurrency,
    direction: EntryDirection.Credit,
    bookId: creditBookId,
    correspondingEntryId: debitId,
    createdAt: now,
  };

  store.entries.set(debitId, debit);
  store.entries.set(creditId, credit);
  store.save();

  return [debit, credit];
}

/**
 * Net balance of a book: sum of debits minus sum of credits.
 * A positive balance means the book holds value; negative means it owes.
 */
export function getBookBalance(bookId: string): number {
  return store.entriesForBook(bookId).reduce((sum, entry) => {
    return entry.direction === EntryDirection.Debit
      ? sum + entry.amount
      : sum - entry.amount;
  }, 0);
}

// ── Bootstrap ────────────────────────────────────────────────────

const CONTROLLER_ACCOUNT_NAME = "controller";
const CASH_BOOK_NAME = "cash";

export function ensureControllerAccount(): { account: Account; cashBook: Book } {
  const existing = [...store.accounts.values()].find(
    (a) => a.type === AccountType.Controller,
  );

  if (existing) {
    const cashBook = getBookByName(existing.id, CASH_BOOK_NAME);
    return { account: existing, cashBook };
  }

  const account = createAccount(CONTROLLER_ACCOUNT_NAME, AccountType.Controller);
  const cashBook = createBook(CASH_BOOK_NAME, account.id, "USD");
  return { account, cashBook };
}

export function createChargeAccount(
  name: string,
  currency: string = "USD",
): {
  account: Account;
  pendingBook: Book;
  postedBook: Book;
} {
  const account = createAccount(name, AccountType.Charge);
  const pendingBook = createBook("pending", account.id, currency);
  const postedBook = createBook("posted", account.id, currency);
  return { account, pendingBook, postedBook };
}
