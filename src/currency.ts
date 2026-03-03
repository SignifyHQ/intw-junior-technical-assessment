import type { Book } from "./types.js";

const BASE_CURRENCY = "USD";

const exchangeRates: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.50,
  CAD: 1.36,
  AUD: 1.53,
};

export const getSupportedCurrencies = (): string[] => {
  return Object.keys(exchangeRates);
};

export const getBookCurrency = (book: Book): string => {
  return (book as any).currencyCode as string ?? BASE_CURRENCY;
};

export const convertAmount = (
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): number => {
  if (fromCurrency === toCurrency) return amount;

  const fromRate = exchangeRates[fromCurrency];
  const toRate = exchangeRates[toCurrency];

  if (fromRate === undefined || toRate === undefined) {
    throw new Error(
      `Unsupported currency conversion: ${fromCurrency} -> ${toCurrency}`,
    );
  }

  const inBase = amount / fromRate;
  return inBase * toRate;
};

export const isValidCurrency = (code: string): boolean => {
  return code in exchangeRates;
};
