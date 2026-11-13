import { describe, expect, it } from "vitest";
import type { Category } from "../src/lib/categories";
import { diffRuns, type RunRow } from "../src/lib/compare";

const row = (id: string, label: Category, model: Category, final: Category, modelKey?: string): RunRow => ({ id, acceptable: [label], model, final, modelKey });

describe("diffRuns", () => {
  it("flags a regression caused by the model's own answer changing (#01: paid 1 → paid 2)", () => {
    const c = diffRuns([row("01", "paid", "paid", "paid", "paid 1")], [row("01", "paid", "needs_human", "needs_human", "paid 2")]);
    expect(c.regressions).toEqual([{ id: "01", kind: "regression", source: "model", before: "paid", after: "needs_human", modelBefore: "paid 1", modelAfter: "paid 2" }]);
  });
  it("attributes a flip with the SAME model answer to a code rule (#32: the quote rule)", () => {
    const c = diffRuns([row("32", "dispute", "dispute", "dispute", "dispute 0")], [row("32", "dispute", "dispute", "needs_human", "dispute 0")]);
    expect(c.regressions[0]).toMatchObject({ id: "32", source: "code rule" });
  });
  it("reports a fix", () => {
    const c = diffRuns([row("18", "dispute", "dispute", "needs_human", "dispute 0")], [row("18", "dispute", "dispute", "dispute", "dispute 0")]);
    expect(c.fixes.map((x) => x.id)).toEqual(["18"]);
    expect([c.passedBefore, c.passedAfter]).toEqual([0, 1]);
  });
  it("a change between two wrong answers is 'moved', not a regression", () => {
    const c = diffRuns([row("22", "needs_human", "promise_to_pay", "promise_to_pay")], [row("22", "needs_human", "dispute", "dispute")]);
    expect(c.changes[0].kind).toBe("moved");
    expect(c.regressions).toEqual([]);
  });
  it("lists replies whose own model answer moved but whose display didn't (instability hidden from accuracy)", () => {
    const c = diffRuns([row("38", "needs_human", "promise_to_pay", "needs_human", "promise_to_pay 2")], [row("38", "needs_human", "promise_to_pay", "needs_human", "promise_to_pay 1")]);
    expect(c.changes).toEqual([]);
    expect(c.hiddenModelChanges).toEqual(["38"]);
  });
  it("only compares replies present in both runs", () => {
    const c = diffRuns([row("a", "paid", "paid", "paid"), row("b", "paid", "paid", "paid")], [row("a", "paid", "paid", "paid")]);
    expect(c.compared).toBe(1);
  });
  it("an acceptable alternative counts as a pass", () => {
    const amb: RunRow = { id: "S44", acceptable: ["needs_human", "promise_to_pay"], model: "needs_human", final: "needs_human" };
    const c = diffRuns([amb], [{ ...amb, final: "promise_to_pay", model: "promise_to_pay" }]);
    expect(c.regressions).toEqual([]);
  });
});
