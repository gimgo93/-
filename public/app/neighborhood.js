export const STORAGE_KEY = "sepol.neighborhood.v1";
export const AUTO_KEY = "sepol.location.auto.v1";
export function containsBox(b, lon, lat) {
  return lon >= b[0] && lat >= b[1] && lon <= b[2] && lat <= b[3];
}
export function inRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i],
      [px, py] = ring[j];
    if (y > lat !== py > lat && lon < ((px - x) * (lat - y)) / (py - y) + x)
      inside = !inside;
  }
  return inside;
}
export function inGeometry(polygons, lon, lat) {
  return polygons.some(
    (rings) =>
      inRing(rings[0], lon, lat) &&
      !rings.slice(1).some((hole) => inRing(hole, lon, lat)),
  );
}
export function findRegion(index, shards, lon, lat) {
  const candidates = index.regions.filter((r) => containsBox(r.bbox, lon, lat));
  const hits = [];
  for (const r of candidates) {
    const feature = shards[r.file]?.features.find((f) => f.code === r.code);
    if (feature && inGeometry(feature.polygons, lon, lat)) hits.push(r);
  }
  return hits.length === 1 ? hits[0] : null;
}
const scope = {
  "gg-pine-20261027": { province: "경기도", cities: ["가평군"] },
  "gg-newforest-20261027": { province: "경기도", cities: ["안산시"] },
  "gg-bridge-20261028": { province: "경기도", cities: ["양평군", "여주시"] },
  "gg-firetf-20261026": { province: "경기도", all: true },
  "gg-bus-20261029": { province: "경기도", all: true, conditional: true },
  "gg-tax-20261029": { province: "경기도", all: true },
  "gg-physicalai-20261029": { province: "경기도", all: true },
  "gg-infection-20260312": { province: "경기도", all: true },
  "gg-pocheon-feed-20260115": { province: "경기도", cities: ["포천시"] },
  "gg-learning-20260118": { province: "경기도", all: true },
  "mois-130600": { national: true },
  "mois-130555": { national: true },
};
export function coverageFor(policy, neighborhood) {
  if (!neighborhood) return "";
  const s = scope[policy.reviewKey];
  if (!s) return "";
  if (s.national) return "전국 의제·참여기관";
  if (neighborhood.province !== s.province) return "";
  if (s.all)
    return s.conditional
      ? "경기도 조건부 대비책 · 개별 운행 확인"
      : "경기도 범위 · 사업별 자격 확인";
  if (s.cities.some((city) => neighborhood.label.includes(city)))
    return "같은 시·군 관련 · 동네 전체 적용은 원문 확인";
  return "";
}
let indexPromise;
const shards = {};
export async function loadRegionIndex() {
  return (indexPromise ??= fetch("/app/regions/index.json")
    .then((r) => {
      if (!r.ok) throw Error("동네 목록을 불러오지 못했습니다.");
      return r.json();
    })
    .catch((e) => {
      indexPromise = null;
      throw e;
    }));
}
export async function resolveNeighborhood(latitude, longitude) {
  const index = await loadRegionIndex();
  const files = [
    ...new Set(
      index.regions
        .filter((r) => containsBox(r.bbox, longitude, latitude))
        .map((r) => r.file),
    ),
  ];
  if (!files.length) return null;
  for (const file of files) {
    if (!shards[file]) {
      const r = await fetch(`/app/regions/${file}`);
      if (!r.ok) throw Error("행정동 경계를 불러오지 못했습니다.");
      shards[file] = await r.json();
    }
  }
  return findRegion(index, shards, longitude, latitude);
}
export function readSavedNeighborhood() {
  try {
    const n = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return n &&
      typeof n.code === "string" &&
      typeof n.label === "string" &&
      Array.isArray(n.center) &&
      n.center.every(Number.isFinite)
      ? n
      : null;
  } catch {
    return null;
  }
}
export function storeNeighborhood(region, method = "manual") {
  const value = {
    code: region.code,
    label: region.label,
    province: region.province,
    district: region.district,
    town: region.town,
    bbox: region.bbox,
    center: region.center,
    method,
    boundaryVersion: "2026-10-01",
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    localStorage.setItem(AUTO_KEY, method === "location" ? "true" : "false");
  } catch {}
  return value;
}
