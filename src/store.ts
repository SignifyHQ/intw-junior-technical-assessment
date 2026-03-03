import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Account, Book, Entry, LedgerSnapshot } from "./types.js";

// Persist alongside the project root so the data file stays co-located
// with the codebase and is easy to gitignore.
const DATA_PATH = resolve(process.cwd(), ".ledger-data.json");

class Store {
  accounts = new Map<string, Account>();
  books = new Map<string, Book>();
  entries = new Map<string, Entry>();

  constructor() {
    this.load();
  }

  private load(): void {
    if (!existsSync(DATA_PATH)) return;

    try {
      const raw = readFileSync(DATA_PATH, "utf-8");
      const snapshot: LedgerSnapshot = JSON.parse(raw);

      for (const account of snapshot.accounts) {
        this.accounts.set(account.id, account);
      }
      for (const book of snapshot.books) {
        this.books.set(book.id, book);
      }
      for (const entry of snapshot.entries) {
        this.entries.set(entry.id, entry);
      }
    } catch {
      // Corrupted file is treated as a fresh start rather than crashing
    }
  }

  save(): void {
    const snapshot: LedgerSnapshot = {
      accounts: [...this.accounts.values()],
      books: [...this.books.values()],
      entries: [...this.entries.values()],
    };
    writeFileSync(DATA_PATH, JSON.stringify(snapshot, null, 2));
  }

  // Convenience accessors for looking up books that belong to a given account
  booksForAccount(accountId: string): Book[] {
    return [...this.books.values()].filter((b) => b.accountId === accountId);
  }

  entriesForBook(bookId: string): Entry[] {
    return [...this.entries.values()].filter((e) => e.bookId === bookId);
  }
}

// Singleton — the entire app shares one store instance so all
// operations see a consistent view of the ledger state.
export const store = new Store();
