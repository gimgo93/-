export const CATEGORIES = ["교통", "의료", "복지", "환경", "생활안전", "기타"];
export const DISTRICTS = ["중앙동", "푸른동", "행복동"];
export const DEFAULT_WEIGHTS = {
  severity: 40,
  vulnerability: 40,
  frequency: 20,
};
const rules = [
  {
    category: "교통",
    policy: "crosswalk",
    words: ["횡단보도", "신호등", "스쿨존", "통학", "보행 신호"],
  },
  {
    category: "교통",
    policy: "bus",
    words: ["버스", "배차", "정류장", "대중교통", "교통"],
  },
  {
    category: "의료",
    policy: "clinic",
    words: ["병원", "진료", "의료", "보건", "응급", "약국", "의사"],
  },
  {
    category: "복지",
    policy: "access",
    words: ["휠체어", "경사로", "장애", "유모차", "턱"],
  },
  {
    category: "복지",
    policy: "care",
    words: ["돌봄", "독거", "노인", "어르신", "복지"],
  },
  {
    category: "환경",
    policy: "recycle",
    words: ["쓰레기", "분리수거", "재활용", "악취", "폐기물"],
  },
  {
    category: "환경",
    policy: "shade",
    words: ["공원", "그늘", "폭염", "나무", "쉼터", "녹지", "환경"],
  },
  {
    category: "생활안전",
    policy: "lighting",
    words: ["가로등", "조명", "어두", "골목", "안전", "방범"],
  },
];
export function classifyOpinion(text) {
  const normalized = String(text).normalize("NFKC").toLowerCase();
  const matches = rules
    .map((rule, index) => ({
      ...rule,
      index,
      keywords: rule.words.filter((word) => normalized.includes(word)),
    }))
    .filter((row) => row.keywords.length)
    .sort((a, b) => b.keywords.length - a.keywords.length || a.index - b.index);
  if (!matches.length)
    return {
      category: "기타",
      policy: "community",
      keywords: [],
      explanation:
        "일치하는 키워드가 없어 기타로 분류했습니다. 분야를 직접 선택할 수도 있습니다.",
    };
  const best = matches[0];
  return {
    category: best.category,
    policy: best.policy,
    keywords: best.keywords,
    explanation: `${best.keywords.join(", ")} 키워드를 바탕으로 분류했습니다.`,
  };
}
export function normalizeWeights(weights = DEFAULT_WEIGHTS) {
  const keys = ["severity", "vulnerability", "frequency"];
  const values = keys.map((key) => Math.max(0, Number(weights[key]) || 0));
  const sum = values.reduce((a, b) => a + b, 0);
  if (!sum) return { severity: 0.4, vulnerability: 0.4, frequency: 0.2 };
  return Object.fromEntries(keys.map((key, i) => [key, values[i] / sum]));
}
export function rankPolicies(policies, opinions, weights = DEFAULT_WEIGHTS) {
  const normalized = normalizeWeights(weights),
    grouped = new Map();
  for (const opinion of opinions) {
    const rows = grouped.get(opinion.policy_id) || [];
    rows.push(opinion);
    grouped.set(opinion.policy_id, rows);
  }
  const maximum = Math.max(
    1,
    ...[...grouped.values()].map((rows) => rows.length),
  );
  return policies
    .map((policy) => {
      const rows = grouped.get(policy.id) || [],
        count = rows.length;
      const severity = count
        ? rows.reduce((sum, row) => sum + Number(row.severity), 0) / count
        : 0;
      const vulnerability = count
        ? rows.reduce((sum, row) => sum + Number(row.vulnerability), 0) / count
        : 0;
      const components = {
        severity: (severity / 5) * 100,
        vulnerability: (vulnerability / 5) * 100,
        frequency: (Math.log1p(count) / Math.log1p(maximum)) * 100,
      };
      const score = Object.entries(normalized).reduce(
        (sum, [key, weight]) => sum + components[key] * weight,
        0,
      );
      return {
        ...policy,
        count,
        severity,
        vulnerability,
        components,
        score: Math.round(score * 10) / 10,
      };
    })
    .filter((policy) => policy.count > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.vulnerability - a.vulnerability ||
        a.id.localeCompare(b.id),
    );
}
export function simulateBudget(policies, budget, strategy = "priority") {
  const available = Math.max(0, Math.floor(Number(budget) || 0));
  const rows = policies.filter(
    (row) =>
      Number.isFinite(Number(row.cost)) &&
      Number(row.cost) > 0 &&
      Number.isFinite(Number(row.beneficiaries)) &&
      Number(row.beneficiaries) >= 0,
  );
  const sorted = [...rows].sort((a, b) => {
    if (strategy === "coverage")
      return (
        b.beneficiaries / b.cost - a.beneficiaries / a.cost || b.score - a.score
      );
    if (strategy === "equity")
      return b.vulnerability - a.vulnerability || b.score - a.score;
    return b.score - a.score || a.cost - b.cost;
  });
  let remaining = available;
  const selected = [],
    waiting = [];
  for (const policy of sorted) {
    const cost = Math.ceil(policy.cost);
    if (cost <= remaining) {
      selected.push({ ...policy, cost });
      remaining -= cost;
    } else waiting.push(policy);
  }
  return {
    budget: available,
    spent: available - remaining,
    remaining,
    selected,
    waiting,
    beneficiaries: selected.reduce(
      (sum, row) => sum + Math.floor(row.beneficiaries),
      0,
    ),
  };
}
export function validateOpinion(input) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (title.length < 5 || title.length > 80)
    return { error: "제목은 5~80자로 입력해 주세요.", field: "title" };
  if (content.length < 15 || content.length > 1500)
    return { error: "의견은 15~1,500자로 입력해 주세요.", field: "content" };
  if (!DISTRICTS.includes(input.district))
    return { error: "지역을 선택해 주세요.", field: "district" };
  for (const field of ["severity", "vulnerability"])
    if (
      !Number.isInteger(Number(input[field])) ||
      Number(input[field]) < 1 ||
      Number(input[field]) > 5
    )
      return { error: "영향도는 1~5 사이에서 선택해 주세요.", field };
  if (input.category !== "auto" && !CATEGORIES.includes(input.category))
    return { error: "분야를 다시 선택해 주세요.", field: "category" };
  if (input.consent !== true)
    return {
      error: "의견 공개 및 저장 안내에 동의해 주세요.",
      field: "consent",
    };
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.requestId || "",
    )
  )
    return {
      error: "접수 정보가 올바르지 않습니다. 화면을 새로고침해 주세요.",
    };
  const classification = classifyOpinion(`${title} ${content}`);
  const category =
    input.category === "auto" ? classification.category : input.category;
  const fallback = {
    교통: "bus",
    의료: "clinic",
    복지: "care",
    환경: "recycle",
    생활안전: "lighting",
    기타: "community",
  };
  return {
    value: {
      id: input.requestId,
      title,
      content,
      district: input.district,
      severity: Number(input.severity),
      vulnerability: Number(input.vulnerability),
      category,
      policy_id:
        classification.category === category
          ? classification.policy
          : fallback[category],
      keywords: classification.keywords,
      classification_method: input.category === "auto" ? "keyword" : "citizen",
    },
  };
}
