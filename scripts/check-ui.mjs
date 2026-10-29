import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";

const base = process.env.APP_TEST_URL || "http://127.0.0.1:8789";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "UI writes must run only against a local test server",
);
const output = new URL("../artifacts/", import.meta.url);
await fs.mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
  ],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (
    message.type() === "error" &&
    /Content Security Policy|Refused to|SyntaxError/.test(message.text())
  )
    errors.push(message.text());
});
let submittedId;
try {
  await page.setViewport({ width: 1440, height: 1050 });
  await page.goto(`${base}/app/`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".stat-row");
  assert.match(
    await page.$eval(".stat-row", (element) => element.textContent),
    /38/,
  );
  await page.screenshot({
    path: new URL("overview-desktop.png", output).pathname,
    fullPage: true,
  });
  await page.click('nav [data-view="priority"]');
  const before = await page.$$eval(".score-cell strong", (elements) =>
    elements.map((el) => el.textContent),
  );
  await page.$eval("#weight-frequency", (element) => {
    element.value = 100;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const after = await page.$$eval(".score-cell strong", (elements) =>
    elements.map((el) => el.textContent),
  );
  assert.notDeepEqual(
    before,
    after,
    "Weights must change rendered policy scores",
  );
  await page.click('[data-action="reset-weights"]');
  await page.click(".policy-name");
  await page.waitForSelector("dialog[open]");
  assert.match(
    await page.$eval("#dialog-content", (el) => el.textContent),
    /점수 계산 근거/,
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.$("dialog[open]"), null);

  await page.click('nav [data-view="budget"]');
  await page.$eval("#budget-input", (element) => {
    element.value = 0;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.match(
    await page.$eval(".allocation-result", (element) => element.textContent),
    /지원할 수 있는 정책이 없습니다/,
  );
  await page.$eval("#budget-input", (element) => {
    element.value = 12000;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.select("#strategy-select", "equity");
  assert.match(
    await page.$eval(".strategy-note", (el) => el.textContent),
    /취약계층/,
  );
  await page.screenshot({
    path: new URL("budget-desktop.png", output).pathname,
    fullPage: true,
  });
  await page.click('nav [data-view="report"]');
  assert.match(
    await page.$eval(".report-document", (el) => el.textContent),
    /공식 정책 제안서나 확정 예산이 아닙니다/,
  );
  await page.click('nav [data-view="opinions"]');
  await page.type("#opinion-search", "일치하지않는검색어");
  assert.match(
    await page.$eval(".empty-state", (el) => el.textContent),
    /검색 결과가 없어요/,
  );
  await page.$eval("#opinion-search", (el) => {
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.select("#source-select", "community");
  await page.waitForFunction(() => !document.querySelector(".loading-state"));
  const baseline = await (
    await fetch(`${base}/app/api/dashboard?source=community`)
  ).json();
  if (!baseline.total)
    assert.match(
      await page.$eval(".empty-state", (el) => el.textContent),
      /아직 모인 의견이 없어요/,
    );

  await page.click('.header-actions [data-view="write"]');
  await page.click(".submit-button");
  assert.match(
    await page.$eval("#form-status", (el) => el.textContent),
    /제목/,
  );
  await page.select('#opinion-form [name="district"]', "중앙동");
  await page.type("#opinion-title", "자동 검증용 마을버스 의견");
  await page.type(
    "#opinion-content",
    '마을버스 배차 간격을 줄여 주세요. <img src=x onerror="window.__unsafe=true"> 자동 검증 후 삭제되는 로컬 의견입니다.',
  );
  assert.match(
    await page.$eval("#classification-preview", (el) => el.textContent),
    /교통/,
  );
  await page.click('#opinion-form [name="consent"]');
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/app/api/opinions") &&
      response.request().method() === "POST",
  );
  await page.click(".submit-button");
  const response = await responsePromise;
  assert.equal(response.status(), 201);
  const result = await response.json();
  submittedId = result.id;
  await page.waitForSelector(".receipt");
  const dashboard = await (
    await fetch(`${base}/app/api/dashboard?source=community`)
  ).json();
  assert.equal(dashboard.total, baseline.total + 1);
  assert.ok(dashboard.opinions.some((row) => row.id === submittedId));
  const repeat = await fetch(`${base}/app/api/opinions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: response.request().postData(),
  });
  assert.equal(repeat.status, 200);
  assert.equal((await repeat.json()).duplicate, true);
  await page.click('.receipt [data-view="opinions"]');
  assert.equal(await page.evaluate(() => window.__unsafe), undefined);
  assert.equal(await page.$(".opinion-body img"), null);

  await page.setOfflineMode(true);
  await page.select("#source-select", "demo");
  await page.waitForSelector(".error-state");
  await page.setOfflineMode(false);
  await page.click('[data-action="retry"]');
  await page.waitForSelector(".opinion-list");

  for (const width of [375, 390, 768, 1280]) {
    await page.setViewport({ width, height: 900 });
    for (const view of [
      "overview",
      "opinions",
      "priority",
      "budget",
      "report",
      "write",
    ]) {
      await page.goto(`${base}/app/?view=${view}&source=demo`, {
        waitUntil: "networkidle0",
      });
      await page.waitForFunction(
        () => !document.querySelector(".loading-state"),
      );
      assert.equal(await page.$(".error-state"), null, `${view} must load`);
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      assert.ok(
        dimensions.document <= dimensions.viewport,
        `${view} at ${width} overflows`,
      );
      if (width === 390 && ["overview", "write"].includes(view))
        await page.screenshot({
          path: new URL(`${view}-mobile.png`, output).pathname,
          fullPage: true,
        });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: scores, funding, modal, search, DB submission, idempotency, escaping, offline recovery and 24 responsive screens.",
  );
} finally {
  await browser.close();
  if (submittedId && /^[0-9a-f-]{36}$/.test(submittedId)) {
    const cleanup = spawnSync(
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
        `DELETE FROM opinions WHERE id='${submittedId}'`,
      ],
      { cwd: new URL("../", import.meta.url), encoding: "utf8" },
    );
    if (cleanup.status !== 0) {
      console.error("Local test-row cleanup failed:", cleanup.stderr);
      process.exitCode = 1;
    }
  }
}
