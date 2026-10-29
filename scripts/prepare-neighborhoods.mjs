import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
if (!process.argv[2])
  throw new Error(
    "Pass the downloaded HangJeongDong_ver20261001.geojson path. See docs/PUBLIC_DATA.md.",
  );
const raw = await fs.readFile(
  pathToFileURL(path.resolve(process.argv[2])),
  "utf8",
);
const data = JSON.parse(raw),
  root = new URL("../public/app/regions/", import.meta.url);
await fs.mkdir(root, { recursive: true });
const provinces = new Map(),
  index = [];
for (const f of data.features) {
  const p = f.properties,
    parts = p.adm_nm.split(" "),
    province = p.sidonm || parts[0],
    district = p.sggnm || parts.slice(1, -1).join(" "),
    town = parts.at(-1),
    code = String(p.adm_cd2 || p.adm_cd);
  const polygons =
    f.geometry.type === "Polygon"
      ? [f.geometry.coordinates]
      : f.geometry.coordinates;
  let bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const coords = polygons.map((poly) =>
    poly.map((ring) =>
      ring.map(([lon, lat]) => {
        bbox = [
          Math.min(bbox[0], lon),
          Math.min(bbox[1], lat),
          Math.max(bbox[2], lon),
          Math.max(bbox[3], lat),
        ];
        return [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];
      }),
    ),
  );
  bbox = bbox.map((n) => Math.round(n * 1e5) / 1e5);
  const row = {
    code,
    label: p.adm_nm,
    province,
    district: district || "세종특별자치시",
    town,
    bbox,
    center: [(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2],
    file: `${p.sido}.json`,
  };
  index.push(row);
  const list = provinces.get(p.sido) || [];
  list.push({ code, bbox, polygons: coords });
  provinces.set(p.sido, list);
}
for (const [code, rows] of provinces)
  await fs.writeFile(
    new URL(`${code}.json`, root),
    JSON.stringify({ version: "2026-10-01", features: rows }),
  );
await fs.writeFile(
  new URL("index.json", root),
  JSON.stringify({
    version: "2026-10-01",
    source:
      "통계청 SGIS · 가공 vuski/admdongkor · sepol 좌표 반올림·시도별 분할",
    sourceUrl: "https://github.com/vuski/admdongkor/tree/master/ver20261001",
    sourceSHA256: crypto.createHash("sha256").update(raw).digest("hex"),
    license: "CC BY 4.0 + 공공누리 제1유형",
    regions: index,
  }),
);
await fs.copyFile(
  new URL("../data/Neighborhood-DATA-LICENSE.txt", import.meta.url),
  new URL(
    "../public/app/licenses/Neighborhood-DATA-LICENSE.txt",
    import.meta.url,
  ),
);
console.log(
  JSON.stringify({
    towns: index.length,
    provinces: provinces.size,
    largest: Math.max(
      ...(await Promise.all(
        [...provinces.keys()].map(
          async (id) => (await fs.stat(new URL(`${id}.json`, root))).size,
        ),
      )),
    ),
  }),
);
