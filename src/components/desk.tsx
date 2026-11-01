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
import { OFFICES, fillRates, money, priceClaim, rateKey, readRates, type Rates, usesMedicareFee, officeCents } from "@/lib/fees";
import { missedCodes } from "@/lib/review";

const DRAFT_KEY = "proper.draft.v1";
const SAVED_KEY = "proper.saved.v1";
const RATES_KEY = "proper.rates.v1";

type Saved = { id: string; name: string; savedAt: string; worksheet: Worksheet };
type Result = ReturnType<typeof codeWorksheet>;
type Quote = ReturnType<typeof priceClaim>;

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

const STEPS = [
  { id: "setup", label: "Setup" },
  { id: "tests", label: "Tests" },
  { id: "time", label: "Professional time" },
  { id: "separate", label: "Billed separately" },
] as const;

export function Desk() {
  const [worksheet, setWorksheet] = useState<Worksheet>(EMPTY);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [rates, setRates] = useState<Rates>({});
  const [query, setQuery] = useState("");
  const [browse, setBrowse] = useState(false);
  const [notice, setNotice] = useState<{ text: string; worksheet?: Worksheet } | null>(null);
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
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.worksheet ? 10000 : 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function replaceWorksheet(next: Worksheet, text: string) {
    setNotice(hasWork(worksheet) ? { text, worksheet } : null);
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
    setNotice({ text: `Saved ${name}.` });
  }

  function removeSaved(id: string) {
    setSaved((current) => {
      const next = current.filter((item) => item.id !== id);
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      return next;
    });
  }

  const visible = TESTS.filter((test) => test.name.toLowerCase().includes(query.trim().toLowerCase()));
  const searching = query.trim() !== "";
  const showCatalog = browse || searching || worksheet.tests.length === 0;
  const customName = searching && !TESTS.some((test) => test.name.toLowerCase() === query.trim().toLowerCase()) ? query.trim() : null;
  const plan = payerProfile(worksheet.payer);
  const llp = worksheet.license === "llp";
  const separateCount = (worksheet.diagnosticInterview ? 1 : 0) + (worksheet.neurobehavioral > 0 ? 1 : 0) + worksheet.screeners.length;
  const stepStatus: Record<(typeof STEPS)[number]["id"], string> = {
    setup: `${llp ? "LLP" : "LP"}, ${plan.label}`,
    tests: worksheet.tests.length === 0 ? "None yet" : `${worksheet.tests.length} selected`,
    time: `${result.professional} min`,
    separate: separateCount === 0 ? "None" : `${separateCount} added`,
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="z-20 border-b lg:sticky lg:top-0 border-line bg-surface/90 backdrop-blur no-print">
        <div className="mx-auto flex max-w-[76rem] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <p className="mr-auto text-lg font-semibold tracking-tight text-ink sm:mr-0">Proper</p>
          <span className="hidden h-5 w-px bg-line sm:block" aria-hidden />
          <label className="order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
            <span className="sr-only">Worksheet name. No names, dates of birth, or member IDs.</span>
            <input
              value={worksheet.name}
              onChange={(event) => patch({ name: event.target.value.slice(0, 80) })}
              placeholder="Untitled worksheet"
              className="h-10 w-full min-w-0 rounded-control border border-line bg-sunken px-3 text-base font-medium sm:border-transparent sm:bg-transparent sm:px-2 text-ink placeholder:text-faint hover:border-line focus:border-accent focus:bg-surface"
            />
          </label>
          <Menu label="Open">
            <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted">Examples</p>
            {PRESETS.map((preset) => (
              <MenuItem key={preset.id} onClick={() => replaceWorksheet(preset.worksheet, `Loaded the ${preset.label} example.`)} title={preset.label} detail={preset.detail} />
            ))}
            <p className="border-t border-line px-3 pt-3 pb-1 text-xs font-medium text-muted">Saved on this browser</p>
            {saved.length === 0 ? <p className="px-3 pb-3 text-sm text-muted">Nothing saved yet.</p> : null}
            {saved.map((item) => (
              <div key={item.id} className="flex items-center">
                <MenuItem onClick={() => replaceWorksheet(item.worksheet, `Opened ${item.name}.`)} title={item.name} />
                <button type="button" className="h-10 shrink-0 px-3 text-sm text-muted hover:text-warn" aria-label={`Remove ${item.name}`} onClick={() => removeSaved(item.id)}>
                  Remove
                </button>
              </div>
            ))}
          </Menu>
          <button type="button" className={button("quiet")} onClick={saveWorksheet}>Save</button>
          <button type="button" className={`${button("ghost")} hidden sm:inline-flex`} onClick={() => replaceWorksheet(EMPTY, "Worksheet cleared.")}>Clear</button>
        </div>
        <nav aria-label="Sections" className="mx-auto max-w-[76rem] overflow-x-auto px-4">
          <ol className="flex gap-1 pb-2">
            {STEPS.map((step, index) => (
              <li key={step.id} className="shrink-0">
                <a href={`#${step.id}`} className="flex items-center gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-sunken">
                  <span className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent tabular-nums">{index + 1}</span>
                  <span className="font-medium text-ink">{step.label}</span>
                  <span className="text-muted tabular-nums">{stepStatus[step.id]}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <main className="mx-auto grid max-w-[76rem] items-start gap-6 px-4 pt-6 pb-28 lg:grid-cols-[minmax(0,1fr)_23rem] lg:pb-16">
        <div className="min-w-0 overflow-hidden rounded-sheet border border-line bg-surface">
          <Section id="setup" step={1} title="Setup" lede="Who is billing and which plan. The license decides which testing codes can go on the claim.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Segmented
                label="Who is billing"
                value={worksheet.license}
                options={[
                  { value: "lp", label: "LP" },
                  { value: "llp", label: "LLP" },
                ]}
                onChange={(license) => patch({ license })}
                hint={llp ? "Master's limited license, practicing under an LP. Testing evaluation stays with the LP." : "Fully licensed psychologist. Evaluation, their own administration, and supervised technician time can go on this claim."}
              />
              <Segmented
                label="Kind of evaluation"
                value={worksheet.domain}
                options={[
                  { value: "psychological", label: "Psychological" },
                  { value: "neuropsychological", label: "Neuropsych" },
                ]}
                onChange={(domain: Domain) => patch({ domain })}
                hint={llp && worksheet.domain === "neuropsychological" ? "An LLP does not bill 96132 or 96133. That evaluation stays with the supervising LP." : worksheet.domain === "psychological" ? "Evaluation codes 96130 and 96131." : "Evaluation codes 96132 and 96133."}
              />
            </div>
            <fieldset className="mt-6">
              <legend className="text-sm font-medium text-ink">Plan</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {PAYERS.map((option) => {
                  const on = worksheet.payer === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => selectPayer(option.id)}
                      className={`rounded-control border px-3 py-2 text-left transition-colors ${on ? "border-accent bg-accent-soft shadow-[inset_0_0_0_1px_var(--color-accent)]" : "border-line bg-surface hover:border-faint"}`}
                    >
                      <span className="block text-sm font-medium text-ink">{option.label}</span>
                      <span className="block text-xs text-muted">{option.hint}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{plan.rule} Rules reviewed {reviewedLabel()}.</p>
            </fieldset>
            <div className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_15rem]">
              <Segmented
                label="Office"
                value={worksheet.locality}
                options={[
                  { value: "01", label: "Ann Arbor, West Bloomfield" },
                  { value: "99", label: "East Lansing" },
                ]}
                onChange={(locality: Locality) => patch({ locality })}
                hint={worksheet.locality === "01" ? "Medicare locality 01, Detroit. Telehealth uses the same locality." : "Medicare locality 99, rest of Michigan. Telehealth uses the same locality."}
              />
              <Segmented
                label="Where"
                value={worksheet.setting}
                options={[
                  { value: "in-person", label: "In person" },
                  { value: "telehealth", label: "Telehealth" },
                ]}
                onChange={(setting) => patch({ setting })}
                hint={worksheet.setting === "in-person" ? "The default for test administration." : "Confirm the plan and each publisher before coding administration."}
              />
            </div>
            <Disclosure
              className="mt-6 rounded-control border border-line px-3"
              title="Plan rules"
              summary={`${worksheet.span === "episode" ? "Whole episode" : "Each date"}, ${worksheet.timeRule === "midpoint" ? "CPT midpoint" : "completed blocks"}${worksheet.span !== plan.span || worksheet.timeRule !== plan.timeRule ? ". Changed from the plan default." : ". Set by the plan."}`}
            >
              <div className="grid gap-5 pb-3 sm:grid-cols-2">
                <Segmented
                  label="Multiple dates"
                  value={worksheet.span}
                  options={[
                    { value: "episode", label: "Whole episode" },
                    { value: "per-date", label: "Each date" },
                  ]}
                  onChange={(span: Span) => patch({ span })}
                  hint={worksheet.span === "episode" ? "One base code, reported on the last date." : "Only if the plan requires a base code per day."}
                />
                <Segmented
                  label="How time is counted"
                  value={worksheet.timeRule}
                  options={[
                    { value: "midpoint", label: "CPT midpoint" },
                    { value: "completed", label: "Completed" },
                  ]}
                  onChange={(timeRule: TimeRule) => patch({ timeRule })}
                  hint={worksheet.timeRule === "midpoint" ? "31 min counts as an hour, 16 min as 30." : "Only a full 60 or full 30 minutes counts."}
                />
              </div>
            </Disclosure>
          </Section>

          <Section
            id="tests"
            step={2}
            title="Tests and administration"
            lede={llp ? "An LLP's administration is technician time on the supervising LP's claim, 96138 and 96139, not 96136. Two or more tests are still required." : "Giving the tests and scoring them. Scoring follows the person who scores. 96136 and 96138 need two or more tests."}
          >
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
              className={field("w-full")}
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
            {worksheet.tests.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {worksheet.tests.map((name) => (
                  <li key={name}>
                    <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent pr-2.5 pl-3.5 text-sm font-medium text-on-accent hover:bg-accent-strong" onClick={() => toggleNamed("tests", name)} aria-label={`Remove ${name}`}>
                      {name}
                      <span className="text-on-accent/70" aria-hidden>×</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!searching && worksheet.tests.length > 0 ? (
              <button type="button" aria-expanded={browse} className={`${button("ghost")} mt-2 -ml-2`} onClick={() => setBrowse((open) => !open)}>
                <ChevronDown className={`mr-1 size-4 transition-transform ${browse ? "rotate-180" : ""}`} aria-hidden />
                {browse ? "Hide the test list" : `Browse all ${TESTS.length} tests`}
              </button>
            ) : null}
            <div className={`mt-4 grid gap-4 sm:grid-cols-2 ${showCatalog ? "" : "hidden"}`}>
              {GROUPS.map((group) => {
                const tests = visible.filter((test) => test.group === group);
                if (tests.length === 0) return null;
                return (
                  <div key={group}>
                    <h3 className="text-xs font-medium text-muted">{group}</h3>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {tests.map((test) => {
                        const on = worksheet.tests.some((name) => name.toLowerCase() === test.name.toLowerCase());
                        return (
                          <button
                            key={test.name}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleNamed("tests", test.name)}
                            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${on ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-surface text-ink hover:border-faint"}`}
                          >
                            {test.name}
                            <span className={on ? "text-accent/70" : "text-faint"}>{test.minutes}′</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {worksheet.tests.length === 1 ? (
              <label className="mt-4 flex items-start gap-3 rounded-control bg-sunken px-3 py-2.5 text-sm leading-relaxed text-ink">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={worksheet.singleAutomated} onChange={(event) => patch({ singleAutomated: event.target.checked })} />
                Single automated electronic instrument. This is 96146 once, not a timed administration code.
              </label>
            ) : null}

            <div className="mt-6 flex flex-col items-start gap-3 rounded-control bg-sunken px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted">
                {worksheet.tests.length === 0
                  ? "Pick the instruments first. Typical time then fills administration and professional work as a starting point, not the chart."
                  : `Typical for this battery: ${suggestion.admin} min administration, about ${evalMinutes(suggestion.activities)} min professional work.${suggestion.ratingScales.length > 0 ? ` ${suggestion.ratingScales.join(", ")} ${suggestion.ratingScales.length === 1 ? "is a rating scale" : "are rating scales"} completed on their own, so add only your scoring time.` : ""}`}
              </p>
              <button type="button" className={button("primary")} disabled={worksheet.tests.length === 0} onClick={applyTypical}>Use typical time</button>
            </div>
            <div className="mt-3 divide-y divide-line rounded-control border border-line">
              <TimeRow
                label={llp ? "LLP gave the tests" : "Psychologist"}
                hint={llp ? "Becomes 96138 on the supervising LP's claim." : "96136 and 96137"}
                value={worksheet.adminQhp}
                onChange={(adminQhp) => patch({ adminQhp })}
              />
              <TimeRow label="Technician or psychometrist" hint="96138 and 96139" value={worksheet.adminTech} onChange={(adminTech) => patch({ adminTech })} />
            </div>
          </Section>

          <Section
            id="time"
            step={3}
            title="Professional time"
            lede={
              llp
                ? "Enter each date the LLP worked. These minutes still do not become 96130 or 96132. The supervising LP bills evaluation only for the LP's own time."
                : worksheet.span === "episode"
                  ? "Selection, gathering, interpretation, report, and feedback. Desk time counts. Dates add up to one base code on the last date. A diagnostic interview does not go here."
                  : "Selection, gathering, interpretation, report, and feedback. Desk time counts. Each date starts the hour over. A diagnostic interview does not go here."
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
                <Plus className="mr-2 size-4" aria-hidden />
                Add a date
              </button>
            ) : (
              <p className="mt-4 text-sm text-muted">Eight dates is the limit on one worksheet.</p>
            )}
          </Section>

          <Section id="separate" step={4} title="Billed separately" lede="Not part of the testing evaluation. Each has its own code, and its minutes are not counted as testing.">
            <div className="divide-y divide-line rounded-control border border-line">
              <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                <span>
                  <span className="block text-sm font-medium text-ink">Diagnostic interview</span>
                  <span className="block text-sm text-muted">90791, once. Do not also count those minutes as testing.</span>
                </span>
                <Switch checked={worksheet.diagnosticInterview} onChange={(diagnosticInterview) => patch({ diagnosticInterview })} label="Diagnostic interview" />
              </label>
              <TimeRow label="Neurobehavioral status exam" hint="96116 and 96121. A clinical exam of thinking and judgment, not the battery." value={worksheet.neurobehavioral} onChange={(neurobehavioral) => patch({ neurobehavioral })} />
              <div className="px-4 py-3">
                <p className="text-sm font-medium text-ink">Brief measures</p>
                <p className="text-sm text-muted">96127, one unit each. Do not also list these in the battery.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SCREENERS.map((name) => {
                    const on = worksheet.screeners.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleNamed("screeners", name)}
                        className={`inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors ${on ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-surface text-ink hover:border-faint"}`}
                      >
                        {on ? <Check className="mr-1 size-3.5" aria-hidden /> : null}
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Section>

          <div className="border-t border-line bg-sunken/60 px-5 sm:px-8">
            <Disclosure title="Which code is which" summary={`The ${CODE_GUIDE.length} codes this sheet can suggest, and when each applies.`}>
              <dl className="grid gap-x-6 pb-4 sm:grid-cols-2">
                {CODE_GUIDE.map((item) => (
                  <div key={item.code} className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3 border-t border-line py-2.5">
                    <dt className="text-sm font-semibold text-ink tabular-nums">{item.code}</dt>
                    <dd>
                      <span className="block text-sm text-ink">{item.use}</span>
                      <span className="block text-sm text-muted">{item.when}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Disclosure>
          </div>
        </div>

        <Claim
          result={result}
          quote={quote}
          missed={missed}
          worksheet={worksheet}
          rates={rates}
          onExample={(index) => replaceWorksheet(PRESETS[index].worksheet, `Loaded the ${PRESETS[index].label} example.`)}
          onRate={(license, code, amount) =>
            setRates((current) => {
              const key = rateKey(worksheet.payer, license, code);
              const next = { ...current };
              if (amount == null) delete next[key];
              else next[key] = amount;
              return next;
            })
          }
          onFill={(license, percent) => setRates((current) => fillRates(current, worksheet.payer, license, worksheet.locality, percent))}
        />
      </main>

      {notice ? (
        <div role="status" className="fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 lg:bottom-6 no-print">
          <div className="flex items-center gap-3 rounded-full bg-panel py-1.5 pr-1.5 pl-4 text-sm text-on-panel shadow-lg">
            <span>{notice.text}</span>
            {notice.worksheet ? (
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-full bg-on-panel/10 px-3 font-medium hover:bg-on-panel/20"
                onClick={() => {
                  if (notice.worksheet) setWorksheet(notice.worksheet);
                  setNotice(null);
                }}
              >
                <Undo2 className="mr-1.5 size-4" aria-hidden />
                Undo
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <MobileSummary result={result} quote={quote} worksheet={worksheet} />
    </div>
  );
}

function hasWork(w: Worksheet): boolean {
  return w.tests.length > 0 || w.screeners.length > 0 || w.adminQhp > 0 || w.adminTech > 0 || w.neurobehavioral > 0 || w.diagnosticInterview || w.dates.some((day) => evalMinutes(day.activities) > 0);
}

type PricedRow = { key: string; code: string; units: number; rendering: License; cents: number | null; extended: number | null; source: Quote["lines"][number]["source"] };

/** One row per code and rendering clinician, so multi-date lines collapse into a single total. */
function priceRows(quote: Quote): PricedRow[] {
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

const KINDS = [
  { id: "evaluation", label: "Evaluation", swatch: "bg-[var(--color-seg-eval)]" },
  { id: "administration", label: "Administration", swatch: "bg-[var(--color-seg-admin)]" },
  { id: "separate", label: "Billed separately", swatch: "bg-[var(--color-seg-other)]" },
] as const;

function kindOf(code: string): (typeof KINDS)[number]["id"] {
  if (/^961(30|31|32|33)$/.test(code)) return "evaluation";
  if (/^961(36|37|38|39|46)$/.test(code)) return "administration";
  return "separate";
}

function MobileSummary({ result, quote, worksheet }: { result: Result; quote: Quote; worksheet: Worksheet }) {
  const units = result.totals.reduce((sum, item) => sum + item.units, 0);
  const holds = result.flags.filter((flag) => flag.tone === "hold").length + result.suppressed.length;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 bg-panel px-4 py-3 text-on-panel no-print lg:hidden">
      <div className="mx-auto flex max-w-[76rem] items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight tabular-nums">
            {quote.allowedCents != null && result.totals.length > 0 ? money(quote.allowedCents) : result.totals.length === 0 ? "No codes yet" : worksheet.payer === "cpt" ? `${units} ${units === 1 ? "unit" : "units"}` : "Rates missing"}
          </p>
          <p className="truncate text-sm text-panel-muted tabular-nums">
            {result.totals.length === 0 ? "Pick tests and enter time." : result.totals.map((item) => `${item.code}×${item.units}`).join("  ")}
            {holds ? `  ·  ${holds} to fix` : ""}
          </p>
        </div>
        <a href="#claim" className="inline-flex h-10 shrink-0 items-center rounded-full bg-on-panel px-4 text-sm font-semibold whitespace-nowrap text-panel">See codes</a>
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
  onExample,
  onRate,
  onFill,
}: {
  result: Result;
  quote: Quote;
  missed: ReturnType<typeof missedCodes>;
  worksheet: Worksheet;
  rates: Rates;
  onExample: (index: number) => void;
  onRate: (license: License, code: string, amount: number | null) => void;
  onFill: (license: License, percent: number) => void;
}) {
  const own = result.lines.filter((line) => line.billedBy !== "supervisor");
  const supervisor = result.lines.filter((line) => line.billedBy === "supervisor");
  const llp = worksheet.license === "llp";
  const rows = priceRows(quote);
  const missing = rows.filter((row) => row.source === "missing").length;
  const checks = missed.length + result.pending.length + result.suppressed.length + result.flags.length;
  const holds = result.flags.filter((flag) => flag.tone === "hold").length + result.suppressed.length;
  const total = quote.allowedCents;
  const noPlan = worksheet.payer === "cpt";
  const units = rows.reduce((sum, row) => sum + row.units, 0);
  const shares = total != null && total > 0 ? KINDS.map((kind) => ({ ...kind, cents: rows.filter((row) => kindOf(row.code) === kind.id).reduce((sum, row) => sum + (row.extended ?? 0), 0) })).filter((kind) => kind.cents > 0) : [];
  const status =
    noPlan
      ? "Pick a plan in Setup to see expected dollars."
      : missing > 0
        ? `Add a contract rate for ${missing} ${missing === 1 ? "code" : "codes"} under Rates.`
        : quote.medicareShareCents != null && quote.coinsuranceCents != null
          ? `Medicare pays ${money(quote.medicareShareCents)} once the deductible is met, plus ${money(quote.coinsuranceCents)} coinsurance. Before the 2% sequestration cut.`
          : worksheet.payer === "uhc-ma"
            ? `Medicare allowed for ${OFFICES[worksheet.locality]}. An Advantage contract can differ.`
            : "From the contract rates on file.";
  const context = `${payerProfile(worksheet.payer).label}, ${llp ? "LLP" : "LP"}, ${worksheet.dates.length > 1 ? (worksheet.span === "episode" ? "one episode on the last date" : `${worksheet.dates.length} dates each with a base code`) : "one date of service"}`;
  return (
    <aside id="claim" className="claim-panel flex scroll-mt-4 flex-col gap-3 lg:scroll-mt-28">
      <div aria-live="polite" className="rounded-sheet bg-panel p-5 text-on-panel">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">What to bill</h2>
          <p className="truncate text-xs text-panel-muted">{context}</p>
        </div>
        {rows.length === 0 ? (
          <div className="mt-4">
            <p className="text-sm leading-relaxed text-panel-muted">
              {result.suppressed.length > 0 ? "Nothing this license can bill from the time entered." : "Nothing to bill yet. Pick two or more tests and enter the time, or start from an example."}
            </p>
            {result.suppressed.length === 0 ? (
              <div className="mt-3 flex flex-col gap-1.5">
                {PRESETS.map((preset, index) => (
                  <button key={preset.id} type="button" onClick={() => onExample(index)} className="rounded-control bg-on-panel/[0.07] px-3 py-2 text-left hover:bg-on-panel/[0.12]">
                    <span className="block text-sm font-medium">{preset.label}</span>
                    <span className="block text-xs text-panel-muted">{preset.detail}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-panel-muted">{noPlan ? "Units to bill" : "Expected allowed"}</p>
            <p className="text-[2.75rem] leading-none font-semibold tracking-tight tabular-nums">{noPlan ? units : total == null ? "—" : money(total)}</p>
            <p className="mt-2 text-sm leading-relaxed text-panel-muted">{status}</p>
            {shares.length > 0 && total != null ? (
              <div className="mt-4">
                <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={shares.map((kind) => `${kind.label} ${money(kind.cents)}`).join(", ")}>
                  {shares.map((kind) => (
                    <span key={kind.id} className={kind.swatch} style={{ width: `${(kind.cents / total) * 100}%` }} />
                  ))}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-panel-muted">
                  {shares.map((kind) => (
                    <li key={kind.id} className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${kind.swatch}`} aria-hidden />
                      {kind.label} {Math.round((kind.cents / total) * 100)}%
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ul className="mt-4 border-t border-panel-line">
              {rows.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-3 border-b border-panel-line py-2">
                  <span className="flex items-center gap-2">
                    <span className={`size-2 shrink-0 rounded-full ${KINDS.find((kind) => kind.id === kindOf(row.code))?.swatch ?? ""}`} aria-hidden />
                    <span className="text-[0.95rem] font-semibold tabular-nums">{row.code}</span>
                    <span className="text-sm text-panel-muted tabular-nums">× {row.units}</span>
                    {llp && row.rendering === "lp" ? <span className="rounded-full bg-on-panel/10 px-1.5 text-xs">LP</span> : null}
                  </span>
                  <span className="text-sm tabular-nums">{noPlan ? null : row.source === "unpayable" ? <span className="text-panel-muted">not payable</span> : row.extended == null ? <span className="text-panel-muted">no rate</span> : money(row.extended)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-2 no-print">
              <Copy label="Copy note" text={result.note} tone="light" />
              <Copy label="Copy codes" text={result.codesText || "No codes"} tone="outline" />
            </div>
          </>
        )}
      </div>

      {checks > 0 || result.lines.length > 0 ? (
        <div className="rounded-sheet border border-line bg-surface p-5">
          {checks > 0 ? (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                Review before billing
                <span className="rounded-full bg-sunken px-2 text-xs font-medium text-muted tabular-nums">{checks}</span>
                {holds > 0 ? <span className="rounded-full bg-warn-soft px-2 text-xs font-medium text-warn">{holds} to fix</span> : null}
              </h3>
              <ul className="mt-3 flex flex-col gap-2">
                {result.suppressed.map((item) => (
                  <Note key={item.label} tone="hold" lead="Not coded.">{item.reason}</Note>
                ))}
                {result.flags.filter((flag) => flag.tone === "hold").map((flag) => (
                  <Note key={flag.text} tone="hold" lead="Do not report.">{flag.text}</Note>
                ))}
                {missed.map((item) => (
                  <Note key={item.text} tone="tip" lead={`Might be missing ${item.code}.`}>{item.text}</Note>
                ))}
                {result.pending.map((item) => (
                  <Note key={item.title} tone="tip" lead="Short of a unit.">{item.title}. {item.detail}</Note>
                ))}
                {result.flags.filter((flag) => flag.tone !== "hold").map((flag) => (
                  <Note key={flag.text} tone="check" lead="Check.">{flag.text}</Note>
                ))}
              </ul>
            </div>
          ) : null}

          {result.lines.length > 0 ? (
            <Disclosure className={checks > 0 ? "mt-4 border-t border-line" : ""} title="How the units were counted" summary="The minutes behind each line.">
              {llp ? (
                <div className="pb-2">
                  <LineGroup label="LLP" lines={own} empty="Nothing on the LLP's own claim." />
                  <LineGroup label="Supervising LP" lines={supervisor} empty="Nothing from this worksheet. Do not move the LLP's evaluation time onto the LP." />
                </div>
              ) : (
                <ul className="pb-2">{own.map((line, index) => <LineView key={`${index}-${line.dayLabel ?? ""}-${line.code}`} line={line} />)}</ul>
              )}
            </Disclosure>
          ) : null}

          {rows.length > 0 && worksheet.payer !== "cpt" ? (
            <Disclosure className="border-t border-line" title="Rates" summary={missing > 0 ? `${missing} missing.` : usesMedicareFee(worksheet.payer) ? "2026 WPS office rates." : "Contract rates on file."} defaultOpen={missing > 0}>
              <Pay rows={rows} worksheet={worksheet} rates={rates} onRate={onRate} onFill={onFill} />
            </Disclosure>
          ) : null}
        </div>
      ) : null}

      <p className="px-1 text-xs leading-relaxed text-muted">
        Worksheet only. Not a claim and not a benefits quote. Medicare amounts are the 2026 WPS participating office rate, not the facility rate. Commercial amounts are the contract rates you enter. Deductible, coinsurance, and sequestration are not a payment promise. Rules reviewed {reviewedLabel()}.
      </p>
    </aside>
  );
}

function Note({ tone, lead, children }: { tone: "hold" | "tip" | "check"; lead: string; children: ReactNode }) {
  const style = tone === "hold" ? "border-warn/30 bg-warn-soft text-warn" : tone === "tip" ? "border-accent/20 bg-accent-soft text-ink" : "border-line bg-sunken text-ink";
  return (
    <li className={`rounded-control border px-3 py-2 text-sm leading-relaxed ${style}`}>
      <span className="font-semibold">{lead} </span>
      {children}
    </li>
  );
}

function Pay({ rows, worksheet, rates, onRate, onFill }: { rows: PricedRow[]; worksheet: Worksheet; rates: Rates; onRate: (license: License, code: string, amount: number | null) => void; onFill: (license: License, percent: number) => void }) {
  const [percent, setPercent] = useState("100");
  const commercial = worksheet.payer === "bcbsm" || worksheet.payer === "bcn" || worksheet.payer === "aetna" || worksheet.payer === "uhc";
  const intro =
    worksheet.payer === "medicare"
      ? `Original Medicare, participating psychologist, office. ${OFFICES[worksheet.locality]}. Type over a rate to override it.`
      : worksheet.payer === "uhc-ma"
        ? `Priced at the Medicare allowed amount for ${OFFICES[worksheet.locality]}. Type your Advantage contract rate to override it.`
        : `${payerProfile(worksheet.payer).label} does not publish this practice's allowed amount. Enter it from the contract or a remittance. Rates are saved on this browser.`;
  return (
    <div className="pb-3">
      <p className="text-sm leading-relaxed text-muted">{intro}</p>
      <ul className="mt-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 border-t border-line py-2">
            <span>
              <span className="block text-sm font-semibold text-ink tabular-nums">
                {row.code}
                {row.rendering === "lp" && worksheet.license === "llp" ? " (LP)" : ""}
              </span>
              <span className="block text-xs text-muted">{row.source === "unpayable" ? "Medicare does not enroll an LLP" : row.source === "missing" ? "No rate yet" : row.source === "contract" ? "Contract rate" : "WPS 2026"}</span>
            </span>
            {row.source === "unpayable" ? null : <RateField payer={worksheet.payer} locality={worksheet.locality} code={row.code} stored={rates[rateKey(worksheet.payer, row.rendering, row.code)]} onCommit={(amount) => onRate(row.rendering, row.code, amount)} />}
          </li>
        ))}
      </ul>
      {commercial ? (
        <div className="mt-3 rounded-control bg-sunken p-3">
          <p className="text-sm leading-relaxed text-muted">No contract handy? Fill the empty rates from a percent of Medicare. It is a stand-in, not the contract, and a rate you already typed is left alone.</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-xs text-muted">Percent of Medicare</span>
              <input inputMode="numeric" value={percent} aria-label="Percent of Medicare" onChange={(event) => setPercent(event.target.value.replace(/\D/g, "").slice(0, 3))} className={field("mt-1 w-20 tabular-nums")} />
            </label>
            <button type="button" className={button("quiet")} onClick={() => onFill(worksheet.license, Number(percent) || 100)}>Fill empty {worksheet.license === "llp" ? "LLP" : "LP"} rates</button>
            {worksheet.license === "llp" ? <button type="button" className={button("quiet")} onClick={() => onFill("lp", Number(percent) || 100)}>Fill empty LP rates</button> : null}
          </div>
        </div>
      ) : null}
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
    <label className="relative flex shrink-0 items-center">
      <span className="pointer-events-none absolute left-3 text-sm text-faint" aria-hidden>$</span>
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
        className={field("w-28 pl-6 text-right tabular-nums")}
      />
    </label>
  );
}

function LineGroup({ label, lines, empty }: { label: string; lines: Result["lines"]; empty: string }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      {lines.length === 0 ? <p className="mt-1 text-sm leading-relaxed text-muted">{empty}</p> : <ul>{lines.map((line) => <LineView key={`${label}-${line.dayLabel ?? ""}-${line.code}-${line.basis}`} line={line} />)}</ul>}
    </div>
  );
}

function LineView({ line }: { line: Result["lines"][number] }) {
  return (
    <li className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 border-t border-line py-2.5 first:border-t-0">
      <div>
        <p className="text-sm font-semibold text-ink tabular-nums">{line.code}</p>
        <p className="text-sm text-muted tabular-nums">× {line.units}</p>
      </div>
      <div>
        {line.dayLabel ? <p className="text-xs font-medium text-accent">{line.dayLabel}</p> : null}
        <p className="text-sm font-medium text-ink">{line.title}</p>
        <p className="text-sm leading-relaxed text-muted">{line.basis}</p>
      </div>
    </li>
  );
}

function DateBlock({ day, index, many, span, license, domain, rule, typical, onRename, onRemove, onActivity }: { day: Worksheet["dates"][number]; index: number; many: boolean; span: Span; license: License; domain: Domain; rule: TimeRule; typical: Activities | null; onRename: (label: string) => void; onRemove: () => void; onActivity: (key: keyof Activities, value: number) => void }) {
  const minutes = evalMinutes(day.activities);
  const broken = breakHours(minutes, rule);
  const pooled = span === "episode" && many;
  const code = pooled || license === "llp" || broken.base === 0 ? null : `${domain === "psychological" ? "96130" : "96132"} × 1${broken.additional ? `, ${domain === "psychological" ? "96131" : "96133"} × ${broken.additional}` : ""}`;
  const note = minutes <= 0 ? "Nothing on this date yet." : license === "llp" ? `${thresholdSentence(broken)} Not the LLP's claim, and not transferable to the LP.` : pooled ? "Counted in the episode. This date does not open its own base code." : thresholdSentence(broken);
  return (
    <div className="rounded-control border border-line">
      {many ? (
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <input value={day.label} onChange={(event) => onRename(event.target.value)} aria-label={`Label for date ${index + 1}`} className="h-9 min-w-0 flex-1 rounded-control border border-transparent bg-transparent px-2 -ml-2 text-sm font-semibold text-ink hover:border-line focus:border-accent" />
          <button type="button" className={button("ghost")} onClick={onRemove}>Remove</button>
        </div>
      ) : null}
      <div className="divide-y divide-line">
        {ACTIVITY_META.map((row) => (
          <TimeRow
            key={row.key}
            label={row.label}
            hint={index === 0 ? (typical && typical[row.key] ? `${row.hint} Typical ${typical[row.key]} min.` : row.hint) : undefined}
            value={day.activities[row.key]}
            onChange={(value) => onActivity(row.key, value)}
            ariaLabel={`${day.label} ${row.label}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-b-control border-t border-line bg-sunken px-4 py-3">
        <p className="text-sm text-muted">{note}</p>
        <p className="flex items-baseline gap-3 tabular-nums">
          {code ? <span className="text-sm font-semibold text-accent">{code}</span> : null}
          <span className="text-base font-semibold text-ink">{minutes} min</span>
        </p>
      </div>
    </div>
  );
}

function TimeRow({ label, hint, value, onChange, ariaLabel }: { label: string; hint?: string; value: number; onChange: (value: number) => void; ariaLabel?: string }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint ? <p className="text-sm leading-relaxed text-muted">{hint}</p> : null}
      </div>
      <Minutes label={ariaLabel ?? label} value={value} onChange={onChange} />
    </div>
  );
}

function Section({ id, step, title, lede, children }: { id: string; step: number; title: string; lede: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 border-t border-line px-5 lg:scroll-mt-32 py-6 first:border-t-0 sm:px-8 sm:py-8">
      <div className="mb-5 flex gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-on-accent tabular-nums">{step}</span>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">{lede}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; hint?: string }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <div className="mt-2 flex rounded-control bg-sunken p-1">
        {options.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(option.value)}
              className={`min-h-9 flex-1 rounded-[calc(var(--radius-control)-3px)] px-3 py-1.5 text-sm transition-colors ${on ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgb(23_33_43/0.12),0_0_0_1px_rgb(23_33_43/0.06)]" : "text-muted hover:text-ink"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {hint ? <p className="mt-2 text-sm leading-relaxed text-muted">{hint}</p> : null}
    </fieldset>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
      <span className="h-6 w-10 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" aria-hidden />
      <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-4" aria-hidden />
    </span>
  );
}

function Menu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group relative">
      <summary className={`${button("ghost")} list-none [&::-webkit-details-marker]:hidden`}>
        {label}
        <ChevronDown className="ml-1 size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div
        className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-control border border-line bg-surface py-1 shadow-xl"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) (event.currentTarget.parentElement as HTMLDetailsElement).open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}

function MenuItem({ title, detail, onClick }: { title: string; detail?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block min-h-10 w-full min-w-0 flex-1 px-3 py-2 text-left hover:bg-sunken">
      <span className="block truncate text-sm font-medium text-ink">{title}</span>
      {detail ? <span className="block text-xs text-muted">{detail}</span> : null}
    </button>
  );
}

function Disclosure({ title, summary, children, className = "", defaultOpen = false }: { title: string; summary?: string; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  // Opens itself when it starts needing attention, but never snaps shut while someone is using it.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  return (
    <details className={`group ${className}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          {summary ? <span className="block text-sm text-muted">{summary}</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {children}
    </details>
  );
}

function Minutes({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex h-10 shrink-0 items-center self-start rounded-control border border-line bg-surface sm:self-auto">
      <button type="button" className="flex size-10 items-center justify-center rounded-l-control text-muted hover:bg-sunken hover:text-ink" aria-label={`Subtract 15 minutes from ${label}`} onClick={() => onChange(value - 15)}>
        <Minus className="size-4" aria-hidden />
      </button>
      <input inputMode="numeric" aria-label={`${label} in minutes`} className="h-full w-12 border-x border-line bg-transparent text-center text-base font-semibold text-ink tabular-nums outline-none focus:bg-accent-soft" value={String(value)} onChange={(event) => onChange(clampMinutes(Number(event.target.value.replace(/\D/g, "")) || 0))} />
      <span className="px-2 text-sm text-muted">min</span>
      <button type="button" className="flex size-10 items-center justify-center rounded-r-control border-l border-line text-muted hover:bg-sunken hover:text-ink" aria-label={`Add 15 minutes to ${label}`} onClick={() => onChange(value + 15)}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function Copy({ label, text, tone }: { label: string; text: string; tone: "light" | "outline" }) {
  const [done, setDone] = useState(false);
  const style = tone === "light" ? "bg-on-panel text-panel hover:bg-on-panel/90" : "border border-on-panel/25 text-on-panel hover:bg-on-panel/10";
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors ${style}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? <Check className="mr-1.5 size-4" aria-hidden /> : null}
      {done ? "Copied" : label}
    </button>
  );
}

function field(extra = "") {
  return `h-10 rounded-control border border-line bg-surface px-3 text-base text-ink placeholder:text-faint hover:border-faint focus:border-accent ${extra}`;
}

function button(tone: "primary" | "quiet" | "ghost") {
  const base = "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-control px-4 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40";
  if (tone === "primary") return `${base} bg-accent text-on-accent hover:bg-accent-strong`;
  if (tone === "ghost") return `${base} px-3 font-medium text-muted hover:bg-sunken hover:text-ink`;
  return `${base} border border-line bg-surface text-ink hover:border-faint`;
}
