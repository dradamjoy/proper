import type { ClaimLine, License, Locality, Payer, Worksheet } from "./coding.ts";

/** 2026 WPS participating amount in cents: office, then facility. */
const WPS: Record<Locality, Record<string, [number, number]>> = {
  "01": {
    "90791": [17225, 13744],
    "96116": [9451, 7324],
    "96121": [7508, 6155],
    "96127": [508, 508],
    "96130": [12474, 10121],
    "96131": [8601, 7022],
    "96132": [12265, 9976],
    "96133": [9721, 7078],
    "96136": [4335, 2175],
    "96137": [3632, 1633],
    "96138": [3666, 3666],
    "96139": [3417, 3417],
    "96146": [250, 250],
  },
  "99": {
    "90791": [16957, 13664],
    "96116": [9183, 7171],
    "96121": [7396, 6115],
    "96127": [465, 465],
    "96130": [12122, 9896],
    "96131": [8475, 6981],
    "96132": [11956, 9790],
    "96133": [9519, 7018],
    "96136": [4169, 2126],
    "96137": [3519, 1628],
    "96138": [3453, 3453],
    "96139": [3232, 3232],
    "96146": [221, 221],
  },
};

export const OFFICES: Record<Locality, string> = {
  "01": "Ann Arbor or West Bloomfield",
  "99": "East Lansing",
};

export type Rates = Record<string, number>;
export type PricedLine = {
  key: string;
  code: string;
  units: number;
  dayLabel?: string;
  rendering: License;
  cents: number | null;
  extended: number | null;
  source: "wps" | "contract" | "missing" | "unpayable";
};

export function money(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  return `${cents < 0 ? "-" : ""}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function rateKey(payer: Payer, license: License, code: string): string {
  return `${payer}|${license}|${code}`;
}

export function officeCents(locality: Locality, code: string): number | null {
  return WPS[locality][code]?.[0] ?? null;
}

export function usesMedicareFee(payer: Payer): boolean {
  return payer === "medicare" || payer === "uhc-ma";
}

export function readRates(value: unknown): Rates {
  if (!value || typeof value !== "object") return {};
  const rates: Rates = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^[a-z-]+\|(lp|llp)\|\d{5}$/.test(key)) continue;
    const amount = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000) continue;
    rates[key] = Math.round(amount * 100) / 100;
  }
  return rates;
}

export function priceClaim(lines: ClaimLine[], worksheet: Worksheet, rates: Rates) {
  const priced = lines.map((line) => priceLine(line, worksheet, rates));
  const payable = priced.filter((line) => line.source !== "unpayable");
  const complete = payable.every((line) => line.extended != null);
  const allowedCents = complete ? payable.reduce((sum, line) => sum + (line.extended ?? 0), 0) : null;
  const medicareShareCents =
    worksheet.payer === "medicare" && complete ? payable.reduce((sum, line) => sum + Math.round(((line.extended ?? 0) * 80) / 100), 0) : null;
  return { lines: priced, allowedCents, medicareShareCents, coinsuranceCents: medicareShareCents != null && allowedCents != null ? allowedCents - medicareShareCents : null };
}

function priceLine(line: ClaimLine, worksheet: Worksheet, rates: Rates): PricedLine {
  const rendering: License = line.billedBy === "supervisor" ? "lp" : worksheet.license;
  const base = { key: `${line.dayLabel ?? ""}|${line.code}|${rendering}|${line.basis}`, code: line.code, units: line.units, dayLabel: line.dayLabel, rendering };
  if (usesMedicareFee(worksheet.payer) && rendering === "llp") return { ...base, cents: null, extended: null, source: "unpayable" };
  const stored = rates[rateKey(worksheet.payer, rendering, line.code)];
  if (stored != null) {
    const cents = Math.round(stored * 100);
    return { ...base, cents, extended: cents * line.units, source: "contract" };
  }
  if (usesMedicareFee(worksheet.payer)) {
    const cents = officeCents(worksheet.locality, line.code);
    return cents == null ? { ...base, cents: null, extended: null, source: "missing" } : { ...base, cents, extended: cents * line.units, source: "wps" };
  }
  return { ...base, cents: null, extended: null, source: "missing" };
}

export function fillRates(rates: Rates, payer: Payer, license: License, locality: Locality, percent: number): Rates {
  if (usesMedicareFee(payer) || payer === "cpt") return rates;
  const factor = Math.min(400, Math.max(1, Math.round(percent)));
  const next = { ...rates };
  for (const code of Object.keys(WPS[locality])) {
    const key = rateKey(payer, license, code);
    if (next[key] == null) next[key] = Math.round((WPS[locality][code][0] * factor) / 100) / 100;
  }
  return next;
}
