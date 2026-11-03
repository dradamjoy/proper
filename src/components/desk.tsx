import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Minus, Plus, Undo2 } from "lucide-react";
import { GROUPS, SCREENERS, TESTS, suggestTimes } from "@/lib/catalog";
import {
  ACTIVITY_META,
  CODE_GUIDE,
  EMPTY,
  EMPTY_ACTIVITIES,
  PAYERS,
  type Activities,
  type Domain,
  type License,
  type Locality,
  type Payer,
  type Setting,
  type Span,
  type TimeRule,
  type Worksheet,
  clampMinutes,
  codeWorksheet,
  evalMinutes,
  normalize,
  payerProfile,
  reviewedLabel,
  sumActivities,
  thresholdSentence,
  breakHours,
} from "@/lib/coding";
import { OFFICES, fillRates, importRates, importSummary, money, priceClaim, rateKey, readRates, type Rates, usesMedicareFee, officeCents } from "@/lib/fees";
import { missedCodes } from "@/lib/review";

const DRAFT_KEY = "proper.draft.v1";
const SAVED_KEY = "proper.saved.v1";
const RATES_KEY = "proper.rates.v1";

type Saved = { id: string; name: string; savedAt: string; worksheet: Worksheet };

function dated(activities: Activities): Pick<Worksheet, "activities" | "dates"> {
  return { activities, dates: [{ id: "date-1", label: "Date 1", activities }] };
}

const PRESETS: { id: string; label: string; detail: string; worksheet: Worksheet }[] = [
  {
    id: "adhd",
    label: "Adult ADHD",
    detail: "Psychologist gives the battery and writes the report.",
    worksheet: {
      ...EMPTY,
      name: "Example — adult ADHD",
      domain: "psychological",
      tests: ["WAIS-IV", "Conners CPT 3", "Conners 4", "BRIEF-A", "PAI"],
      adminQhp: 120,
      screeners: ["ASRS", "PHQ-9", "GAD-7"],
      ...dated({ testSelection: 15, informationGathering: 30, interpretation: 45, reportWriting: 60, feedback: 20 }),
    },
  },
  {
    id: "neuro",
    label: "Neuropsych",
    detail: "Technician gives the battery. Psychologist integrates and writes.",
    worksheet: {
      ...EMPTY,
      name: "Example — memory evaluation",
      domain: "neuropsychological",
      tests: ["WAIS-IV", "WMS-IV", "CVLT-3", "Trail Making", "Rey Complex Figure", "D-KEFS", "TOMM"],
      adminTech: 180,
      ...dated({ testSelection: 25, informationGathering: 50, interpretation: 70, reportWriting: 90, feedback: 30 }),
    },
  },
  {
    id: "split",
    label: "Split battery",
    detail: "Psychologist and technician both have administration time.",
    worksheet: {
      ...EMPTY,
      name: "Example — school-age learning",
      tests: ["WISC-V", "WIAT-4", "CTOPP-2", "Beery VMI", "BASC-3"],
      adminQhp: 100,
      adminTech: 45,
      ...dated({ testSelection: 20, informationGathering: 40, interpretation: 40, reportWriting: 50, feedback: 20 }),
    },
  },
];

export function Desk() {
  const [worksheet, setWorksheet] = useState<Worksheet>(EMPTY);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [rates, setRates] = useState<Rates>({});
  const [query, setQuery] = useState("");
  const [browse, setBrowse] = useState(false);
  const [undo, setUndo] = useState<{ text: string; worksheet: Worksheet } | null>(null);
  const result = useMemo(() => codeWorksheet(worksheet), [worksheet]);
  const quote = useMemo(() => priceClaim(result.lines, worksheet, rates), [result.lines, worksheet, rates]);
  const missed = useMemo(() => missedCodes(worksheet), [worksheet]);
  const suggestion = useMemo(() => suggestTimes(worksheet.tests, worksheet.domain), [worksheet.tests, worksheet.domain]);

  useEffect(() => {
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) setWorksheet(normalize(JSON.parse(draft)));
      const storedRates = localStorage.getItem(RATES_KEY);
      if (storedRates) setRates(readRates(JSON.parse(storedRates)));
      const stored = localStorage.getItem(SAVED_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSaved(
            parsed
              .filter((item) => item && typeof item.id === "string")
              .map((item) => ({
                id: item.id,
                name: typeof item.name === "string" ? item.name : "Worksheet",
                savedAt: typeof item.savedAt === "string" ? item.savedAt : "",
                worksheet: normalize(item.worksheet),
              }))
              .slice(0, 12),
          );
        }
      }
    } catch {
      /* a damaged draft is ignored */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!worksheet.dates?.length) setWorksheet((current) => normalize(current));
  }, [worksheet]);

  useEffect(() => {
    if (ready) localStorage.setItem(DRAFT_KEY, JSON.stringify(worksheet));
  }, [worksheet, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(RATES_KEY, JSON.stringify(rates));
  }, [rates, ready]);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 10000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  function replaceWorksheet(next: Worksheet, text: string) {
    if (hasWork(worksheet)) setUndo({ text, worksheet });
    setWorksheet(next);
  }

  function patch(partial: Partial<Worksheet>) {
    setWorksheet((current) => ({ ...current, ...partial }));
  }

  function selectPayer(payer: Payer) {
    const plan = payerProfile(payer);
    patch({ payer, span: plan.span, timeRule: plan.timeRule });
  }

  function patchDay(id: string, key: keyof Activities, value: number) {
    setWorksheet((current) => {
      const dates = current.dates.map((day) => (day.id === id ? { ...day, activities: { ...day.activities, [key]: clampMinutes(value) } } : day));
      return { ...current, dates, activities: sumActivities(dates) };
    });
  }

  function toggleNamed(field: "tests" | "screeners", name: string) {
    setWorksheet((current) => {
      const list = current[field].some((item) => item.toLowerCase() === name.toLowerCase())
        ? current[field].filter((item) => item.toLowerCase() !== name.toLowerCase())
        : [...current[field], name];
      return { ...current, [field]: list, singleAutomated: field === "tests" ? list.length === 1 && current.singleAutomated : current.singleAutomated };
    });
  }

  function addCustom(name: string) {
    setWorksheet((current) => {
      if (current.tests.some((item) => item.toLowerCase() === name.toLowerCase())) return current;
      const tests = [...current.tests, name];
      return { ...current, tests, singleAutomated: tests.length === 1 && current.singleAutomated };
    });
  }

  /** Enter in the search box: pick the catalog match, or add the text as a custom instrument. */
  function submitQuery() {
    const name = query.trim();
    if (!name) return;
    const exact = TESTS.find((test) => test.name.toLowerCase() === name.toLowerCase());
    const pick = exact ?? (visible.length === 1 ? visible[0] : undefined);
    if (pick) {
      if (!worksheet.tests.some((item) => item.toLowerCase() === pick.name.toLowerCase())) toggleNamed("tests", pick.name);
    } else addCustom(name);
    setQuery("");
  }

  function applyTypical() {
    setWorksheet((current) => {
      const next = suggestTimes(current.tests, current.domain);
      const useTech = current.adminTech > current.adminQhp;
      const dates = current.dates.map((day, index) => (index === 0 ? { ...day, activities: next.activities } : day));
      return {
        ...current,
        adminQhp: useTech ? 0 : next.admin,
        adminTech: useTech ? next.admin : 0,
        diagnosticInterview: current.diagnosticInterview || next.interview,
        dates,
        activities: sumActivities(dates),
      };
    });
  }

  function saveWorksheet() {
    const name = worksheet.name.trim() || "Untitled worksheet";
    const nextSheet = { ...worksheet, name };
    setWorksheet(nextSheet);
    setSaved((current) => {
      const existing = current.find((item) => item.name === name);
      const entry: Saved = { id: existing?.id ?? crypto.randomUUID(), name, savedAt: new Date().toISOString(), worksheet: nextSheet };
      const next = existing ? current.map((item) => (item.id === existing.id ? entry : item)) : [entry, ...current].slice(0, 12);
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      return next;
    });
  }

  const visible = TESTS.filter((test) => test.name.toLowerCase().includes(query.trim().toLowerCase()));
  const searching = query.trim() !== "";
  const showCatalog = browse || searching || worksheet.tests.length === 0;
  const customName = searching && !TESTS.some((test) => test.name.toLowerCase() === query.trim().toLowerCase()) ? query.trim() : null;
  const plan = payerProfile(worksheet.payer);

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto max-w-6xl px-4 pt-6 pb-4">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-3xl leading-tight tracking-tight text-ink">Proper</h1>
          <a href="#claim" className="text-sm font-medium text-accent no-print">Skip to codes</a>
        </div>
        <p className="mt-2 max-w-2xl text-base leading-normal text-muted">
          Describe the tests, who gave them, and the time. The claim follows the license: an LP and an LLP do not bill the same testing codes.
        </p>
      </header>
      <main className="mx-auto grid max-w-6xl items-start gap-4 px-4 pb-28 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:pb-16">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-faint">Start from a pattern</p>
                <h2 className="font-serif text-xl leading-snug text-ink">Examples</h2>
              </div>
              <div className="flex gap-2 no-print">
                <button type="button" className={button("quiet")} onClick={saveWorksheet}>Save</button>
                <button type="button" className={button("ghost")} onClick={() => replaceWorksheet(EMPTY, "Worksheet cleared.")}>Clear</button>
              </div>
            </div>
            {undo ? (
              <div role="status" className="mt-3 flex items-center justify-between gap-3 rounded-md bg-inset px-3 py-2 no-print">
                <p className="text-sm text-ink">{undo.text}</p>
                <button
                  type="button"
                  className={button("quiet")}
                  onClick={() => {
                    setWorksheet(undo.worksheet);
                    setUndo(null);
                  }}
                >
                  <Undo2 className="mr-2 size-4" aria-hidden />
                  Undo
                </button>
              </div>
            ) : null}
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {PRESETS.map((preset) => (
                <button key={preset.id} type="button" onClick={() => replaceWorksheet(preset.worksheet, `Loaded the ${preset.label} example.`)} className="rounded-md border border-line bg-paper px-3 py-3 text-left hover:border-accent">
                  <span className="block text-sm font-medium text-ink">{preset.label}</span>
                  <span className="mt-1 block text-sm leading-normal text-muted">{preset.detail}</span>
                </button>
              ))}
            </div>
            {ready && saved.length > 0 ? (
              <div className="mt-4">
                <p className="text-sm text-muted">Saved on this browser. No patient information belongs here.</p>
                <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {saved.map((item) => (
                    <li key={item.id} className="flex shrink-0 overflow-hidden rounded-md border border-line">
                      <button type="button" className="h-11 px-3 text-sm text-ink hover:bg-inset" onClick={() => replaceWorksheet(item.worksheet, `Opened ${item.name}.`)}>{item.name}</button>
                      <button
                        type="button"
                        className="h-11 border-l border-line px-3 text-sm text-muted hover:bg-inset"
                        aria-label={`Remove ${item.name}`}
                        onClick={() =>
                          setSaved((current) => {
                            const next = current.filter((savedItem) => savedItem.id !== item.id);
                            localStorage.setItem(SAVED_KEY, JSON.stringify(next));
                            return next;
                          })
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <Section index="01" title="The evaluation" lede="Pick the license first. An LP can bill testing evaluation. An LLP practices under an LP, and that evaluation stays with the LP.">
            <label className="block">
              <span className="text-sm font-medium text-ink">Worksheet name</span>
              <input value={worksheet.name} onChange={(event) => patch({ name: event.target.value.slice(0, 80) })} placeholder="Adult ADHD battery" className="mt-2 h-11 w-full rounded-md border border-line bg-paper px-3 text-base text-ink placeholder:text-faint" />
              <span className="mt-1 block text-sm text-muted">No names, dates of birth, or member IDs.</span>
            </label>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-ink">Who is billing</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Choice pressed={worksheet.license === "lp"} label="LP" hint="Fully licensed psychologist" onClick={() => patch({ license: "lp" })} />
                <Choice pressed={worksheet.license === "llp"} label="LLP" hint="Master's limited license, under an LP" onClick={() => patch({ license: "llp" })} />
              </div>
              <p className="mt-2 text-sm leading-normal text-muted">
                {worksheet.license === "lp"
                  ? "Testing evaluation (96130 or 96132), their own administration (96136), and technician time they supervise (96138) can go on this claim."
                  : "The LLP's own claim can include a diagnostic interview and brief measures, if the plan credentials them. Administration becomes 96138 under the supervising LP. Testing evaluation does not."}
              </p>
            </fieldset>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-ink">Plan</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {PAYERS.map((plan) => (
                  <Choice key={plan.id} pressed={worksheet.payer === plan.id} label={plan.label} hint={plan.hint} onClick={() => selectPayer(plan.id)} />
                ))}
              </div>
              <p className="mt-2 text-sm leading-normal text-muted">{plan.rule} Rules reviewed {reviewedLabel()}.</p>
            </fieldset>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-ink">Office</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Choice pressed={worksheet.locality === "01"} label="Ann Arbor or West Bloomfield" hint="Medicare locality 01, Detroit" onClick={() => patch({ locality: "01" })} />
                <Choice pressed={worksheet.locality === "99"} label="East Lansing" hint="Medicare locality 99, rest of Michigan" onClick={() => patch({ locality: "99" })} />
              </div>
              <p className="mt-2 text-sm leading-normal text-muted">Medicare allowed amounts follow the office. {OFFICES[worksheet.locality]}. Telehealth on this sheet uses that same locality.</p>
            </fieldset>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-ink">What kind of evaluation</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Choice pressed={worksheet.domain === "psychological"} label="Psychological" hint="96130 and 96131" onClick={() => patch({ domain: "psychological" satisfies Domain })} />
                <Choice pressed={worksheet.domain === "neuropsychological"} label="Neuropsychological" hint="96132 and 96133" onClick={() => patch({ domain: "neuropsychological" })} />
              </div>
              {worksheet.license === "llp" && worksheet.domain === "neuropsychological" ? (
                <p className="mt-2 text-sm leading-normal text-muted">An LLP does not bill 96132 or 96133. Neuropsychological testing evaluation stays with the supervising LP, and only for the LP's own time.</p>
              ) : null}
            </fieldset>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-ink">Where</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Choice pressed={worksheet.setting === "in-person"} label="In person" hint="Default for test administration" onClick={() => patch({ setting: "in-person" satisfies Setting })} />
                <Choice pressed={worksheet.setting === "telehealth"} label="Telehealth" hint="Confirm before coding administration" onClick={() => patch({ setting: "telehealth" })} />
              </div>
            </fieldset>
            <Disclosure
              className="mt-4"
              title="Plan rules"
              summary={`${worksheet.span === "episode" ? "Whole episode" : "Each date"} · ${worksheet.timeRule === "midpoint" ? "CPT midpoint" : "Completed blocks"}${worksheet.span !== plan.span || worksheet.timeRule !== plan.timeRule ? " · changed from the plan default" : " · set by the plan"}`}
            >
              <fieldset>
                <legend className="text-sm font-medium text-ink">Multiple dates</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Choice pressed={worksheet.span === "per-date"} label="Each date" hint="Only if the plan requires a base code per day" onClick={() => patch({ span: "per-date" satisfies Span })} />
                  <Choice pressed={worksheet.span === "episode"} label="Whole episode" hint="One base code, reported on the last date" onClick={() => patch({ span: "episode" })} />
                </div>
              </fieldset>
              <fieldset className="mt-4">
                <legend className="text-sm font-medium text-ink">How this plan counts time</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Choice pressed={worksheet.timeRule === "midpoint"} label="CPT midpoint" hint="31 min of an hour, 16 of 30" onClick={() => patch({ timeRule: "midpoint" satisfies TimeRule })} />
                  <Choice pressed={worksheet.timeRule === "completed"} label="Completed blocks" hint="Full 60 or full 30 only" onClick={() => patch({ timeRule: "completed" })} />
                </div>
              </fieldset>
            </Disclosure>
          </Section>

          <Section
            index="02"
            title="Tests and administration"
            lede={
              worksheet.license === "llp"
                ? "An LLP's administration is technician time on the supervising LP's claim, 96138 and 96139, not 96136. Two or more tests are still required."
                : "Giving the tests and scoring them. Scoring follows the person who scores. The report does not go here. 96136 and 96138 need two or more tests."
            }
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-sm leading-normal text-muted">
                {worksheet.tests.length === 0
                  ? "Select the instruments. Typical time is a starting point, not the chart."
                  : `Typical administration for the selected tests is ${suggestion.admin} min. Professional time is about ${evalMinutes(suggestion.activities)} min.${suggestion.ratingScales.length > 0 ? ` ${suggestion.ratingScales.join(", ")} ${suggestion.ratingScales.length === 1 ? "is a rating scale" : "are rating scales"} completed on their own, so only your scoring time counts. Add it by hand.` : ""}`}
              </p>
              <button type="button" className={button("primary")} disabled={worksheet.tests.length === 0} onClick={applyTypical}>Use typical time</button>
            </div>
            {worksheet.tests.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {worksheet.tests.map((name) => (
                  <li key={name}>
                    <button type="button" className="h-11 rounded-md bg-accent px-3 text-sm text-on-accent" onClick={() => toggleNamed("tests", name)} aria-label={`Remove ${name}`}>
                      {name}
                      <span className="ml-2" aria-hidden>×</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No instruments yet. Two or more are required before administration codes appear.</p>
            )}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitQuery();
                }
                if (event.key === "Escape") setQuery("");
              }}
              placeholder="Find or add a test"
              aria-label="Find or add a test"
              className="mt-3 h-11 w-full rounded-md border border-line bg-paper px-3 text-base text-ink placeholder:text-faint"
            />
            {customName ? (
              <button
                type="button"
                className={`${button("quiet")} mt-2`}
                onClick={() => {
                  addCustom(customName);
                  setQuery("");
                }}
              >
                <Plus className="mr-2 size-4" aria-hidden />
                Add “{customName}” as a custom instrument
              </button>
            ) : null}
            {!searching && worksheet.tests.length > 0 ? (
              <button type="button" aria-expanded={browse} className={`${button("ghost")} mt-2 px-0`} onClick={() => setBrowse((open) => !open)}>
                <ChevronDown className={`mr-1 size-4 transition-transform ${browse ? "rotate-180" : ""}`} aria-hidden />
                {browse ? "Hide the test list" : `Browse all ${TESTS.length} tests`}
              </button>
            ) : null}
            <div className={`mt-3 flex flex-col gap-3 ${showCatalog ? "" : "hidden"}`}>
              {GROUPS.map((group) => {
                const tests = visible.filter((test) => test.group === group);
                if (tests.length === 0) return null;
                return (
                  <div key={group}>
                    <h3 className="text-sm font-medium text-muted">{group}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tests.map((test) => {
                        const on = worksheet.tests.some((name) => name.toLowerCase() === test.name.toLowerCase());
                        return (
                          <button key={test.name} type="button" aria-pressed={on} onClick={() => toggleNamed("tests", test.name)} className={`min-h-11 rounded-md border px-3 py-2 text-left text-sm ${on ? "border-accent bg-accent text-on-accent" : "border-line bg-paper text-ink"}`}>
                            {test.name}
                            <span className={`ml-2 ${on ? "text-on-accent" : "text-faint"}`}>{test.minutes} min</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {worksheet.tests.length === 1 ? (
              <label className="mt-4 flex items-start gap-3 text-sm leading-normal text-ink">
                <input type="checkbox" className="mt-1 size-4" checked={worksheet.singleAutomated} onChange={(event) => patch({ singleAutomated: event.target.checked })} />
                Single automated electronic instrument. This is 96146 once, not a timed administration code.
              </label>
            ) : null}
            <div className="mt-4 grid gap-3">
              <AdminRow
                label={worksheet.license === "llp" ? "LLP gave the tests" : "Psychologist"}
                hint={worksheet.license === "llp" ? "Becomes 96138 on the supervising LP's claim." : suggestion.admin ? `Typical ${suggestion.admin} min` : "96136 and 96137"}
                value={worksheet.adminQhp}
                onChange={(adminQhp) => patch({ adminQhp })}
              />
              <AdminRow label="Technician or psychometrist" hint="96138 and 96139" value={worksheet.adminTech} onChange={(adminTech) => patch({ adminTech })} />
            </div>
          </Section>

          <Section
            index="03"
            title="Professional work"
            lede={
              worksheet.license === "llp"
                ? "Enter each date the LLP worked. These minutes still do not become 96130 or 96132. The supervising LP bills testing evaluation only for time the LP actually spent."
                : worksheet.span === "episode"
                  ? "Enter each date, then the hours are added together. The claim uses one base code on the last date. Desk time counts. Do not put a diagnostic interview here."
                  : "Each date starts the hour over. Time on one date does not add onto another date's base code. Desk time counts. Do not enter the same minutes twice, and do not put a diagnostic interview here."
            }
          >
            <div className="flex flex-col gap-4">
              {worksheet.dates.map((day, index) => (
                <DateBlock
                  key={day.id}
                  day={day}
                  index={index}
                  many={worksheet.dates.length > 1}
                  span={worksheet.span}
                  license={worksheet.license}
                  domain={worksheet.domain}
                  rule={worksheet.timeRule}
                  typical={index === 0 ? suggestion.activities : null}
                  onRename={(label) => setWorksheet((current) => ({ ...current, dates: current.dates.map((item) => (item.id === day.id ? { ...item, label: label.slice(0, 40) } : item)) }))}
                  onRemove={() =>
                    setWorksheet((current) => {
                      if (current.dates.length <= 1) return current;
                      const dates = current.dates.filter((item) => item.id !== day.id);
                      return { ...current, dates, activities: sumActivities(dates) };
                    })
                  }
                  onActivity={(key, value) => patchDay(day.id, key, value)}
                />
              ))}
            </div>
            {worksheet.dates.length < 8 ? (
              <button
                type="button"
                className={`${button("quiet")} mt-4`}
                onClick={() =>
                  setWorksheet((current) => {
                    if (current.dates.length >= 8) return current;
                    const dates = [...current.dates, { id: `date-${Date.now()}`, label: `Date ${current.dates.length + 1}`, activities: { ...EMPTY_ACTIVITIES } }];
                    return { ...current, dates, activities: sumActivities(dates) };
                  })
                }
              >
                Add a date
              </button>
            ) : (
              <p className="mt-4 text-sm text-muted">Eight dates is the limit on one worksheet.</p>
            )}
          </Section>

          <Section index="04" title="Kept separate" lede="These are not part of the testing evaluation. A diagnostic interview, a neurobehavioral status exam, and brief screeners each have their own code.">
            <label className="flex items-start gap-3 text-sm leading-normal text-ink">
              <input type="checkbox" className="mt-1 size-4" checked={worksheet.diagnosticInterview} onChange={(event) => patch({ diagnosticInterview: event.target.checked })} />
              Diagnostic interview, 90791. Do not also count those minutes as testing.
            </label>
            <div className="mt-4">
              <h3 className="text-base font-medium text-ink">Neurobehavioral status exam</h3>
              <p className="text-sm text-muted">96116 and 96121. A clinical exam of thinking and judgment, not the standardized battery.</p>
              <div className="mt-2">
                <Minutes label="Neurobehavioral status exam" value={worksheet.neurobehavioral} onChange={(neurobehavioral) => patch({ neurobehavioral })} />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-medium text-ink">Brief measures</h3>
              <p className="text-sm text-muted">96127, one unit each. Do not also list these in the battery.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SCREENERS.map((name) => {
                  const on = worksheet.screeners.includes(name);
                  return (
                    <button key={name} type="button" aria-pressed={on} onClick={() => toggleNamed("screeners", name)} className={`h-11 rounded-md border px-3 text-sm ${on ? "border-accent bg-accent text-on-accent" : "border-line bg-paper text-ink"}`}>
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          <section className="rounded-xl border border-line bg-card p-4">
            <Disclosure title="Which code is which" summary={`${CODE_GUIDE.length} codes this sheet can suggest, and when each applies`} heading>
            <ul>
              {CODE_GUIDE.map((item) => (
                <li key={item.code} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-t border-line py-3">
                  <span className="font-mono text-sm text-ink tabular-nums">{item.code}</span>
                  <span>
                    <span className="block text-sm font-medium text-ink">{item.use}</span>
                    <span className="block text-sm text-muted">{item.when}</span>
                  </span>
                </li>
              ))}
            </ul>
            </Disclosure>
          </section>
        </div>
        <Claim result={result} quote={quote} missed={missed} worksheet={worksheet} rates={rates} onRate={(license, code, amount) => setRates((current) => { const key = rateKey(worksheet.payer, license, code); const next = { ...current }; if (amount == null) delete next[key]; else next[key] = amount; return next; })} onFill={(license, percent) => setRates((current) => fillRates(current, worksheet.payer, license, worksheet.locality, percent))} onImport={(text) => { const imported = importRates(rates, text); if (!imported.error) setRates(imported.next); return importSummary(imported); }} />
      </main>
      <MobileSummary result={result} quote={quote} worksheet={worksheet} />
    </div>
  );
}

function hasWork(w: Worksheet): boolean {
  return w.tests.length > 0 || w.screeners.length > 0 || w.adminQhp > 0 || w.adminTech > 0 || w.neurobehavioral > 0 || w.diagnosticInterview || w.dates.some((day) => evalMinutes(day.activities) > 0);
}

type PricedRow = { key: string; code: string; units: number; rendering: License; cents: number | null; extended: number | null; source: ReturnType<typeof priceClaim>["lines"][number]["source"] };

/** One row per code and rendering clinician, so multi-date lines collapse into a single total. */
function priceRows(quote: ReturnType<typeof priceClaim>): PricedRow[] {
  const rows = new Map<string, PricedRow>();
  for (const line of quote.lines) {
    const key = `${line.rendering}|${line.code}`;
    const found = rows.get(key);
    if (!found) rows.set(key, { key, code: line.code, units: line.units, rendering: line.rendering, cents: line.cents, extended: line.extended, source: line.source });
    else {
      found.units += line.units;
      found.extended = found.extended == null || line.extended == null ? null : found.extended + line.extended;
    }
  }
  return [...rows.values()];
}

function MobileSummary({ result, quote, worksheet }: { result: ReturnType<typeof codeWorksheet>; quote: ReturnType<typeof priceClaim>; worksheet: Worksheet }) {
  const units = result.totals.reduce((sum, item) => sum + item.units, 0);
  const holds = result.flags.filter((flag) => flag.tone === "hold").length;
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card/95 px-4 py-3 backdrop-blur no-print lg:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-ink tabular-nums">
            {result.totals.length === 0 ? "No codes yet" : result.totals.map((item) => `${item.code}×${item.units}`).join("  ")}
          </p>
          <p className="text-sm text-muted">
            {result.totals.length === 0
              ? "Enter tests and time."
              : `${units} ${units === 1 ? "unit" : "units"} · ${quote.allowedCents != null ? `${money(quote.allowedCents)} allowed` : worksheet.payer === "cpt" ? "Pick a plan for dollars" : "Rates missing"}${holds ? ` · ${holds} to fix` : ""}`}
          </p>
        </div>
        <a href="#claim" className={`${button("primary")} shrink-0 whitespace-nowrap`}>See codes</a>
      </div>
    </div>
  );
}

function Claim({
  result,
  quote,
  missed,
  worksheet,
  rates,
  onRate,
  onFill,
  onImport,
}: {
  result: ReturnType<typeof codeWorksheet>;
  quote: ReturnType<typeof priceClaim>;
  missed: ReturnType<typeof missedCodes>;
  worksheet: Worksheet;
  rates: Rates;
  onRate: (license: License, code: string, amount: number | null) => void;
  onFill: (license: License, percent: number) => void;
  onImport: (text: string) => string;
}) {
  const own = result.lines.filter((line) => line.billedBy !== "supervisor");
  const supervisor = result.lines.filter((line) => line.billedBy === "supervisor");
  const llp = worksheet.license === "llp";
  const rows = priceRows(quote);
  const missing = rows.filter((row) => row.source === "missing").length;
  const checks = missed.length + result.pending.length + result.suppressed.length + result.flags.length;
  const holds = result.flags.filter((flag) => flag.tone === "hold").length + result.suppressed.length;
  const status =
    rows.length === 0
      ? null
      : worksheet.payer === "cpt"
        ? "Pick a plan to see dollars. CPT alone has no fee."
        : missing > 0
          ? `Add a contract rate for ${missing} ${missing === 1 ? "code" : "codes"} under Rates.`
          : quote.medicareShareCents != null && quote.coinsuranceCents != null
            ? `Medicare pays ${money(quote.medicareShareCents)} once the deductible is met. Coinsurance ${money(quote.coinsuranceCents)}. Before the 2% sequestration cut.`
            : worksheet.payer === "uhc-ma"
              ? `Medicare allowed for ${OFFICES[worksheet.locality]}. An Advantage contract can differ.`
              : "From the contract rates on file.";
  return (
    <aside id="claim" className="claim-panel rounded-xl border border-line bg-card p-4">
      <p className="font-mono text-xs text-faint">Claim draft</p>
      <h2 className="font-serif text-xl leading-snug text-ink">What to bill</h2>
      <p className="mt-1 text-sm text-muted">
        {payerProfile(worksheet.payer).label} · {llp ? "LLP" : "LP"} · {worksheet.timeRule === "midpoint" ? "CPT midpoint" : "Completed blocks"} ·{" "}
        {worksheet.dates.length > 1 ? (worksheet.span === "episode" ? "one episode on the last date" : `${worksheet.dates.length} dates, each its own base code`) : "one date of service"}
      </p>

      <div aria-live="polite" className="mt-3 rounded-md bg-inset p-3">
        {rows.length === 0 ? (
          <p className="text-sm leading-normal text-muted">
            {result.suppressed.length > 0 ? "Nothing this license can bill from the time entered." : "Nothing to bill yet. Add two or more tests and the time, or start from an example."}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">Expected allowed</p>
            <p className="font-serif text-3xl leading-tight text-ink tabular-nums">{quote.allowedCents == null ? "—" : money(quote.allowedCents)}</p>
            {status ? <p className="mt-1 text-sm leading-normal text-muted">{status}</p> : null}
            <ul className="mt-3">
              {rows.map((row) => (
                <li key={row.key} className="flex items-baseline justify-between gap-3 border-t border-line py-2">
                  <span className="font-mono text-base text-ink tabular-nums">
                    {row.code} <span className="text-muted">× {row.units}</span>
                    {llp && row.rendering === "lp" ? <span className="text-sm text-muted"> · LP</span> : null}
                  </span>
                  <span className="font-mono text-sm text-ink tabular-nums">{row.source === "unpayable" ? "not payable" : row.extended == null ? "—" : money(row.extended)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {result.lines.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 no-print">
          <Copy label="Copy note" text={result.note} tone="primary" />
          <Copy label="Copy codes" text={result.codesText || "No codes"} tone="quiet" />
        </div>
      ) : null}

      {checks > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink">
            Review before billing <span className="font-mono text-muted tabular-nums">· {checks}</span>
            {holds > 0 ? <span className="ml-2 rounded-sm bg-warn-soft px-1.5 py-0.5 text-xs text-warn">{holds} to fix</span> : null}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {result.suppressed.map((item) => (
              <li key={item.label} className="rounded-md bg-warn-soft px-3 py-2 text-sm leading-normal text-warn"><span className="font-medium">Not coded. </span>{item.reason}</li>
            ))}
            {result.flags.filter((flag) => flag.tone === "hold").map((flag) => (
              <li key={flag.text} className="rounded-md bg-warn-soft px-3 py-2 text-sm leading-normal text-warn"><span className="font-medium">Do not report. </span>{flag.text}</li>
            ))}
            {missed.map((item) => (
              <li key={item.text} className="rounded-md bg-inset px-3 py-2 text-sm leading-normal text-ink"><span className="font-medium">Might be missing {item.code}. </span>{item.text}</li>
            ))}
            {result.pending.map((item) => (
              <li key={item.title} className="rounded-md bg-inset px-3 py-2 text-sm leading-normal text-ink"><span className="font-medium">Short of a unit. </span>{item.title}. {item.detail}</li>
            ))}
            {result.flags.filter((flag) => flag.tone !== "hold").map((flag) => (
              <li key={flag.text} className="rounded-md bg-inset px-3 py-2 text-sm leading-normal text-ink"><span className="font-medium">Check. </span>{flag.text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.lines.length > 0 ? (
        <Disclosure className="mt-4 border-t border-line pt-3" title="How the units were counted" summary="Minutes behind each line">
          {llp ? (
            <div>
              <LineGroup label="LLP" lines={own} empty="Nothing on the LLP's own claim." />
              <LineGroup label="Supervising LP" lines={supervisor} empty="Nothing from this worksheet. Do not move the LLP's evaluation time onto the LP." />
            </div>
          ) : (
            <ul>{own.map((line, index) => <LineView key={`${index}-${line.dayLabel ?? ""}-${line.code}`} line={line} />)}</ul>
          )}
        </Disclosure>
      ) : null}

      {rows.length > 0 && worksheet.payer !== "cpt" ? (
        <Disclosure className="mt-3 border-t border-line pt-3" title="Rates" summary={missing > 0 ? `${missing} missing` : usesMedicareFee(worksheet.payer) ? "WPS 2026 office rates" : "Contract rates on file"} defaultOpen={missing > 0}>
          <Pay rows={rows} worksheet={worksheet} rates={rates} onRate={onRate} onFill={onFill} onImport={onImport} />
        </Disclosure>
      ) : null}

      <p className="mt-4 text-sm leading-normal text-muted">Worksheet only. Not a claim and not a benefits quote. Medicare amounts are the 2026 WPS participating office rate, not the facility rate. Commercial amounts are the contract rates you enter. Deductible, coinsurance, and sequestration are not a payment promise. Rules reviewed {reviewedLabel()}.</p>
    </aside>
  );
}

function Pay({ rows, worksheet, rates, onRate, onFill, onImport }: { rows: PricedRow[]; worksheet: Worksheet; rates: Rates; onRate: (license: License, code: string, amount: number | null) => void; onFill: (license: License, percent: number) => void; onImport: (text: string) => string }) {
  const [percent, setPercent] = useState("100");
  const [imported, setImported] = useState<string | null>(null);
  const commercial = worksheet.payer === "bcbsm" || worksheet.payer === "bcn" || worksheet.payer === "bcn-advantage" || worksheet.payer === "aetna" || worksheet.payer === "uhc";
  const intro = worksheet.payer === "medicare" ? `Original Medicare, participating psychologist, office. ${OFFICES[worksheet.locality]}. Type over a rate to override it.` : worksheet.payer === "uhc-ma" ? `Priced at the Medicare allowed amount for ${OFFICES[worksheet.locality]}. Type your Advantage contract rate to override it.` : `${payerProfile(worksheet.payer).label} does not publish this practice's allowed amount. Enter it from the contract or a remittance. Rates are saved on this browser.`;
  return (
    <div>
      <p className="text-sm leading-normal text-muted">{intro}</p>
      <ul className="mt-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 border-t border-line py-2">
            <span className="font-mono text-sm text-ink tabular-nums">
              {row.code}
              {row.rendering === "lp" && worksheet.license === "llp" ? " · LP" : ""}
              <span className="block font-sans text-xs text-muted">{row.source === "unpayable" ? "Medicare does not enroll an LLP" : row.source === "missing" ? "No rate yet" : row.source === "contract" ? "Contract rate" : "WPS 2026"}</span>
            </span>
            {row.source === "unpayable" ? null : <RateField payer={worksheet.payer} locality={worksheet.locality} code={row.code} stored={rates[rateKey(worksheet.payer, row.rendering, row.code)]} onCommit={(amount) => onRate(row.rendering, row.code, amount)} />}
          </li>
        ))}
      </ul>
      {commercial ? (
        <div className="mt-3 rounded-md bg-inset p-3">
          <p className="text-sm leading-normal text-muted">No contract handy? Fill the empty rates from a percent of Medicare. It is a stand-in, not the contract, and a rate you already typed is left alone.</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-sm text-muted">Percent of Medicare</span>
              <input inputMode="numeric" value={percent} aria-label="Percent of Medicare" onChange={(event) => setPercent(event.target.value.replace(/\D/g, "").slice(0, 3))} className="mt-1 h-11 w-24 rounded-md border border-line bg-paper px-3 text-base text-ink tabular-nums" />
            </label>
            <button type="button" className={button("quiet")} onClick={() => onFill(worksheet.license, Number(percent) || 100)}>Fill empty {worksheet.license === "llp" ? "LLP" : "LP"} rates</button>
            {worksheet.license === "llp" ? <button type="button" className={button("quiet")} onClick={() => onFill("lp", Number(percent) || 100)}>Fill empty LP rates</button> : null}
          </div>
        </div>
      ) : null}
      <div className="mt-3 rounded-md bg-inset p-3">
        <p className="text-sm leading-normal text-muted">Have a fee schedule file? Load a CSV with plan, license, code, and allowed_per_unit columns. It fills every plan in the file, replaces rates you typed for those codes, and stays on this browser.</p>
        <label className={`${button("quiet")} mt-2 cursor-pointer focus-within:ring-2 focus-within:ring-accent`}>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              input.value = "";
              if (!file) return;
              try {
                setImported(onImport(await file.text()));
              } catch {
                setImported("That file could not be read.");
              }
            }}
          />
          Load rates from CSV
        </label>
        <p aria-live="polite" className={imported ? "mt-2 text-sm leading-normal text-ink" : "sr-only"}>{imported ?? ""}</p>
      </div>
    </div>
  );
}

function RateField({ payer, locality, code, stored, onCommit }: { payer: Payer; locality: Locality; code: string; stored: number | undefined; onCommit: (amount: number | null) => void }) {
  const office = officeCents(locality, code);
  const dollars = office == null ? null : office / 100;
  const medicare = usesMedicareFee(payer);
  const shown = stored == null ? (medicare && dollars != null ? dollars.toFixed(2) : "") : stored.toFixed(2);
  const [value, setValue] = useState(shown);
  useEffect(() => setValue(shown), [shown]);
  return (
    <label className="flex shrink-0 items-center gap-1">
      <span className="text-sm text-muted" aria-hidden>$</span>
      <input
        inputMode="decimal"
        aria-label={`Allowed amount per unit for ${code}`}
        value={value}
        placeholder="per unit"
        onChange={(event) => setValue(event.target.value.replace(/[^0-9.]/g, "").slice(0, 8))}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={() => {
          const trimmed = value.trim();
          if (!trimmed) {
            onCommit(null);
            return;
          }
          const amount = Number(trimmed);
          if (!Number.isFinite(amount) || amount < 0 || amount > 10000) {
            setValue(shown);
            return;
          }
          const rounded = Math.round(amount * 100) / 100;
          onCommit(medicare && dollars != null && rounded === dollars ? null : rounded);
        }}
        className="h-11 w-28 rounded-md border border-line bg-paper px-3 text-right text-base text-ink tabular-nums placeholder:text-faint"
      />
    </label>
  );
}

function LineGroup({ label, lines, empty }: { label: string; lines: ReturnType<typeof codeWorksheet>["lines"]; empty: string }) {
  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-ink">{label}</p>
      {lines.length === 0 ? <p className="mt-1 text-sm leading-normal text-muted">{empty}</p> : <ul>{lines.map((line) => <LineView key={`${label}-${line.dayLabel ?? ""}-${line.code}-${line.basis}`} line={line} />)}</ul>}
    </div>
  );
}

function LineView({ line }: { line: ReturnType<typeof codeWorksheet>["lines"][number] }) {
  return (
    <li className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 border-t border-line py-3">
      <div>
        <p className="font-mono text-base font-medium text-ink tabular-nums">{line.code}</p>
        <p className="font-mono text-sm text-muted tabular-nums">× {line.units}</p>
      </div>
      <div>
        {line.dayLabel ? <p className="font-mono text-xs text-faint">{line.dayLabel}</p> : null}
        <p className="text-sm font-medium text-ink">{line.title}</p>
        <p className="text-sm leading-normal text-muted">{line.basis}</p>
      </div>
    </li>
  );
}

function DateBlock({ day, index, many, span, license, domain, rule, typical, onRename, onRemove, onActivity }: { day: Worksheet["dates"][number]; index: number; many: boolean; span: Span; license: License; domain: Domain; rule: TimeRule; typical: Activities | null; onRename: (label: string) => void; onRemove: () => void; onActivity: (key: keyof Activities, value: number) => void }) {
  const minutes = evalMinutes(day.activities);
  const broken = breakHours(minutes, rule);
  const pooled = span === "episode" && many;
  const code = pooled || license === "llp" || broken.base === 0 ? null : `${domain === "psychological" ? "96130" : "96132"} × 1${broken.additional ? ` · ${domain === "psychological" ? "96131" : "96133"} × ${broken.additional}` : ""}`;
  return (
    <div className={many ? "rounded-md border border-line p-3" : ""}>
      <div className="flex items-end justify-between gap-3">
        <label className="block min-w-0 flex-1">
          <span className="text-sm font-medium text-ink">Date {index + 1}</span>
          <input value={day.label} onChange={(event) => onRename(event.target.value)} aria-label={`Label for date ${index + 1}`} className="mt-2 h-11 w-full rounded-md border border-line bg-paper px-3 text-base text-ink placeholder:text-faint" />
        </label>
        {many ? <button type="button" className={button("ghost")} onClick={onRemove}>Remove</button> : null}
      </div>
      <ul className="mt-2 divide-y divide-line">
        {ACTIVITY_META.map((row) => (
          <li key={row.key} className="flex flex-col gap-3 py-4 first:pt-2 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 sm:pr-4">
              <h3 className="text-base font-medium text-ink">{row.label}</h3>
              {index === 0 ? <p className="text-sm leading-normal text-muted">{typical && typical[row.key] ? `${row.hint} Typical ${typical[row.key]} min.` : row.hint}</p> : null}
            </div>
            <Minutes label={`${day.label} ${row.label}`} value={day.activities[row.key]} onChange={(value) => onActivity(row.key, value)} />
          </li>
        ))}
      </ul>
      <div className="mt-2 rounded-md bg-inset px-3 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-ink">{many ? day.label || `Date ${index + 1}` : "Professional time"}</p>
          <p className="font-mono text-base text-ink tabular-nums">{minutes} min</p>
        </div>
        {code ? <p className="mt-1 font-mono text-sm text-accent tabular-nums">{code}</p> : null}
        <p className="mt-1 text-sm text-muted">{minutes <= 0 ? "Nothing on this date yet." : license === "llp" ? `${thresholdSentence(broken)} Not the LLP's claim, and not transferable to the LP.` : pooled ? "Counted in the episode. This date does not open its own base code." : thresholdSentence(broken)}</p>
      </div>
    </div>
  );
}

function AdminRow({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="rounded-md border border-line p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-medium text-ink">{label}</h3>
          <p className="text-sm text-muted">{hint}</p>
        </div>
        <Minutes label={label} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function Section({ index, title, lede, children }: { index: string; title: string; lede: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <div className="mb-4 flex gap-3">
        <span className="font-mono text-sm text-faint tabular-nums">{index}</span>
        <div>
          <h2 className="font-serif text-xl leading-snug text-ink">{title}</h2>
          <p className="mt-1 text-sm leading-normal text-muted">{lede}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Disclosure({ title, summary, children, className = "", defaultOpen = false, heading = false }: { title: string; summary?: string; children: ReactNode; className?: string; defaultOpen?: boolean; heading?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  // Opens itself when it starts needing attention, but never snaps shut while someone is using it.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  return (
    <details className={`group ${className}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className={heading ? "block font-serif text-xl leading-snug text-ink" : "block text-sm font-medium text-ink"}>{title}</span>
          {summary ? <span className="block text-sm text-muted">{summary}</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

function Choice({ pressed, label, hint, onClick }: { pressed: boolean; label: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`min-h-11 rounded-md border px-3 py-2 text-left ${pressed ? "border-accent bg-accent text-on-accent" : "border-line bg-paper text-ink hover:border-accent"}`}>
      <span className="block text-sm font-medium">{label}</span>
      <span className={`block text-sm ${pressed ? "text-on-accent/80" : "text-muted"}`}>{hint}</span>
    </button>
  );
}

function Minutes({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex shrink-0 items-center rounded-md bg-inset p-1">
      <button type="button" className="flex size-11 items-center justify-center rounded-sm text-ink hover:bg-card" aria-label={`Subtract 15 minutes from ${label}`} onClick={() => onChange(value - 15)}><Minus className="size-4" aria-hidden /></button>
      <input inputMode="numeric" aria-label={`${label} in minutes`} className="w-14 bg-transparent text-center font-mono text-base text-ink tabular-nums outline-none" value={String(value)} onChange={(event) => onChange(clampMinutes(Number(event.target.value.replace(/\D/g, "")) || 0))} />
      <span className="pr-1 text-sm text-muted">min</span>
      <button type="button" className="flex size-11 items-center justify-center rounded-sm text-ink hover:bg-card" aria-label={`Add 15 minutes to ${label}`} onClick={() => onChange(value + 15)}><Plus className="size-4" aria-hidden /></button>
    </div>
  );
}

function Copy({ label, text, tone }: { label: string; text: string; tone: "primary" | "quiet" }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={button(tone)} onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); window.setTimeout(() => setDone(false), 1600); } catch { setDone(false); } }}>
      {done ? <Check className="mr-2 size-4" aria-hidden /> : null}
      {done ? "Copied" : label}
    </button>
  );
}

function button(tone: "primary" | "quiet" | "ghost") {
  const base = "inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40";
  if (tone === "primary") return `${base} bg-accent text-on-accent hover:bg-accent/90`;
  if (tone === "ghost") return `${base} bg-transparent text-muted hover:bg-inset hover:text-ink`;
  return `${base} bg-inset text-ink hover:bg-line`;
}
