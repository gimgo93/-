import snapshot from "../data/local-notices.json" with { type: "json" };
import { fetchLocalNotice, fetchLocalNotices, localNoticeNumber, localNoticePolicy } from "./local-notices.js";

export const localNotices = snapshot.items.map(localNoticePolicy);
const noticeById = new Map(localNotices.map((item) => [item.id, item]));
const freshness = 10 * 60 * 1000;

export async function readLatestNotices(ctx) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request("https://ageclan.com/app/internal-cache/local-notices-v1");
  const cached = await cache?.match(key).then((hit) => hit?.json()).catch(() => null);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < freshness) return cached;
  try {
    const items = (await fetchLocalNotices()).slice(0, 6).map(localNoticePolicy);
    const latest = { status: "live", items, fetchedAt: new Date().toISOString() };
    if (cache) {
      const write = cache.put(key, Response.json(latest, {
        headers: { "Cache-Control": "public, max-age=86400" },
      })).catch(() => {});
      if (ctx?.waitUntil) ctx.waitUntil(write);
      else await write;
    }
    return latest;
  } catch {
    return {
      status: "stale",
      items: cached?.items ?? localNotices.slice(0, 6),
      fetchedAt: cached?.fetchedAt ?? snapshot.collectedAt,
    };
  }
}

export async function findLocalNotice(id, ctx) {
  if (!localNoticeNumber(id)) return null;
  return noticeById.get(id) ??
    (await readLatestNotices(ctx)).items.find((item) => item.id === id) ??
    await fetchLocalNotice(id).catch(() => null);
}
