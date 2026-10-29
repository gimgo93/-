// One-time, small, serial lookup of named PUBLIC policy locations.
// Not a runtime place-search service. Cache results and obey the OSM policy.
// https://operations.osmfoundation.org/policies/nominatim/
import fs from "node:fs/promises";
const places = [
  "경기도 가평군",
  "경기도 안산시 상록구 본오동",
  "양평대교",
  "양근대교",
  "이포대교",
  "수원역",
  "기흥역",
  "대화역",
  "경기도 시흥시",
  "분당서울대학교병원",
  "경기도 포천시",
  "연세대학교 백양누리",
  "경기도 양평군",
  "경기도 여주시",
  "서울특별시 서대문구",
];
const out = new URL("../data/public-location-cache.json", import.meta.url);
let records = {};
try {
  records = JSON.parse(await fs.readFile(out, "utf8"));
} catch {}
for (const place of places) {
  if (records[place]) continue;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q: place,
    format: "jsonv2",
    limit: "1",
    countrycodes: "kr",
    "accept-language": "ko",
  });
  const r = await fetch(url, {
    headers: {
      "User-Agent": "SepolPolicyReview/2.0 (+https://ageclan.com/app/)",
      Referer: "https://ageclan.com/app/",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw Error(`Geocoding ${r.status}; stop, do not retry in a loop`);
  const rows = await r.json();
  records[place] = {
    query: place,
    fetchedAt: new Date().toISOString(),
    result: rows[0] || null,
    source: "OpenStreetMap Nominatim",
    license: "ODbL",
    sourceUrl: url.href,
  };
  await fs.writeFile(out, JSON.stringify(records, null, 2));
  console.log(
    JSON.stringify({
      place,
      result: rows[0]
        ? {
            name: rows[0].display_name,
            lat: rows[0].lat,
            lon: rows[0].lon,
            type: rows[0].type,
          }
        : null,
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 1150));
}
