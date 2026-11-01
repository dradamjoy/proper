import { findTest } from "./catalog.ts";
import { type Worksheet, evalMinutes } from "./coding.ts";

export type Missed = { code: string; text: string };

export function missedCodes(worksheet: Worksheet): Missed[] {
  if (worksheet.tests.length === 0 && worksheet.screeners.length === 0 && !worksheet.diagnosticInterview) return [];
  const chosen = worksheet.tests.map(findTest).filter((test) => test != null);
  const administered = chosen.filter((test) => test.kind !== "interview");
  const interviews = chosen.filter((test) => test.kind === "interview");
  const missed: Missed[] = [];
  if (administered.length >= 2 && worksheet.adminQhp + worksheet.adminTech === 0 && !worksheet.singleAutomated) {
    missed.push({ code: "96136", text: "Two or more tests are selected and administration time is still zero. Add who gave them and how long it took." });
  }
  if (interviews.length > 0 && !worksheet.diagnosticInterview) {
    missed.push({ code: "90791", text: `${interviews.map((test) => test.name).join(" and ")} is a diagnostic interview. If it was a separate evaluation, 90791 is legitimate. Do not also count those minutes as test administration.` });
  }
  if (worksheet.domain === "neuropsychological" && worksheet.neurobehavioral < 31 && worksheet.license === "lp") {
    missed.push({ code: "96116", text: "A neurobehavioral status exam is often legitimate on a neuropsychological evaluation, but only if that exam was done. It is not included in 96132." });
  }
  const professional = worksheet.dates.reduce((sum, day) => sum + evalMinutes(day.activities), 0);
  if (administered.length > 0 && professional > 0) {
    if (worksheet.dates.every((day) => day.activities.reportWriting === 0)) {
      missed.push({ code: "96130", text: "Report-writing time is empty. If the report was written, those minutes belong in the testing evaluation. They are not a separate code." });
    }
    if (worksheet.dates.every((day) => day.activities.feedback === 0)) {
      missed.push({ code: "96130", text: "Feedback to the patient or family is part of 96130 or 96132, including when it happens on a later date." });
    }
  }
  const neuro = chosen.filter((test) => test.domainHint === "neuropsychological").map((test) => test.name);
  if (worksheet.domain === "psychological" && neuro.length >= 2) {
    missed.push({ code: "96132", text: `${neuro.slice(0, 3).join(", ")} are usually part of a neuropsychological evaluation. If that is what was done, the professional codes are 96132 and 96133, not 96130.` });
  }
  return missed;
}
