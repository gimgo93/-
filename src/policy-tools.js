export const escapeXML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function policyId(url) {
  let hash = 2166136261;
  for (const c of String(url))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `policy-${(hash >>> 0).toString(16)}`;
}
export function earthURL(policy) {
  if (!Number.isFinite(policy.latitude) || !Number.isFinite(policy.longitude))
    return null;
  return `https://earth.google.com/web/search/${encodeURIComponent(`${policy.latitude},${policy.longitude}`)}`;
}
export function makeKML(policies) {
  const rows = policies.flatMap((p) =>
    (p.locations || [])
      .filter(
        (l) => Number.isFinite(l.latitude) && Number.isFinite(l.longitude),
      )
      .map((l) => ({ p, l })),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>공개 정책의 적용 지역과 거점</name><description>공식자료 기반. 대표 위치·시설·행사 지역을 각각 구분합니다. 사업 경계를 나타내지 않습니다. 좌표 © OpenStreetMap contributors (ODbL).</description>${rows.map(({ p, l }) => `<Placemark><name>${escapeXML(`${p.title} — ${l.label}`)}</name><description>${escapeXML(`${p.summary}\n적용 지역: ${p.region}\n좌표 기준: ${l.note}\n위치 판단 근거: ${p.locationEvidence}\n출처: ${p.sourceName}\n원문: ${p.sourceUrl}\n좌표 출처: ${l.geoSourceUrl}\n발표일: ${p.publishedAt}\n검토일: ${p.reviewedAt}`)}</description><Point><coordinates>${l.longitude},${l.latitude},0</coordinates></Point></Placemark>`).join("")}</Document></kml>`;
}
export function validateFeedback(input, policies) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: "입력 내용을 확인해 주세요." };
  const policy = policies.find((p) => p.id === input.policyId);
  if (!policy) return { error: "목록에서 실제 정책을 선택해 주세요." };
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (title.length < 5 || title.length > 80)
    return { error: "제목은 5~80자로 입력해 주세요." };
  if (content.length < 15 || content.length > 1500)
    return { error: "의견은 15~1,500자로 입력해 주세요." };
  if (input.consent !== true)
    return { error: "의견 공개와 저장에 동의해 주세요." };
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.requestId || "",
    )
  )
    return { error: "접수 번호가 올바르지 않습니다." };
  return {
    value: {
      id: input.requestId,
      policy_id: policy.id,
      policy_title: policy.title,
      region: policy.region,
      title,
      content,
    },
  };
}
