import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { getCatalog, parseFeed } from "../src/catalog.js";
import { makeKML, validateFeedback } from "../src/policy-tools.js";
import {
  inGeometry,
  findRegion,
  coverageFor,
} from "../public/app/neighborhood.js";
import worker from "../src/worker.js";

test("reviewed official policies retain provenance and have no invented opinion metrics", () => {
  const { policies } = getCatalog();
  assert.equal(policies.length, 12);
  for (const p of policies) {
    assert.ok(
      ["gnews.gg.go.kr", "www.mois.go.kr"].includes(
        new URL(p.sourceUrl).hostname,
      ),
    );
    assert.equal(p.license, "KOGL-1");
    assert.ok(p.summary && p.region && p.statusNote && p.locationEvidence);
    assert.equal(p.cost, undefined);
    assert.equal(p.severity, undefined);
    for (const l of p.locations) {
      assert.ok(l.latitude >= 33 && l.latitude <= 39);
      assert.ok(l.longitude >= 124 && l.longitude <= 132);
      assert.ok(l.note && l.geoSourceUrl);
    }
  }
  assert.equal(
    policies.find((p) => p.reviewKey === "mois-130555").locations.length,
    0,
  );
});
test("KML includes every reviewed location, escapes text and omits unlocated national policy", () => {
  const policies = getCatalog().policies;
  const xml = makeKML(policies);
  const doc = new XMLParser().parse(xml);
  assert.equal(doc.kml.Document.Placemark.length, 11);
  assert.equal(
    doc.kml.Document.Placemark[0].Point.coordinates.split(",").length,
    3,
  );
  assert.doesNotMatch(
    makeKML(policies.filter((p) => p.reviewKey === "mois-130555")),
    /<Placemark>/,
  );
  assert.match(
    makeKML([{ ...policies[0], title: "A <script> & B" }]),
    /A &lt;script&gt; &amp; B/,
  );
});
test("public RSS parsing excludes unapproved links and raw HTML", () => {
  const xml =
    "<rss><channel><item><title><![CDATA[<b>안전 정책</b>]]></title><link>https://www.mois.go.kr/frt/bbs/test</link><pubDate>THU, 29 OCT 2026 12:00:00 KST</pubDate><description><![CDATA[<script>bad()</script>]]></description></item><item><title>Bad</title><link>https://evil.example/</link></item></channel></rss>";
  const rows = parseFeed(xml);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "안전 정책");
  assert.equal(rows[0].description, undefined);
  assert.equal(rows[0].publishedAt, "2026-10-29T03:00:00.000Z");
  assert.throws(() => parseFeed("<!DOCTYPE rss><rss/>"));
});
test("feedback requires genuine policy, public consent and bounded text", () => {
  const rows = getCatalog().policies;
  const input = {
    policyId: rows[0].id,
    title: "정책을 더 자세히 확인하고 싶어요",
    content:
      "대상 지역에서 어떤 일정으로 진행하는지 추가 정보를 확인하고 싶습니다.",
    consent: true,
    requestId: crypto.randomUUID(),
  };
  assert.ok(validateFeedback(input, rows).value);
  assert.ok(validateFeedback({ ...input, policyId: "fake" }, rows).error);
  assert.ok(validateFeedback({ ...input, consent: false }, rows).error);
});
test("synthetic APIs are retired while official catalog does not depend on feedback DB", async () => {
  for (const path of ["dashboard", "opinions"])
    assert.equal(
      (
        await worker.fetch(
          new Request(`https://ageclan.com/app/api/${path}`),
          {},
        )
      ).status,
      410,
    );
  const r = await worker.fetch(
    new Request("https://ageclan.com/app/api/policies"),
    {},
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).policies.length, 12);
});
test("point-in-polygon respects holes and does not guess a town outside boundaries", () => {
  const p = [
    [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [2, 2],
        [4, 2],
        [4, 4],
        [2, 4],
        [2, 2],
      ],
    ],
  ];
  assert.ok(inGeometry(p, 1, 1));
  assert.equal(inGeometry(p, 3, 3), false);
  assert.equal(inGeometry(p, 20, 20), false);
  assert.equal(findRegion({ regions: [] }, {}, 127, 37), null);
});
test("offline Korean boundaries resolve known town and local relevance uses stated coverage", async () => {
  const index = JSON.parse(
    await fs.readFile(
      new URL("../public/app/regions/index.json", import.meta.url),
      "utf8",
    ),
  );
  const shard = JSON.parse(
    await fs.readFile(
      new URL("../public/app/regions/11.json", import.meta.url),
      "utf8",
    ),
  );
  const region = findRegion(index, { "11.json": shard }, 126.978, 37.5665);
  assert.ok(region);
  assert.match(region.label, /서울특별시 중구/);
  const policies = getCatalog().policies;
  const gapyeong = { province: "경기도", label: "경기도 가평군 가평읍" };
  const gimcheon = { province: "경상북도", label: "경상북도 김천시 율곡동" };
  const pine = policies.find((p) => p.reviewKey === "gg-pine-20261027");
  const nation = policies.find((p) => p.reviewKey === "mois-130555");
  assert.ok(coverageFor(pine, gapyeong));
  assert.equal(coverageFor(pine, gimcheon), "");
  assert.ok(coverageFor(nation, gimcheon));
});
