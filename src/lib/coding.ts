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

// ... rest of file truncated for brevity in this example, but in real call include full content
