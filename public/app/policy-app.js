import { setupNeighborhood } from "./neighborhood-ui.js";
import { coverageFor } from "./neighborhood.js";
const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
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
const earth = (l) =>
  `https://earth.google.com/web/search/${encodeURIComponent(`${l.latitude},${l.longitude}`)}`;
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
  feed: null,
  feedLoading: false,
  requestId: crypto.randomUUID(),
  receipt: null,
};
let map = null,
  toastTimer;
let localOnly = true;
const neighborhood = setupNeighborhood({
  onChange: () => {
    localOnly = true;
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
function filtered() {
  const q = state.search.trim().toLowerCase();
  return policies()
    .filter(
      (p) =>
        (!neighborhood.current ||
          !localOnly ||
          !!coverageFor(p, neighborhood.current)) &&
        (state.category === "all" || p.category === state.category) &&
        (state.region === "all" ||
          (state.region === "nationwide"
            ? p.geographyType === "nationwide"
            : p.region.includes(state.region))) &&
        (!q ||
          [p.title, p.summary, p.region, p.audience, p.sourceTitle]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    )
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
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
      return toast("최대 4개 정책을 비교할 수 있어요.");
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
    state.saved.has(id) ? "비교 목록에 담았습니다." : "비교 목록에서 뺐습니다.",
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
  `<div class="scope-note">${icon("info")}<p>${esc(state.catalog.scopeNote)} 요약은 공식 청원이나 주민 투표 결과가 아니며, 발표 이후 변경사항은 원문에서 확인해 주세요.</p></div>`;
function card(p) {
  return `<article class="policy-card"><div class="card-top">${badge(p)}<span class="status">${esc(p.status)}</span></div><h3><button data-detail="${p.id}">${esc(p.title)}</button></h3><p class="card-summary">${esc(p.summary)}</p><div class="card-region">${icon("map-pin")}<span>${esc(p.region)}</span></div>${neighborhood.current ? `<p class="coverage-label">${esc(coverageFor(p, neighborhood.current) || "다른 지역의 정책")}</p>` : ""}<div class="card-meta"><span>${esc(p.sourceName)} / ${date(p.publishedAt)}</span><span>원문 확인 ${esc(p.reviewedAt)} / 공공누리 제1유형</span></div><div class="card-actions"><button class="save-button" data-save="${p.id}" aria-pressed="${state.saved.has(p.id)}">${state.saved.has(p.id) ? "✓ 비교에 담음" : "+ 비교에 담기"}</button>${p.locations.length ? `<a href="?view=map&policy=${p.id}" data-map="${p.id}">지도에서 보기</a>` : `<button class="text-button small" data-detail="${p.id}">적용 범위 확인</button>`}</div></article>`;
}
function discover() {
  const rows = filtered();
  return `<section class="hero"><div><h1>${neighborhood.current ? esc(neighborhood.current.town) + "에서 시작하는<br>우리 동네 정책 탐색." : "우리 동네 정책을<br>근거부터 살펴보세요."}</h1><p>무엇을 바꾸려는 정책인지, 누구를 위한 것인지.<br>확인한 공개자료를 쉽게 읽고 지역과 함께 살펴보세요.</p><div class="button-row"><button class="button primary" data-view="map">${icon("map-pin")}정책 지도 열기</button><button class="button" data-view="sources">출처와 가공 기준</button></div></div><dl class="hero-facts"><div><dt>확인한 정책·사업</dt><dd>${policies().length}<small>건</small></dd></div><div><dt>공식 원문 기관</dt><dd>2<small>개</small></dd></div><div><dt>지도 위치·거점</dt><dd>${policies().reduce((n, p) => n + p.locations.length, 0)}<small>곳</small></dd></div></dl></section>${scopeNote()}${filters()}<div class="result-heading"><h2>검토한 정책 <span class="muted">${rows.length}건</span></h2><span class="small">발표일 최신순</span></div>${rows.length ? `<div class="policy-grid">${rows.map(card).join("")}</div>` : empty("조건에 맞는 정책이 없어요.", "다른 검색어나 분야·지역을 선택해 주세요.")}<section class="review-notes"><h2>정책의 상태까지 함께 읽으세요.</h2><p class="small">발표 계획은 완료된 사업과 다르고, 행사 장소는 정책 전체의 적용 지역이 아닙니다. 각 정책의 ‘확인할 점’과 위치 판단 근거를 열어보세요.</p></section>`;
}
function empty(
  title = "아직 표시할 자료가 없어요.",
  text = "확인된 자료가 들어오면 여기에 표시합니다.",
) {
  return `<section class="empty-state"><h2>${title}</h2><p>${text}</p></section>`;
}
function selectedPolicy() {
  const rows = filtered().filter((p) => p.locations.length);
  return rows.find((p) => p.id === state.selected) || rows[0];
}
function mapDetail(p) {
  if (!p) return "<p>선택한 조건에 지도 위치가 확인된 정책이 없습니다.</p>";
  return `${badge(p)}<h2>${esc(p.title)}</h2><p>${esc(p.summary)}</p><p><strong>원문이 설명한 지역</strong> ${esc(p.region)}</p><p class="small">${esc(p.locationEvidence)}</p><div class="button-row"><button class="button compact" data-detail="${p.id}">근거·위치 기준 보기</button>${p.locations[0] ? outLink(earth(p.locations[0]), "Google Earth로 열기", "button compact") : ""}<button class="button compact" data-save="${p.id}" aria-pressed="${state.saved.has(p.id)}">${state.saved.has(p.id) ? "✓ 비교에 담음" : "비교에 담기"}</button></div>`;
}
function mapView() {
  const rows = filtered().filter((p) => p.locations.length);
  const p = selectedPolicy();
  if (p) state.selected = p.id;
  return `<div class="page-top"><div><h1>어디에 닿는 정책일까요?</h1></div><div class="button-row"><a class="button" href="/app/api/policies.kml">${icon("download")}Google Earth용 KML</a></div></div><p class="section-intro">정책을 선택하면 원문이 명시한 지역·거점을 볼 수 있어요. Google Earth에서는 위성·3D 화면으로 이어서 탐색할 수 있습니다.</p>${filters()}<div class="map-layout"><div class="map-list" aria-label="지도에서 볼 정책">${rows.length ? rows.map((p) => `<button class="map-choice" data-map-select="${p.id}" aria-pressed="${state.selected === p.id}"><strong>${esc(p.title)}</strong><span>${esc(p.region)}</span><span>${p.locations.length}개 표시 위치 / ${esc(p.status)}</span></button>`).join("") : empty("지도에 표시할 정책이 없어요.", "전국 정책과 지역 미확인 자료는 임의의 점으로 표시하지 않습니다.")}</div><section class="map-panel"><div id="policy-map" class="map-canvas" role="region" aria-label="공개 정책 적용 지역과 거점 지도"></div><div class="map-caption" id="map-caption">파랑: 행정구역 대표 위치 / 초록: 시설·역 주변 / 주황: 행사 지역. 사업 경계를 뜻하지 않습니다. <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">지도 오류 제보</a></div><div class="map-detail">${mapDetail(p)}</div></section></div><div class="scope-note map-list-note">${icon("info")}<p>Google Earth 웹 자체를 이 페이지에 삽입한 것은 아닙니다. 내장 지도는 OpenStreetMap이며, ‘Google Earth로 열기’ 또는 KML 가져오기로 같은 위치를 이어서 봅니다. ${policies().filter((p) => !p.locations.length).length}개 광역·전국 정책은 지점 핀 대신 원문 적용 범위로 안내합니다.</p></div>`;
}
function mountMap() {
  const container = $("#policy-map");
  if (!container || !window.L) return;
  if (map) {
    map.remove();
    map = null;
  }
  map = L.map(container, { scrollWheelZoom: false }).setView([37.5, 127.2], 8);
  const tile = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  }).addTo(map);
  tile.once("tileerror", () => {
    $("#map-caption")?.insertAdjacentHTML(
      "beforeend",
      " <strong>배경 지도를 불러오지 못한 경우 위치 목록과 Google Earth 링크를 이용해 주세요.</strong>",
    );
  });
  const active = selectedPolicy();
  const bounds = [];
  for (const p of filtered()) {
    for (const l of p.locations) {
      const selected = p.id === active?.id;
      const color =
        l.precision === "event-area"
          ? "#a96919"
          : ["facility", "station-area"].includes(l.precision)
            ? "#18714e"
            : "#075cc9";
      const marker = L.circleMarker([l.latitude, l.longitude], {
        radius: selected ? 10 : 7,
        color,
        fillColor: color,
        fillOpacity: selected ? 0.9 : 0.55,
        weight: selected ? 3 : 2,
      }).addTo(map);
      marker.bindPopup(
        `<strong>${esc(l.label)}</strong><span>${esc(p.title)}</span><p>${esc(l.note)}</p>${outLink(earth(l), "Google Earth로 열기")}`,
      );
      marker.on("click", () => {
        state.selected = p.id;
        sync();
        $(".map-detail").innerHTML = mapDetail(p);
        document
          .querySelectorAll("[data-map-select]")
          .forEach((b) =>
            b.setAttribute(
              "aria-pressed",
              b.dataset.mapSelect === p.id ? "true" : "false",
            ),
          );
      });
      if (selected) bounds.push([l.latitude, l.longitude]);
    }
  }
  if (neighborhood.current && localOnly) {
    const n = neighborhood.current;
    L.rectangle(
      [
        [n.bbox[1], n.bbox[0]],
        [n.bbox[3], n.bbox[2]],
      ],
      { color: "#627086", weight: 1, dashArray: "5,5", fill: false },
    )
      .addTo(map)
      .bindPopup(esc(n.label) + " / 동네 경계의 외접 범위");
    map.fitBounds(
      [
        [n.bbox[1], n.bbox[0]],
        [n.bbox[3], n.bbox[2]],
      ],
      { padding: [35, 35], maxZoom: 13 },
    );
  } else if (bounds.length === 1)
    map.setView(
      bounds[0],
      active.locations[0].precision === "administrative-area" ? 10 : 13,
    );
  else if (bounds.length > 1)
    map.fitBounds(bounds, { padding: [45, 45], maxZoom: 12 });
  map.invalidateSize();
}
function compare() {
  const rows = policies().filter((p) => state.saved.has(p.id));
  const kml = `/app/api/policies.kml?ids=${encodeURIComponent(rows.map((p) => p.id).join(","))}`;
  return `<div class="page-top"><div><h1>비교하고, 확인할 점을 남겨요.</h1></div>${rows.length ? `<div class="button-row"><button class="button" data-action="csv">${icon("download")}비교 CSV</button><a class="button" href="${kml}">선택 정책 KML</a><button class="button" data-action="print">인쇄 / PDF</button></div>` : ""}</div><p class="section-intro">최대 4개 정책의 대상·지역·추진 상태·출처를 비교합니다. 원문에 없는 효과 점수와 예산은 추정하지 않습니다.</p>${
    !rows.length
      ? empty(
          "비교할 정책을 담아 주세요.",
          "정책 둘러보기에서 ‘비교에 담기’를 눌러 최대 4개를 선택할 수 있어요.",
        )
      : `<div class="comparison-scroll"><table class="comparison"><thead><tr><th scope="col">확인 기준</th>${rows.map((p) => `<th scope="col">${esc(p.title)}<br><button class="text-button small" data-save="${p.id}">비교에서 빼기</button></th>`).join("")}</tr></thead><tbody>${[
          ["분야", (p) => esc(p.category)],
          ["누구를 위한 정책", (p) => esc(p.audience)],
          ["적용 지역", (p) => esc(p.region)],
          ["핵심 내용", (p) => esc(p.summary)],
          ["발표 당시 상태", (p) => esc(p.status)],
          ["확인할 점", (p) => esc(p.statusNote)],
          [
            "원문 기재 사업비",
            (p) =>
              p.budget
                ? `${esc(p.budget.label)}<br><small>${esc(p.budget.note)}</small>`
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
  }<section class="review-notes"><h2>없는 근거를 숫자로 채우지 않았습니다.</h2><ul><li>공고일과 신청기간, 정책 시행일은 서로 다릅니다. ‘발표 당시 상태’와 원문을 함께 확인하세요.</li><li>확인한 사업비만 표시합니다. 사업 목적과 범위가 다른 금액을 단순한 효율 순위로 비교하지 않습니다.</li><li>이 목록은 실제 시민 청원 수·찬성률·주민의 주관적 평가를 포함하지 않습니다.</li></ul></section>`;
}
function sourcesView() {
  return `<h1>무엇을 가져와, 어떻게 정리했나요?</h1><p class="section-intro">공개 API가 있다고 모두 사용할 수 있는 것은 아니었습니다. 접근 조건·제공 상태·가공 조건을 확인하고, 실제 연동과 원문 검토 자료를 구분했습니다.</p><div class="sources-grid">${state.catalog.sources.map((s) => `<article class="source-card"><h2>${esc(s.name)}</h2><span class="source-state">${esc(s.status)}</span><p>${esc(s.access)}</p><div class="button-row">${outLink(s.docs, "공식 안내")}${outLink(s.url, "자료 보기")}</div></article>`).join("")}</div><section class="method-section"><div class="result-heading"><div><h2>방금 공개된 보도자료</h2><p class="small">행정안전부의 실제 공개 RSS 제목·원문 링크입니다. 검토한 정책 12건과는 별도 목록입니다.</p></div><button class="button compact" data-action="refresh-feed">${icon("refresh-cw")}목록 확인</button></div><div id="feed-result">${feedHTML()}</div></section><section class="method-section"><h2>정책을 가공한 기준</h2><ol><li>공식 원문의 공공누리 제1유형을 확인한 12건을 선별했습니다. 공식 청원이나 주민이 작성한 의견으로 바꾸어 표시하지 않습니다.</li><li>핵심 내용·대상·지역·추진 상태를 따로 정리했습니다. 원문의 사실과 편집자의 판단을 구분하며, 요약은 원문을 대신하는 신청 안내가 아닙니다.</li><li>예산·동의 수·심각도·성과 점수는 만들지 않았습니다. 금액은 원문에서 확인한 경우에만 표시합니다.</li><li>사업이 계획인지, 완료 발표인지, 조건부 대책인지 구분했습니다. 과거 발표의 모집상태를 현재 진행 중으로 간주하지 않습니다.</li><li>시민 의견은 실제 접수한 내용만 별도 DB에 저장합니다. 이전 합성 예시 의견은 공개 목록과 API에서 제외했습니다.</li></ol><p class="small">목록 검토일: ${esc(state.catalog.reviewedAt)} / ${esc(state.catalog.scopeNote)}</p><a href="/app/api/policies">가공된 정책 JSON 보기</a></section><section class="method-section"><h2>지도와 Google Earth 연결 기준</h2><ul><li>원문이 명시한 지역·역·시설명만 위치 검색에 사용했습니다. 장소명이 모호하거나 검색 대상이 다르면 정확한 시설 위치로 채택하지 않았습니다.</li><li>파랑은 행정구역 대표 위치, 초록은 시설·역 주변, 주황은 행사 지역입니다. 정확한 사업 경계나 수혜 범위를 뜻하지 않습니다.</li><li>전국·광역 정책은 청사 주소 한 점으로 표시하지 않습니다. 행사장은 정책 전체의 적용 범위와 구분합니다.</li><li>Google Earth 위치 링크와 KML의 이름·좌표·설명이 서로 연결됩니다. Google Earth에서 KML을 가져오면 여러 정책을 함께 볼 수 있습니다.</li><li>배경 지도·좌표는 © OpenStreetMap contributors, ODbL입니다. 장소 좌표는 Nominatim을 제한된 횟수로 조회·캐시했고, 실시간 주소 검색은 제공하지 않습니다.</li></ul><div class="button-row">${outLink("https://www.openstreetmap.org/copyright", "지도 저작권")}${outLink("https://operations.osmfoundation.org/policies/nominatim/", "좌표 조회 이용 조건")}${outLink("https://support.google.com/earth/community-guide/307322063/google-earth-kml-import-guide?hl=en", "Google Earth KML 안내")}<a href="/app/api/policies.kml">KML 다운로드</a></div></section>`;
}
function feedHTML() {
  if (state.feedLoading)
    return '<p role="status">공식 RSS를 확인하고 있어요.</p>';
  if (!state.feed)
    return '<p class="small">‘목록 확인’을 누르면 공개 RSS를 조회합니다. 개인정보나 시민 의견은 출처 사이트로 전송하지 않습니다.</p>';
  if (state.feed.status !== "live")
    return `<p class="notice warning">${esc(state.feed.message)}</p>`;
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
        "공식 최신 목록을 가져오지 못했습니다. 잠시 후 다시 확인해 주세요.",
    };
  }
  state.feedLoading = false;
  if ($("#feed-result")) $("#feed-result").innerHTML = feedHTML();
}
function opinions() {
  return `<div class="page-top"><div><h1>정책을 읽고, 의견을 나눠요.</h1></div><button class="button primary" data-view="write">의견 남기기</button></div><p class="section-intro">공식 정책 요약과 시민의 의견을 구분합니다. 여기에 남긴 의견은 이 서비스에 공개되며, 행정기관에 자동 접수되지 않습니다.</p>${state.feedbackError ? `<p class="notice warning">${esc(state.feedbackError)} <button class="text-button" data-action="retry-feedback">다시 불러오기</button></p>` : state.feedback === null ? '<p role="status">실제 접수 의견을 불러오고 있어요.</p>' : state.feedback.items.length ? `<p class="small">총 ${state.feedback.total}건${state.feedback.total > state.feedback.limit ? ` 중 최근 ${state.feedback.limit}건` : ""}</p><div class="feedback-list">${state.feedback.items.map((r) => `<article class="feedback-item"><small>${esc(r.region)} / ${date(r.created_at)}</small><h2>${esc(r.title)}</h2><p>${esc(r.content)}</p><button class="text-button small" data-detail="${esc(r.policy_id)}">관련 정책: ${esc(r.policy_title)}</button></article>`).join("")}</div>` : empty("아직 접수된 시민 의견이 없어요.", "실제 참여가 쌓이는 공간입니다. 예시 의견이나 가상의 청원으로 채우지 않았습니다.")}`;
}
async function loadFeedback() {
  state.feedbackError = "";
  try {
    state.feedback = await requestJSON("/app/api/feedback");
  } catch (e) {
    state.feedbackError = e.message;
  }
  if (state.view === "opinions") render();
}
function write() {
  if (state.receipt)
    return `<section class="receipt"><h1>의견을 저장했습니다.</h1><p>${esc(state.receipt.policyTitle)}</p><code>접수 번호: ${esc(state.receipt.id)}</code><div class="button-row"><button class="button primary" data-view="opinions">접수 의견 보기</button><button class="button" data-action="write-again">다른 의견 남기기</button></div><p class="small">행정기관 민원 접수와는 별개입니다.</p></section>`;
  return `<h1>어떤 점을 더 살펴야 할까요?</h1><p class="section-intro">정책을 선택하고 지역에서 필요한 변화나 확인할 점을 구체적으로 적어 주세요.</p><div class="feedback-layout"><form class="feedback-form" id="feedback-form"><label for="feedback-policy">관련된 실제 정책<select id="feedback-policy" name="policyId" required><option value="">정책 선택</option>${policies()
    .map(
      (p) =>
        `<option value="${p.id}" ${state.selected === p.id ? "selected" : ""}>${esc(p.title)}</option>`,
    )
    .join(
      "",
    )}</select><small>지역과 원문은 선택한 정책의 출처를 기준으로 연결합니다.</small></label><label for="feedback-title">의견 제목<input id="feedback-title" name="title" minlength="5" maxlength="80" placeholder="5~80자로 구체적으로 적어 주세요" required autocomplete="off"></label><label for="feedback-content">자세한 의견<textarea id="feedback-content" name="content" minlength="15" maxlength="1500" placeholder="누구에게 어떤 영향이 있는지, 어떤 내용을 더 확인하면 좋을지 알려 주세요." required></textarea><small>15~1,500자. 이름·연락처·개인 주소·건강정보 등은 적지 마세요.</small></label><label class="consent"><input type="checkbox" name="consent" required><span>의견이 공개되고 이 서비스의 독립 DB에 저장되는 데 동의합니다.</span></label><p id="form-status" class="form-status" role="status" aria-live="polite"></p><button class="button primary" type="submit">${icon("send")}의견 저장하기</button></form><aside class="writing-note"><h2>근거 있는 이야기로 이어가요.</h2><ul><li>공식 원문과 적용 지역을 먼저 살펴보세요.</li><li>시행이 확정된 내용과 앞으로의 계획을 구분해 주세요.</li><li>정책에 대한 평가와 개인적인 경험을 구분해 적어 주세요.</li><li>다른 사람을 식별할 수 있는 정보는 공개하지 마세요.</li></ul><p>이 서비스는 정부·지자체의 공식 민원 창구가 아닙니다.</p></aside></div>`;
}
function details(id) {
  const p = policies().find((p) => p.id === id);
  if (!p) return;
  $("#dialog-title").textContent = p.title;
  $("#dialog-content").innerHTML =
    `<article class="policy-detail">${badge(p)}<p class="lead">${esc(p.summary)}</p><dl class="detail-facts"><dt>정책·사업 대상</dt><dd>${esc(p.audience)}</dd><dt>적용 지역</dt><dd>${esc(p.region)}</dd><dt>발표 당시 상태</dt><dd>${esc(p.status)}</dd><dt>발표일</dt><dd>${date(p.publishedAt)}</dd><dt>원문 확인일</dt><dd>${esc(p.reviewedAt)}</dd><dt>원문 제목</dt><dd>${esc(p.sourceTitle)}</dd><dt>출처</dt><dd>${outLink(p.sourceUrl, esc(p.sourceName))}</dd><dt>이용 조건</dt><dd>${outLink(p.licenseUrl, "공공누리 제1유형 / 출처표시")}</dd><dt>원문 확인 사업비</dt><dd>${p.budget ? `${esc(p.budget.label)} — ${esc(p.budget.note)}` : "이번 원문 검토에서 확인하지 않았습니다."}</dd></dl><section class="detail-section"><h3>확인할 점</h3><p>${esc(p.statusNote)}</p></section><section class="detail-section"><h3>왜 이 위치에 표시했나요?</h3><p>${esc(p.locationEvidence)}</p>${p.locations.length ? p.locations.map((l) => `<div class="location-row"><strong>${esc(l.label)}</strong><small>${esc(l.note)}</small><small>좌표 ${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)} / OSM 지명 조회 결과</small><div class="button-row">${outLink(earth(l), "Google Earth로 열기")}${outLink(l.geoSourceUrl, "좌표 출처")}</div></div>`).join("") : "<p>정책의 대상이 전국 또는 광역 범위여서 임의의 지점 핀을 생성하지 않았습니다.</p>"}</section><div class="button-row"><button class="button primary" data-write="${p.id}">이 정책에 의견 남기기</button><button class="button" data-save="${p.id}" aria-pressed="${state.saved.has(p.id)}">${state.saved.has(p.id) ? "✓ 비교에 담음" : "비교에 담기"}</button>${p.locations.length ? `<a class="button" href="/app/api/policies.kml?ids=${p.id}">이 정책 KML</a>` : ""}</div><p class="small">직접 작성한 요약이며 공식 발표를 대체하지 않습니다. 후속 고시·모집조건·운행 여부는 출처에서 확인해 주세요.</p></article>`;
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
      `<section class="empty-state"><h1>정책 목록에 연결하지 못했어요.</h1><p>${esc(state.error)}</p><button class="button primary" data-action="reload">다시 불러오기</button></section>`;
    return;
  }
  if (!state.catalog) return;
  $("#reviewed-date").textContent = state.catalog.reviewedAt;
  $("#workspace").innerHTML = {
    discover,
    map: mapView,
    compare,
    opinions,
    sources: sourcesView,
    write,
  }[state.view]();
  if (state.view === "map") mountMap();
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
  if (view === "opinions") loadFeedback();
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
    throw Error("응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (!r.ok) throw Error(j.error || "연결을 확인해 주세요.");
  return j;
}
async function load() {
  state.error = "";
  try {
    state.catalog = await requestJSON("/app/api/policies");
    if (state.catalog.mode !== "reviewed-publications")
      throw Error("정책 자료 형식이 올바르지 않습니다.");
    const known = new Set(policies().map((p) => p.id));
    state.saved = new Set([...state.saved].filter((id) => known.has(id)));
  } catch (e) {
    state.error = e.message;
  }
  render();
  if (state.view === "opinions") loadFeedback();
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
    state.selected = b.dataset.map;
    return go("map");
  }
  if (b.dataset.mapSelect) {
    state.selected = b.dataset.mapSelect;
    sync();
    return render();
  }
  if (b.dataset.write) {
    state.selected = b.dataset.write;
    state.receipt = null;
    return go("write");
  }
  const action = b.dataset.action;
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
    state.receipt = null;
    state.requestId = crypto.randomUUID();
    go("write");
  }
});
let searchTimer;
document.addEventListener("input", (e) => {
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
  if (e.target.id === "feedback-policy") state.selected = e.target.value;
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "feedback-form") return;
  e.preventDefault();
  const form = e.target,
    data = new FormData(form),
    button = form.querySelector("[type=submit]"),
    status = $("#form-status");
  button.disabled = true;
  status.textContent = "저장 중…";
  try {
    const result = await requestJSON("/app/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policyId: data.get("policyId"),
        title: data.get("title"),
        content: data.get("content"),
        consent: data.get("consent") === "on",
        requestId: state.requestId,
      }),
    });
    state.receipt = result;
    state.requestId = crypto.randomUUID();
    state.feedback = null;
    render();
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
  if (state.view === "opinions") loadFeedback();
});
load().then(() => neighborhood.start());
