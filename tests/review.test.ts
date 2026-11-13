import { describe, expect, it } from "vitest";
import { queueTier, sortQueue } from "../src/lib/review";

const r = (id: string, reviewReasons: string[], overrideReasons: string[] = [], day = 1) => ({
  id, reviewReasons, overrideReasons, receivedAt: new Date(Date.UTC(2026, 10, day)),
});

describe("queueTier", () => {
  it("1: a paid claim code blocked, whatever else is true", () => {
    expect(queueTier(r("17", ["needs_human", "rule_override"], ["paid_no_reference"]))).toBe(1);
    expect(queueTier(r("36", ["needs_human", "rule_override"], ["paid_amount_mismatch"]))).toBe(1);
  });
  it("1: manipulation, status-update requests and classifier errors", () => {
    expect(queueTier(r("23", ["needs_human", "manipulation_language"]))).toBe(1);
    expect(queueTier(r("a", ["status_update_request"]))).toBe(1);
    expect(queueTier(r("b", ["classifier_error", "needs_human"], ["classifier_error"]))).toBe(1);
  });
  it("2: needs_human with nothing worse", () => expect(queueTier(r("9", ["needs_human"]))).toBe(2));
  it("3: money questions that aren't needs_human", () => {
    expect(queueTier(r("H01", ["partial_no_plan"]))).toBe(3);
    expect(queueTier(r("c", ["other_invoice_mentioned"]))).toBe(3);
    expect(queueTier(r("d", ["amount_not_in_text"]))).toBe(3);
  });
  it("4: everything else", () => {
    expect(queueTier(r("e", ["low_confidence"]))).toBe(4);
    expect(queueTier(r("f", ["evidence_not_found"]))).toBe(4);
    expect(queueTier(r("g", ["promised_date_disagrees"]))).toBe(4);
  });
  it("a needs_human reply that also mentions another invoice stays tier 2 (first match wins)", () => {
    expect(queueTier(r("h", ["needs_human", "other_invoice_mentioned"]))).toBe(2);
  });
});

describe("sortQueue", () => {
  it("orders by tier, then oldest received first, then id", () => {
    const rows = [
      r("low-old", ["low_confidence"], [], 1),
      r("nh-new", ["needs_human"], [], 9),
      r("nh-old", ["needs_human"], [], 2),
      r("inj", ["needs_human", "manipulation_language"], [], 12),
      r("tie-b", ["needs_human"], [], 2),
    ];
    expect(sortQueue(rows).map((x) => x.id)).toEqual(["inj", "nh-old", "tie-b", "nh-new", "low-old"]);
  });
  it("doesn't change the input array", () => {
    const rows = [r("b", ["low_confidence"]), r("a", ["needs_human"])];
    sortQueue(rows);
    expect(rows.map((x) => x.id)).toEqual(["b", "a"]);
  });
});
