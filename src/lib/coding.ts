export type License = "lp" | "llp";
export type Payer = "cpt" | "medicare" | "bcbsm" | "bcn" | "aetna" | "uhc" | "uhc-ma";
export type Domain = "psychological" | "neuropsychological";
export type Span = "per-date" | "episode";
export type Setting = "in-person" | "telehealth";
export type Locality = "01" | "99";
export type TimeRule = "midpoint" | "completed";
export type BilledBy = "clinician" | "supervisor";

export type Activities = {
  testSelection: number;
  informationGathering: number;
  interpretation: number;
  reportWriting: number;
  feedback: number;
};

export type ServiceDate = { id: string; label: string; activities: Activities };

export type Worksheet = {
  name: string;
  license: License;
  payer: Payer;
  span: Span;
  domain: Domain;
  setting: Setting;
  locality: Locality;
  timeRule: TimeRule;
  tests: string[];
  adminQhp: number;
  adminTech: number;
  activities: Activities;
  diagnosticInterview: boolean;
  neurobehavioral: number;
  screeners: string[];
  singleAutomated: boolean;
  dates: ServiceDate[];
};

export type TimeBreakdown = {
  minutes: number;
  base: number;
  additional: number;
  nextAt: number;
  shortfall: number;
};

export type ClaimLine = {
  code: string;
  units: number;
  addon: boolean;
  title: string;
  basis: string;
  billedBy: BilledBy;
  dayLabel?: string;
};

export type Flag = { tone: "review" | "hold"; text: string };
export type Pending = { title: string; detail: string };
export type Suppressed = { label: string; reason: string };

export type CodingResult = {
  lines: ClaimLine[];
  flags: Flag[];
  pending: Pending[];
  suppressed: Suppressed[];
  professional: number;
  evalBreak: TimeBreakdown;
  qhpBreak: TimeBreakdown;
  techBreak: TimeBreakdown;
  neuroBreak: TimeBreakdown;
  note: string;
  codesText: string;
  totals: { code: string; units: number; billedBy: BilledBy }[];
};

export const REVIEWED = "2026-11-02";
export const EMPTY_ACTIVITIES: Activities = {
  testSelection: 0,
  informationGathering: 0,
  interpretation: 0,
  reportWriting: 0,
  feedback: 0,
};

export const ACTIVITY_META: { key: keyof Activities; label: string; hint: string }[] = [
  { key: "testSelection", label: "Test selection", hint: "Choosing the battery and the question each instrument answers." },
  { key: "informationGathering", label: "Information gathering", hint: "Records, collateral, and history integrated into the testing evaluation. Not a diagnostic interview." },
  { key: "interpretation", label: "Interpretation", hint: "Scores, clinical data, decisions, and the plan. Desk time counts." },
  { key: "reportWriting", label: "Report writing", hint: "Writing the report. This is evaluation time, not its own code." },
  { key: "feedback", label: "Feedback", hint: "Interactive feedback to the patient, family, or caregiver, when you gave it." },
];

const EVAL = {
  psychological: {
    base: "96130",
    add: "96131",
    noun: "Psychological testing evaluation",
    baseTitle: "Psychological testing evaluation, first hour",
    addTitle: "Psychological testing evaluation, each additional hour",
  },
  neuropsychological: {
    base: "96132",
    add: "96133",
    noun: "Neuropsychological testing evaluation",
    baseTitle: "Neuropsychological testing evaluation, first hour",
    addTitle: "Neuropsychological testing evaluation, each additional hour",
  },
} as const;

const ADMIN = {
  qhp: {
    base: "96136",
    add: "96137",
    noun: "Psychologist administration and scoring",
    baseTitle: "Test administration and scoring by psychologist, first 30 minutes",
    addTitle: "Test administration and scoring by psychologist, each additional 30 minutes",
  },
  tech: {
    base: "96138",
    add: "96139",
    noun: "Technician administration and scoring",
    baseTitle: "Test administration and scoring by technician, first 30 minutes",
    addTitle: "Test administration and scoring by technician, each additional 30 minutes",
  },
} as const;

export const CODE_GUIDE = [
  { code: "96130", use: "Psychological testing evaluation, first hour", when: "Test selection, information gathering, interpretation, report, and feedback." },
  { code: "96131", use: "Each additional hour of that evaluation", when: "Add-on. Report only with 96130." },
  { code: "96132", use: "Neuropsychological testing evaluation, first hour", when: "The same professional work, when the service is neuropsychological." },
  { code: "96133", use: "Each additional hour of that evaluation", when: "Add-on. Report only with 96132." },
  { code: "96136", use: "Administration and scoring by a psychologist, first 30 minutes", when: "Two or more tests, any method. Include scoring. Not the report." },
  { code: "96137", use: "Each additional 30 minutes of that work", when: "Add-on. Report only with 96136." },
  { code: "96138", use: "Administration and scoring by a technician, first 30 minutes", when: "Two or more tests given or scored by a technician or psychometrist." },
  { code: "96139", use: "Each additional 30 minutes of technician work", when: "Add-on. Report only with 96138." },
  { code: "96146", use: "Single automated electronic test", when: "One instrument with an automated result. Not timed. Not for a battery." },
  { code: "96116", use: "Neurobehavioral status exam, first hour", when: "Clinical exam of thinking, reasoning, and judgment. Not a standardized battery." },
  { code: "96121", use: "Each additional hour of that exam", when: "Add-on. Report only with 96116." },
  { code: "90791", use: "Psychiatric diagnostic evaluation", when: "The diagnostic interview, once. Often billed on a different date from testing." },
  { code: "96127", use: "Brief emotional or behavioral assessment", when: "Per short instrument, such as a PHQ-9. Not a full test in the battery." },
];

export const PAYERS: { id: Payer; label: string; hint: string; span: Span; timeRule: TimeRule; rule: string }[] = [
  { id: "cpt", label: "CPT only", hint: "No plan selected", span: "episode", timeRule: "midpoint", rule: "CPT reports the total time when the whole evaluation is complete: one base code, add-on hours, on the last date." },
  { id: "medicare", label: "Medicare", hint: "WPS, original Medicare", span: "episode", timeRule: "midpoint", rule: "Combine every date and bill one base code on the last date." },
  { id: "bcbsm", label: "Blue Cross", hint: "BCBSM commercial", span: "episode", timeRule: "midpoint", rule: "No published multi-day rule, so the CPT episode rule applies. Switch to Each date only if the contract says so." },
  { id: "bcn", label: "Blue Care Network", hint: "BCN commercial", span: "episode", timeRule: "midpoint", rule: "No published multi-day rule, so the CPT episode rule applies. Confirm the member's network." },
  { id: "aetna", label: "Aetna", hint: "Commercial", span: "episode", timeRule: "midpoint", rule: "No published multi-day rule, so the CPT episode rule applies. Most commercial plans dropped routine precertification in 2019." },
  { id: "uhc", label: "UnitedHealthcare", hint: "Commercial, often Optum", span: "episode", timeRule: "midpoint", rule: "No published multi-day rule, so the CPT episode rule applies. Testing often needs Optum authorization." },
  { id: "uhc-ma", label: "UHC Advantage", hint: "Medicare Advantage", span: "episode", timeRule: "midpoint", rule: "Combine every date and bill one base code on the last date. Authorization may still apply." },
];

const PAYER_IDS = new Set<string>(PAYERS.map((payer) => payer.id));

export const EMPTY: Worksheet = {
  name: "",
  license: "lp",
  payer: "cpt",
  span: "episode",
  domain: "psychological",
  setting: "in-person",
  locality: "01",
  timeRule: "midpoint",
  tests: [],
  adminQhp: 0,
  adminTech: 0,
  activities: { ...EMPTY_ACTIVITIES },
  diagnosticInterview: false,
  neurobehavioral: 0,
  screeners: [],
  singleAutomated: false,
  dates: [{ id: "date-1", label: "Date 1", activities: { ...EMPTY_ACTIVITIES } }],
};

export function payerProfile(id: Payer) {
  return PAYERS.find((payer) => payer.id === id) ?? PAYERS[0];
}

export function reviewedLabel(iso = REVIEWED): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function clampMinutes(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1440, Math.round(value))) : 0;
}

export function evalMinutes(activities: Activities): number {
  return ACTIVITY_META.reduce((sum, row) => sum + activities[row.key], 0);
}

export function sumActivities(dates: ServiceDate[]): Activities {
  const total = { ...EMPTY_ACTIVITIES };
  for (const day of dates) for (const row of ACTIVITY_META) total[row.key] += day.activities[row.key];
  return total;
}

export function breakHours(minutes: number, rule: TimeRule): TimeBreakdown {
  const m = clampMinutes(minutes);
  if (rule === "completed") {
    const units = Math.floor(m / 60);
    return pack(m, units, (units + 1) * 60);
  }
  if (m < 31) return pack(m, 0, 31);
  const units = 1 + Math.floor((m - 31) / 60);
  return pack(m, units, 31 + units * 60);
}

export function breakBlocks(minutes: number, rule: TimeRule): TimeBreakdown {
  const m = clampMinutes(minutes);
  if (rule === "completed") {
    const units = Math.floor(m / 30);
    return pack(m, units, (units + 1) * 30);
  }
  if (m < 16) return pack(m, 0, 16);
  const units = 1 + Math.floor((m - 16) / 30);
  return pack(m, units, 16 + units * 30);
}

function pack(minutes: number, units: number, nextAt: number): TimeBreakdown {
  return { minutes, base: units > 0 ? 1 : 0, additional: Math.max(0, units - 1), nextAt, shortfall: nextAt - minutes };
}

export function thresholdSentence(broken: TimeBreakdown): string {
  if (broken.minutes <= 0) return "No time entered.";
  const units = broken.base + broken.additional;
  if (units === 0) return `${broken.minutes} min does not reach a unit. ${broken.shortfall} min more would.`;
  return `${broken.minutes} min supports ${units} ${units === 1 ? "unit" : "units"}. ${broken.shortfall} min more reaches the next.`;
}

export function codePair(base: string, add: string, broken: TimeBreakdown): string {
  if (broken.base === 0) return thresholdSentence(broken);
  if (broken.additional === 0) return `${base} x 1. ${broken.shortfall} min more reaches the next unit.`;
  return `${base} x 1, ${add} x ${broken.additional}. ${broken.shortfall} min more reaches the next unit.`;
}

export function codeWorksheet(input: Worksheet): CodingResult {
  const w = normalize(input);
  const lines: ClaimLine[] = [];
  const flags: Flag[] = [];
  const pending: Pending[] = [];
  const suppressed: Suppressed[] = [];
  const llp = w.license === "llp";
  const days = w.dates.map((day) => ({ ...day, minutes: evalMinutes(day.activities), breakdown: breakHours(evalMinutes(day.activities), w.timeRule) }));
  const professional = days.reduce((sum, day) => sum + day.minutes, 0);
  const billedDays = days.filter((day) => day.minutes > 0);
  const episodeBreak = breakHours(professional, w.timeRule);
  const evalBreak = w.span === "per-date" && billedDays.length === 1 ? billedDays[0].breakdown : episodeBreak;
  const qhpBreak = breakBlocks(w.adminQhp, w.timeRule);
  const techOnly = breakBlocks(w.adminTech, w.timeRule);
  const combinedTech = breakBlocks(llp ? w.adminQhp + w.adminTech : w.adminTech, w.timeRule);
  const neuroBreak = breakHours(w.neurobehavioral, w.timeRule);
  const pair = EVAL[w.domain];

  if (w.diagnosticInterview) {
    lines.push({
      code: "90791",
      units: 1,
      addon: false,
      title: "Psychiatric diagnostic evaluation",
      basis: llp
        ? "Distinct diagnostic interview by the LLP, once, if this plan credentials an LLP for 90791. Not testing evaluation."
        : "Distinct diagnostic interview. Report once. Do not also put that interview in the evaluation minutes.",
      billedBy: "clinician",
    });
    flags.push({ tone: "review", text: "Some plans will not pay 90791 on the same date as testing. If the interview was another day, bill it on that date." });
    if (llp) flags.push({ tone: "review", text: "A credentialed LLP may report 90791 under LP supervision on many Michigan commercial plans. Blue Care Network facility claims often use modifier HO. Medicare does not enroll an LLP as the rendering psychologist." });
  }

  if (w.neurobehavioral > 0) {
    if (llp) {
      suppressed.push({ label: "Neurobehavioral status exam", reason: "An LLP does not bill 96116 or 96121. That exam is the LP's clinical work. If the LP performed it, code the LP's own minutes on an LP worksheet." });
    } else {
      pushHours(lines, pending, { minutes: w.neurobehavioral, breakdown: neuroBreak, base: "96116", add: "96121", noun: "Neurobehavioral status exam", baseTitle: "Neurobehavioral status exam, first hour", addTitle: "Neurobehavioral status exam, each additional hour", detail: "Clinical exam of thinking, reasoning, and judgment. Not the standardized battery.", billedBy: "clinician" });
      if (professional > 0) flags.push({ tone: "review", text: "Keep neurobehavioral status exam time out of the testing evaluation. The same minutes cannot support both 96116 and 96130 or 96132." });
    }
  }

  if (w.singleAutomated) {
    lines.push({
      code: "96146",
      units: 1,
      addon: false,
      title: "Automated test administration, single instrument",
      basis: llp
        ? `${w.tests[0]}. One unit on the supervising LP's claim. Not timed, and not the LLP's evaluation.`
        : `${w.tests[0]}. One unit. Not timed. Do not also report 96136–96139 for this test.`,
      billedBy: llp ? "supervisor" : "clinician",
    });
    if (w.adminQhp > 0 || w.adminTech > 0) {
      flags.push({ tone: "review", text: llp ? "96146 does not turn administration minutes into units. Clinical interpretation still belongs in the supervising LP's 96130 or 96132." : "96146 does not turn administration minutes into units. Clinical interpretation of the result still belongs in 96130 or 96132." });
    }
  } else if ((w.adminQhp > 0 || w.adminTech > 0) && w.tests.length < 2) {
    suppressed.push({
      label: "Test administration",
      reason: w.tests.length === 0 ? "Name at least two tests before reporting 96136–96139." : "One test is not enough for 96136–96139. Add a second instrument, or mark a single automated electronic test for 96146.",
    });
  } else if (w.tests.length >= 2) {
    if (llp) {
      pushAdmin(lines, pending, "tech", w.adminQhp + w.adminTech, combinedTech, "supervisor");
      if (w.adminQhp > 0) flags.push({ tone: "review", text: "An LLP does not bill 96136 or 96137. Administration the LLP performed is 96138 and 96139 on the supervising LP's claim." });
      if (w.adminQhp > 0 && w.adminTech > 0) flags.push({ tone: "review", text: "LLP administration and technician time were added into one 96138 claim. Add them only when the minutes do not overlap." });
    } else {
      pushAdmin(lines, pending, "qhp", w.adminQhp, qhpBreak, "clinician");
      pushAdmin(lines, pending, "tech", w.adminTech, techOnly, "clinician");
      if (qhpBreak.base > 0 && techOnly.base > 0) flags.push({ tone: "review", text: "96136 and 96138 are paired by an NCCI edit. Bill both on one date only when the time does not overlap. A modifier such as 59 or XE may be required. Never report both for the same minutes." });
    }
  }

  if (professional > 0) {
    if (w.tests.length === 0 && !llp) flags.push({ tone: "review", text: "Name the instruments this evaluation interprets. 96130 and 96132 are for standardized testing, including the report. An interview with no testing is 90791." });
    if (llp) {
      suppressed.push({
        label: pair.noun,
        reason: w.domain === "neuropsychological"
          ? `${professional} min of professional work is not the LLP's claim. An LLP does not bill 96132 or 96133. The supervising LP bills neuropsychological testing evaluation only for the LP's own time. Do not move the LLP's minutes onto the LP.`
          : `${professional} min of professional work is not the LLP's claim. 96130 and 96131 are the supervising LP's own integration, interpretation, report, and feedback. Do not move the LLP's minutes onto the LP.`,
      });
    } else if (w.span === "episode") {
      const last = billedDays[billedDays.length - 1];
      pushHours(lines, pending, {
        minutes: professional,
        breakdown: episodeBreak,
        base: pair.base,
        add: pair.add,
        noun: billedDays.length > 1 ? `${last.label}: ${pair.noun}` : pair.noun,
        baseTitle: pair.baseTitle,
        addTitle: pair.addTitle,
        detail: billedDays.length > 1 ? billedDays.map((day) => `${day.label}, ${day.minutes} min. ${activityDetail(day.activities)}`).join(" ") : activityDetail(last.activities),
        billedBy: "clinician",
        dayLabel: billedDays.length > 1 ? `Reported on ${last.label}` : undefined,
      });
    } else {
      for (const day of billedDays) {
        pushHours(lines, pending, {
          minutes: day.minutes,
          breakdown: day.breakdown,
          base: pair.base,
          add: pair.add,
          noun: billedDays.length > 1 ? `${day.label}: ${pair.noun}` : pair.noun,
          baseTitle: pair.baseTitle,
          addTitle: pair.addTitle,
          detail: activityDetail(day.activities),
          billedBy: "clinician",
          dayLabel: billedDays.length > 1 ? day.label : undefined,
        });
      }
    }
    if (!llp && billedDays.length > 1) {
      const plan = payerProfile(w.payer);
      const last = billedDays[billedDays.length - 1].label;
      flags.push({
        tone: "review",
        text: w.span === "episode"
          ? `${plan.label} reports this episode on ${last}. One base code, then add-on hours. Do not also bill a base code on the earlier dates.`
          : `Each date is coded with its own base code, and hours are not added across dates. CPT reports the whole evaluation once, on the last date. Use Each date only when ${w.payer === "cpt" ? "a plan" : plan.label} requires it in writing, and keep each add-on on the same date as its base code.`,
      });
    }
  }

  if (w.screeners.length > 0) {
    lines.push({ code: "96127", units: w.screeners.length, addon: false, title: "Brief emotional or behavioral assessment", basis: `${w.screeners.join(", ")}. One unit per instrument.`, billedBy: "clinician" });
    if (w.screeners.length > 3) flags.push({ tone: "review", text: `96127 is at ${w.screeners.length} units. Medicare often limits this code to 3 units a day. Confirm before billing more.` });
    if (llp) flags.push({ tone: "review", text: "Confirm this plan credentials the LLP for 96127. One unit per brief instrument. These are not 96130." });
    const doubled = w.screeners.filter((name) => w.tests.some((test) => test.toLowerCase() === name.toLowerCase()));
    if (doubled.length > 0) flags.push({ tone: "hold", text: `${doubled.join(", ")} is listed as both a brief measure and a test. Do not bill the same instrument under 96127 and test administration.` });
  }

  const techBreak = llp ? combinedTech : techOnly;
  if (billedDays.some((day) => day.breakdown.additional >= 6) || qhpBreak.additional >= 8 || techBreak.additional >= 8) {
    flags.push({ tone: "review", text: "Unit counts this high on one date often fail a medically unlikely edit. Confirm the payer’s limit and that every minute is documented." });
  }
  if (w.setting === "telehealth" && (w.adminQhp > 0 || w.adminTech > 0 || w.singleAutomated)) {
    flags.push({
      tone: "review",
      text: usesMedicareList(w.payer)
        ? "96130–96139 are on the 2026 Medicare telehealth list with two-way audio and video. Confirm each instrument's publisher permits remote administration, and that a technician can administer remotely under supervision."
        : "Commercial plans and publishers vary on remote test administration. Do not assume 96136, 96138, or 96146 are payable by telehealth. Evaluation and feedback time are more often allowed. Confirm the plan and each instrument.",
    });
  }
  const interviews = w.tests.filter((name) => /DIVA-5|CAADID/i.test(name));
  if (w.diagnosticInterview && interviews.length > 0) flags.push({ tone: "review", text: `${interviews.join(" and ")} is a structured diagnostic interview. Do not count it both as 90791 and as administration time.` });
  if (llp && (professional > 0 || w.adminQhp > 0 || w.adminTech > 0 || w.neurobehavioral > 0 || w.singleAutomated)) flags.push({ tone: "review", text: llpNote(w.payer) });
  flags.push(...payerFlags(w.payer));
  flags.push(...staleFlag());

  const result: CodingResult = {
    lines,
    flags,
    pending,
    suppressed,
    professional,
    evalBreak,
    qhpBreak,
    techBreak,
    neuroBreak,
    note: "",
    codesText: formatCodes(lines, w.license),
    totals: rollup(lines),
  };
  result.note = renderNote(w, result);
  return result;
}

function pushHours(
  lines: ClaimLine[],
  pending: Pending[],
  item: { minutes: number; breakdown: TimeBreakdown; base: string; add: string; noun: string; baseTitle: string; addTitle: string; detail: string; billedBy: BilledBy; dayLabel?: string },
) {
  if (item.breakdown.base === 0) {
    pending.push({ title: item.noun, detail: thresholdSentence(item.breakdown) });
    return;
  }
  lines.push({
    code: item.base,
    units: 1,
    addon: false,
    title: item.baseTitle,
    basis: item.breakdown.additional > 0 ? item.detail : `${item.detail} ${thresholdSentence(item.breakdown)}`,
    billedBy: item.billedBy,
    dayLabel: item.dayLabel,
  });
  if (item.breakdown.additional > 0) {
    lines.push({
      code: item.add,
      units: item.breakdown.additional,
      addon: true,
      title: item.addTitle,
      basis: `${item.breakdown.minutes} min total. ${item.breakdown.shortfall} min more reaches the next unit.`,
      billedBy: item.billedBy,
      dayLabel: item.dayLabel,
    });
  }
}

function pushAdmin(lines: ClaimLine[], pending: Pending[], kind: "qhp" | "tech", minutes: number, broken: TimeBreakdown, billedBy: BilledBy) {
  if (minutes <= 0) return;
  const meta = ADMIN[kind];
  if (broken.base === 0) {
    pending.push({ title: meta.noun, detail: thresholdSentence(broken) });
    return;
  }
  lines.push({ code: meta.base, units: 1, addon: false, title: meta.baseTitle, basis: broken.additional > 0 ? `${minutes} min.` : `${minutes} min. ${thresholdSentence(broken)}`, billedBy });
  if (broken.additional > 0) lines.push({ code: meta.add, units: broken.additional, addon: true, title: meta.addTitle, basis: `${minutes} min total. ${broken.shortfall} min more reaches the next unit.`, billedBy });
}

function activityDetail(activities: Activities): string {
  const parts = ACTIVITY_META.filter((row) => activities[row.key] > 0).map((row) => `${row.label}: ${activities[row.key]} min`);
  return parts.length === 0 ? "Professional evaluation time." : `${parts.join(". ")}.`;
}

function llpNote(payer: Payer): string {
  if (payer === "medicare" || payer === "uhc-ma") return "Medicare does not enroll a master's LLP as the rendering psychologist. Testing stays on the supervising LP's claim. Do not use the LLP's NPI.";
  if (payer === "bcn") return "BCN may credential a master's LLP to treat directly, often with HO in a facility. That is not incident-to. Testing evaluation stays with the LP. Office incident-to for a TLLP ends March 1, 2027.";
  if (payer === "bcbsm") return "Blue Cross office incident-to for a TLLP and other limited licenses ends March 1, 2027. A clinician who can enroll bills their own NPI. Testing evaluation stays with the LP.";
  return "An LLP does not bill testing evaluation. Confirm whether this plan credentials the LLP for 90791 or 96127. Do not move the LLP's minutes onto the LP.";
}

function payerFlags(payer: Payer): Flag[] {
  const text: Record<Payer, string | null> = {
    cpt: null,
    medicare: "Original Medicare through WPS. Testing does not need prior authorization. Time uses the CPT midpoint. A master's LLP cannot bill as the Medicare psychologist.",
    bcbsm: "Blue Cross Behavioral Health manages commercial utilization review. Confirm whether this group needs testing authorization. By telehealth, 96130 may be asynchronous. Other behavioral health telehealth is synchronous audiovisual.",
    bcn: "A contracted BCN provider in the member's designated network often needs no referral when 96130–96139 are billed alone. Confirm the network before the battery.",
    aetna: "Most Aetna commercial plans have not required routine precertification for this testing since 2019. Student, Medicaid, and some employer plans still do. Do not bill 96130 with 96132 for the same episode.",
    uhc: "UnitedHealthcare behavioral health is often administered by Optum, not the medical plan on the card. Psychological testing commonly needs authorization before the first date.",
    "uhc-ma": "Optum's Medicare testing guidance combines multi-day time on the last date of service. Medicare Advantage can still require authorization. Original Medicare does not.",
  };
  return text[payer] ? [{ tone: "review", text: text[payer] }] : [];
}

function usesMedicareList(payer: Payer): boolean {
  return payer === "medicare" || payer === "uhc-ma";
}

function staleFlag(): Flag[] {
  const reviewed = Date.parse(`${REVIEWED}T00:00:00Z`);
  if (!Number.isFinite(reviewed) || Date.now() - reviewed <= 8 * 24 * 60 * 60 * 1000) return [];
  return [{ tone: "review", text: `Plan rules were last reviewed ${reviewedLabel()}. That is more than a week ago. Confirm the plan before this goes on a claim.` }];
}

export function rollup(lines: ClaimLine[]) {
  const order: string[] = [];
  const map = new Map<string, { code: string; units: number; billedBy: BilledBy }>();
  for (const line of lines) {
    const key = `${line.billedBy}|${line.code}`;
    const found = map.get(key);
    if (found) found.units += line.units;
    else {
      order.push(key);
      map.set(key, { code: line.code, units: line.units, billedBy: line.billedBy });
    }
  }
  return order.map((key) => map.get(key)!);
}

function formatCodes(lines: ClaimLine[], license: License): string {
  const block = (group: ClaimLine[]) => {
    const plain = group.filter((line) => !line.dayLabel).map((line) => `${line.code} x ${line.units}`);
    const labels = [...new Set(group.map((line) => line.dayLabel).filter(Boolean))] as string[];
    const dated = labels.map((label) => [label, ...group.filter((line) => line.dayLabel === label).map((line) => `${line.code} x ${line.units}`)].join("\n"));
    return [...(plain.length ? [plain.join("\n")] : []), ...dated].join("\n\n");
  };
  if (license === "lp") return block(lines);
  const own = lines.filter((line) => line.billedBy === "clinician");
  const supervisor = lines.filter((line) => line.billedBy === "supervisor");
  return [own.length ? `LLP\n${block(own)}` : "", supervisor.length ? `Supervising LP\n${block(supervisor)}` : ""].filter(Boolean).join("\n\n");
}

function renderNote(w: Worksheet, result: CodingResult): string {
  const billed = w.dates.filter((day) => evalMinutes(day.activities) > 0);
  const lines = [
    "PROPER — billing support note",
    w.name.trim() ? `Worksheet: ${w.name.trim()}` : "Worksheet: untitled",
    `License: ${w.license === "llp" ? "LLP — master's limited psychologist, supervised by an LP" : "LP — fully licensed psychologist"}`,
    `Domain: ${w.domain === "psychological" ? "Psychological testing" : "Neuropsychological testing"}`,
    `Setting: ${w.setting === "in-person" ? "In person" : "Telehealth"}`,
    `Time rule: ${w.timeRule === "midpoint" ? "CPT midpoint (31 min of an hour, 16 min of a 30-minute block)" : "Completed blocks only (full 60 min or full 30 min)"}`,
    `Plan: ${payerProfile(w.payer).label}. Rules reviewed ${reviewedLabel()}.`,
    w.span === "episode" && billed.length > 1
      ? `Professional evaluation is one episode, reported on ${billed[billed.length - 1].label}. Hours are added across dates. Administration is one block.`
      : billed.length > 1
        ? "Professional evaluation is coded on each date. Hours are not added across dates. Administration is one block."
        : "Professional evaluation is one date of service.",
    "",
    w.tests.length ? `Instruments (${w.tests.length}): ${w.tests.join("; ")}` : "Instruments: none listed",
  ];
  if (w.singleAutomated) lines.push("Marked as a single automated electronic instrument (96146).");
  lines.push("", "Administration and scoring");
  if (w.license === "llp") {
    lines.push(adminNote("LLP or technician, on the supervising LP's claim", w.adminQhp + w.adminTech, result.techBreak, "96138", "96139"));
    if (w.adminQhp > 0) lines.push("- Not 96136. An LLP is not the qualified professional for test administration.");
  } else {
    lines.push(adminNote("Psychologist or other qualified professional", w.adminQhp, result.qhpBreak, "96136", "96137"));
    lines.push(adminNote("Technician or psychometrist", w.adminTech, result.techBreak, "96138", "96139"));
  }
  for (const item of result.suppressed) lines.push(`- Not coded: ${item.reason}`);
  lines.push("", `Professional evaluation: ${result.professional} min`);
  if (billed.length <= 1 || (w.span === "episode" && w.license !== "llp")) {
    if (w.span !== "episode" || billed.length <= 1) {
      for (const row of ACTIVITY_META) if (w.activities[row.key] > 0) lines.push(`- ${row.label}: ${w.activities[row.key]} min`);
    } else for (const day of billed) lines.push(`- ${day.label}: ${evalMinutes(day.activities)} min`);
    if (result.professional > 0) {
      if (w.license === "llp") lines.push(`- Not ${w.domain === "neuropsychological" ? "96132 or 96133" : "96130 or 96131"}. These minutes stay off the LLP's claim and are not moved onto the LP.`);
      else lines.push(`- ${codePair(EVAL[w.domain].base, EVAL[w.domain].add, result.evalBreak)}`);
    }
  } else {
    for (const day of w.dates) {
      const minutes = evalMinutes(day.activities);
      if (minutes <= 0) continue;
      lines.push("", `${day.label}: ${minutes} min`);
      for (const row of ACTIVITY_META) if (day.activities[row.key] > 0) lines.push(`- ${row.label}: ${day.activities[row.key]} min`);
      lines.push(w.license === "llp" ? "- Not billed on the LLP's claim." : `- ${codePair(EVAL[w.domain].base, EVAL[w.domain].add, breakHours(minutes, w.timeRule))}`);
    }
  }
  if (w.neurobehavioral > 0) {
    lines.push("", `Neurobehavioral status exam: ${w.neurobehavioral} min`);
    lines.push(w.license === "llp" ? "- Not 96116 or 96121. An LLP does not bill this exam." : `- ${codePair("96116", "96121", result.neuroBreak)}`);
  }
  if (w.diagnosticInterview) lines.push("", "Diagnostic interview: yes → 90791 x 1");
  if (w.screeners.length > 0) lines.push("", `Brief measures (${w.screeners.length}): ${w.screeners.join("; ")} → 96127 x ${w.screeners.length}`);
  lines.push("", "Suggested claim lines");
  if (result.lines.length === 0) lines.push("- None. The documented work does not yet meet a code.");
  else if (w.license === "llp") {
    const own = result.lines.filter((line) => line.billedBy === "clinician");
    const supervisor = result.lines.filter((line) => line.billedBy === "supervisor");
    lines.push("LLP");
    if (own.length === 0) lines.push("- None on the LLP's own claim.");
    for (const line of own) lines.push(`- ${line.code} x ${line.units} — ${line.title}`);
    lines.push("Supervising LP");
    if (supervisor.length === 0) lines.push("- None from this worksheet. Do not move the LLP's evaluation minutes onto the LP.");
    for (const line of supervisor) lines.push(`- ${line.code} x ${line.units} — ${line.title}`);
  } else for (const line of result.lines) lines.push(`- ${line.code} x ${line.units} — ${line.title}${line.dayLabel ? ` (${line.dayLabel})` : ""}`);
  if (result.pending.length > 0) {
    lines.push("", "Short of a unit");
    for (const item of result.pending) lines.push(`- ${item.title}: ${item.detail}`);
  }
  if (result.flags.length > 0) {
    lines.push("", "Review before billing");
    for (const flag of result.flags) lines.push(`- ${flag.text}`);
  }
  lines.push("", "Coding worksheet only. Not a claim, not medical advice, and not a payer policy. Confirm medical necessity, NCCI edits, and the plan before submitting.");
  return lines.join("\n");
}

function adminNote(label: string, minutes: number, broken: TimeBreakdown, base: string, add: string): string {
  return minutes <= 0 ? `- ${label}: 0 min` : `- ${label}: ${minutes} min → ${codePair(base, add, broken)}`;
}

export function normalize(input: unknown): Worksheet {
  const source = input && typeof input === "object" ? (input as Partial<Worksheet>) : {};
  const legacy = readActivities(source.activities);
  const dates = readDates(source.dates, legacy);
  const tests = cleanList(source.tests, 40);
  return {
    name: typeof source.name === "string" ? source.name.slice(0, 80) : "",
    license: source.license === "llp" ? "llp" : "lp",
    payer: PAYER_IDS.has(String(source.payer)) ? (source.payer as Payer) : "cpt",
    span: source.span === "per-date" ? "per-date" : "episode",
    domain: source.domain === "neuropsychological" ? "neuropsychological" : "psychological",
    setting: source.setting === "telehealth" ? "telehealth" : "in-person",
    locality: source.locality === "99" ? "99" : "01",
    timeRule: source.timeRule === "completed" ? "completed" : "midpoint",
    tests,
    adminQhp: clampMinutes(Number(source.adminQhp ?? 0)),
    adminTech: clampMinutes(Number(source.adminTech ?? 0)),
    activities: sumActivities(dates),
    diagnosticInterview: Boolean(source.diagnosticInterview),
    neurobehavioral: clampMinutes(Number(source.neurobehavioral ?? 0)),
    screeners: cleanList(source.screeners, 12),
    singleAutomated: Boolean(source.singleAutomated) && tests.length === 1,
    dates,
  };
}

function readActivities(value: unknown): Activities {
  const source = value && typeof value === "object" ? (value as Partial<Activities>) : {};
  const activities = { ...EMPTY_ACTIVITIES };
  for (const row of ACTIVITY_META) activities[row.key] = clampMinutes(Number(source[row.key] ?? 0));
  return activities;
}

function readDates(value: unknown, legacy: Activities): ServiceDate[] {
  if (!Array.isArray(value) || value.length === 0) return [{ id: "date-1", label: "Date 1", activities: legacy }];
  const dates: ServiceDate[] = [];
  for (const item of value.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const source = item as Partial<ServiceDate>;
    const index = dates.length + 1;
    const label = typeof source.label === "string" ? source.label.trim().slice(0, 40) : "";
    dates.push({
      id: typeof source.id === "string" && source.id.trim() ? source.id.trim().slice(0, 40) : `date-${index}`,
      label: label || `Date ${index}`,
      activities: readActivities(source.activities),
    });
  }
  if (dates.length === 0) return [{ id: "date-1", label: "Date 1", activities: legacy }];
  const dated = dates.reduce((sum, day) => sum + evalMinutes(day.activities), 0);
  if (dates.length === 1 && dated === 0 && evalMinutes(legacy) > 0 && dates[0].id === "date-1") dates[0] = { ...dates[0], activities: legacy };
  return dates;
}

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim().slice(0, 80);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
    if (names.length >= max) break;
  }
  return names;
}
