import type { Activities, Domain } from "./coding.ts";
import { EMPTY_ACTIVITIES } from "./coding.ts";

export type TestKind = "performance" | "rating" | "auto" | "interview";

export type TestInfo = {
  group: string;
  name: string;
  minutes: number;
  kind: TestKind;
  domainHint: Domain | "either";
};

const ROWS: [string, string, number, TestKind, Domain | "either"][] = [
  ["Cognitive", "WAIS-5", 75, "performance", "either"],
  ["Cognitive", "WAIS-IV", 75, "performance", "either"],
  ["Cognitive", "WISC-V", 75, "performance", "either"],
  ["Cognitive", "WPPSI-IV", 60, "performance", "either"],
  ["Cognitive", "WJ IV COG", 90, "performance", "either"],
  ["Cognitive", "DAS-II", 75, "performance", "either"],
  ["Cognitive", "Stanford-Binet 5", 75, "performance", "either"],
  ["Academic", "WIAT-4", 90, "performance", "psychological"],
  ["Academic", "WJ IV ACH", 90, "performance", "psychological"],
  ["Academic", "WRAT5", 30, "performance", "psychological"],
  ["Academic", "GORT-5", 25, "performance", "psychological"],
  ["Academic", "CTOPP-2", 40, "performance", "psychological"],
  ["Academic", "Nelson-Denny", 35, "performance", "psychological"],
  ["Memory", "WMS-IV", 90, "performance", "neuropsychological"],
  ["Memory", "CVLT-3", 40, "performance", "neuropsychological"],
  ["Memory", "CVLT-C", 40, "performance", "neuropsychological"],
  ["Memory", "WRAML-3", 60, "performance", "neuropsychological"],
  ["Memory", "Rey Complex Figure", 45, "performance", "neuropsychological"],
  ["Attention and executive", "D-KEFS", 90, "performance", "neuropsychological"],
  ["Attention and executive", "WCST", 20, "performance", "neuropsychological"],
  ["Attention and executive", "Conners CPT 3", 14, "auto", "psychological"],
  ["Attention and executive", "Conners 4", 20, "rating", "psychological"],
  ["Attention and executive", "BRIEF-2", 15, "rating", "either"],
  ["Attention and executive", "BRIEF-A", 15, "rating", "either"],
  ["Attention and executive", "Brown EF/A", 20, "rating", "either"],
  ["Attention and executive", "Trail Making", 10, "performance", "neuropsychological"],
  ["Attention and executive", "Stroop", 10, "performance", "neuropsychological"],
  ["Personality and emotional", "MMPI-3", 45, "performance", "psychological"],
  ["Personality and emotional", "MMPI-A-RF", 45, "performance", "psychological"],
  ["Personality and emotional", "PAI", 50, "performance", "psychological"],
  ["Personality and emotional", "PAI-A", 40, "performance", "psychological"],
  ["Personality and emotional", "MCMI-IV", 30, "performance", "psychological"],
  ["Personality and emotional", "BASC-3", 20, "rating", "psychological"],
  ["Personality and emotional", "MACI-II", 30, "performance", "psychological"],
  ["Autism and developmental", "ADOS-2", 50, "interview", "either"],
  ["Autism and developmental", "ADI-R", 90, "interview", "either"],
  ["Autism and developmental", "SRS-2", 15, "rating", "either"],
  ["Autism and developmental", "Vineland-3", 30, "rating", "either"],
  ["Autism and developmental", "ABAS-3", 20, "rating", "either"],
  ["Language and motor", "Boston Naming Test", 15, "performance", "neuropsychological"],
  ["Language and motor", "NEPSY-II", 90, "performance", "neuropsychological"],
  ["Language and motor", "Beery VMI", 15, "performance", "either"],
  ["Language and motor", "Grooved Pegboard", 10, "performance", "neuropsychological"],
  ["Validity", "TOMM", 20, "performance", "neuropsychological"],
  ["Validity", "Word Memory Test", 20, "auto", "neuropsychological"],
  ["Structured interviews", "DIVA-5", 60, "interview", "psychological"],
  ["Structured interviews", "CAADID", 50, "interview", "psychological"],
];

export const TESTS: TestInfo[] = ROWS.map(([group, name, minutes, kind, domainHint]) => ({ group, name, minutes, kind, domainHint }));
export const GROUPS = [...new Set(TESTS.map((test) => test.group))];
export const SCREENERS = ["PHQ-9", "GAD-7", "ASRS", "C-SSRS screen", "PSC-17", "SCARED", "MDQ"];

export function findTest(name: string): TestInfo | undefined {
  return TESTS.find((test) => test.name.toLowerCase() === name.toLowerCase());
}

export function suggestTimes(names: string[], domain: Domain): { admin: number; interview: boolean; activities: Activities } {
  const chosen = names.map(findTest).filter((test): test is TestInfo => Boolean(test));
  const administered = chosen.filter((test) => test.kind !== "interview");
  const neuro = domain === "neuropsychological";
  const activities = { ...EMPTY_ACTIVITIES };
  if (administered.length > 0) {
    activities.testSelection = administered.length > 4 ? 25 : 15;
    activities.informationGathering = neuro ? 45 : 30;
    activities.interpretation = Math.min(neuro ? 120 : 90, Math.max(30, administered.length * 12));
    activities.reportWriting = (neuro ? 90 : 60) + (administered.length > 6 ? 15 : 0);
    activities.feedback = 45;
  }
  return { admin: administered.reduce((sum, test) => sum + test.minutes, 0), interview: chosen.some((test) => test.kind === "interview"), activities };
}
