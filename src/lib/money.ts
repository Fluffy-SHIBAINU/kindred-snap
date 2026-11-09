/** Money is integer cents everywhere. Parsing never goes through floating point. */

export function toCents(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error(`toCents: not a number: ${input}`);
    return Math.round(input * 100);
  }
  let s = input.trim().replace(/[$,\s]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  if (!/^\d*(\.\d{0,2})?$/.test(s) || s === "" || s === ".") throw new Error(`toCents: not an amount: ${input}`);
  const [whole = "0", frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function formatUsd(cents: number): string {
  return usd.format(cents / 100);
}

export function sumCents(list: number[]): number {
  return list.reduce((a, b) => a + b, 0);
}
