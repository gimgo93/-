import { setupNeighborhood } from "./neighborhood-ui.js?v=7";
import { coverageFor } from "./neighborhood.js?v=4";
const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const prose = (v) => esc(String(v ?? "").replace(/(?<=[가-힣])\.(?=\s|$)/g, ""));
const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="/app/icons.svg#${name}"></use></svg>`;
const date = (v) =>
  v
    ? new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "Asia/Seoul",
      }).format(new Date(v))
    : "원문 확인";
const categoryIcon = {
  환경: "leaf",
  교통: "bus",
  의료: "heart-pulse",
  복지: "hand-heart",
  생활안전: "shield-check",
  교육: "users",
  "산업·일자리": "shapes",
  시민참여: "messages-square",
};
const badge = (p) => `<span class="badge">${esc(p.category)}</span>`;
const outLink = (url, label, cls = "") =>
  `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`;
const views = ["discover", "map", "compare", "opinions", "sources", "write"];
const params = new URLSearchParams(location.search);
let stored = [];
try {
  stored = JSON.parse(localStorage.getItem("moa.policy.saved.v2") || "[]");
} catch {}
const state = {
  view: views.includes(params.get("view")) ? params.get("view") : "discover",
  search: params.get("search") || "",
  category: params.get("category") || "all",
  region: params.get("region") || "all",
  catalog: null,
  error: "",
  saved: new Set(Array.isArray(stored) ? stored : []),
  selected: params.get("policy") || null,
  feedback: null,
  feedbackError: "",
  latestNotices: null,
  latestLoading: false,
  localSearch: "",
  localLimit: 12,
  extraPolicy: null,
  feed: null,
  feedLoading: false,
  requestId: crypto.randomUUID(),
  receipt: null,
};
let map = null,
  toastTimer;
let localOnly = !(state.view === "map" && state.selected?.startsWith("area:"));
const neighborhood = setupNeighborhood({
  onChange: () => {
    localOnly = true;
    if (state.view === "write") return;
    state.region = "all";
    state.search = "";
    state.category = "all";
    state.selected = null;
    state.view = "discover";
    sync(true);
    render();
  },
});
function neighborhoodScope() {
  const n = neighborhood.current;
  return n
    ? '<div class="local-scope"><span><strong>' +
        esc(n.town) +
        '</strong> 관련 정책 / 원문 적용 범위 기준</span><button class="text-button" data-action="toggle-local">' +
        (localOnly ? "전체 정책 보기" : "우리 동네 기준으로 보기") +
        "</button></div>"
    : "";
}
function toast(message) {
  $("#toast").textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").textContent = ""), 3500);
}
function policies() {
  return state.catalog?.policies || [];
}
const newestFirst = (a, b) => b.publishedAt.localeCompare(a.publishedAt);
const inNeighborhood = (p) =>
  !neighborhood.current || !localOnly || !!coverageFor(p, neighborhood.current);
const policyMatches = (p, query) =>
  [p.title, p.summary, p.region, p.audience, p.sourceTitle].join(" ").toLowerCase().includes(query);
function filtered() {
  const q = state.search.trim().toLowerCase();
  return policies()
    .filter(
      (p) =>
        inNeighborhood(p) &&
        (state.category === "all" || p.category === state.category) &&
        (state.region === "all" ||
          (state.region === "nationwide"
            ? p.geographyType === "nationwide"
            : p.region.includes(state.region))) &&
        policyMatches(p, q),
    )
    .sort(newestFirst);
}
function sync(push = false) {
  const p = new URLSearchParams({ view: state.view });
  if (state.search) p.set("search", state.search);
  if (state.category !== "all") p.set("category", state.category);
  if (state.region !== "all") p.set("region", state.region);
  if (state.selected && ["map", "write"].includes(state.view))
    p.set("policy", state.selected);
  history[push ? "pushState" : "replaceState"](null, "", `/app/?${p}`);
}
function save(id) {
  if (state.saved.has(id)) state.saved.delete(id);
  else {
    if (state.saved.size >= 4)
      return toast("최대 4개 정책을 비교할 수 있어요");
    state.saved.add(id);
  }
  try {
    localStorage.setItem(
      "moa.policy.saved.v2",
      JSON.stringify([...state.saved]),
    );
  } catch {}
  render();
  toast(
    state.saved.has(id) ? "비교 목록에 담았습니다" : "비교 목록에서 뺐습니다",
  );
}
function filters() {
  return `${neighborhoodScope()}<div class="filters"><label class="search-label" for="policy-search">정책·지역 검색<input id="policy-search" type="search" placeholder="예: 가평, 교통, 돌봄, 감염병" value="${esc(state.search)}" autocomplete="off"></label><label for="category-filter">분야<select id="category-filter"><option value="all">모든 분야</option>${[
    ...new Set(policies().map((p) => p.category)),
  ]
    .sort()
    .map(
      (v) =>
        `<option ${state.category === v ? "selected" : ""}>${esc(v)}</option>`,
    )
    .join(
      "",
    )}</select></label><label for="region-filter">적용 지역<select id="region-filter">${[
    ["all", "모든 지역"],
    ["경기도", "경기도 관련"],
    ["서울특별시", "서울 행사 지역"],
    ["nationwide", "전국 정책"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}" ${state.region === value ? "selected" : ""}>${label}</option>`,
    )
    .join("")}</select></label></div>`;
}
const scopeNote = () =>
  `<div class="scope-note">${icon("info")}<p>${prose(state.catalog.scopeNote)}<br>요약은 공식 청원이나 주민 투표 결과가 아니며, 발표 이후 변경사항은 원문에서 확인해 주세요</p></div>`;
function card(p) {
  return `<article class="policy-card"><div class="card-top">${badge(p)}<span class="status">${esc(p.status)}</span></div><h3><button data-detail="${p.id}">${esc(p.title)}</button></h3><p class="card-summary">${prose(p.summary)}</p><div class="card-region">${icon("map-pin")}<span>${esc(p.region)}</span></div>${neighborhood.current ? `<p class="coverage-label">${esc(coverageFor(p, neighborhood.current) || "다른 지역의 정책")}</p>` : ""}<div class="card-meta"><span>${esc(p.sourceName)} / ${date(p.publishedAt)}</span><span>원문 확인 ${esc(p.reviewedAt)} / 공공누리 제1유형</span></div><div class="card-actions"><button class="save-button" data-save="${p.id}" aria-pressed="${state.saved.has(p.id)}">${state.saved.has(p.id) ? "✓ 비교에 담음" : "+ 비교에 담기"}</button>${p.locations.length ? `<a href="?view=map&policy=${p.id}" data-map="${p.id}">지도에서 보기</a>` : `<button class="text-button small" data-detail="${p.id}">적용 범위 확인</button>`}</div></article>`;
}
function discover() {
  const rows = policies().filter(inNeighborhood).sort(newestFirst);
  return `<section class="hero"><div><h1>${neighborhood.current ? esc(neighborhood.current.town) + "에서 시작하는<br>우리 동네 정책 탐색" : "우리 동네 정책을<br>근거부터 살펴보세요"}</h1><p>무엇을 바꾸려는 정책인지, 누구를 위한 것인지<br>확인한 공개자료를 쉽게 읽고 지역과 함께 살펴보세요</p><div class="button-row"><button class="button primary" data-view="map">${icon("map-pin")}정책 지도 열기</button></div></div></section>${scopeNote()}${neighborhoodScope()}<div class="result-heading"><h2>검토한 정책 <span class="muted">${rows.length}건</span></h2><span class="small">발표일 최신순</span></div>${rows.length ? `<div class="policy-grid">${rows.map(card).join("")}</div>` : empty("조건에 맞는 정책이 없어요", "다른 검색어나 분야·지역을 선택해 주세요")}<section class="review-notes"><h2>정책의 상태까지 함께 읽으세요</h2><p class="small">발표 계획은 완료된 사업과 다르고, 행사 장소는 정책 전체의 적용 지역이 아닙니다<br>각 정책의 ‘확인할 점’과 위치 판단 근거를 열어보세요</p></section>${localDirectory()}`;
}
function empty(
  title = "아직 표시할 자료가 없어요",
  text = "확인된 자료가 들어오면 여기에 표시합니다",
) {
  return `<section class="empty-state"><h2>${title}</h2><p>${text}</p></section>`;
}
function mapNotices() {
  const q = state.search.trim().toLowerCase().replace(/\s+/g, "");
  const home = neighborhood.current;
  const groups = new Map();
  for (const notice of state.catalog?.localNotices || []) {
    const area = notice.mapArea;
    if (!area || state.category !== "all") continue;
    if (state.region !== "all" && !area.label.includes(state.region)) continue;
    if (home && localOnly &&
      (home.province !== area.province || (area.district &&
        !home.district.replace(/\s+/g, "").startsWith(area.district.replace(/\s+/g, ""))))) continue;
    if (q && !`${area.label}${notice.title}`.toLowerCase().replace(/\s+/g, "").includes(q)) continue;
    const id = noticeMapId(area);
    if (!groups.has(id)) groups.set(id, { ...area, id, notices: [] });
    groups.get(id).notices.push(notice);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "ko"));
}
function noticeMapId(area) {
  return "area:" + area.label;
}
function mapData() {
  const rows = filtered().filter((p) => p.locations.length);
  const groups = mapNotices();
  const area = groups.find((g) => g.id === state.selected);
  const policy = rows.find((p) => p.id === state.selected);
  return { rows, groups, area, policy };
}
function mapDetail(p) {
  if (!p) return "<p>지도에서 지역이나 정책을 선택해 주세요</p>";
  return `${badge(p)}<h2>${esc(p.title)}</h2><p>${prose(p.summary)}</p><p><strong>원문이 설명한 지역</strong> ${esc(p.region)}</p><p class="small">${prose(p.locationEvidence)}</p><div class="button-row"><button class="button compact" data-detail="${p.id}">근거·위치 기준 보기</button><button class="button compact" data-save="${p.id}" aria-pressed="${state.saved.has(p.id)}">${state.saved.has(p.id) ? "✓ 비교에 담음" : "비교에 담기"}</button></div>`;
}
function areaDetail(area) {
  return `<h2>${esc(area.label)} 입법예고 ${area.notices.length}건</h2><p class="small">지자체 대표 위치 · 공고별 위치는 원문에서 확인해 주세요</p><div class="map-notice-results">${area.notices.map((notice) => noticeCard(notice)).join("")}</div>`;
}
function mapView({ rows, groups, area, policy }) {
  const noticeCount = groups.reduce((sum, group) => sum + group.notices.length, 0);
  const choices = rows.map((p) => `<button class="map-choice" data-map-select="${esc(p.id)}" aria-pressed="${policy?.id === p.id}"><strong>${esc(p.title)}</strong><span>${esc(p.region)}</span></button>`).join("");
  const areas = groups.map((g) => `<button class="map-choice" data-map-select="${esc(g.id)}" aria-pressed="${area?.id === g.id}"><strong>${esc(g.label)}</strong><span>입법예고 ${g.notices.length}건</span></button>`).join("");
  const list = `${areas ? `<h2>지자체 입법예고 · ${noticeCount}건</h2>${areas}` : ""}${choices ? `<h2>검토한 정책 · ${rows.length}건</h2>${choices}` : ""}`;
  return `<div class="page-top"><h1>어디에 닿는 정책일까요?</h1><div class="button-row"><button class="button" data-action="map-overview">표시 지역 전체 보기</button></div></div><p class="section-intro">보라색 숫자에 묶인 지자체 입법예고 ${noticeCount}건을 확인할 수 있어요</p>${filters()}<div class="map-layout"><div class="map-list" aria-label="지도에서 볼 지역과 정책">${list || empty("지도에 표시할 자료가 없어요", "다른 검색어나 필터를 선택해 주세요")}</div><section class="map-panel"><div id="policy-map" class="map-canvas" role="region" aria-label="공개 정책과 지자체 입법예고 지도"></div><div class="map-caption" id="map-caption">보라: 지자체 대표 위치 · 숫자는 공고 건수<br>파랑: 행정구역 대표 위치 / 초록: 시설·역 주변 / 주황: 행사 지역 · 사업 경계 표시 제외 <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">지도 오류 제보</a></div><div class="map-detail">${area ? areaDetail(area) : mapDetail(policy || rows[0])}</div></section></div>`;
}
function updateMapSelection(id, html) {
  state.selected = id;
  sync();
  $(".map-detail").innerHTML = html;
  document.querySelectorAll("[data-map-select]").forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.mapSelect === id)));
}
function mountMap({ rows, groups, area, policy }) {
  const container = $("#policy-map");
  if (!container || !window.L) return;
  map = L.map(container, { scrollWheelZoom: false }).setView([36.3, 127.7], 7);
  const tile = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  }).addTo(map);
  tile.once("tileerror", () => {
    $("#map-caption")?.insertAdjacentHTML("beforeend", " <strong>배경 지도를 불러오지 못하면 위치 목록에서 정책을 확인해 주세요</strong>");
  });
  const bounds = [];
  for (const p of rows) {
    for (const l of p.locations) {
      const point = [l.latitude, l.longitude];
      const selected = p.id === policy?.id;
      const color = l.precision === "event-area" ? "#a96919"
        : ["facility", "station-area"].includes(l.precision) ? "#18714e" : "#075cc9";
      const marker = L.circleMarker(point, {
        radius: selected ? 10 : 7, color, fillColor: color,
        fillOpacity: selected ? 0.9 : 0.55, weight: selected ? 3 : 2,
      }).addTo(map);
      marker.bindPopup(`<strong>${esc(l.label)}</strong><span>${esc(p.title)}</span><p>${prose(l.note)}</p>`);
      marker.on("click", () => updateMapSelection(p.id, mapDetail(p)));
      bounds.push(point);
    }
  }
  for (const group of groups) {
    const point = [group.latitude, group.longitude];
    const label = `${group.label} 입법예고 ${group.notices.length}건`;
    const selected = group.id === area?.id;
    const marker = L.marker(point, {
      title: label,
      zIndexOffset: selected ? 500 : 0,
      icon: L.divIcon({
        className: selected ? "notice-map-marker is-selected" : "notice-map-marker",
        html: `<span>${group.notices.length}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    }).addTo(map);
    marker.getElement().setAttribute("aria-label", label);
    marker.bindPopup(`<strong>${esc(label)}</strong><p>공고 목록은 지도 아래에서 확인할 수 있어요</p>`);
    marker.on("click", () => updateMapSelection(group.id, areaDetail(group)));
    bounds.push(point);
  }
  if (neighborhood.current && localOnly) {
    const n = neighborhood.current;
    const box = [[n.bbox[1], n.bbox[0]], [n.bbox[3], n.bbox[2]]];
    L.rectangle(box, { color: "#627086", weight: 1, dashArray: "5,5", fill: false })
      .addTo(map).bindPopup(esc(n.label) + " / 동네 경계의 외접 범위");
    if (!area && !policy) bounds.push(...box);
  }
  if (area) map.setView([area.latitude, area.longitude], area.district ? 10 : 8);
  else if (policy?.locations.length === 1) {
    const l = policy.locations[0];
    map.setView([l.latitude, l.longitude], l.precision === "administrative-area" ? 10 : 13);
  } else if (policy) {
    map.fitBounds(policy.locations.map((l) => [l.latitude, l.longitude]), { padding: [45, 45], maxZoom: 12 });
  } else if (bounds.length) {
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 10 });
  }
  map.invalidateSize();
}

function compare() {
  const rows = policies().filter((p) => state.saved.has(p.id));
  return `<div class="page-top"><div><h1>비교하고, 확인할 점을 남겨요</h1></div>${rows.length ? `<div class="button-row"><button class="button" data-action="csv">${icon("download")}비교 CSV</button><button class="button" data-action="print">인쇄 / PDF</button></div>` : ""}</div><p class="section-intro">최대 4개 정책의 대상·지역·추진 상태·출처를 비교합니다 원문에 없는 효과 점수와 예산은 추정하지 않습니다</p>${
    !rows.length
      ? empty(
          "비교할 정책을 담아 주세요",
          "정책 둘러보기에서 ‘비교에 담기’를 눌러 최대 4개를 선택할 수 있어요",
        )
      : `<div class="comparison-scroll"><table class="comparison"><thead><tr><th scope="col">확인 기준</th>${rows.map((p) => `<th scope="col">${esc(p.title)}<br><button class="text-button small" data-save="${p.id}">비교에서 빼기</button></th>`).join("")}</tr></thead><tbody>${[
          ["분야", (p) => esc(p.category)],
          ["누구를 위한 정책", (p) => esc(p.audience)],
          ["적용 지역", (p) => esc(p.region)],
          ["핵심 내용", (p) => prose(p.summary)],
          ["발표 당시 상태", (p) => esc(p.status)],
          ["확인할 점", (p) => prose(p.statusNote)],
          [
            "원문 기재 사업비",
            (p) =>
              p.budget
                ? `${esc(p.budget.label)}<br><small>${prose(p.budget.note)}</small>`
                : "원문 검토에서 확인하지 않음",
          ],
          [
            "발표일 / 검토일",
            (p) => `${date(p.publishedAt)} / ${esc(p.reviewedAt)}`,
          ],
          ["출처", (p) => outLink(p.sourceUrl, esc(p.sourceName))],
          [
            "지도",
            (p) =>
              p.locations.length
                ? `<button class="text-button" data-map="${p.id}">적용 지역 보기</button>`
                : "광역·전국 범위 / 특정 지점 없음",
          ],
        ]
          .map(
            ([name, fn]) =>
              `<tr><th scope="row">${name}</th>${rows.map((p) => `<td>${fn(p)}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table></div>`
  }<p class="review-notes policy-promise"><strong>없는 정책은 만들지 않습니다</strong></p>`;
}
function sourcesView() {
  return `<h1>데이터와 지도 기준</h1><p class="section-intro">접근·가공 조건과 제공 상태를 확인해 실제 연동 자료와 원문 검토 자료를 구분했어요</p><div class="sources-grid">${state.catalog.sources.map((s) => `<article class="source-card"><h2>${esc(s.name)}</h2><span class="source-state">${esc(s.status)}</span><p>${prose(s.access)}</p><div class="button-row">${outLink(s.docs, "공식 안내")}${outLink(s.url, "자료 보기")}</div></article>`).join("")}</div><section class="method-section"><div class="result-heading"><div><h2>방금 공개된 보도자료</h2><p class="small">행정안전부의 공개 RSS 제목과 원문 링크를 검토한 정책 12건과 별도로 표시해요</p></div><button class="button compact" data-action="refresh-feed">${icon("refresh-cw")}목록 확인</button></div><div id="feed-result">${feedHTML()}</div></section><section class="method-section"><h2>정책을 가공한 기준</h2><ol><li>공식 원문의 공공누리 제1유형을 확인한 12건을 선별했습니다<br>공식 청원이나 주민이 작성한 의견으로 바꾸어 표시하지 않습니다</li><li>핵심 내용·대상·지역·추진 상태를 따로 정리했습니다<br>원문의 사실과 편집자의 판단을 구분하며, 요약은 원문을 대신하는 신청 안내가 아닙니다</li><li>예산·동의 수·심각도·성과 점수는 만들지 않았습니다<br>금액은 원문에서 확인한 경우에만 표시합니다</li><li>사업이 계획인지, 완료 발표인지, 조건부 대책인지 구분했습니다<br>과거 발표의 모집상태를 현재 진행 중으로 간주하지 않습니다</li><li>시민 의견은 실제 접수한 내용만 별도 DB에 저장합니다<br>이전 합성 예시 의견은 공개 목록과 API에서 제외했습니다</li></ol><p class="small">목록 검토일: ${esc(state.catalog.reviewedAt)} / ${prose(state.catalog.scopeNote)}</p><a href="/app/api/policies">가공된 정책 JSON 보기</a></section><section class="method-section"><h2>지도 표시 기준</h2><ul><li>원문이 명시한 지역·역·시설명만 위치 검색에 사용했습니다<br>장소명이 모호하거나 검색 대상이 다르면 정확한 시설 위치로 채택하지 않았습니다</li><li>파랑은 행정구역 대표 위치, 초록은 시설·역 주변, 주황은 행사 지역입니다<br>정확한 사업 경계나 수혜 범위를 뜻하지 않습니다</li><li>전국·광역 정책은 청사 주소 한 점으로 표시하지 않습니다<br>행사장은 정책 전체의 적용 범위와 구분합니다</li><li>배경 지도·좌표는 © OpenStreetMap contributors, ODbL입니다<br>장소 좌표는 Nominatim을 제한된 횟수로 조회·캐시했고, 실시간 주소 검색은 제공하지 않습니다</li></ul><div class="button-row">${outLink("https://www.openstreetmap.org/copyright", "지도 저작권")}${outLink("https://operations.osmfoundation.org/policies/nominatim/", "좌표 조회 이용 조건")}</div></section>`;
}
function feedHTML() {
  if (state.feedLoading)
    return '<p role="status">공식 RSS를 확인하고 있어요</p>';
  if (!state.feed)
    return '<p class="small">‘목록 확인’을 누르면 공개 RSS를 조회합니다 개인정보나 시민 의견은 출처 사이트로 전송하지 않습니다</p>';
  if (state.feed.status !== "live")
    return `<p class="notice warning">${prose(state.feed.message)}</p>`;
  return `<p class="small">실제 조회 ${esc(new Date(state.feed.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}${state.feed.cached ? " / 30분 캐시" : ""}</p><ul class="feed-list">${state.feed.items.map((p) => `<li>${outLink(p.sourceUrl, esc(p.title))}<time>${date(p.publishedAt)}</time></li>`).join("")}</ul>`;
}
async function loadFeed() {
  if (state.feedLoading) return;
  state.feedLoading = true;
  const box = $("#feed-result");
  if (box) box.innerHTML = feedHTML();
  try {
    state.feed = await requestJSON("/app/api/public-feed");
  } catch {
    state.feed = {
      status: "unavailable",
      message:
        "공식 최신 목록을 가져오지 못했습니다 잠시 후 다시 확인해 주세요",
    };
  }
  state.feedLoading = false;
  if ($("#feed-result")) $("#feed-result").innerHTML = feedHTML();
}
function noticeCard(p, showMap = false) {
  return `<article class="local-notice"><p class="small">${esc(p.region)} · 공고일 ${date(p.publishedAt)}</p><h3>${outLink(p.sourceUrl, esc(p.title))}</h3><div class="button-row"><span class="small">${esc(p.sourceName)} · ${esc(p.reference)}</span>${showMap && p.mapArea ? `<button class="text-button small" data-map="${esc(noticeMapId(p.mapArea))}">지도에서 보기</button>` : ""}<button class="text-button small" data-write="${esc(p.id)}">이 정책에 의견 남기기</button></div></article>`;
}

function localNoticeList() {
  const query = state.localSearch.trim().toLowerCase();
  const notices = (state.catalog.localNotices || []).filter((p) =>
    `${p.region} ${p.mapArea?.label || ""} ${p.title} ${p.reference}`.toLowerCase().includes(query),
  );
  const reviewed = query ? policies().filter((p) => policyMatches(p, query)).sort(newestFirst) : [];
  if (query && !reviewed.length && !notices.length)
    return empty("일치하는 정책이나 입법예고가 없어요", "다른 지역명이나 정책명으로 검색해 보세요");
  return `${query ? `<p class="small" role="status">검색 결과 ${reviewed.length + notices.length}건</p>
    <h3>검토한 정책 · ${reviewed.length}건</h3>
    ${reviewed.length ? `<div class="policy-grid">${reviewed.map(card).join("")}</div>` : ""}
    <h3>전국 지자체 입법예고 · ${notices.length}건</h3>` : `<p class="small" role="status">${notices.length}건 · 공고일 최신순</p>`}
    ${notices.length ? `<div class="local-notice-grid">${notices.slice(0, state.localLimit).map((p) => noticeCard(p, true)).join("")}</div>` : ""}
    ${notices.length > state.localLimit ? '<button class="button" data-action="more-local-notices">공고 12건 더 보기</button>' : ""}`;
}

function drawLocalList() {
  const list = $("#local-notice-list");
  if (list) list.innerHTML = localNoticeList();
}

function latestNoticeList() {
  const latest = state.latestNotices;
  if (!latest) return '<p role="status">최신 지방 입법예고를 확인하고 있어요</p>';
  const fetchedAt = latest.fetchedAt
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(latest.fetchedAt))
    : "";
  const message = latest.status === "live" ? "공식 목록 최신순 · 최대 6건" : "원본 연결이 늦어 마지막으로 확인한 자료를 표시해요";
  return `<p class="small" role="status">${message}${fetchedAt ? ` · ${esc(fetchedAt)} 확인` : ""}</p><div class="local-notice-grid">${latest.items.map((p) => noticeCard(p)).join("")}</div>`;
}

function localDirectory() {
  return `<section class="local-directory"><div class="result-heading"><h2>전국 지자체 입법예고</h2></div><p class="small">거제·김천·상주를 비롯한 시·군·구가 공개한 조례·규칙 제정 및 개정안</p><label class="local-search" for="local-notice-search">정책·입법예고 검색<input id="local-notice-search" type="search" value="${esc(state.localSearch)}" placeholder="예: 김천, 돌봄, 자전거"></label><div id="local-notice-list">${localNoticeList()}</div></section><section class="local-directory"><div class="result-heading"><h2>더 많은 정책</h2><button class="button compact" data-action="refresh-local-notices" ${state.latestLoading ? "disabled" : ""}>새로 확인</button></div><div id="latest-notice-list">${latestNoticeList()}</div></section>`;
}

async function loadLatestNotices(refreshSource = false) {
  if (state.latestLoading) return;
  state.latestLoading = true;
  const refresh = $('[data-action="refresh-local-notices"]');
  if (refresh) {
    refresh.disabled = true;
    refresh.textContent = "확인 중…";
  }
  try {
    state.latestNotices = await requestJSON("/app/api/local-notices" + (refreshSource ? "?refresh=1" : ""));
  } catch {
    state.latestNotices = {
      ...state.latestNotices,
      status: "stale",
      items: state.latestNotices?.items ?? (state.catalog?.localNotices || []).slice(0, 6),
    };
  } finally {
    state.latestLoading = false;
    const list = $("#latest-notice-list");
    if (list) list.innerHTML = latestNoticeList();
    const currentRefresh = $('[data-action="refresh-local-notices"]');
    if (currentRefresh) {
      currentRefresh.disabled = false;
      currentRefresh.textContent = "새로 확인";
    }
    if (state.view === "write") updatePolicyOptions($("#feedback-form"));
  }
}

function authorHeaders(create = false) {
  const key = "sepol.feedback.author.v1";
  let token;
  try {
    token = localStorage.getItem(key);
    if (create && !/^[0-9a-f]{64}$/.test(token ?? "")) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      localStorage.setItem(key, token);
    }
  } catch {
    if (create) throw Error("이 브라우저에서 사이트 데이터 저장을 허용해야 의견을 남길 수 있어요");
  }
  return /^[0-9a-f]{64}$/.test(token ?? "") ? { Authorization: "Bearer " + token } : {};
}
function authorHeadersForWrite() {
  return navigator.locks
    ? navigator.locks.request("sepol.feedback.author.v1", () => authorHeaders(true))
    : authorHeaders(true);
}

function feedbackItem(row) {
  const location = row.neighborhood
    ? `<span class="feedback-place">${icon("map-pin")}${esc(row.neighborhood)}</span>`
    : `<small>정책 적용 지역 ${esc(row.region)}</small>`;
  const policy = row.policy_source_url
    ? outLink(row.policy_source_url, esc(row.policy_title))
    : esc(row.policy_title);
  return `<article class="feedback-item">${location}<small>정책 발표·공고일 ${date(row.policy_published_at)}</small><h2>${esc(row.title)}</h2><p>${esc(row.content)}</p><div class="button-row"><span class="small">관련 정책 · ${policy}</span>${row.can_delete
    ? `<button class="text-button small delete-feedback" data-action="delete-feedback" data-id="${esc(row.id)}">내 의견 삭제</button>`
    : ""}</div></article>`;
}

function opinions() {
  const intro = `<div class="page-top"><h1>정책을 읽고, 의견을 나눠요</h1><button class="button primary write-button" data-view="write">의견 남기기</button></div><p class="section-intro">이곳에 남긴 의견은 세폴의 시민 의견 목록에 공개돼요<br>행정기관 접수는 별도로 해야 해요</p>`;
  if (state.feedbackError)
    return intro + `<p class="notice warning">${prose(state.feedbackError)} <button class="text-button" data-action="retry-feedback">다시 불러오기</button></p>`;
  if (!state.feedback) return intro + '<p role="status">실제 접수 의견을 불러오고 있어요</p>';
  const { items, total, limit } = state.feedback;
  return intro + (items.length
    ? `<p class="small">총 ${total}건${total > limit ? ` 중 최근 ${limit}건` : ""}</p><div class="feedback-list">${items.map(feedbackItem).join("")}</div>`
    : empty("아직 접수된 시민 의견이 없어요", "첫 번째 의견을 남겨 주세요"));
}

let feedbackLoad = 0;
async function loadFeedback() {
  const request = ++feedbackLoad;
  state.feedbackError = "";
  try {
    const response = await requestJSON("/app/api/feedback", { headers: authorHeaders() });
    if (request !== feedbackLoad) return;
    state.feedback = response;
  } catch (error) {
    if (request !== feedbackLoad) return;
    state.feedbackError = error.message;
  }
  if (state.view === "opinions") render();
}

async function deleteFeedback(button) {
  if (button.disabled || !window.confirm("내 의견을 삭제할까요? 삭제한 글은 되돌릴 수 없어요")) return;
  button.disabled = true;
  try {
    await requestJSON("/app/api/feedback/" + encodeURIComponent(button.dataset.id), {
      method: "DELETE",
      headers: authorHeaders(),
    });
    if (state.view === "opinions") await loadFeedback();
    toast("의견을 삭제했어요");
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

function opinionPolicies() {
  const list = [...(state.latestNotices?.items || []), ...(state.catalog?.localNotices || []), ...policies()];
  if (state.extraPolicy) list.unshift(state.extraPolicy);
  return [...new Map(list.map((p) => [p.id, p])).values()];
}
function policyOptions(selected, query = "") {
  const q = query.trim().toLowerCase();
  return '<option value="">정책 선택</option>' + opinionPolicies()
    .filter((p) => p.id === selected || `${p.title} ${p.region}`.toLowerCase().includes(q))
    .map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? "selected" : ""}>${esc(p.region)} · ${esc(p.title)}</option>`)
    .join("");
}
function updatePolicyOptions(form, initial = "") {
  if (!form) return;
  const select = form.elements.policyId;
  select.innerHTML = policyOptions(select.value || initial, form.elements.policySearch.value);
  updatePolicyDate(form);
}
function updatePolicyDate(form) {
  const selected = opinionPolicies().find((p) => p.id === form.elements.policyId.value);
  form.querySelector("#feedback-policy-date").textContent = selected
    ? "정책 발표·공고일 " + date(selected.publishedAt)
    : "선택한 정책의 발표·공고일을 함께 표시해요";
}

function write() {
  if (state.receipt) {
    return `<section class="receipt">${state.receipt.neighborhood ? `<span class="feedback-place">${icon("map-pin")}${esc(state.receipt.neighborhood)}</span>` : ""}<h1>의견을 저장했어요</h1><p>${esc(state.receipt.policyTitle)}</p><p class="small">정책 발표·공고일 ${date(state.receipt.publishedAt)}</p><code>접수 번호: ${esc(state.receipt.id)}</code><div class="button-row"><button class="button primary" data-view="opinions">접수 의견 보기</button><button class="button" data-action="write-again">다른 의견 남기기</button></div></section>`;
  }
  const selected = opinionPolicies().find((p) => p.id === state.selected);
  return `<h1>시민 의견 남기기</h1><p class="section-intro">관련 정책과 공개할 지역을 골라 주세요</p>
    <div class="feedback-layout"><form class="feedback-form" id="feedback-form">
      <div class="feedback-location"><div class="feedback-location-heading">${icon("map-pin")}<strong>의견을 남기는 지역</strong></div>
        <p>선택한 읍·면·동 이름이 의견 위에 공개돼요</p>
        <button class="button compact" type="button" data-action="choose-feedback-location">지역 직접 선택</button>
        <p id="feedback-location-status" class="location-status" role="status" aria-live="polite"></p>
      </div>
      <fieldset class="feedback-fields" aria-label="의견 내용">
        <label for="feedback-policy-search">관련 정책 검색<input id="feedback-policy-search" name="policySearch" type="search" placeholder="예: 거제, 김천, 돌봄"></label>
        <label for="feedback-policy">관련 정책<select id="feedback-policy" name="policyId" required>${policyOptions(state.selected)}</select><small id="feedback-policy-date">${selected ? "정책 발표·공고일 " + date(selected.publishedAt) : "선택한 정책의 발표·공고일을 함께 표시해요"}</small></label>
        <label for="feedback-title">의견 제목<input id="feedback-title" name="title" minlength="5" maxlength="80" placeholder="5~80자로 구체적으로 적어 주세요" required autocomplete="off"></label>
        <label for="feedback-content">자세한 의견<textarea id="feedback-content" name="content" minlength="15" maxlength="1500" placeholder="누구에게 어떤 영향이 있는지, 어떤 내용을 더 확인하면 좋을지 알려 주세요" required></textarea><small>15~1,500자 · 이름이나 연락처, 상세 주소 등은 적지 마세요</small></label>
        <label class="consent"><input type="checkbox" name="consent" required><span>지역 이름과 의견을 이 서비스에 공개하고 저장하는 데 동의해요</span></label>
        <p id="form-status" class="form-status" role="status" aria-live="polite"></p><button class="button primary write-button" type="submit">${icon("send")}의견 저장하기</button>
      </fieldset>
    </form><aside class="writing-note"><h2>공개와 삭제</h2><p>내 의견은 작성한 브라우저에서 삭제할 수 있어요</p><p>브라우저의 사이트 데이터를 지우면 삭제 권한도 사라져요</p><p>공식 의견 제출은 관련 정책의 원문에서 확인해 주세요</p></aside></div>`;
}

function chooseFeedbackLocation(form) {
  neighborhood.open((region) => {
    if (!form.isConnected) return;
    form.dataset.neighborhoodCode = region.code;
    const status = form.querySelector("#feedback-location-status");
    status.textContent = region.label;
    status.classList.add("feedback-place");
    form.querySelector('[data-action="choose-feedback-location"]').textContent = "지역 변경";
    form.querySelector("#form-status").textContent = "";
  });
}

function startWriting(id) {
  state.selected = id;
  state.receipt = null;
  state.requestId = crypto.randomUUID();
  go("write");
}

async function loadSelectedNotice() {
  const id = state.selected;
  const form = $("#feedback-form");
  if (!form || !/^local-\d+$/.test(id ?? "") || opinionPolicies().some((p) => p.id === id)) return;
  try {
    const notice = await requestJSON("/app/api/local-notices/" + encodeURIComponent(id));
    if (!form.isConnected) return;
    state.extraPolicy = notice;
    updatePolicyOptions(form, id);
  } catch {
    if (form.isConnected) form.querySelector("#form-status").textContent = "연결된 공고를 확인하지 못했어요 정책 목록에서 다시 골라 주세요";
  }
}

function activateView() {
  if (!state.catalog) return;
  if (state.view === "opinions") loadFeedback();
  if (state.view === "discover" || state.view === "write") {
    if (!state.latestNotices) loadLatestNotices();
    if (state.view === "write") loadSelectedNotice();
  }
}

function details(id) {
  const p = policies().find((p) => p.id === id);
  if (!p) return;
  $("#dialog-title").textContent = p.title;
  $("#dialog-content").innerHTML =
    `<article class="policy-detail">${badge(p)}<p class="lead">${prose(p.summary)}</p><dl class="detail-facts"><dt>정책·사업 대상</dt><dd>${esc(p.audience)}</dd><dt>적용 지역</dt><dd>${esc(p.region)}</dd><dt>발표 당시 상태</dt><dd>${esc(p.status)}</dd><dt>발표일</dt><dd>${date(p.publishedAt)}</dd><dt>원문 확인일</dt><dd>${esc(p.reviewedAt)}</dd><dt>원문 제목</dt><dd>${esc(p.sourceTitle)}</dd><dt>출처</dt><dd>${outLink(p.sourceUrl, esc(p.sourceName))}</dd><dt>이용 조건</dt><dd>${outLink(p.licenseUrl, "공공누리 제1유형 / 출처표시")}</dd><dt>원문 확인 사업비</dt><dd>${p.budget ? `${esc(p.budget.label)} — ${prose(p.budget.note)}` : "이번 원문 검토에서 확인하지 않았습니다"}</dd></dl><section class="detail-section"><h3>확인할 점</h3><p>${prose(p.statusNote)}</p></section><section class="detail-section"><h3>왜 이 위치에 표시했나요?</h3><p>${prose(p.locationEvidence)}</p>${p.locations.length ? p.locations.map((l) => `<div class="location-row"><strong>${esc(l.label)}</strong><small>${prose(l.note)}</small><small>좌표 ${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)} / OSM 지명 조회 결과</small><div class="button-row">${outLink(l.geoSourceUrl, "좌표 출처")}</div></div>`).join("") : "<p>정책의 대상이 전국 또는 광역 범위여서 임의의 지점 핀을 생성하지 않았습니다</p>"}</section><div class="button-row"><button class="button primary" data-write="${p.id}">이 정책에 의견 남기기</button><button class="button" data-save="${p.id}" aria-pressed="${state.saved.has(p.id)}">${state.saved.has(p.id) ? "✓ 비교에 담음" : "비교에 담기"}</button></div><p class="small">직접 작성한 요약이며 공식 발표를 대체하지 않습니다 후속 고시·모집조건·운행 여부는 출처에서 확인해 주세요</p></article>`;
  if (!$("#policy-dialog").open) $("#policy-dialog").showModal();
}
function render() {
  if (map) {
    map.remove();
    map = null;
  }
  const active = document.activeElement;
  const activeId = active?.id,
    selection = active?.type === "search" ? active.selectionStart : null;
  document.querySelectorAll("nav [data-view]").forEach((a) => {
    const current =
      a.dataset.view === (state.view === "write" ? "opinions" : state.view);
    if (current) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $("#saved-count").textContent = state.saved.size;
  if (state.error) {
    $("#workspace").innerHTML =
      `<section class="empty-state"><h1>정책 목록에 연결하지 못했어요</h1><p>${prose(state.error)}</p><button class="button primary" data-action="reload">다시 불러오기</button></section>`;
    return;
  }
  if (!state.catalog) return;
  $("#reviewed-date").textContent = state.catalog.reviewedAt;
  const visibleMap = state.view === "map" ? mapData() : null;
  $("#workspace").innerHTML = {
    discover,
    map: () => mapView(visibleMap),
    compare,
    opinions,
    sources: sourcesView,
    write,
  }[state.view]();
  if (visibleMap) mountMap(visibleMap);
  if (activeId && document.getElementById(activeId)) {
    document.getElementById(activeId).focus({ preventScroll: true });
    if (selection !== null)
      document.getElementById(activeId).setSelectionRange(selection, selection);
  }
}
function go(view) {
  if (!views.includes(view)) return;
  $("#policy-dialog").close();
  state.view = view;
  sync(true);
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  $("#workspace").focus({ preventScroll: true });
  activateView();
}
async function requestJSON(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
  let j;
  try {
    j = await r.json();
  } catch {
    throw Error("응답을 읽지 못했습니다 잠시 후 다시 시도해 주세요");
  }
  if (!r.ok) throw Error(j.error || "연결을 확인해 주세요");
  return j;
}
async function load() {
  state.error = "";
  try {
    state.catalog = await requestJSON("/app/api/policies");
    if (state.catalog.mode !== "reviewed-publications")
      throw Error("정책 자료 형식이 올바르지 않습니다");
    const known = new Set(policies().map((p) => p.id));
    state.saved = new Set([...state.saved].filter((id) => known.has(id)));
  } catch (e) {
    state.error = e.message;
  }
  render();
  activateView();
}
function csv() {
  const rows = policies().filter((p) => state.saved.has(p.id));
  const quote = (v) => {
    let s = String(v ?? "");
    if (/^[=+@-]/.test(s)) s = "'" + s;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const data = [
    [
      "정책",
      "요약",
      "지역",
      "대상",
      "발표 당시 상태",
      "확인할 점",
      "발표일",
      "검토일",
      "출처",
      "원문 URL",
    ],
    ...rows.map((p) => [
      p.title,
      p.summary,
      p.region,
      p.audience,
      p.status,
      p.statusNote,
      p.publishedAt,
      p.reviewedAt,
      p.sourceName,
      p.sourceUrl,
    ]),
  ]
    .map((row) => row.map(quote).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + data], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "공개정책-비교.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(
    "[data-view],[data-detail],[data-save],[data-map],[data-map-select],[data-write],[data-action]",
  );
  if (!b) return;
  e.preventDefault();
  if (b.dataset.view === "write") return startWriting(null);
  if (b.dataset.view) return go(b.dataset.view);
  if (b.dataset.detail) return details(b.dataset.detail);
  if (b.dataset.save) {
    const open = $("#policy-dialog").open,
      id = b.dataset.save;
    save(id);
    if (open) details(id);
    return;
  }
  if (b.dataset.map) {
    if (b.dataset.map.startsWith("area:")) {
      localOnly = false;
      state.search = "";
      state.category = "all";
      state.region = "all";
    }
    state.selected = b.dataset.map;
    return go("map");
  }
  if (b.dataset.mapSelect) {
    state.selected = b.dataset.mapSelect;
    sync();
    return render();
  }
  if (b.dataset.write) return startWriting(b.dataset.write);
  const action = b.dataset.action;
  if (action === "choose-feedback-location") return chooseFeedbackLocation(b.form);
  if (action === "delete-feedback") return deleteFeedback(b);
  if (action === "refresh-local-notices") return loadLatestNotices(true);
  if (action === "map-overview") {
    state.selected = null;
    sync();
    return render();
  }
  if (action === "more-local-notices") {
    state.localLimit += 12;
    return drawLocalList();
  }
  if (action === "close-dialog") $("#policy-dialog").close();
  if (action === "reload") load();
  if (action === "toggle-local") {
    localOnly = !localOnly;
    state.selected = null;
    sync();
    render();
  }
  if (action === "refresh-feed") loadFeed();
  if (action === "retry-feedback") loadFeedback();
  if (action === "csv") csv();
  if (action === "print") window.print();
  if (action === "write-again") {
    startWriting(null);
  }
});
let searchTimer;
document.addEventListener("input", (e) => {
  if (e.target.id === "local-notice-search") {
    state.localSearch = e.target.value;
    state.localLimit = 12;
    drawLocalList();
  }
  if (e.target.id === "feedback-policy-search") updatePolicyOptions(e.target.form);
  if (e.target.id === "policy-search") {
    state.search = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      sync();
      render();
    }, 180);
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "category-filter") {
    state.category = e.target.value;
    sync();
    render();
  }
  if (e.target.id === "region-filter") {
    state.region = e.target.value;
    sync();
    render();
  }
  if (e.target.id === "feedback-policy") updatePolicyDate(e.target.form);
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "feedback-form") return;
  e.preventDefault();
  const form = e.target,
    data = new FormData(form),
    button = form.querySelector("[type=submit]"),
    status = $("#form-status");
  if (button.disabled) return;
  if (!form.dataset.neighborhoodCode) {
    status.textContent = "의견을 남길 지역을 골라 주세요";
    form.querySelector('[data-action="choose-feedback-location"]').focus();
    return;
  }
  button.disabled = true;
  status.textContent = "저장 중…";
  try {
    const result = await requestJSON("/app/api/feedback", {
      method: "POST",
      headers: { ...await authorHeadersForWrite(), "Content-Type": "application/json" },
      body: JSON.stringify({
        policyId: data.get("policyId"),
        title: data.get("title"),
        content: data.get("content"),
        consent: data.get("consent") === "on",
        neighborhoodCode: form.dataset.neighborhoodCode,
        requestId: state.requestId,
      }),
    });
    state.receipt = result;
    state.requestId = crypto.randomUUID();
    state.feedback = null;
    if (state.view === "write") render();
  } catch (e) {
    status.textContent = e.message;
    button.disabled = false;
  }
});
window.addEventListener("popstate", () => {
  const p = new URLSearchParams(location.search);
  state.view = views.includes(p.get("view")) ? p.get("view") : "discover";
  state.search = p.get("search") || "";
  state.category = p.get("category") || "all";
  state.region = p.get("region") || "all";
  state.selected = p.get("policy");
  render();
  activateView();
});
load().then(() => neighborhood.start());
setInterval(() => {
  if (!document.hidden && state.view === "discover") loadLatestNotices();
}, 120000);
