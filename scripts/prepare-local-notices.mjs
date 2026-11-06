import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fetchLocalNotices } from "../src/local-notices.js";

const pages = Number(process.argv[2] || 30);
if (!Number.isInteger(pages) || pages < 1 || pages > 60) throw Error("Expected 1–60 pages");
const notices = new Map();
for (let page = 1; page <= pages; page++) {
  const query = "?pageIndex=" + page;
  for (const notice of await fetchLocalNotices(query)) notices.set(notice.id, notice);
  await delay(450);
}
for (const city of ["거제시", "김천시", "상주시"]) {
  const items = await fetchLocalNotices("?lsNm=" + encodeURIComponent(city));
  for (const notice of items.filter((item) => item.region.endsWith(city)))
    notices.set(notice.id, notice);
  await delay(450);
}
const byRegion = new Map();
for (const notice of [...notices.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
  const region = byRegion.get(notice.region) || [];
  if (region.length < 5) region.push(notice);
  byRegion.set(notice.region, region);
}
const items = [...byRegion.values()].flat().sort((a, b) =>
  b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id, "en", { numeric: true }));
await fs.writeFile(new URL("../data/local-notices.json", import.meta.url), JSON.stringify({
  collectedAt: new Date().toISOString(),
  items,
}, null, 2) + "\n");
console.log({ items: items.length, localAuthorities: byRegion.size,
  cities: new Set([...byRegion.keys()].map((v) => v.split(" ").at(-1)).filter((v) => v.endsWith("시"))).size,
  examples: [...byRegion.keys()].filter((v) => /거제시|김천시|상주시/.test(v)),
});
