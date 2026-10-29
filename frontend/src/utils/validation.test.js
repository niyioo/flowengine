import { describe, expect, it } from "vitest";
import { validateComment, validateMemo, validateRoute } from "./validation";

const LIMITS = { memo_body_max_length: 50, comment_min_length: 5, comment_max_length: 20, max_route_steps: 2 };
const memo = { title: "Chairs", body: "Buy 20 chairs.", route: "1" };

describe("validateMemo", () => {
  it("accepts a complete memo", () => {
    expect(validateMemo(memo, LIMITS)).toEqual({});
  });

  it("requires a title, body and route", () => {
    expect(Object.keys(validateMemo({ title: " ", body: "", route: "" }, LIMITS)).sort()).toEqual(["body", "route", "title"]);
  });

  it("uses the server's length limit", () => {
    expect(validateMemo({ ...memo, body: "x".repeat(51) }, LIMITS).body).toMatch("50");
  });
});

describe("validateComment", () => {
  it("allows an empty optional comment", () => {
    expect(validateComment("", LIMITS, { required: false })).toBe("");
  });

  it("requires a reason when returning or rejecting", () => {
    expect(validateComment("  ", LIMITS, { required: true })).not.toBe("");
    expect(validateComment("no", LIMITS, { required: true })).toMatch("5");
    expect(validateComment("Attach quotes.", LIMITS, { required: true })).toBe("");
  });
});

describe("validateRoute", () => {
  const step = (approver) => ({ title: "Review", approver });

  it("rejects duplicate approvers and too many steps", () => {
    expect(validateRoute({ name: "R", steps: [step("a"), step("a")] }, LIMITS).steps).toMatch("only once");
    expect(validateRoute({ name: "R", steps: [step("a"), step("b"), step("c")] }, LIMITS).steps).toMatch("2");
  });

  it("accepts a valid route", () => {
    expect(validateRoute({ name: "R", steps: [step("a"), step("b")] }, LIMITS)).toEqual({});
  });
});
