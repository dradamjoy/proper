import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestTimes } from "./catalog.ts";
import { EMPTY, breakBlocks, breakHours, codeWorksheet, normalize } from "./coding.ts";
import { missedCodes } from "./review.ts";

const adhd = {
  ...EMPTY,
  payer: "medicare" as const,
  span: "episode" as const,
  tests: ["WAIS-IV", "Conners CPT 3", "Conners 4", "BRIEF-A", "PAI"],
  adminQhp: 120,
  screeners: ["ASRS", "PHQ-9", "GAD-7"],
  dates: [
    {
      id: "date-1",
      label: "Date 1",
      activities: { testSelection: 15, informationGathering: 30, interpretation: 45, reportWriting: 60, feedback: 20 },
    },
  ],
};

describe("time", () => {
  it("holds the hour and the 30-minute midpoint", () => {
    assert.equal(breakHours(30, "midpoint").base, 0);
    assert.equal(breakHours(31, "midpoint").base, 1);
    assert.equal(breakHours(91, "midpoint").additional, 1);
    assert.equal(breakHours(151, "midpoint").additional, 2);
    assert.equal(breakBlocks(15, "midpoint").base, 0);
    assert.equal(breakBlocks(16, "midpoint").base, 1);
    assert.equal(breakBlocks(46, "midpoint").additional, 1);
    assert.equal(breakBlocks(120, "midpoint").additional, 3);
    assert.equal(breakHours(59, "completed").base, 0);
    assert.equal(breakHours(60, "completed").base, 1);
  });
});

describe("codeWorksheet", () => {
  it("maps an adult battery to units", () => {
    const result = codeWorksheet(adhd);
    const units = Object.fromEntries(result.totals.map((item) => [item.code, item.units]));
    assert.equal(units["96130"], 1);
    assert.equal(units["96131"], 2);
    assert.equal(units["96136"], 1);
    assert.equal(units["96137"], 3);
    assert.equal(units["96127"], 3);
  });

  it("uses technician codes and the neuropsychological pair", () => {
    const result = codeWorksheet({
      ...EMPTY,
      domain: "neuropsychological",
      tests: ["WAIS-IV", "WMS-IV"],
      adminTech: 60,
      dates: [{ id: "date-1", label: "Date 1", activities: { ...EMPTY.dates[0].activities, reportWriting: 70 } }],
    });
    assert.ok(result.lines.some((line) => line.code === "96132"));
    assert.ok(result.lines.some((line) => line.code === "96138" && line.units === 1));
    assert.ok(result.lines.some((line) => line.code === "96139"));
  });

  it("does not report administration for one non-automated test", () => {
    const result = codeWorksheet({ ...EMPTY, tests: ["PAI"], adminQhp: 50 });
    assert.equal(result.lines.some((line) => line.code.startsWith("9613")), false);
    assert.ok(result.suppressed.some((item) => item.label === "Test administration"));
  });

  it("reports 96146 once for a single automated test", () => {
    const result = codeWorksheet({ ...EMPTY, tests: ["Conners CPT 3"], singleAutomated: true, adminQhp: 14 });
    assert.ok(result.lines.some((line) => line.code === "96146"));
    assert.equal(result.lines.some((line) => line.code === "96136"), false);
  });

  it("keeps testing evaluation off an LLP and recodes administration", () => {
    const result = codeWorksheet({ ...adhd, license: "llp" });
    assert.equal(result.lines.some((line) => line.code === "96130" || line.code === "96136"), false);
    assert.ok(result.lines.some((line) => line.code === "96138" && line.billedBy === "supervisor"));
  });

  it("gives each commercial date its own base and pools Medicare", () => {
    const dates = [
      { id: "a", label: "Monday", activities: { ...EMPTY.dates[0].activities, reportWriting: 50 } },
      { id: "b", label: "Wednesday", activities: { ...EMPTY.dates[0].activities, feedback: 50 } },
    ];
    const commercial = codeWorksheet({ ...EMPTY, payer: "aetna", span: "per-date", tests: ["WAIS-IV", "PAI"], dates });
    assert.equal(commercial.lines.filter((line) => line.code === "96130").length, 2);
    const medicare = codeWorksheet({ ...EMPTY, payer: "medicare", span: "episode", tests: ["WAIS-IV", "PAI"], dates });
    assert.equal(medicare.lines.filter((line) => line.code === "96130").length, 1);
    assert.equal(medicare.totals.find((item) => item.code === "96131")?.units, 1);
  });
});

describe("episode default", () => {
  it("pools dates by default, as CPT reports the whole episode once", () => {
    const dates = [
      { id: "a", label: "Monday", activities: { ...EMPTY.dates[0].activities, reportWriting: 25 } },
      { id: "b", label: "Wednesday", activities: { ...EMPTY.dates[0].activities, feedback: 25 } },
    ];
    const result = codeWorksheet({ ...EMPTY, tests: ["WAIS-IV", "PAI"], dates });
    assert.equal(EMPTY.span, "episode");
    assert.equal(result.lines.filter((line) => line.code === "96130").length, 1);
    assert.equal(result.lines.find((line) => line.code === "96130")?.dayLabel, "Reported on Wednesday");
    assert.equal(normalize({}).span, "episode");
    assert.equal(normalize({ span: "per-date" }).span, "per-date");
  });
});

describe("suggest and review", () => {
  it("leaves informant rating scales out of suggested administration time", () => {
    const suggestion = suggestTimes(["WAIS-IV", "BRIEF-A", "Conners 4"], "psychological");
    assert.equal(suggestion.admin, 75);
    assert.deepEqual(suggestion.ratingScales, ["BRIEF-A", "Conners 4"]);
  });

  it("treats the ADOS-2 as a test, not a diagnostic interview", () => {
    const missed = missedCodes({ ...EMPTY, tests: ["ADOS-2", "Vineland-3"] });
    assert.equal(missed.some((item) => item.code === "90791"), false);
    assert.equal(suggestTimes(["ADOS-2"], "psychological").interview, false);
  });

  it("suggests administration from the selected tests", () => {
    const suggestion = suggestTimes(["WAIS-IV", "Conners CPT 3", "PAI"], "psychological");
    assert.equal(suggestion.admin, 75 + 14 + 50);
    assert.ok(suggestion.activities.reportWriting >= 60);
  });

  it("points at administration and an interview that were not entered", () => {
    const missed = missedCodes({ ...EMPTY, tests: ["WAIS-IV", "WMS-IV", "CVLT-3", "DIVA-5"] });
    assert.ok(missed.some((item) => item.code === "96136"));
    assert.ok(missed.some((item) => item.code === "90791"));
    assert.ok(missed.some((item) => item.code === "96132"));
  });

  it("drops a damaged draft back to a blank worksheet", () => {
    assert.equal(normalize({ license: "nope" as "lp", adminQhp: -4 }).license, "lp");
    assert.equal(normalize({ adminQhp: -4 }).adminQhp, 0);
  });
});
