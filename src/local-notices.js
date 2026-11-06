export const LOCAL_NOTICE_SOURCE = "https://opinion.lawmaking.go.kr/gcom/sgLmPp";
const MAX_HTML = 2_000_000;
const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function textOf(html = "") {
  return html.replace(/<[^>]*>/g, " ").replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (value, entity) => {
    if (!entity.startsWith("#")) return entities[entity] ?? value;
    const hex = entity[1].toLowerCase() === "x";
    const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : value;
  }).replace(/\s+/g, " ").trim();
}

function notice(number, title, region, reference, day) {
  const parts = textOf(day).match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?$/);
  const publishedAt = parts?.slice(1).map((v) => v.padStart(2, "0")).join("-");
  if (!title || !region || !reference || !publishedAt) return null;
  const timestamp = new Date(publishedAt);
  if (!Number.isFinite(+timestamp) || timestamp.toISOString().slice(0, 10) !== publishedAt) return null;
  return { id: "local-" + number, title, region, reference, publishedAt };
}

export function parseLocalNotices(html) {
  if (html.length > MAX_HTML) throw Error("Local notice page is too large");
  const items = [];
  for (const [row] of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    const link = row.match(/<a\s+href="\/gcom\/sgLmPp\/(\d{1,12})(?:\?[^"]*)?"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const cells = new Map([...row.matchAll(/<td\b[^>]*data-th="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(([, key, body]) => [key, body]));
    const item = notice(link[1], textOf(link[2]), textOf(cells.get("자치단체")),
      textOf(cells.get("공고번호")), cells.get("공고일자"));
    if (item) items.push(item);
  }
  if (!items.length) throw Error("Local notice list not found");
  return items;
}

export function localNoticeNumber(id) {
  return typeof id === "string" ? id.match(/^local-(\d{1,12})$/)?.[1] : undefined;
}

export function localNoticePolicy(item) {
  return {
    ...item,
    sourceUrl: LOCAL_NOTICE_SOURCE + "/" + localNoticeNumber(item.id),
    sourceName: "법제처 국민참여입법센터",
  };
}

async function readHTML(url) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "text/html", "User-Agent": "sepol/2.0 (+https://ageclan.com/app/)" },
  });
  if (!response.ok) throw Error("Local notice source HTTP " + response.status);
  return response.text();
}

export async function fetchLocalNotices(query = "") {
  return parseLocalNotices(await readHTML(LOCAL_NOTICE_SOURCE + "/list" + query));
}

export async function fetchLocalNotice(id) {
  const number = localNoticeNumber(id);
  if (!number) return null;
  const html = await readHTML(LOCAL_NOTICE_SOURCE + "/" + number);
  if (html.length > MAX_HTML || !html.includes('name="sgLmPpSeq" value="' + number + '"')) return null;
  const title = html.match(/<p class="subjectHead_tit">([\s\S]*?)<\/p>/i)?.[1];
  const info = html.match(/<ul class="detailInfo">([\s\S]*?)<\/ul>/i)?.[1] || "";
  const fields = new Map([...info.matchAll(/<span class="label_tit">([^<]+)<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/gi)]
    .map(([, key, value]) => [key, value]));
  const item = notice(number, textOf(title), textOf(fields.get("자치단체")),
    textOf(fields.get("공고번호")), fields.get("공고일자"));
  return item ? localNoticePolicy(item) : null;
}
