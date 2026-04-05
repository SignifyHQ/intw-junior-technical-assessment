# Assessment Writeup

## Initial Thoughts

**Task 1:** off by a few cents at a scale of several million dollars indicates that the logic must be sound, but there may a minor error in implementation.

**Task 2:** i'll probably have to take a look at way that the values are kept consistent, and how the currency is managed, i haven't read the way it works yet, but im guessing some sort of string or enum is used to track the currency in an easily legible way, such as "USD" or "YEN". there would also have to be some sort of conversion logic that's accesible to the codebase at either the point of entry or at the point of exit. ill put extra attention on the way that the code handles the value throughout the process and validation that it still equals the original amount.

**Task 3:** this feature will likely require a new function to be added, as well as the leverage of an either already existing or new method for tracking transactions. if the tracking is already in place, via json or some logging system, then it will come down to adding logic for accessing the transaction and reversing it, which would manipulate and read. if not, this will have to be implemented, which will take considerations on the type of data structure used, and access points for the data, especially for security reasons, as this manages financial data. id lean towards a more atomic process to ensure functionality, for ease of debugging, ill review the payment system and emulate its typing to ensure DRY code.

---

## Task 1 — Balance Rounding Bug

- i see that there is a `ledgerSnapshot` in index, indicating some sort of state management
- to see how the accounts are off by a few cents, i need to view the account balance after making a few transactions, and then compare it to the expected balance. this will help me identify the scale of the error, and give me a starting point to investigate, by iteratively checking each function for an amount of times to see if the error is consistent and reproducible.
- i quickly created a small python script to run the ledger npm functions, but more importantly, to give me a way to easily test scenarios which would induce normal usage, rather than have to manually run the functions repeatedly or in a certain manner to induce results that i'm expecting. this will allow me to quickly identify the error. i first started by adding several scenarios which would be common usage, and then a method to view the balance and status' of the accounts after running the scenarion to both give me a better idea of how the entire program works, and to see if there are any immediate disparities that pop out to me.
- after running the first scenario, i noticed the value not being properly passed, or better said, held, i immediately replaced the value with `bigint` in order to verify if it worked
- after changing the line number to `bigint`, there is still some slight drift in some transactions. i recalled from previous experience with Stripe that it's better to handle monetary values with no floating point at all, and to use integers to represent the smallest unit of currency, such as cents, in order to avoid floating point errors.
- to apply this change, i need to identify the entry and exit points of the value, and make sure that the value properly converted so the internal function doesn't expose itself
- i replaced instances of `const amount = parseFloat(amountStr);` with `const amount = BigInt(Math.round(parseFloat(amountStr) * 100));` to convert the amount to cents and store it as an integer, which should eliminate the floating point errors and ensure that the balances are accurate to the cent. this led to a silent error in the attempted scenario with every instance, where a total number of 0 entries was being added to the account book
- i found that the error was due to the fact that the reduce was being calculated as a number, so i simply appended `n` to the entry value and it assumed that the value was a bigint, and the reduce properly executed.
- i see that it's still not passing, so i need to investigate entries and see why it's swallowing the value
- the `bigint` was causing severe issues at the write level — it silently broke persistence entirely. `JSON.stringify` throws a `TypeError` on bigint values, so `store.save()` was failing and no entries were being written to disk. the status command showed 0 entries and 0 balance because the data was never stored.
- i found the source of the error, after tracking it down in `store.ts` (since i suspected the write), i had two decisions:
  1. remove the previously implemented `bigint` and return to `number`, then add the new magnitude logic
  2. keep the `bigint` as a safety measure
- i decided to remove the `bigint`, as the write fix was stretching the initial scope off track. as the fallback would have no immediate impact or scenario where it would apply, i left the idea and went for the more straightforward fix, reversing the bigint change and implementing the magnitude change, where the value is multipled to convert it to cents.
- i ran into another error for the reverse function, this was caused by not applying the cents conversion to the refund amount, which caused the value to be treated as a float, when it should be in cents, which collided with the balance check `(x < y)`.
- after confirming the float conversion approach worked, the inline conversion logic (`Math.round(parseFloat(amountStr) * 100)` and `(balance / 100).toFixed(2)`) was present in 4 places in `cli.ts`. to avoid duplication and make the conversion a single point of change, two helper functions were added to `ledger.ts`: `toCents(dollars: number): number` and `toDollars(cents: number): string`. all commands in `cli.ts` now call these instead of inlining the math.
- a stale data problem was also surfaced during testing: `.ledger-data.json` written under the old float convention (e.g., `amount: 100.7` meaning $100.70) is incompatible with the new cents convention (`amount: 10070` meaning $100.70 in cents). the store has no version field, so it loads stale data without warning and the balance checks then operate on mismatched magnitudes. the immediate fix was to delete `.ledger-data.json` when changing the amount convention. as i don't have access to a schema or versioning, and don't want to bloat the task too much, i left it as is.
- **final verified state:** scenario_B (`capture $100.70 → reverse $25.25 → post $75.45 → clear $75.45`) ran clean with status checks at every step. all intermediate balances matched expectations exactly, and all books settled to `$0.00` at completion with no floating-point drift. the dual-entry invariant held throughout: `cash + pending + posted = $0.00` at every step.

---

## Task 2 — Multi-Currency PR Review

- immediately im thinking about how the currency is going to integrate with the new atomic `toCent` and `toDollar` function, since `toDollar` naturally implies that it's USD. i might consider changing the name to something more generic.

### `src/cli.ts`

- i see the reference to the new file for currency management (`line 18`)
- versioning is not within my scope of authority, but i see that this is now `v2.0.0` (`line 25`)
- new `opts` parameter for currency is added, im wondering what the default is if it's not provided, and how that's handled (`line 43`)
- this parameter extends to every instance of the command being run, including documentation with `book.currency`
- the PR does not apply the task 1 fix here — all commands still use raw `parseFloat(amountStr)` without going through `toCents`, meaning the floating point issue we just fixed is immediately reintroduced at the entry point of every command (`lines 45, 61, 81, 97`)
- the fallback display `opts.currency ?? "USD"` is hardcoded as a string — if the default ever changes or a new base currency is introduced, this would silently show the wrong currency in the output without any compile time warning (`lines 48, 68, 84, 104`)

### `src/currency.ts`

- default on USD (`line 3`)
- exchange rates are hard coded, im wondering how these would be easily changed, is the user of this system always considered admin, that would change the concept of a getter and setter directly in this program (`lines 5–12`)
- there's a getter, but i don't see a setter, meaning that the update of the exchange rates would have to be done by a code change, which wouldn't work for production. (`lines 5–12`)
- i see `amount`, which means ill have to change a line to put in `toDollar` and `toCent`, which will be a bit off from the original PR, but it'll be clean (`line 23`)
- to me, the real impact is at the `fromRate` and `toRate`, where the conversion actually happens. if i can get `toCent` before then, it won't impact it at all, as it's a ratio rather than a value. (`lines 29–30`)
- `getBookCurrency` is reading `book.currencyCode` via a `(book as any)` cast, but the field added to the interface in `types.ts` is `book.currency` — these don't match, so the function always returns `undefined` and falls back to USD on every call. the `any` cast is what's hiding this, since typescript would have caught the mismatch immediately otherwise. practically speaking this means the entire currency feature is a no-op on the current code (`line 19`)
- `isValidCurrency` is exported but never actually called anywhere internally — `createBook` and `createChargeAccount` both accept any string for currency without checking it, so an invalid code like `"XYZ"` gets persisted silently and only blows up deep inside `convertAmount` during a transaction, well after the state has already been written (`lines 42–44`)
- none of the exports have JSDoc. the rest of the codebase documents every exported function, and `convertAmount` especially has non-obvious semantics (USD as the base pivot, what the rate table represents) that would benefit from a comment (`lines 14, 18, 22, 42`)
- all four exports are arrow functions assigned to `const`. the rest of the codebase uses function declarations throughout — `ledger.ts`, `operations.ts`, all consistent. this file introduces a different style with no reason for it (`lines 14, 18, 22, 42`)

### `src/index.ts`

- currency exported
- the new exports follow the existing explicit named export pattern rather than a wildcard, which is correct and consistent with the rest of the file

### `src/ledger.ts`

- to implement exchange rate conversion at the book level, it seems that they added getters and converters for the currency, to ensure that there is no conflict (`lines 69–71`)
- `amount` is now defined more specifically as the debit/credit amount, to differentiate it from the currency, as there can now be a new case where each book has a different currency, and therefore the amounts aren't directly comparable without conversion (`lines 73–74`)
- cashbook automatically set to USD, which is, to my understanding, global standard. but this would need different handling for regions or instances that require a different currency. either this is a policy level decision where they need to engage in a conversion at init, or the system needs to be able to handle different currencies at init. a non issue as there is no blocking state, but merely an extra step for a conceived case. (`line 135`)
- `createEntryPair` now calculates a separate `debitAmount` and `creditAmount` when books are in different currencies, so the two entries in a pair no longer carry the same value. the whole system runs on the invariant that each debit has an equal and opposite credit — `getBookBalance` does `sum(debits) - sum(credits)` with no currency context, so balances become meaningless on any cross-currency transaction and the `cash + pending + posted = $0` guarantee breaks (`lines 73–74, 82, 92`)
- `createBook` writes any string for currency straight to the store without calling `isValidCurrency` — an unsupported code silently persists and only throws during a transaction, which is too late (`lines 27–29`)
- any existing `.ledger-data.json` will hydrate with `currency: undefined` on all books since the field is new. there's no migration or version check. the `getBookCurrency` bug papers over this right now, but if either bug were fixed independently the other would surface (`line 29`)

### `src/opertaions.ts`

- matching each function to handle the new currency parameter (`lines 33, 50, 75, 101`)
- `reversePendingCharge` and `clearAmount` were changed from function declarations to arrow functions assigned to `const`, while `capturePendingCharge` and `postCharge` kept the existing style. all four are parallel operations in the same file and there's no reason to split them — the existing codebase uses function declarations consistently throughout and this introduces a style divergence with no justification (`lines 47, 98` vs `lines 30, 72`)
- the balance guard compares the book's stored balance against the incoming `opts.amount` without converting either to a common currency first. if a EUR account was captured with USD, the pending book holds roughly 92 EUR, and reversing $100 USD hits `92 < 100` and incorrectly throws insufficient balance even though the funds are there. same issue in `clearAmount` (`lines 56, 107`)

### `src/types.ts`

- issuing new types
- `currency` is added as a plain `string` on both `Book` and `Entry`. the existing pattern for categoricals is enums — `AccountType` and `EntryDirection` both follow this. a typed enum or union for currency codes would be more consistent and would let typescript catch typos like `"eur"` or `"UUSD"` at compile time instead of runtime (`lines 21, 27`)
- `currency` on `Entry` appears to be dead data — nothing in the codebase reads `entry.currency` for any logic or display. the book the entry belongs to already carries the currency, so this is a redundant field that adds weight to persistence without any functional payoff (`line 27`)

### `README.md`

- confirmation that the default is intentionally USD as observed earlier (`line 9`)
- issued new API for getting the list of supported currencies that the system can handle (`line 60`)
- the example code mixes two different calling styles for the same charge lifecycle in the same snippet: `postCharge(account.id, 100.50, "EUR")` uses positional params, `clearAmount({ chargeAccountId: account.id, amount: 100.50, currency: "EUR" })` uses an options object. someone reading this would reasonably assume the API is consistent across all four operations (`lines 90, 93`)
- the examples use raw floats like `100.50` rather than cents, which directly contradicts the task 1 fix and would produce float drift if run as written (`lines 87, 90, 93`)

### Technical Faults Summary

- there's a field name mismatch where the currency is being passed `currencyCode` in `src/currency.ts` but as `currency` in `src/types.ts`. this also highlights the `(book as any)` that suppresses the major advantage of typescript, which is the type safety. i believe this would default to USD on every instance. not destructive, but it conflicts with the intention of the PR's new feature. (`currency.ts line 19`, `types.ts line 21`)
- although i agree with the decision to handle the books separately now that they can have different currencies, `getBookBalance` is almost untouched from its export, meaning the intended `sum + entry.amount` is not considering the currency at all. this is just a gap in the implementation. (`ledger.ts lines 111–117`)
- this applies to the last point, as there's another literal comparison of the amount without converting the balance or the `opts.amount`, e.g: `pendingBalance < opts.amount`. i presume this is an assumption that the balance account will be in the same currency, but it now has the possibility of being in a different currency. there is no standardization, such as constant comparison to the USD, which seems to more strongly enforce the default and would facilitate easier conversion. that would bring up conversion logistics, as it would always need to pass through USD, but since it currently defaults and inits as USD, it would be ideal for the current program (`operations.ts lines 56, 107`)
- the use of the floating point division would cause more exacerbated issues than what occurred in the original task, as division would cause more significant floating point errors than addition and/or subtraction. the use of the `toCent` and `toDollar` would need flooring or rounding to ensure that the value is properly converted and maintained, since the combination of the exchange rate and the float could cause drift in the price. the magnitude change (`*100`) would reduce this, but it would be ideal to cite industry standard, such as Stripe's approach, which is to only convert at entry and exit to ensure that the internal logic is always working with the larger integers, which would reduce the amount of floating point math throughout the process. (`currency.ts lines 38–39`)
- i believe there is an inconsistency with the adhering addition of currency to some of the functions. `reversePendingCharge` adds `opts` to the currency, but `capturePendingCharge` does not, simply adding `currency` instead of `opts.currency`. (`operations.ts lines 30–38` vs `lines 47–51`)

---

## Task 3 — Refund Support

- i'll scope out the findings on what "refunding" means. as i can't ask directly, i'll infer from the codebase and the general concept of refunds in finance systems. i would assume that this is a process where a charge is reversed, and the money is returned to the user, but it would be ideal to confirm if there are any specific edge cases or requirements for this process, such as partial refunds, time limits, or specific conditions under which a refund can be issued.
- i assume the accounts for which this refund would issue out to would be the same as the charge, but in reverse, meaning it would debit the cash account and credit the pending or posted account, depending on the state of the original charge. this would be a reversal of the original transaction, so it would need to ensure that the dual-entry invariant holds, and that the balances are updated accordingly.
- i would also need to consider how to track the refund in the system, whether it needs to be linked to the original charge for record-keeping and auditing purposes, and how to handle any potential errors or edge cases that could arise during the refund process, such as insufficient funds, invalid charge ID, or attempts to refund a charge that has already been refunded.
- ill compare the already existing reversal logic to see if it can be leveraged for the refund process, as they are conceptually similar in that they both involve reversing a transaction, but refunds may have additional considerations such as the reason for the refund, which ill omit for the current implementation, and whether it's a full or partial refund. if the reversal logic is robust and well-implemented, it could serve as a solid foundation for building the refund feature, ensuring consistency in how transactions are reversed in the system.
- im taking into considerationt the scope of documentation in the ledger, whether it should udpate the charge itself, or make a new entry as mentioned before. a new entry would cause another query, as this is supposed to handle millions of services a day, but but it would be ideal, however this may take going back and ensuring that entry handling isn't hampered by this new field. i;m considering the creation of a new refund id, such as what exists with the charge id. i could add the refund id to the charge id entry, and this would make it conditional to search, and it would be O(N) as it would be for the value, rather than the index, but there doesn't seem to be index management, so this is the status quo, and doesn't divert from the codebase too much.
- ill proceed with the O(N) scan approach, and bring it up as a concern for scalability. if currently, it's already managing millions of transactions, it might be worth an immediate raise up in development, as it's a common use case and it would require a new data type that would benefit the other functions that scan, but isn't within the scope of the current task

### Settled implementation plan
#### src/types.ts
```
Add refundId?: string and refundOf?: string to Entry
```
#### src/ledger.ts — createEntryPair
```
Add refundId?: string and refundOf?: string as optional trailing params
Stamp both on debit and credit entries when provided
```
#### src/operations.ts — add refundPostedCharge
```
export function refundPostedCharge(
  chargeAccountId: string,
  amount: number,
  originalEntryId: string,
): [Entry, Entry] {
  requireChargeAccount(chargeAccountId);
  const postedBook = getBookByName(chargeAccountId, "posted");

  // validate originalEntryId belongs to this posted book
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
```
#### src/index.ts
```
Re-export refundPostedCharge
src/cli.ts

Add ledger refund <accountId> <amount> <originalEntryId> command
Output: refund amount, refundId, both entry IDs
```

## Tools used
- python for scripting scenarios and testing
- claude for PR review line context, implementation guidance, pattern matching, boilerplate generation, and logic verification
- vscode for code navigation and editing
- github for version control and PR management


## Final notes
- the refund implementation is a new function `refundPostedCharge` that creates a new entry pair to reverse a posted charge. it validates the original entry belongs to the posted book, checks for sufficient balance, and generates a unique refund ID. the new fields `refundId` and `refundOf` are added to the `Entry` type to link refunds to their original charges. this approach maintains the dual-entry invariant and allows for tracking refunds without modifying existing charge entries, but it does introduce an O(N) scan to find the original entry, which could be a concern for scalability in a high-volume system.
- the multi-currency PR had several critical issues that undermined the functionality of the feature, such as the currency field mismatch, lack of validation for supported currencies, and failure to consider currency in balance calculations. these issues would need to be addressed to ensure the feature works as intended and doesn't introduce bugs or inconsistencies in the system. the balance rounding bug was effectively fixed by switching to integer cents and adding helper functions for conversion, which is a standard approach in financial software to avoid floating point errors.
Written by Jeshua Linder-Jimenez :)