import {
  CATEGORIES,
  DISTRICTS,
  DEFAULT_WEIGHTS,
  classifyOpinion,
  normalizeWeights,
  rankPolicies,
  simulateBudget,
  validateOpinion,
} from "./logic.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const number = (value) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);
const money = (value) =>
  Number(value) >= 10000
    ? `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(Number(value) / 10000)}억 원`
    : `${number(value)}만 원`;
const date = (value) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
const icon = (name, extra = "") =>
  `<svg class="icon ${extra}" aria-hidden="true"><use href="/app/icons.svg#${name}"></use></svg>`;
const categoryIcons = {
  교통: "bus",
  의료: "heart-pulse",
  복지: "hand-heart",
  환경: "leaf",
  생활안전: "shield-check",
  기타: "shapes",
};
const categoryClass = (category) => `category-${CATEGORIES.indexOf(category)}`;
const badge = (category) =>
  `<span class="category-badge ${categoryClass(category)}">${icon(categoryIcons[category] || "shapes")}${esc(category)}</span>`;
const navViews = [
  "overview",
  "opinions",
  "priority",
  "budget",
  "report",
  "write",
];
const params = new URLSearchParams(location.search);
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem("moa.app.simulation.v1") || "{}");
} catch {
  /* Storage is optional. */
}
const state = {
  view: navViews.includes(params.get("view")) ? params.get("view") : "overview",
  source: params.get("source") === "community" ? "community" : "demo",
  district: DISTRICTS.includes(params.get("district"))
    ? params.get("district")
    : "all",
  category: CATEGORIES.includes(params.get("category"))
    ? params.get("category")
    : "all",
  search: params.get("search") || "",
  weights: {
    ...DEFAULT_WEIGHTS,
    ...Object.fromEntries(
      Object.keys(DEFAULT_WEIGHTS).map((key) => [
        key,
        Math.max(
          0,
          Math.min(100, Number(saved.weights?.[key] ?? DEFAULT_WEIGHTS[key])),
        ),
      ]),
    ),
  },
  budget: Number.isFinite(saved.budget)
    ? Math.max(0, Math.min(1000000, saved.budget))
    : 12000,
  strategy: ["priority", "coverage", "equity"].includes(saved.strategy)
    ? saved.strategy
    : "priority",
  overrides: {},
  data: null,
  loading: true,
  error: "",
  formRequestId: crypto.randomUUID(),
  receipt: null,
};

function persist() {
  try {
    localStorage.setItem(
      "moa.app.simulation.v1",
      JSON.stringify({
        weights: state.weights,
        budget: state.budget,
        strategy: state.strategy,
      }),
    );
  } catch {
    /* Private browsing may deny storage. */
  }
}
function syncUrl(push = false) {
  const query = new URLSearchParams({ view: state.view, source: state.source });
  for (const key of ["district", "category"])
    if (state[key] !== "all") query.set(key, state[key]);
  if (state.search && state.view === "opinions")
    query.set("search", state.search);
  history[push ? "pushState" : "replaceState"](
    null,
    "",
    `${location.pathname}?${query}`,
  );
}
function opinions() {
  return (state.data?.opinions || []).filter(
    (row) =>
      (state.district === "all" || row.district === state.district) &&
      (state.category === "all" || row.category === state.category),
  );
}
function ranked() {
  return rankPolicies(
    state.data?.policies || [],
    opinions(),
    state.weights,
  ).map((row) => ({ ...row, ...state.overrides[row.id] }));
}
function budgetResult() {
  return simulateBudget(ranked(), state.budget, state.strategy);
}
function sourceNote() {
  return `<div class="data-notice ${state.source === "community" ? "community-notice" : ""}">${icon(state.source === "demo" ? "info" : "messages-square")}<span>${state.source === "demo" ? "지금은 시연 데이터로 살펴보고 있어요. 지역·의견·비용은 사용 방법을 보여 주는 예시입니다." : "시민이 직접 접수한 의견입니다. 비용과 수혜 규모는 여전히 시뮬레이션 가정값입니다."}</span><button type="button" class="text-button" data-action="${state.source === "demo" ? "community" : "demo"}">${state.source === "demo" ? "실제 접수 의견 보기" : "시연 데이터 보기"}${icon("arrow-right")}</button></div>`;
}
function filters() {
  return `<div class="filter-group"><label class="select-wrap">${icon("map-pin")}<span class="visually-hidden">지역 필터</span><select id="district-filter" name="district"><option value="all">전체 지역</option>${DISTRICTS.map((value) => `<option ${state.district === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></label><label class="select-wrap"><span class="visually-hidden">분야 필터</span><select id="category-filter" name="category"><option value="all">모든 분야</option>${CATEGORIES.map((value) => `<option ${state.category === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></label></div>`;
}
function heading(title, description, actions = filters()) {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div>${actions}</div>`;
}
function empty(
  title = "아직 모인 의견이 없어요.",
  description = "첫 번째 목소리를 남겨 우리 동네의 변화를 시작해 주세요.",
) {
  return `<div class="empty-state">${icon("messages-square")}<h2>${title}</h2><p>${description}</p><button type="button" class="button quiet" data-view="write">의견 남기기${icon("arrow-right")}</button></div>`;
}
function stats() {
  const rows = opinions(),
    policies = ranked();
  return `<dl class="stat-row"><div><dt>모인 시민 의견</dt><dd>${number(rows.length)}<span>건</span></dd><small>${state.source === "demo" ? "시연용 의견" : "직접 접수한 의견"}</small></div><div><dt>의견이 연결된 정책</dt><dd>${policies.length}<span>개</span></dd><small>현재 필터 기준</small></div><div><dt>논의 중인 분야</dt><dd>${new Set(rows.map((x) => x.category)).size}<span>개</span></dd><small>다양한 일상의 문제</small></div><div><dt>설정한 전체 예산</dt><dd class="budget-stat">${money(state.budget)}</dd><button type="button" class="text-button" data-view="budget">직접 배분해 보기${icon("arrow-up-right")}</button></div></dl>`;
}
function trendChart() {
  const rows = opinions(),
    today = new Date();
  const key = (value) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
      new Date(value),
    );
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - 6 + i);
    return day;
  });
  const counts = days.map(
    (day) => rows.filter((row) => key(row.created_at) === key(day)).length,
  );
  const max = Math.max(4, ...counts),
    step = Math.ceil(max / 4),
    top = step * 4;
  const points = counts
    .map((count, i) => `${50 + i * 82},${160 - (count / top) * 130}`)
    .join(" ");
  const area = `50,160 ${points} 542,160`;
  return `<div class="chart-summary"><strong>${number(counts.reduce((a, b) => a + b, 0))}<span>건의 목소리</span></strong><span>최근 7일</span></div><svg class="trend-chart" viewBox="0 0 580 205" role="img" aria-labelledby="trend-title trend-desc"><title id="trend-title">최근 7일 의견 접수 현황</title><desc id="trend-desc">${days.map((day, i) => `${date(day)} ${counts[i]}건`).join(", ")}</desc>${Array.from({ length: 5 }, (_, i) => `<line x1="50" y1="${30 + i * 32.5}" x2="550" y2="${30 + i * 32.5}" class="chart-grid"/><text x="30" y="${34 + i * 32.5}" class="chart-label" text-anchor="end">${top - i * step}</text>`).join("")}<polygon points="${area}" class="chart-area"/><polyline points="${points}" class="chart-line"/>${counts.map((count, i) => `<circle cx="${50 + i * 82}" cy="${160 - (count / top) * 130}" r="3.5" class="chart-point"><title>${date(days[i])}: ${count}건</title></circle>`).join("")}${days.map((day, i) => `<text x="${50 + i * 82}" y="190" text-anchor="middle" class="chart-label">${day.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" })}</text>`).join("")}</svg>`;
}
function categoryChart() {
  const rows = opinions(),
    total = rows.length || 1;
  return `<div class="category-chart">${CATEGORIES.map((category) => ({
    category,
    count: rows.filter((row) => row.category === category).length,
  }))
    .filter((row) => row.count)
    .sort((a, b) => b.count - a.count)
    .map(
      (row) =>
        `<button type="button" class="category-row" data-action="filter-category" data-category="${esc(row.category)}"><span class="category-icon ${categoryClass(row.category)}">${icon(categoryIcons[row.category])}</span><span class="category-bar-content"><span class="category-bar-label"><strong>${row.category}</strong><span>${row.count}건 <small>${Math.round((row.count / total) * 100)}%</small></span></span><meter min="0" max="${total}" value="${row.count}" class="category-meter ${categoryClass(row.category)}" aria-label="${row.category} ${row.count}건"></meter></span></button>`,
    )
    .join("")}</div>`;
}
function policyTable(limit = 0) {
  let rows = ranked();
  if (limit) rows = rows.slice(0, limit);
  if (!rows.length) return empty();
  return `<div class="table-scroll"><table class="policy-table"><caption class="visually-hidden">정책 우선순위, 점수와 의견 수. 정책명을 누르면 계산 근거를 확인합니다.</caption><thead><tr><th scope="col">순위</th><th scope="col">정책 제안</th><th scope="col">분야</th><th scope="col">우선순위 점수</th><th scope="col">연결된 의견</th><th scope="col">예상 비용</th><th scope="col"><span class="visually-hidden">계산 근거</span></th></tr></thead><tbody>${rows.map((row, i) => `<tr><td><span class="rank-number ${i === 0 ? "first" : ""}">${i + 1}</span></td><td><button type="button" class="policy-name" data-policy="${row.id}">${esc(row.title)}</button><span class="policy-subtitle">${esc(row.description)}</span></td><td>${badge(row.category)}</td><td class="score-cell"><strong>${row.score.toFixed(1)}</strong><meter min="0" max="100" value="${row.score}" aria-label="100점 중 ${row.score}점"></meter></td><td class="num">${row.count}건</td><td class="num">${money(row.cost)}</td><td><button type="button" class="icon-button" data-policy="${row.id}" aria-label="${esc(row.title)} 계산 근거 보기">${icon("chevron-right")}</button></td></tr>`).join("")}</tbody></table></div>`;
}
function overview() {
  const rows = ranked();
  return `${heading("우리 동네, 무엇부터 바꿀까요?", "의견의 수를 넘어, 문제의 깊이와 이웃에게 미치는 영향을 함께 살펴요.")}${sourceNote()}
    <section class="intro-banner" aria-label="작은 목소리를 반영하는 분석"><div><span class="banner-symbol">${icon("scale")}</span><h2>많은 목소리만큼, <br>작은 목소리도 중요하니까.</h2><p>심각성, 취약계층 영향, 의견 빈도를 함께 고려합니다.</p><button type="button" class="text-button" data-view="priority">우선순위 계산 기준 살펴보기${icon("arrow-right")}</button></div><div class="banner-insight"><span>지금 주목할 정책</span>${rows.length ? `<button type="button" data-policy="${rows[0].id}">${esc(rows[0].title)}${icon("arrow-up-right")}</button><p>${badge(rows[0].category)}<span><strong>${rows[0].score.toFixed(1)}</strong> / 100점</span></p><small>현재 가중치와 필터로 계산한 결과</small>` : `<strong>첫 의견을 기다리고 있어요.</strong><p>주민의 경험이 정책의 출발점입니다.</p>`}</div></section>
    ${stats()}${opinions().length ? `<div class="chart-grid-layout"><section class="panel"><div class="section-heading"><h2>목소리가 모이는 흐름</h2><span class="muted small">${state.source === "demo" ? "시연 의견 기준" : "시민 접수 기준"}</span></div>${trendChart()}</section><section class="panel"><div class="section-heading"><h2>어떤 이야기가 많을까요?</h2><span class="muted small">분야별 의견</span></div>${categoryChart()}</section></div><section class="policy-section"><div class="section-heading"><div><h2>변화가 필요한 정책</h2><p>우선순위가 높은 정책부터 함께 살펴보세요.</p></div><button type="button" class="text-button" data-view="priority">전체 정책 보기${icon("arrow-right")}</button></div>${policyTable(5)}</section>` : empty()}
    <section class="next-step"><div>${icon("coins")}<div><h2>한정된 예산, 더 나은 선택</h2><p>같은 예산으로 어떤 변화를 만들 수 있을까요?</p></div></div><button type="button" class="button quiet" data-view="budget">예산 시뮬레이션${icon("arrow-right")}</button></section>`;
}
function opinionList() {
  const search = state.search.trim().toLowerCase();
  const rows = opinions().filter((row) =>
    `${row.title} ${row.content}`.toLowerCase().includes(search),
  );
  return `${heading("일상의 불편이 변화의 시작이에요.", "이웃의 경험을 읽고, 우리 동네에 필요한 변화를 찾아보세요.")}${sourceNote()}<div class="opinion-toolbar"><label class="search-field">${icon("search")}<span class="visually-hidden">의견 검색</span><input id="opinion-search" name="search" type="search" placeholder="궁금한 의견을 검색해 보세요" value="${esc(state.search)}" maxlength="100" autocomplete="off"></label><span class="muted small">${rows.length}건의 의견</span></div>${rows.length ? `<div class="opinion-list">${rows.map((row) => `<article class="opinion-item"><div class="opinion-icon ${categoryClass(row.category)}">${icon(categoryIcons[row.category])}</div><div class="opinion-body"><div class="opinion-meta">${badge(row.category)}<span>${icon("map-pin")}${esc(row.district)}</span><time datetime="${esc(row.created_at)}">${date(row.created_at)}</time>${row.is_demo ? '<span class="sample-label">시연 의견</span>' : '<span class="sample-label">시민 접수</span>'}</div><h2>${esc(row.title)}</h2><p>${esc(row.content)}</p><div class="opinion-impact"><span>문제 심각성 <strong>${row.severity}/5</strong></span><span>취약계층 영향 <strong>${row.vulnerability}/5</strong></span><button type="button" class="text-button" data-policy="${esc(row.policy_id)}">연결된 정책${icon("chevron-right")}</button></div></div></article>`).join("")}</div>` : empty(search ? "검색 결과가 없어요." : undefined, search ? "다른 검색어를 입력하거나 지역·분야 필터를 바꿔 보세요." : undefined)}`;
}
function writeOpinion() {
  if (state.receipt)
    return `${heading("당신의 목소리가 모아졌어요.", "남겨 주신 의견은 시민 접수 의견에서 확인할 수 있습니다.", "")}<section class="receipt">${icon("check-circle-2")}<h2>의견이 DB에 저장되었습니다.</h2><p>${esc(state.receipt.category)} 분야로 접수했어요.</p><dl><div><dt>접수 번호</dt><dd>${esc(state.receipt.id)}</dd></div></dl><div class="button-row"><button type="button" class="button primary" data-view="opinions">접수된 의견 보기</button><button type="button" class="button quiet" data-action="write-again">다른 의견 남기기</button></div><small>모아는 정책 탐구용 앱이며, 행정기관에 자동으로 민원을 전송하지 않습니다.</small></section>`;
  return `${heading("어떤 변화가 필요하신가요?", "일상에서 겪은 문제를 들려주세요. 이름이나 연락처 없이 참여할 수 있어요.", '<button type="button" class="text-button" data-view="opinions">' + icon("arrow-left") + "의견 목록으로</button>")}<div class="form-layout"><form id="opinion-form" class="opinion-form" novalidate><div class="form-section-title"><span>01</span><h2>어디에서, 어떤 일이 있었나요?</h2></div><div class="form-two"><label>지역 <span class="required-text">필수</span><select name="district" required aria-required="true"><option value="">지역 선택</option>${DISTRICTS.map((value) => `<option>${value}</option>`).join("")}</select><small>현재 지역명은 시연을 위한 예시입니다.</small></label><label>의견 분야<select name="category"><option value="auto">내용을 바탕으로 자동 분류</option>${CATEGORIES.map((value) => `<option>${value}</option>`).join("")}</select><small>자동 분류가 다르면 직접 선택해 주세요.</small></label></div><label>의견 제목 <span class="required-text">필수</span><input name="title" id="opinion-title" type="text" placeholder="예: 학교 앞 횡단보도 신호가 너무 짧아요" minlength="5" maxlength="80" required aria-required="true" autocomplete="off"><small>5~80자로 구체적인 문제를 적어 주세요.</small></label><label>자세한 이야기 <span class="required-text">필수</span><textarea name="content" id="opinion-content" rows="5" placeholder="언제, 어디에서 어떤 불편을 겪었는지, 어떻게 바뀌면 좋을지 알려 주세요." minlength="15" maxlength="1500" required aria-required="true"></textarea><small>15~1,500자. 이름·전화번호·정확한 집 주소는 적지 마세요.</small></label><div id="classification-preview" class="classification-preview">${icon("sparkles")}<div><strong>내용을 입력하면 분야를 제안해 드려요.</strong><p>설명 가능한 키워드 분석을 사용합니다.</p></div></div><div class="form-section-title"><span>02</span><h2>이 문제는 누구에게, 얼마나 영향을 주나요?</h2></div><label class="range-label">문제의 심각성 <output id="severity-value">3 / 5</output><input type="range" name="severity" min="1" max="5" step="1" value="3"><span class="range-ends"><span>작은 불편</span><span>일상·안전에 큰 영향</span></span></label><label class="range-label">취약계층에 미치는 영향 <output id="vulnerability-value">3 / 5</output><input type="range" name="vulnerability" min="1" max="5" step="1" value="3"><span class="range-ends"><span>영향이 적음</span><span>이동·건강·돌봄에 큰 영향</span></span></label><label class="consent-label"><input name="consent" type="checkbox" required><span>의견이 공개되고 분석 목적으로 DB에 저장되는 데 동의합니다. <span class="required-text">필수</span></span></label><p id="form-status" class="form-status" role="status" aria-live="polite"></p><button type="submit" class="button primary submit-button">${icon("send")}시민 의견 접수하기</button></form><aside class="writing-guide"><h2>좋은 변화는 <br>구체적인 이야기에서.</h2><div>${icon("map-pin")}<h3>장면을 떠올려 주세요</h3><p>‘교통이 불편해요’보다 ‘아침 8시 마을버스를 30분 기다려요’가 문제를 이해하는 데 도움이 돼요.</p></div><div>${icon("hand-heart")}<h3>함께 영향을 받는 이웃</h3><p>어린이, 어르신, 장애인 등 이 문제를 더 크게 겪을 수 있는 이웃도 생각해 주세요.</p></div><div>${icon("scale")}<h3>의견의 수가 전부는 아니에요</h3><p>빈도가 적더라도 심각성과 취약계층 영향이 높으면 우선순위에 반영됩니다.</p></div><small>의견은 정책 탐구에 활용됩니다. 실제 행정기관 민원 접수와는 별개입니다.</small></aside></div>`;
}
function weightControls() {
  const normalized = normalizeWeights(state.weights);
  return `<div class="weights-grid">${[
    ["severity", "문제 심각성", "생활과 안전에 미치는 영향"],
    ["vulnerability", "취약계층 영향", "더 큰 불편을 겪는 이웃의 필요"],
    ["frequency", "의견 빈도", "같은 문제를 제기한 의견 수"],
  ]
    .map(
      ([key, title, description]) =>
        `<label class="weight-control"><span>${title}<output id="${key}-percent">${Math.round(normalized[key] * 100)}%</output></span><input id="weight-${key}" data-weight="${key}" type="range" min="0" max="100" value="${state.weights[key]}" aria-label="${title} 가중치"><small>${description}</small></label>`,
    )
    .join("")}</div>`;
}
function priority() {
  return `${heading("무엇을 먼저 바꿔야 할까요?", "내가 중요하게 생각하는 기준을 조절하고, 정책 순위가 어떻게 달라지는지 살펴보세요.")}${sourceNote()}<section class="weight-panel"><div class="section-heading"><h2>${icon("sliders-horizontal")}우리의 선택 기준</h2><button type="button" class="text-button" data-action="reset-weights">${icon("rotate-ccw")}기본값으로</button></div>${weightControls()}<details class="method-details"><summary>점수는 어떻게 계산하나요?</summary><p>심각성과 취약계층 영향의 평균을 각각 100점으로 환산하고, 의견 수에는 로그 정규화를 적용합니다. 세 값에 설정한 가중치의 비율을 곱해 더합니다. 빈도만으로 순위가 결정되지 않게 기본값은 심각성 40%, 취약계층 영향 40%, 빈도 20%입니다. 가중치 합이 0이면 기본값을 사용합니다. 응답자의 주관적 평가에 기반한 탐구 도구이며 객관적인 정책 효과나 공식 결정을 뜻하지 않습니다.</p></details></section><section class="policy-section"><div class="section-heading"><div><h2>정책 우선순위</h2><p>${ranked().length}개 정책을 현재 기준으로 비교했습니다.</p></div><button type="button" class="text-button" data-view="budget">이 기준으로 예산 배분${icon("arrow-right")}</button></div>${policyTable()}</section>`;
}
function budget() {
  const result = budgetResult(),
    rows = ranked();
  return `${heading("한정된 예산으로 만드는 변화", "예산, 정책별 비용과 수혜 규모를 바꿔 서로 다른 배분 결과를 비교해 보세요.", '<button type="button" class="button quiet" data-view="report">' + icon("file-chart-column") + "정책 제안서 보기</button>")}${sourceNote()}${!rows.length ? empty() : `<div class="budget-layout"><section class="budget-controls"><h2>예산 배분 조건</h2><label class="budget-input-label">전체 예산<div class="unit-input"><input id="budget-input" name="budget" type="number" min="0" max="1000000" step="100" value="${state.budget}" inputmode="numeric"><span>만 원</span></div></label><label class="visually-hidden" for="budget-range">전체 예산 조절</label><input id="budget-range" type="range" min="0" max="${Math.max(30000, state.budget)}" step="100" value="${state.budget}"><p class="budget-caption">${money(state.budget)}</p><label>어떤 기준으로 배분할까요?<select id="strategy-select" name="strategy"><option value="priority" ${state.strategy === "priority" ? "selected" : ""}>정책 우선순위</option><option value="equity" ${state.strategy === "equity" ? "selected" : ""}>취약계층 영향 우선</option><option value="coverage" ${state.strategy === "coverage" ? "selected" : ""}>예산당 수혜 규모 우선</option></select></label><p class="strategy-note">${{ priority: "점수가 높은 정책부터, 전액을 확보할 수 있는 정책에 순서대로 배분합니다.", equity: "취약계층 영향이 높은 정책을 먼저 살피고, 같은 경우 점수 순으로 배분합니다.", coverage: "정책 비용 대비 예상 수혜 건수가 큰 정책을 먼저 선택합니다." }[state.strategy]}</p><div class="budget-reminder">${icon("info")}<p>전액 지원을 가정하는 비교 시뮬레이션입니다. 최적화 결과나 실제 예산 확정이 아닙니다.</p></div></section><section class="allocation-result"><div class="section-heading"><h2>이렇게 배분할 수 있어요</h2><span>${result.selected.length}개 정책 선택</span></div><dl class="allocation-stats"><div><dt>배분한 예산</dt><dd>${money(result.spent)}</dd></div><div><dt>남은 예산</dt><dd>${money(result.remaining)}</dd></div><div><dt>예상 수혜 건수 합계</dt><dd>${number(result.beneficiaries)}<span>건</span></dd></div></dl><label class="budget-progress-label">전체 예산 대비 배분<progress max="${Math.max(1, result.budget)}" value="${result.spent}">${Math.round((result.spent / Math.max(1, result.budget)) * 100)}%</progress><span>${Math.round((result.spent / Math.max(1, result.budget)) * 100)}%</span></label><p class="small muted">수혜 규모는 정책 사이에 같은 사람이 중복될 수 있습니다.</p><div class="allocation-list">${result.selected.length ? result.selected.map((row) => `<div class="allocation-row"><span class="allocation-check">${icon("check")}</span><div><strong>${esc(row.title)}</strong><small>${esc(row.category)} / 예상 수혜 ${number(row.beneficiaries)}건</small></div><span>${money(row.cost)}</span></div>`).join("") : '<div class="inline-empty">현재 예산으로 전액 지원할 수 있는 정책이 없습니다. 예산을 늘리거나 가정 비용을 조정해 보세요.</div>'}</div>${result.waiting.length ? `<details class="waiting-list"><summary>이번 예산에 담지 못한 정책 ${result.waiting.length}개</summary>${result.waiting.map((row) => `<p><span>${esc(row.title)}</span><span>${money(row.cost)}</span></p>`).join("")}</details>` : ""}</section></div><section class="policy-section assumptions"><div class="section-heading"><div><h2>정책별 가정값 바꾸기</h2><p>비용 단위는 만 원입니다. 변경은 현재 화면에만 적용되며 DB를 수정하지 않습니다.</p></div><button type="button" class="text-button" data-action="reset-costs">${icon("rotate-ccw")}초기 가정값</button></div><div class="table-scroll"><table><thead><tr><th scope="col">정책</th><th scope="col">예상 비용 (만 원)</th><th scope="col">예상 수혜 건수</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.title)}</td><td><input data-cost="${row.id}" id="cost-${row.id}" type="number" min="1" max="1000000" step="100" value="${row.cost}" aria-label="${esc(row.title)} 예상 비용"></td><td><input data-beneficiaries="${row.id}" id="beneficiaries-${row.id}" type="number" min="0" max="1000000" value="${row.beneficiaries}" aria-label="${esc(row.title)} 수혜 건수"></td></tr>`).join("")}</tbody></table></div></section>`}`;
}
function report() {
  const rows = ranked(),
    result = budgetResult(),
    weights = normalizeWeights(state.weights);
  return `${heading("우리 동네의 다음 변화를 제안합니다.", "의견 분석과 예산 배분을 한 장의 제안서로 정리했어요.", '<div class="button-row"><button type="button" class="button quiet" data-action="export">' + icon("download") + 'CSV 저장</button><button type="button" class="button quiet" data-action="print">' + icon("printer") + "인쇄 / PDF</button></div>")}${sourceNote()}${
    !rows.length
      ? empty()
      : `<article class="report-document"><div class="report-mast"><span class="report-logo">모아</span><span>${date(new Date())} 작성</span></div><h2>시민 의견 기반 정책 제안서</h2><p class="report-subtitle">${state.district === "all" ? "전체 지역" : esc(state.district)} / ${state.source === "demo" ? "시연 자료" : "시민 접수 자료"} / ${opinions().length}건의 의견 분석</p><section><h3>1. 먼저 살펴볼 문제</h3><p>현재 기준에서 <strong>‘${esc(rows[0].title)}’</strong>의 우선순위가 가장 높습니다. 연결된 의견 ${rows[0].count}건의 심각성 평균은 ${rows[0].severity.toFixed(1)}/5, 취약계층 영향 평균은 ${rows[0].vulnerability.toFixed(1)}/5입니다.</p><ol class="report-priorities">${rows
          .slice(0, 3)
          .map(
            (row) =>
              `<li><span>${esc(row.title)}</span><strong>${row.score.toFixed(1)}점</strong></li>`,
          )
          .join(
            "",
          )}</ol></section><section><h3>2. 예산 배분 제안</h3><p>총 ${money(result.budget)} 중 ${money(result.spent)}을 ${result.selected.length}개 정책에 배분하는 방안을 비교했습니다. 예상 수혜 건수의 단순 합계는 ${number(result.beneficiaries)}건이며, 정책 간 중복 수혜를 포함할 수 있습니다.</p>${result.selected.length ? `<ul class="report-projects">${result.selected.map((row) => `<li><span>${esc(row.title)}</span><strong>${money(row.cost)}</strong></li>`).join("")}</ul>` : "<p>현재 예산으로 전액 지원할 수 있는 정책이 없습니다.</p>"}</section><section><h3>3. 계산 기준과 검토할 점</h3><p>심각성 ${Math.round(weights.severity * 100)}%, 취약계층 영향 ${Math.round(weights.vulnerability * 100)}%, 의견 빈도 ${Math.round(weights.frequency * 100)}%를 반영했습니다. 분류는 한국어 키워드 규칙, 점수는 가중합, 예산은 선택한 기준의 순차 전액 배분 방식입니다.</p><p>주민의 주관적 응답과 시뮬레이션 가정에 기반한 탐구 결과입니다. 실제 집행 전에는 현장 조사, 비용 검증, 중복 수혜 확인과 주민 논의가 필요합니다. 행정기관의 공식 정책 제안서나 확정 예산이 아닙니다.</p></section><div class="report-signoff">모든 목소리가 정책의 출발점이 되도록.</div></article>`
  }`;
}
function render() {
  const active = document.activeElement,
    activeId = active?.id;
  const selection =
    active?.tagName === "INPUT" && ["search", "text"].includes(active.type)
      ? [active.selectionStart, active.selectionEnd]
      : null;
  document.querySelectorAll("nav [data-view]").forEach((link) => {
    const current =
      link.dataset.view === (state.view === "write" ? "opinions" : state.view);
    link.classList.toggle("selected", current);
    current
      ? link.setAttribute("aria-current", "page")
      : link.removeAttribute("aria-current");
  });
  $("#source-select").value = state.source;
  if (state.loading)
    $("#workspace").innerHTML =
      `<div class="loading-state" role="status" aria-live="polite"><h1>우리 동네의 목소리를 모으고 있어요.</h1><p>의견과 정책을 불러오는 중입니다.</p><div class="skeleton skeleton-heading"></div><div class="skeleton skeleton-wide"></div><div class="skeleton-grid"><div class="skeleton"></div><div class="skeleton"></div></div></div>`;
  else if (state.error)
    $("#workspace").innerHTML =
      `<div class="error-state" role="alert">${icon("triangle-alert")}<h1>데이터를 불러오지 못했어요.</h1><p>${esc(state.error)}</p><button type="button" class="button primary" data-action="retry">${icon("refresh-cw")}다시 불러오기</button></div>`;
  else {
    $("#workspace").innerHTML = {
      overview,
      opinions: opinionList,
      priority,
      budget,
      report,
      write: writeOpinion,
    }[state.view]();
    if (state.data.total > state.data.analysisLimit)
      $("#workspace").insertAdjacentHTML(
        "afterbegin",
        `<p class="analysis-limit">전체 ${number(state.data.total)}건 중 최근 ${state.data.analysisLimit}건을 분석하고 있습니다.</p>`,
      );
  }
  if (activeId) {
    const target = document.getElementById(activeId);
    if (target) {
      target.focus({ preventScroll: true });
      if (selection) target.setSelectionRange(...selection);
    }
  }
}
let loadSequence = 0;
async function loadData() {
  const sequence = ++loadSequence;
  state.loading = true;
  state.error = "";
  render();
  try {
    const response = await fetch(`/app/api/dashboard?source=${state.source}`, {
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "잠시 후 다시 시도해 주세요.");
    if (sequence !== loadSequence) return;
    state.data = data;
  } catch (error) {
    if (sequence !== loadSequence) return;
    state.error =
      error.name === "TimeoutError"
        ? "응답이 지연되고 있습니다. 다시 불러오기를 눌러 주세요."
        : error.message || "연결을 확인하고 다시 시도해 주세요.";
  }
  state.loading = false;
  render();
}
function go(view) {
  state.view = view;
  syncUrl(true);
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
  $("#workspace").focus({ preventScroll: true });
}
function changeSource(source) {
  state.source = source;
  syncUrl();
  loadData();
}
function openDialog(title, content) {
  $("#dialog-title").textContent = title;
  $("#dialog-content").innerHTML = content;
  $("#info-dialog").showModal();
}
function explainPolicy(id) {
  const policy =
    ranked().find((row) => row.id === id) ||
    state.data.policies.find((row) => row.id === id);
  if (!policy) return;
  const weights = normalizeWeights(state.weights);
  openDialog(
    policy.title,
    `<p class="dialog-description">${esc(policy.description)}</p>${badge(policy.category)}${
      policy.count
        ? `<dl class="detail-metrics"><div><dt>연결된 의견</dt><dd>${policy.count}건</dd></div><div><dt>우선순위</dt><dd>${policy.score.toFixed(1)} / 100점</dd></div></dl><h3>점수 계산 근거</h3><div class="score-breakdown">${[
            ["severity", "문제 심각성"],
            ["vulnerability", "취약계층 영향"],
            ["frequency", "의견 빈도"],
          ]
            .map(
              ([key, title]) =>
                `<div><span>${title}</span><meter min="0" max="100" value="${policy.components[key]}" aria-label="${title} 환산 점수"></meter><strong>${policy.components[key].toFixed(1)} × ${weights[key].toFixed(2)}</strong></div>`,
            )
            .join("")}</div>`
        : '<p class="dialog-note">현재 필터에 연결된 의견이 없어 점수를 계산하지 않았습니다.</p>'
    }<p class="dialog-note">비용 ${money(policy.cost)}, 예상 수혜 ${number(policy.beneficiaries)}건은 비교를 위한 가정값입니다.</p><button type="button" class="button quiet" data-action="dialog-budget">예산에 반영해 보기${icon("arrow-right")}</button>`,
  );
}
function exportReport() {
  const weights = normalizeWeights(state.weights),
    result = budgetResult();
  const cell = (value) => {
    let string = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(string)) string = `'${string}`;
    return `"${string.replaceAll('"', '""')}"`;
  };
  const csvRows = [
    ["모아 정책 제안서", new Date().toISOString()],
    ["자료", state.source === "demo" ? "시연 데이터" : "시민 접수 의견"],
    ["지역", state.district],
    ["심각성 가중치", weights.severity],
    ["취약계층 영향 가중치", weights.vulnerability],
    ["빈도 가중치", weights.frequency],
    ["예산(만원)", result.budget],
    ["배분(만원)", result.spent],
    ["남은 예산(만원)", result.remaining],
    ["기준", state.strategy],
    ["안내", "비용과 수혜는 가정값. 중복 수혜 가능. 공식 정책 결정 아님."],
    [],
    [
      "순위",
      "정책",
      "분야",
      "점수",
      "의견 수",
      "예상 비용(만원)",
      "수혜 건수",
      "배분 여부",
    ],
    ...ranked().map((row, i) => [
      i + 1,
      row.title,
      row.category,
      row.score,
      row.count,
      row.cost,
      row.beneficiaries,
      result.selected.some((p) => p.id === row.id) ? "선택" : "미선택",
    ]),
  ];
  const blob = new Blob(
    ["\uFEFF", csvRows.map((row) => row.map(cell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const link = document.createElement("a"),
    url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `모아-정책제안서-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener("click", (event) => {
  const button = event.target.closest(
    "[data-view],[data-action],[data-policy]",
  );
  if (!button) return;
  event.preventDefault();
  if (button.dataset.view) {
    go(button.dataset.view);
    return;
  }
  if (button.dataset.policy) {
    explainPolicy(button.dataset.policy);
    return;
  }
  switch (button.dataset.action) {
    case "retry":
      loadData();
      break;
    case "community":
      changeSource("community");
      break;
    case "demo":
      changeSource("demo");
      break;
    case "close-dialog":
      $("#info-dialog").close();
      break;
    case "dialog-budget":
      $("#info-dialog").close();
      go("budget");
      break;
    case "reset-weights":
      state.weights = { ...DEFAULT_WEIGHTS };
      persist();
      render();
      break;
    case "reset-costs":
      state.overrides = {};
      render();
      break;
    case "write-again":
      state.receipt = null;
      state.formRequestId = crypto.randomUUID();
      go("write");
      break;
    case "filter-category":
      state.category = button.dataset.category;
      go("opinions");
      break;
    case "export":
      exportReport();
      break;
    case "print":
      window.print();
      break;
    case "guide":
      openDialog(
        "함께 만드는 우리 동네의 변화",
        `<ol class="guide-steps"><li><strong>일상의 의견을 남겨요</strong><p>이름 없이 지역 문제와 개선 아이디어를 접수할 수 있어요.</p></li><li><strong>분류와 우선순위를 살펴요</strong><p>키워드 규칙으로 분야를 분류하고, 세 가지 기준으로 정책을 비교해요.</p></li><li><strong>같은 예산, 다른 선택을 비교해요</strong><p>비용과 수혜 가정을 조절한 결과를 제안서로 저장할 수 있어요.</p></li></ol><p class="dialog-note">현재는 해커톤 정책 탐구용 앱입니다. 예시 지역과 시연 자료는 실제 행정 통계가 아닙니다.</p>`,
      );
      break;
    case "method":
      openDialog(
        "분석 기준과 데이터 안내",
        `<h3>시연과 시민 의견을 구분합니다</h3><p>시연 데이터는 기능을 설명하기 위해 만든 자료입니다. 시민 접수 의견은 별도로 DB에 저장되고 공개됩니다. 지역명은 현재 예시입니다. 이름과 연락처를 수집하지 않습니다.</p><h3>분류와 점수를 설명합니다</h3><p>한국어 키워드를 분야와 정책에 연결합니다. 언어 모델이나 외부 AI에 보내지 않습니다. 심각성과 취약계층 영향은 응답자 평가의 평균, 빈도는 로그 정규화로 계산합니다. 최근 최대 500건을 분석합니다.</p><h3>시뮬레이션은 확정이 아닙니다</h3><p>비용과 수혜 규모는 가정값입니다. 순서대로 전액을 배분하는 휴리스틱으로, 최적 예산이나 고유 수혜 인원을 보장하지 않습니다. 실제 집행에는 추가 검토가 필요합니다.</p><h3>의견 저장</h3><p>제출한 의견은 다른 이용자에게 공개되며 정책 분석에 사용됩니다. 하루 20건으로 접수를 제한하고, 접수 제한용 식별값은 만료 후 정리합니다. 관리 기능과 실제 지자체 연계는 아직 제공하지 않습니다.</p>`,
      );
      break;
  }
});
$("#info-dialog").addEventListener("click", (event) => {
  if (event.target === $("#info-dialog")) {
    const bounds = event.target.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      event.target.close();
  }
});
document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.id === "source-select") return changeSource(el.value);
  if (el.id === "district-filter" || el.id === "category-filter") {
    state[el.id === "district-filter" ? "district" : "category"] = el.value;
    syncUrl();
    render();
  }
  if (el.id === "strategy-select") {
    state.strategy = el.value;
    persist();
    render();
  }
  if (el.id === "budget-input") {
    const value = Number(el.value);
    if (!Number.isFinite(value) || value < 0 || value > 1000000) {
      el.setCustomValidity("0~1,000,000만 원 사이로 입력해 주세요.");
      el.reportValidity();
      return;
    }
    el.setCustomValidity("");
    state.budget = Math.floor(value);
    persist();
    render();
  }
  if (el.dataset.cost || el.dataset.beneficiaries) {
    const value = Number(el.value),
      isCost = Boolean(el.dataset.cost),
      id = el.dataset.cost || el.dataset.beneficiaries;
    if (
      !Number.isInteger(value) ||
      value < (isCost ? 1 : 0) ||
      value > 1000000
    ) {
      el.setCustomValidity("허용 범위 내의 정수를 입력해 주세요.");
      el.reportValidity();
      return;
    }
    el.setCustomValidity("");
    state.overrides[id] = {
      ...state.overrides[id],
      [isCost ? "cost" : "beneficiaries"]: value,
    };
    render();
  }
});
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "opinion-search") {
    state.search = el.value;
    syncUrl();
    render();
  }
  if (el.dataset.weight) {
    state.weights[el.dataset.weight] = Number(el.value);
    persist();
    render();
  }
  if (el.id === "budget-range") {
    state.budget = Number(el.value);
    persist();
    render();
  }
  if (el.form?.id === "opinion-form") {
    el.removeAttribute("aria-invalid");
    if (["severity", "vulnerability"].includes(el.name))
      $(`#${el.name}-value`).textContent = `${el.value} / 5`;
    if (["title", "content", "category"].includes(el.name)) {
      const form = el.form,
        classification = classifyOpinion(
          `${form.elements.title.value} ${form.elements.content.value}`,
        );
      const manual = form.elements.category.value !== "auto";
      $("#classification-preview").innerHTML =
        `${icon("sparkles")}<div><strong>${manual ? esc(form.elements.category.value) + " 분야를 직접 선택했어요." : esc(classification.category) + " 분야로 분류할 수 있어요."}</strong><p>${manual ? "선택한 분야를 기준으로 정책에 연결합니다." : esc(classification.explanation)}</p></div>`;
    }
  }
});
document.addEventListener("submit", async (event) => {
  if (event.target.id !== "opinion-form") return;
  event.preventDefault();
  const form = event.target,
    button = form.querySelector('[type="submit"]'),
    status = $("#form-status");
  const input = Object.fromEntries(new FormData(form));
  input.requestId = state.formRequestId;
  input.consent = form.elements.consent.checked;
  const checked = validateOpinion(input);
  if (checked.error) {
    status.textContent = checked.error;
    status.setAttribute("role", "alert");
    const field = form.elements[checked.field];
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", "form-status");
      field.focus();
    }
    return;
  }
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  status.textContent = "의견을 안전하게 저장하고 있어요.";
  try {
    const response = await fetch("/app/api/opinions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error || "접수하지 못했습니다. 다시 시도해 주세요.",
      );
    state.receipt = result;
    state.source = "community";
    state.district = "all";
    state.category = "all";
    syncUrl();
    await loadData();
  } catch (error) {
    status.textContent =
      error.name === "TimeoutError"
        ? "접수 확인이 지연되고 있어요. 다시 누르면 중복 없이 확인합니다."
        : error.message;
    status.setAttribute("role", "alert");
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
});
window.addEventListener("popstate", () => {
  const p = new URLSearchParams(location.search);
  state.view = navViews.includes(p.get("view")) ? p.get("view") : "overview";
  state.district = DISTRICTS.includes(p.get("district"))
    ? p.get("district")
    : "all";
  state.category = CATEGORIES.includes(p.get("category"))
    ? p.get("category")
    : "all";
  state.search = p.get("search") || "";
  const source = p.get("source") === "community" ? "community" : "demo";
  if (source !== state.source) changeSource(source);
  else render();
});
syncUrl();
loadData();
