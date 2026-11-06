import regionIndex from "../public/app/regions/index.json" with { type: "json" };

const neighborhoodLabels = new Map(
  regionIndex.regions.map(({ code, label }) => [code, label]),
);

export function policyId(url) {
  let hash = 2166136261;
  for (const c of String(url))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `policy-${(hash >>> 0).toString(16)}`;
}
export function validateFeedback(input, policies) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: "입력 내용을 확인해 주세요" };
  const policy = policies.find((p) => p.id === input.policyId);
  if (!policy) return { error: "목록에서 실제 정책을 선택해 주세요" };
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (title.length < 5 || title.length > 80)
    return { error: "제목은 5~80자로 입력해 주세요" };
  if (content.length < 15 || content.length > 1500)
    return { error: "의견은 15~1,500자로 입력해 주세요" };
  if (input.consent !== true)
    return { error: "의견 공개와 저장에 동의해 주세요" };
  const neighborhood = neighborhoodLabels.get(input.neighborhoodCode);
  if (input.neighborhoodCode !== undefined && !neighborhood)
    return { error: "읍·면·동을 다시 선택해 주세요" };
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.requestId || "",
    )
  )
    return { error: "접수 번호가 올바르지 않습니다" };
  return {
    value: {
      id: input.requestId,
      policy_id: policy.id,
      policy_title: policy.title,
      policy_published_at: policy.publishedAt,
      policy_source_url: policy.sourceUrl,
      region: policy.region,
      neighborhood: neighborhood ?? null,
      title,
      content,
    },
  };
}
