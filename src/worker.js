import { getCatalog, readPublicFeed } from "./catalog.js";
import { validateFeedback } from "./policy-tools.js";
import { findLocalNotice, localNotices, readLatestNotices } from "./policy-directory.js";
const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(self)",
};
const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { ...securityHeaders, "Cache-Control": "no-store" },
  });
const feedbackReceipt = (row) => ({
  id: row.id,
  policyTitle: row.policy_title,
  neighborhood: row.neighborhood,
  publishedAt: row.policy_published_at,
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
}
function existingFeedback(existing, row) {
  if (!existing.deleted_at &&
    ["policy_id", "title", "content", "neighborhood", "author_hash"].every((k) => existing[k] === row[k]))
    return json({ ...feedbackReceipt(existing), duplicate: true });
  return json({ error: "접수 번호가 중복되었어요\n새 의견으로 제출해 주세요" }, 409);
}
async function checkFeedbackLimit(request, db) {
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const key = await hash("policy-v2:" + day + ":" + ip);
  const limit = await db.prepare(
    "INSERT INTO request_limits(id,hits,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits",
  ).bind(key, Date.now() + 86400000).first();
  return limit.hits <= 20;
}
const feedbackLimited = () =>
  json({ error: "오늘 접수 횟수를 초과했습니다 내일 다시 참여해 주세요" }, 429);
async function api(request, env, url, ctx) {
  const catalog = getCatalog();
  if (url.pathname === "/app/api/policies" && request.method === "GET")
    return json({ ...catalog, localNotices });
  if (url.pathname === "/app/api/local-notices" && request.method === "GET")
    return json(await readLatestNotices(ctx, { refresh: url.searchParams.get("refresh") === "1" }));
  const noticeId = url.pathname.match(/^\/app\/api\/local-notices\/(local-\d{1,12})$/)?.[1];
  if (noticeId && request.method === "GET") {
    const notice = await findLocalNotice(noticeId, ctx);
    return notice ? json(notice) : json({ error: "입법예고를 확인할 수 없어요" }, 404);
  }
  if (url.pathname === "/app/api/public-feed" && request.method === "GET")
    return json(await readPublicFeed(ctx));
  if (["/app/api/dashboard", "/app/api/opinions"].includes(url.pathname))
    return json(
      {
        error:
          "기존 합성 시연 API는 종료했습니다 실제 정책은 /app/api/policies, 시민 의견은 /app/api/feedback을 이용해 주세요",
      },
      410,
    );
  const deleteId = url.pathname.match(/^\/app\/api\/feedback\/([^/]+)$/)?.[1];
  if (url.pathname !== "/app/api/feedback" && !deleteId)
    return json({ error: "지원하지 않는 요청입니다" }, 404);
  if (!env.APP_DB)
    return json(
      {
        error: "의견 저장소에 연결하지 못했습니다 잠시 후 다시 시도해 주세요",
      },
      503,
    );
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin && origin !== url.origin)
    return json({ error: "같은 앱 화면에서 제출해 주세요" }, 403);
  const authorization = request.headers.get("authorization");
  const authorToken = authorization?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
  if (authorization && !authorToken) return json({ error: "작성자 키를 확인할 수 없어요" }, 401);
  const authorHash = authorToken ? await hash("sepol-author:" + authorToken) : null;
  if (deleteId) {
    if (request.method !== "DELETE") return json({ error: "지원하지 않는 요청입니다" }, 405);
    if (!uuid.test(deleteId) || !authorHash)
      return json({ error: "작성한 브라우저에서만 삭제할 수 있어요" }, 403);
    const result = await env.APP_DB.prepare(
      "UPDATE civic_feedback_v2 SET deleted_at=?, title='', content='', neighborhood=NULL WHERE id=? AND author_hash=? AND deleted_at IS NULL",
    ).bind(new Date().toISOString(), deleteId, authorHash).run();
    if (result.success === false) throw Error("Deletion failed");
    return result.meta?.changes
      ? json({ deleted: true })
      : json({ error: "삭제할 수 있는 의견이 없어요" }, 404);
  }
  if (request.method === "GET") {
    const data = await env.APP_DB.batch([
      env.APP_DB.prepare(
        "SELECT id,policy_id,policy_title,policy_published_at,policy_source_url,region,neighborhood,title,content,created_at,COALESCE(author_hash=?,0) AS can_delete FROM civic_feedback_v2 WHERE deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 100",
      ).bind(authorHash),
      env.APP_DB.prepare("SELECT COUNT(*) AS total FROM civic_feedback_v2 WHERE deleted_at IS NULL"),
    ]);
    return json({
      items: data[0].results.map((row) => {
        const policy = catalog.policies.find((p) => p.id === row.policy_id);
        return {
          ...row,
          policy_published_at: row.policy_published_at ?? policy?.publishedAt ?? null,
          policy_source_url: row.policy_source_url ?? policy?.sourceUrl ?? null,
          can_delete: Boolean(row.can_delete),
        };
      }),
      total: data[1].results[0].total,
      limit: 100,
      source: "user-submissions",
    });
  }
  if (request.method !== "POST")
    return json({ error: "지원하지 않는 요청입니다" }, 405);
  if (!request.headers.get("content-type")?.includes("application/json"))
    return json({ error: "JSON 형식이 필요합니다" }, 415);
  if (Number(request.headers.get("content-length") || 0) > 16000)
    return json({ error: "입력 내용이 너무 깁니다" }, 413);
  const raw = await request.text();
  if (raw.length > 8000)
    return json({ error: "입력 내용이 너무 깁니다" }, 413);
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ error: "입력 내용을 확인해 주세요" }, 400);
  }
  if (!authorHash)
    return json({ error: "페이지를 새로고침한 뒤 다시 제출해 주세요" }, 401);
  const policy = catalog.policies.find((item) => item.id === input?.policyId) ??
    localNotices.find((item) => item.id === input?.policyId);
  if (!input?.neighborhoodCode)
    return json({ error: "의견을 남길 읍·면·동을 골라 주세요" }, 400);
  const needsLookup = !policy && /^local-\d{1,12}$/.test(input?.policyId || "");
  if (needsLookup && !(await checkFeedbackLimit(request, env.APP_DB))) return feedbackLimited();
  const official = policy ?? (needsLookup ? await findLocalNotice(input.policyId, ctx) : null);
  const validated = validateFeedback(input, official ? [official] : []);
  if (validated.error) return json(validated, 400);
  const row = { ...validated.value, author_hash: authorHash };
  const findExisting = env.APP_DB.prepare(
    "SELECT id,policy_id,policy_title,policy_published_at,title,content,neighborhood,author_hash,deleted_at FROM civic_feedback_v2 WHERE id=?",
  ).bind(row.id);
  const existing = await findExisting.first();
  if (existing) return existingFeedback(existing, row);
  if (!needsLookup && !(await checkFeedbackLimit(request, env.APP_DB))) return feedbackLimited();
  const result = await env.APP_DB.prepare(
    "INSERT INTO civic_feedback_v2(id,policy_id,policy_title,region,neighborhood,title,content,created_at,author_hash,policy_published_at,policy_source_url) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
  )
    .bind(
      row.id,
      row.policy_id,
      row.policy_title,
      row.region,
      row.neighborhood,
      row.title,
      row.content,
      new Date().toISOString(),
      row.author_hash,
      row.policy_published_at,
      row.policy_source_url,
    )
    .run();
  if (result.success === false) throw Error("Storage failed");
  if (result.meta?.changes === 0) {
    const concurrent = await findExisting.first();
    if (!concurrent) throw Error("Storage failed");
    return existingFeedback(concurrent, row);
  }
  const cleanup = env.APP_DB.prepare(
    "DELETE FROM request_limits WHERE expires<?",
  )
    .bind(Date.now())
    .run();
  if (ctx?.waitUntil) ctx.waitUntil(cleanup);
  else await cleanup;
  return json(feedbackReceipt(row), 201);
}
export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/app" && !url.pathname.startsWith("/app/"))
      return new Response("Not found", { status: 404 });
    if (url.pathname.startsWith("/app/api/")) {
      try {
        return await api(request, env, url, ctx);
      } catch (error) {
        console.error("Policy API:", error?.name || "Error");
        return json(
          { error: "처리를 완료하지 못했습니다 잠시 후 다시 시도해 주세요" },
          503,
        );
      }
    }
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    if (url.pathname === "/app") {
      url.pathname = "/app/";
      return Response.redirect(url.toString(), 308);
    }
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [name, value] of Object.entries(securityHeaders))
      response.headers.set(name, value);
    return response;
  },
};
