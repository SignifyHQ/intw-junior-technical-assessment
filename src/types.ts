export enum AccountType {
  Charge = "charge",
  Controller = "controller",
}

export enum EntryDirection {
  Debit = "debit",
  Credit = "credit",
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
}

export interface Book {
  id: string;
  name: string;
  accountId: string;
}

export interface Entry {
  id: string;
  amount: number;
  direction: EntryDirection;
  bookId: string;
  correspondingEntryId: string;
  createdAt: string;
}

// Serializable snapshot of the entire ledger state for disk persistence
export interface LedgerSnapshot {
  accounts: Account[];
  books: Book[];
  entries: Entry[];
}
