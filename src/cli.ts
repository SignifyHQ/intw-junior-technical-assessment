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

const program = new Command();

program
  .name("ledger")
  .description("In-memory dual-entry ledger CLI")
  .version("1.0.0");

program
  .command("create-account")
  .description("Create a new charge account with pending and posted books")
  .argument("<name>", "Name for the charge account")
  .action((name: string) => {
    ensureControllerAccount();
    const { account } = createChargeAccount(name);
    console.log(`Created charge account "${name}" (${account.id})`);
  });

program
  .command("capture")
  .description("Capture a pending charge (cash -> pending)")
  .argument("<accountId>", "Charge account ID")
  .argument("<amount>", "Amount to capture")
  .action((accountId: string, amountStr: string) => {
    const amount = parseFloat(amountStr);
    const [debit, credit] = capturePendingCharge(accountId, amount);
    console.log(
      `Captured ${amount} on account ${accountId}`,
    );
    console.log(`  Debit entry:  ${debit.id}`);
    console.log(`  Credit entry: ${credit.id}`);
  });

program
  .command("reverse")
  .description("Reverse a pending charge (pending -> cash)")
  .argument("<accountId>", "Charge account ID")
  .argument("<amount>", "Amount to reverse")
  .action((accountId: string, amountStr: string) => {
    const amount = parseFloat(amountStr);
    const [debit, credit] = reversePendingCharge(accountId, amount);
    console.log(
      `Reversed ${amount} on account ${accountId}`,
    );
    console.log(`  Debit entry:  ${debit.id}`);
    console.log(`  Credit entry: ${credit.id}`);
  });

program
  .command("post")
  .description("Post a charge (pending -> posted)")
  .argument("<accountId>", "Charge account ID")
  .argument("<amount>", "Amount to post")
  .action((accountId: string, amountStr: string) => {
    const amount = parseFloat(amountStr);
    const [debit, credit] = postCharge(accountId, amount);
    console.log(
      `Posted ${amount} on account ${accountId}`,
    );
    console.log(`  Debit entry:  ${debit.id}`);
    console.log(`  Credit entry: ${credit.id}`);
  });

program
  .command("clear")
  .description("Clear a posted amount (posted -> cash)")
  .argument("<accountId>", "Charge account ID")
  .argument("<amount>", "Amount to clear")
  .action((accountId: string, amountStr: string) => {
    const amount = parseFloat(amountStr);
    const [debit, credit] = clearAmount(accountId, amount);
    console.log(
      `Cleared ${amount} on account ${accountId}`,
    );
    console.log(`  Debit entry:  ${debit.id}`);
    console.log(`  Credit entry: ${credit.id}`);
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
          `  ${book.name}: balance=${balance}, entries=${entryCount}`,
        );
      }
    }
  });

program.parse();
