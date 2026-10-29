import fs from "node:fs/promises";
import { policyId, earthURL } from "../src/policy-tools.js";
const root = new URL("../", import.meta.url);
const reviewed = JSON.parse(
  await fs.readFile(
    new URL("../data/reviewed-publications.json", import.meta.url),
    "utf8",
  ),
);
const geocodes = JSON.parse(
  await fs.readFile(
    new URL("../data/public-location-cache.json", import.meta.url),
    "utf8",
  ),
);
const definitions = {
  "gg-pine-20261027": [
    ["경기도 가평군", "가평군 전역의 대표 위치", "administrative-area"],
  ],
  "gg-newforest-20261027": [
    [
      "경기도 안산시 상록구 본오동",
      "본오동 대표 위치 · 조성지 경계 미확인",
      "administrative-area",
    ],
  ],
  "gg-bridge-20261028": [
    [
      "경기도 양평군",
      "양평군 대표 위치 · 양평·양근대교",
      "administrative-area",
    ],
    ["경기도 여주시", "여주시 대표 위치 · 이포대교", "administrative-area"],
  ],
  "gg-bus-20261029": [
    ["수원역", "수원역 주변 · 기사에 제시한 거점 예시", "station-area"],
    ["기흥역", "기흥역 주변 · 기사에 제시한 거점 예시", "station-area"],
    ["대화역", "대화역 주변 · 기사에 제시한 거점 예시", "station-area"],
  ],
  "gg-physicalai-20261029": [
    [
      "경기도 시흥시",
      "시흥시 대표 위치 · 확산센터 주소 미확인",
      "administrative-area",
    ],
  ],
  "gg-infection-20260312": [
    ["분당서울대학교병원", "분당서울대학교병원 · 설치 계획 거점", "facility"],
  ],
  "gg-pocheon-feed-20260115": [
    [
      "경기도 포천시",
      "포천시 대표 위치 · 하천 사업구간 미확인",
      "administrative-area",
    ],
  ],
  "mois-130600": [
    [
      "서울특별시 서대문구",
      "서대문구 대표 위치 · 행사 지역(전국 정책 범위 아님)",
      "event-area",
    ],
  ],
};
const audiences = {
  "gg-pine-20261027": "가평군 산림과 인접 지역",
  "gg-newforest-20261027": "안산 지역 주민과 향후 정원 이용자",
  "gg-bridge-20261028": "원문에 명시된 세 교량의 이용자",
  "gg-firetf-20261026": "경기도 소방 현장과 소방공무원",
  "gg-bus-20261029": "파업 시 영향을 받는 경기도 버스 이용자",
  "gg-tax-20261029": "경기도 성실납세자(기관별 조건 확인)",
  "gg-physicalai-20261029": "기술 도입·실증에 참여할 제조기업 등",
  "gg-infection-20260312": "수도권 감염병 의료 대응체계",
  "gg-pocheon-feed-20260115": "포천시 참여 축산농가",
  "gg-learning-20260118": "사업별 학습 취약계층·아동·청소년 등",
  "mois-130600": "개인정보 보호·활용 의제에 참여하는 시민",
  "mois-130555": "다자녀·장애인·국가유공자 등 해당 자격 보유자",
};
const policies = reviewed.items.map((p) => {
  const locations = (definitions[p.id] || []).flatMap(
    ([query, label, precision], index) => {
      const g = geocodes[query];
      if (!g?.result) return [];
      return [
        {
          id: `${policyId(p.sourceUrl)}-${index}`,
          label,
          precision,
          latitude: Number(g.result.lat),
          longitude: Number(g.result.lon),
          query,
          geoSource: "OpenStreetMap Nominatim",
          geoSourceUrl: g.sourceUrl,
          osmType: g.result.type,
          osmId: g.result.osm_id,
          note:
            precision === "facility"
              ? "원문에 명시된 기존 병원의 OSM 위치이며 새 전문병원의 완공을 뜻하지 않습니다."
              : precision === "station-area"
                ? "역 주변 개략 위치입니다. 실제 임시 승차 위치와 운행 여부는 교통기관 안내에서 확인하세요."
                : "행정구역 표시용 대표 위치입니다. 사업장·사업 경계 좌표가 아닙니다.",
        },
      ];
    },
  );
  return {
    ...p,
    id: policyId(p.sourceUrl),
    reviewKey: p.id,
    sourceName: p.source,
    locations,
    audience: audiences[p.id],
    reviewedAt: reviewed.reviewedAt,
    summaryMethod: "공식 원문 검토 후 재작성",
    locationNote: p.locationEvidence,
    latitude: locations[0]?.latitude ?? null,
    longitude: locations[0]?.longitude ?? null,
    budget:
      p.id === "gg-bridge-20261028"
        ? {
            label: "34억 원",
            amountKRW: 3400000000,
            note: "원문에 기재된 세 교량 총사업비(발표 기준)",
          }
        : null,
    earthUrl: locations[0] ? earthURL(locations[0]) : null,
  };
});
await fs.mkdir(new URL("data/", root), { recursive: true });
await fs.writeFile(
  new URL("data/policy-catalog.json", root),
  JSON.stringify(
    {
      reviewedAt: reviewed.reviewedAt,
      scopeNote:
        "이번에 확인한 경기도·행정안전부 공개 정책과 사업 12건입니다. 전국 모든 정책을 수집한 목록은 아닙니다.",
      policies,
    },
    null,
    2,
  ) + "\n",
);
await fs.writeFile(
  new URL("data/source-research.json", root),
  JSON.stringify(reviewed.sourceResearch, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    policies: policies.length,
    mapPoints: policies.reduce((n, p) => n + p.locations.length, 0),
    categories: [...new Set(policies.map((p) => p.category))],
  }),
);
