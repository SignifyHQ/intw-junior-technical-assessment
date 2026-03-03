#!/usr/bin/env node

import { Command } from "commander";
import { store } from "./store.js";
import { AccountType } from "./types.js";
import {
  createChargeAccount,
  ensureControllerAccount,
  getBookByName,
  getBookBalance,
} from "./ledger.js";
import {
  capturePendingCharge,
  reversePendingCharge,
  postCharge,
  clearAmount,
} from "./operations.js";
import { getSupportedCurrencies } from "./currency.js";

const program = new Command();

program
  .name("ledger")
  .description("In-memory dual-entry ledger CLI with multi-currency support")
  .version("2.0.0");

program
  .command("create-account")
  .description("Create a new charge account with pending and posted books")
  .argument("<name>", "Name for the charge account")
  .option("--currency <code>", "Currency for the account", "USD")
  .action((name: string, opts: { currency: string }) => {
    ensureControllerAccount();
    const { account } = createChargeAccount(name, opts.currency);
    console.log(`Created charge account "${name}" [${opts.currency}] (${account.id})`);
  });

program
  .command("capture")
  .description("Capture a pending charge (cash -> pending)")
  .argument("<accountId>", "Charge account ID")
  .argument("<amount>", "Amount to capture")
  .option("--currency <code>", "Transaction currency")
  .action((accountId: string, amountStr: string, opts: { currency?: string }) => {
    const amount = parseFloat(amountStr);
    const [debit, credit] = capturePendingCharge(accountId, amount, opts.currency);
    console.log(
      `Captured ${amount} ${opts.currency ?? "USD"} on account ${accountId}`,
    );
    console.log(`  Debit entry:  ${debit.id}`);
    console.log(`  Credit entry: ${credit.id}`);
  });

program
  .command("reverse")
  .description("Reverse a pending charge (pending -> cash)")
  .argument("<accountId>", "Charge account ID")
  .argument("<amount>", "Amount to reverse")
  .option("--currency <code>", "Transaction currency")
  .action((accountId: string, amountStr: string, opts: { currency?: string }) => {
    const amount = parseFloat(amountStr);
    const [debit, credit] = reversePendingCharge({
      chargeAccountId: accountId,
      amount,
      currency: opts.currency,
    });
    console.log(
      `Reversed ${amount} ${opts.currency ?? "USD"} on account ${accountId}`,
    );
    console.log(`  Debit entry:  ${debit.id}`);
    console.log(`  Credit entry: ${credit.id}`);
  });

program
  .command("post")
  .description("Post a charge (pending -> posted)")
  .argument("<accountId>", "Charge account ID")
  .argument("<amount>", "Amount to post")
  .option("--currency <code>", "Transaction currency")
  .action((accountId: string, amountStr: string, opts: { currency?: string }) => {
    const amount = parseFloat(amountStr);
    const [debit, credit] = postCharge(accountId, amount, opts.currency);
    console.log(
      `Posted ${amount} ${opts.currency ?? "USD"} on account ${accountId}`,
    );
    console.log(`  Debit entry:  ${debit.id}`);
    console.log(`  Credit entry: ${credit.id}`);
  });

program
  .command("clear")
  .description("Clear a posted amount (posted -> cash)")
  .argument("<accountId>", "Charge account ID")
  .argument("<amount>", "Amount to clear")
  .option("--currency <code>", "Transaction currency")
  .action((accountId: string, amountStr: string, opts: { currency?: string }) => {
    const amount = parseFloat(amountStr);
    const [debit, credit] = clearAmount({
      chargeAccountId: accountId,
      amount,
      currency: opts.currency,
    });
    console.log(
      `Cleared ${amount} ${opts.currency ?? "USD"} on account ${accountId}`,
    );
    console.log(`  Debit entry:  ${debit.id}`);
    console.log(`  Credit entry: ${credit.id}`);
  });

program
  .command("currencies")
  .description("List supported currencies")
  .action(() => {
    console.log("Supported currencies:", getSupportedCurrencies().join(", "));
  });

program
  .command("status")
  .description("Show all accounts and their book balances")
  .action(() => {
    ensureControllerAccount();

    for (const account of store.accounts.values()) {
      console.log(`\n${account.name} (${account.type}) [${account.id}]`);
      const books = store.booksForAccount(account.id);
      for (const book of books) {
        const balance = getBookBalance(book.id);
        const entryCount = store.entriesForBook(book.id).length;
        console.log(
          `  ${book.name} [${book.currency}]: balance=${balance}, entries=${entryCount}`,
        );
      }
    }
  });

program.parse();
