import regionIndex from "../public/app/regions/index.json" with { type: "json" };

const key = (label) => label.replace(/\s+/g, "");
const areas = new Map();
const byDistrict = new Map();

function addArea(label, province, district, center) {
  const areaKey = key(label);
  if (!areas.has(areaKey)) {
    const area = { label, province, district, centers: [] };
    areas.set(areaKey, area);
    if (district) {
      const candidates = byDistrict.get(key(district)) ?? [];
      candidates.push(area);
      byDistrict.set(key(district), candidates);
    }
  }
  areas.get(areaKey).centers.push(center);
}

for (const { province, district, center } of regionIndex.regions) {
  addArea(province, province, "", center);
  addArea(province + " " + district, province, district, center);
  const city = district.match(/^(.+?시)\s*.+구$/)?.[1];
  if (city) addArea(province + " " + city, province, city, center);
}

function representativePoint(centers) {
  const count = centers.length;
  const meanLatitude = centers.reduce((sum, p) => sum + p[0], 0) / count;
  const meanLongitude = centers.reduce((sum, p) => sum + p[1], 0) / count;
  const longitudeScale = Math.cos(meanLatitude * Math.PI / 180);
  const distance = ([lat, lon]) =>
    (lat - meanLatitude) ** 2 + ((lon - meanLongitude) * longitudeScale) ** 2;
  return centers.reduce((closest, point) =>
    distance(point) < distance(closest) ? point : closest);
}

const verifiedGoseongNotices = new Set(["local-358531", "local-358827", "local-358867"]);

export function noticeArea(item) {
  const candidates = byDistrict.get(key(item.region)) ?? [];
  const area = areas.get(key(item.region)) ??
    (verifiedGoseongNotices.has(item.id) && item.region === "고성군"
      ? areas.get(key("강원특별자치도 고성군"))
      : candidates.length === 1 ? candidates[0]
        : candidates.find((candidate) => key(item.title).includes(key(candidate.label))));
  if (!area) return null;
  if (!area.point) {
    const { label, province, district, centers } = area;
    const [latitude, longitude] = representativePoint(centers);
    area.point = { label, province, district, latitude, longitude };
  }
  return area.point;
}
