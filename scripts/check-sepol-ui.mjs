import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const base = process.env.APP_TEST_URL || "http://127.0.0.1:8789";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "UI writes/mocked location tests must be local",
);
const output = path.resolve(process.env.SEPOL_TEST_OUTPUT || "artifacts/sepol");
await fs.mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
  args: ["--disable-background-networking", "--no-first-run"],
});
const results = [],
  errors = [];
let submittedId;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1050 });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      /Content Security Policy|SyntaxError|ReferenceError/.test(m.text())
    )
      errors.push(m.text());
  });
  await page.goto(`${base}/app/`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".policy-card");
  assert.equal(await page.$$(".policy-card").then((a) => a.length), 12);
  assert.match(await page.title(), /sepol/);
  await page.screenshot({
    path: path.join(output, "sepol-policies-desktop.png"),
    fullPage: true,
  });
  results.push("실제 정책 12건·sepol 이름 표시");
  await page.click("[data-neighborhood=open]");
  await page.waitForFunction(
    () => document.querySelector("#neighborhood-province").options.length > 2,
  );
  await page.select("#neighborhood-province", "경상북도");
  await page.select("#neighborhood-district", "김천시");
  const town = await page.$$eval(
    "#neighborhood-town option",
    (els) => els.find((e) => e.textContent === "율곡동")?.value,
  );
  assert.ok(town);
  await page.select("#neighborhood-town", town);
  await page.click("#neighborhood-form [type=submit]");
  await page.waitForFunction(() =>
    document.querySelector("#neighborhood-bar").textContent.includes("율곡동"),
  );
  assert.equal(await page.$$(".policy-card").then((a) => a.length), 2);
  await page.reload({ waitUntil: "networkidle0" });
  assert.match(
    await page.$eval("#neighborhood-bar", (e) => e.textContent),
    /율곡동/,
  );
  results.push("시·도/시군구/동 직접 선택·맞춤 정책·새로고침 저장");
  await page.click("[data-action=toggle-local]");
  assert.equal(await page.$$(".policy-card").then((a) => a.length), 12);
  await page.click("[data-neighborhood=clear]");
  await page.click(".policy-card [data-save]");
  await page.click(".policy-card:nth-child(2) [data-save]");
  await page.click("nav [data-view=compare]");
  await page.waitForSelector(".comparison");
  assert.equal(await page.$$eval(".comparison thead th", (a) => a.length), 3);
  results.push("정책 비교와 실제 출처 표시");
  await page.click("nav [data-view=map]");
  await page.waitForSelector(".leaflet-container");
  await page.waitForFunction(
    () => document.querySelectorAll(".leaflet-tile-loaded").length > 0,
    { timeout: 15000 },
  );
  assert.ok(
    await page.$('.map-detail a[href^="https://earth.google.com/web/search/"]'),
  );
  await page.screenshot({
    path: path.join(output, "sepol-map-desktop.png"),
    fullPage: true,
  });
  results.push("실제 지도 타일·정책 선택·Google Earth 링크");
  const kml = await page.evaluate(
    async () => await fetch("/app/api/policies.kml").then((r) => r.text()),
  );
  assert.equal((kml.match(/<Placemark>/g) || []).length, 11);
  results.push("Google Earth KML 11개 위치");
  await page.click("nav [data-view=sources]");
  await page.click("[data-action=refresh-feed]");
  await page.waitForFunction(
    () =>
      document.querySelector("#feed-result")?.textContent &&
      !document
        .querySelector("#feed-result")
        .textContent.includes("확인하고 있어요"),
    { timeout: 20000 },
  );
  const feedText = await page.$eval("#feed-result", (e) => e.textContent);
  results.push(
    `공개 RSS 상태: ${feedText.includes("실제 조회") ? "실제 목록 수신" : "연결 오류를 명시적으로 표시"}`,
  );
  // One synthetic local opinion, removed by exact UUID after the test.
  await page.click("[data-view=write]");
  const id = await page.$eval(
    '#feedback-policy option[value]:not([value=""])',
    (e) => e.value,
  );
  await page.select("#feedback-policy", id);
  await page.type("#feedback-title", "자동 UI 검증용 공개 의견");
  await page.type(
    "#feedback-content",
    "실제 정책과 연결되는 로컬 검증 의견입니다. <script>window.__xss=1</script> 내용은 텍스트로 표시되어야 합니다.",
  );
  await page.click("[name=consent]");
  await page.click("#feedback-form [type=submit]");
  await page.waitForSelector(".receipt");
  submittedId = (
    await page.$eval(".receipt code", (e) => e.textContent)
  ).replace("접수 번호: ", "");
  assert.match(submittedId, /^[a-f0-9-]{36}$/);
  await page.click(".receipt [data-view=opinions]");
  await page.waitForSelector(".feedback-item");
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.match(
    await page.$eval(".feedback-item", (e) => e.textContent),
    /<script>/,
  );
  results.push("실제 로컬 DB 저장·공개 내용 이스케이프");
  await page.setRequestInterception(true);
  page.on("request", (r) =>
    r.url().startsWith("https://tile.openstreetmap.org/")
      ? r.abort()
      : r.continue(),
  );
  for (const width of [375, 390, 768, 1280]) {
    await page.setViewport({ width, height: 900 });
    for (const view of [
      "discover",
      "map",
      "compare",
      "sources",
      "opinions",
      "write",
    ]) {
      await page.goto(`${base}/app/?view=${view}`, {
        waitUntil: "networkidle0",
      });
      await page.waitForSelector("#reviewed-date");
      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      assert.ok(
        overflow.doc <= overflow.viewport + 1,
        `${view} overflow ${width}: ${JSON.stringify(overflow)}`,
      );
    }
    if (width === 390) {
      await page.goto(`${base}/app/`, { waitUntil: "networkidle0" });
      await page.screenshot({
        path: path.join(output, "sepol-mobile.png"),
        fullPage: true,
      });
    }
  }
  results.push("6개 화면 × 4개 너비(375/390/768/1280) 문서 가로 넘침 없음");
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${base}/app/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_ok, fail) => fail({ code: 1 });
  });
  await page.click("[data-neighborhood=open]");
  await page.waitForSelector("[data-neighborhood=locate]");
  await page.click("[data-neighborhood=locate]");
  assert.match(
    await page.$eval("#location-status", (e) => e.textContent),
    /허용되지/,
  );
  assert.ok(await page.$("#neighborhood-form"));
  results.push("위치 권한 거부 시 직접 선택 복구");
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (ok) =>
      ok({ coords: { latitude: 37.5665, longitude: 126.978, accuracy: 30 } });
  });
  await page.click("[data-neighborhood=locate]");
  await page.waitForFunction(() =>
    document
      .querySelector("#neighborhood-bar")
      .textContent.includes("서울특별시 중구"),
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sepol.neighborhood.v1")),
  );
  assert.equal(saved.method, "location");
  assert.equal(saved.latitude, undefined);
  assert.equal(saved.longitude, undefined);
  results.push(
    "모의 위치 승인→브라우저 내부 행정동 판별·자동 기본 화면·정확 좌표 미저장",
  );
  await page.screenshot({
    path: path.join(output, "sepol-neighborhood.png"),
    fullPage: true,
  });
  await page.click("[data-neighborhood=open]");
  await page.waitForSelector("[data-neighborhood=locate]");
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (ok) =>
      ok({ coords: { latitude: 37.5665, longitude: 126.978, accuracy: 8000 } });
  });
  await page.click("[data-neighborhood=locate]");
  await page.waitForFunction(() =>
    document
      .querySelector("#location-status")
      ?.textContent.includes("확정하지"),
  );
  results.push("큰 측정 오차 시 동네 자동 확정 보류");
  await page.click('[data-neighborhood=close]');
  await page.evaluateOnNewDocument(() => {
    window.__locationCalls=0;
    navigator.geolocation.getCurrentPosition=ok=>{window.__locationCalls++;ok({coords:{latitude:37.5665,longitude:126.978,accuracy:30}});};
    navigator.permissions.query=async()=>({state:'granted'});
  });
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForFunction(()=>window.__locationCalls===1&&document.querySelector('#neighborhood-bar').textContent.includes('서울특별시 중구'));
  results.push('이전에 위치를 승인한 브라우저의 재방문 자동 동네 설정(모의 권한)');
  await page.click('[data-neighborhood=open]');
  await page.waitForFunction(()=>document.querySelector('#neighborhood-province').options.length>2);
  await page.select('#neighborhood-province','경기도');await page.select('#neighborhood-district','가평군');
  const manualTown=await page.$$eval('#neighborhood-town option',els=>els.find(e=>e.textContent==='가평읍')?.value);
  await page.select('#neighborhood-town',manualTown);await page.click('#neighborhood-form [type=submit]');
  await page.reload({waitUntil:'networkidle0'});
  assert.match(await page.$eval('#neighborhood-bar',e=>e.textContent),/가평읍/);
  assert.equal(await page.evaluate(()=>window.__locationCalls),0);
  results.push('수동 변경 후에는 자동 위치가 선택한 동네를 덮어쓰지 않음');
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, "ui-results.json"),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        results,
        errors,
        submittedId,
        onlyLocalWrites: true,
        locationTests:
          "mock coordinates only; user browser permissions unchanged",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, errors, submittedId }, null, 2));
} finally {
  await browser.close();
  if (submittedId) {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(
      process.execPath,
      [
        "scripts/wrangler.mjs",
        "d1",
        "execute",
        "APP_DB",
        "--local",
        "--persist-to",
        ".wrangler/state",
        "--command",
        `DELETE FROM civic_feedback_v2 WHERE id='${submittedId}'`,
      ],
      { stdio: "pipe", encoding: "utf8" },
    );
    if (r.status !== 0)
      throw Error("Local test cleanup failed: " + r.stdout + r.stderr);
  }
}
