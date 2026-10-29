import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyOpinion,
  rankPolicies,
  normalizeWeights,
  simulateBudget,
  validateOpinion,
} from "../public/app/logic.js";

test("Korean classification explains its keywords and has an explicit fallback", () => {
  assert.equal(classifyOpinion("버스 배차 간격을 줄여 주세요").policy, "bus");
  assert.equal(
    classifyOpinion("휠체어를 위한 경사로가 필요합니다").category,
    "복지",
  );
  assert.equal(classifyOpinion("특별한 새로운 제안입니다").category, "기타");
  assert.deepEqual(classifyOpinion("특별한 새로운 제안입니다").keywords, []);
});
test("a serious minority issue can outrank a frequent low-impact issue", () => {
  const policies = [{ id: "a" }, { id: "b" }, { id: "empty" }];
  const opinions = [
    { policy_id: "a", severity: 5, vulnerability: 5 },
    ...Array.from({ length: 20 }, () => ({
      policy_id: "b",
      severity: 1,
      vulnerability: 1,
    })),
  ];
  const ranked = rankPolicies(policies, opinions);
  assert.equal(ranked[0].id, "a");
  assert.equal(ranked.length, 2);
  assert.equal(ranked[1].components.frequency, 100);
  assert.deepEqual(
    normalizeWeights({ severity: 0, vulnerability: 0, frequency: 0 }),
    { severity: 0.4, vulnerability: 0.4, frequency: 0.2 },
  );
  assert.deepEqual(rankPolicies(policies, []), []);
});
test("changing weights changes rank and a tie has a stable order", () => {
  const policies = [{ id: "a" }, { id: "b" }];
  const opinions = [
    { policy_id: "a", severity: 5, vulnerability: 1 },
    { policy_id: "b", severity: 1, vulnerability: 5 },
  ];
  assert.equal(
    rankPolicies(policies, opinions, {
      severity: 100,
      vulnerability: 0,
      frequency: 0,
    })[0].id,
    "a",
  );
  assert.equal(
    rankPolicies(policies, opinions, {
      severity: 0,
      vulnerability: 100,
      frequency: 0,
    })[0].id,
    "b",
  );
  assert.deepEqual(
    rankPolicies(policies, opinions),
    rankPolicies([...policies].reverse(), [...opinions].reverse()),
  );
});
test("allocation cannot overspend, double count policies or partially fund them", () => {
  const policies = [
    { id: "a", score: 90, vulnerability: 3, cost: 100, beneficiaries: 20 },
    { id: "b", score: 80, vulnerability: 5, cost: 40, beneficiaries: 40 },
    { id: "c", score: 70, vulnerability: 2, cost: 30, beneficiaries: 100 },
  ];
  for (const strategy of ["priority", "coverage", "equity"]) {
    const result = simulateBudget(policies, 75, strategy);
    assert.equal(result.spent, 70);
    assert.equal(result.remaining, 5);
    assert.equal(result.beneficiaries, 140);
    assert.equal(
      new Set(result.selected.map((x) => x.id)).size,
      result.selected.length,
    );
  }
  assert.equal(simulateBudget(policies, 0).selected.length, 0);
  assert.equal(simulateBudget(policies, 140, "equity").selected[0].id, "b");
  assert.equal(simulateBudget(policies, 140, "coverage").selected[0].id, "c");
  assert.deepEqual(
    policies.map((x) => x.cost),
    [100, 40, 30],
  );
});
test("validation enforces consent, ranges and matching manual category", () => {
  const input = {
    requestId: "00000000-0000-4000-8000-000000000001",
    title: "학교 앞 버스 개선",
    content: "학교 앞 마을버스 배차 간격이 길어서 이동이 불편합니다.",
    category: "복지",
    district: "중앙동",
    severity: 4,
    vulnerability: 5,
    consent: true,
  };
  assert.equal(validateOpinion(input).value.policy_id, "care");
  assert.equal(validateOpinion({ ...input, severity: NaN }).field, "severity");
  assert.equal(
    validateOpinion({ ...input, vulnerability: 7 }).field,
    "vulnerability",
  );
  assert.equal(validateOpinion({ ...input, consent: false }).field, "consent");
  assert.equal(validateOpinion({ ...input, title: "<" }).field, "title");
});
