import snapshot from "../data/policy-catalog.json" with { type: "json" };
import { XMLParser } from "fast-xml-parser";
import { policyId, earthURL } from "./policy-tools.js";

export const FEED_URL =
  "https://www.mois.go.kr/gpms/view/jsp/rss/rss.jsp?ctxCd=1012";
export const sources = [
  {
    name: "경기도뉴스포털",
    kind: "공식 정책·사업 원문",
    status: "공공누리 제1유형을 확인한 자료를 선별·요약",
    url: "https://gnews.gg.go.kr/",
    docs: "https://gnews.gg.go.kr/rss/gnews_rss_main.do",
    access:
      "공개 원문 이용. 별도 REST API는 31개 시군용 인증키가 필요해 사용하지 않습니다.",
  },
  {
    name: "행정안전부",
    kind: "공개 RSS(XML)",
    status: "실제 RSS 조회 연동",
    url: FEED_URL,
    docs: "https://mois.go.kr/frt/sub/a08/rss/screen.do",
    access:
      "인증키 없이 공개된 최신 보도자료 제목·원문 링크·발표일을 조회합니다. 최신 목록은 정책의 시행 여부를 뜻하지 않습니다.",
  },
  {
    name: "온통청년",
    kind: "청년정책 REST API",
    status: "공식 API 조사 완료 · 미연결",
    url: "https://www.youthcenter.go.kr/",
    docs: "https://www.youthcenter.go.kr/cmnFooter/openapiIntro/oaiDoc",
    access:
      "발급받은 API 키가 필요합니다. 키 없이 전체 정책을 수집하거나 연동한 것으로 표시하지 않습니다.",
  },
  {
    name: "경기데이터드림",
    kind: "공공데이터 REST API",
    status: "공식 명세 조사 완료 · 미연결",
    url: "https://data.gg.go.kr/",
    docs: "https://data.gg.go.kr/portal/openapi/usagePage.do",
    access:
      "인증키가 없으면 5건으로 제한되는 공개 sample 응답입니다. sample은 실제 자료의 일부이며 전체 정책 목록이 아닙니다.",
  },
  {
    name: "서울시 분야별 정책 RSS",
    kind: "공개 RSS / REST 제한",
    status: "조회 확인 · 가공 목록에는 미사용",
    url: "https://news.seoul.go.kr/welfare/feed",
    docs: "https://news.seoul.go.kr/",
    access:
      "RSS는 응답했지만 확인한 기사에 변경금지 조건이 있어 이번 요약 목록에서 제외했습니다. REST API는 인증이 필요합니다.",
  },
  {
    name: "대한민국 정책브리핑",
    kind: "종료된 RSS",
    status: "미사용 · 제공 중단 확인",
    url: "https://www.korea.kr/",
    docs: "https://www.korea.kr/etc/noticeView.do?newsId=132038885",
    access:
      "2026년 7월 1일 RSS 제공 중단 공지를 확인했습니다. 종료된 서비스를 실시간 API로 표시하지 않습니다.",
  },
];

export function getCatalog() {
  const policies = snapshot.policies.map((p) => ({
    ...p,
    id: policyId(p.sourceUrl),
    earthUrl: earthURL(p),
  }));
  return {
    version: 2,
    mode: "reviewed-publications",
    reviewedAt: snapshot.reviewedAt,
    scopeNote: snapshot.scopeNote,
    policies,
    sources,
    methodology:
      "공식 발표의 사실을 확인해 사람이 읽기 쉬운 요약·대상·지역·확인할 점으로 재구성했습니다. 원문에 없는 예산·동의 수·심각도·효과 점수는 만들지 않았습니다.",
    mapNote:
      "지도점은 정책 적용 행정구역의 표시용 대표 위치입니다. 정확한 사업장 주소·사업 경계·수혜 범위를 뜻하지 않습니다. 전국 정책과 지역이 확인되지 않은 자료는 점으로 표시하지 않습니다.",
  };
}
export function parseFeed(xml) {
  if (xml.length > 4000000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw Error("Unsupported feed");
  const doc = new XMLParser({
    ignoreAttributes: true,
    processEntities: false,
    parseTagValue: false,
  }).parse(xml);
  let rows = doc?.rss?.channel?.item;
  if (!rows) throw Error("Feed schema changed");
  rows = Array.isArray(rows) ? rows : [rows];
  return rows.slice(0, 12).flatMap((row) => {
    let url;
    try {
      url = new URL(String(row.link));
    } catch {
      return [];
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.mois.go.kr" ||
      !url.pathname.startsWith("/frt/bbs/")
    )
      return [];
    const date = new Date(String(row.pubDate || "").replace(/KST$/, "+0900"));
    return [
      {
        title: String(row.title || "")
          .replace(/<[^>]*>/g, "")
          .slice(0, 240),
        sourceUrl: url.href,
        publishedAt: Number.isNaN(date.valueOf()) ? null : date.toISOString(),
        sourceName: "행정안전부",
        kind: "최신 보도자료",
      },
    ];
  });
}
export async function readPublicFeed(ctx) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(
    "https://ageclan.com/app/internal-cache/mois-feed-v3",
  );
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return { ...(await hit.json()), cached: true };
  }
  try {
    const r = await fetch(FEED_URL, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "sepol/2.0 (+https://ageclan.com/app/)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    const result = {
      status: "live",
      fetchedAt: new Date().toISOString(),
      feedUrl: FEED_URL,
      items: parseFeed(await r.text()),
      cached: false,
    };
    if (cache) {
      const put = cache.put(
        key,
        Response.json(result, {
          headers: { "Cache-Control": "public,max-age=1800" },
        }),
      );
      if (ctx?.waitUntil) ctx.waitUntil(put);
      else await put;
    }
    return result;
  } catch {
    return {
      status: "unavailable",
      fetchedAt: null,
      feedUrl: FEED_URL,
      items: [],
      message:
        "공식 RSS에 연결하지 못했습니다. 확인한 정책 목록은 계속 볼 수 있으며, 최신 목록은 원문 사이트에서 확인해 주세요.",
    };
  }
}
