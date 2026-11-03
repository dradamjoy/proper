Proper is an internal CPT worksheet for psychological and neuropsychological testing.

It turns tests, who gave them, and professional time into suggested codes. It is a coding worksheet, not a claim and not a benefits quote. Do not put patient names, dates of birth, or member IDs in it.

Start here:

- `src/lib/coding.ts` — time rules, LP and LLP, payer rules, and the claim lines.
- `src/lib/fees.ts` — 2026 WPS participating office amounts, contract rates, and the CSV rate import. Contract rates live on the browser, never in this repo.
- `src/lib/catalog.ts` — instruments and typical times.
- `src/lib/review.ts` — legitimate codes the sheet may still be missing.
- `src/components/desk.tsx` — the form and the claim panel.
- `src/lib/coding.test.ts` — the worked examples, including the adult ADHD battery.
