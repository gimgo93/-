import { getCatalog, readPublicFeed } from "./catalog.js";
import { makeKML, validateFeedback } from "./policy-tools.js";
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
async function api(request, env, url, ctx) {
  const catalog = getCatalog();
  if (url.pathname === "/app/api/policies" && request.method === "GET")
    return json(catalog);
  if (url.pathname === "/app/api/public-feed" && request.method === "GET")
    return json(await readPublicFeed(ctx));
  if (url.pathname === "/app/api/policies.kml" && request.method === "GET") {
    const selected = (url.searchParams.get("ids") || "")
      .split(",")
      .filter(Boolean);
    const rows = selected.length
      ? catalog.policies.filter((p) => selected.includes(p.id))
      : catalog.policies;
    return new Response(makeKML(rows), {
      headers: {
        ...securityHeaders,
        "Content-Type": "application/vnd.google-earth.kml+xml; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="public-policy-locations.kml"',
        "Cache-Control": "no-store",
      },
    });
  }
  if (["/app/api/dashboard", "/app/api/opinions"].includes(url.pathname))
    return json(
      {
        error:
          "기존 합성 시연 API는 종료했습니다. 실제 정책은 /app/api/policies, 시민 의견은 /app/api/feedback을 이용해 주세요.",
      },
      410,
    );
  if (url.pathname !== "/app/api/feedback")
    return json({ error: "지원하지 않는 요청입니다." }, 404);
  if (!env.APP_DB)
    return json(
      {
        error: "의견 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      503,
    );
  if (request.method === "GET") {
    const data = await env.APP_DB.batch([
      env.APP_DB.prepare(
        "SELECT id,policy_id,policy_title,region,title,content,created_at FROM civic_feedback_v2 ORDER BY created_at DESC,id DESC LIMIT 100",
      ),
      env.APP_DB.prepare("SELECT COUNT(*) AS total FROM civic_feedback_v2"),
    ]);
    return json({
      items: data[0].results,
      total: data[1].results[0].total,
      limit: 100,
      source: "user-submissions",
    });
  }
  if (request.method !== "POST")
    return json({ error: "지원하지 않는 요청입니다." }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin)
    return json({ error: "같은 앱 화면에서 제출해 주세요." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    return json({ error: "JSON 형식이 필요합니다." }, 415);
  if (Number(request.headers.get("content-length") || 0) > 16000)
    return json({ error: "입력 내용이 너무 깁니다." }, 413);
  const raw = await request.text();
  if (raw.length > 8000)
    return json({ error: "입력 내용이 너무 깁니다." }, 413);
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ error: "입력 내용을 확인해 주세요." }, 400);
  }
  const validated = validateFeedback(input, catalog.policies);
  if (validated.error) return json(validated, 400);
  const row = validated.value;
  const existing = await env.APP_DB.prepare(
    "SELECT id,policy_id,title,content FROM civic_feedback_v2 WHERE id=?",
  )
    .bind(row.id)
    .first();
  if (existing) {
    if (["policy_id", "title", "content"].every((k) => existing[k] === row[k]))
      return json({
        id: existing.id,
        policyTitle: row.policy_title,
        duplicate: true,
      });
    return json(
      { error: "접수 번호가 중복되었습니다. 새 의견으로 제출해 주세요." },
      409,
    );
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `policy-v2:${new Date().toISOString().slice(0, 10)}:${request.headers.get("CF-Connecting-IP") || "local"}`,
    ),
  );
  const key = Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  const limit = await env.APP_DB.prepare(
    "INSERT INTO request_limits(id,hits,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits",
  )
    .bind(key, Date.now() + 86400000)
    .first();
  if (limit.hits > 20)
    return json(
      { error: "오늘 접수 횟수를 초과했습니다. 내일 다시 참여해 주세요." },
      429,
    );
  const result = await env.APP_DB.prepare(
    "INSERT INTO civic_feedback_v2(id,policy_id,policy_title,region,title,content,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
  )
    .bind(
      row.id,
      row.policy_id,
      row.policy_title,
      row.region,
      row.title,
      row.content,
      new Date().toISOString(),
    )
    .run();
  if (result.success === false) throw Error("Storage failed");
  const cleanup = env.APP_DB.prepare(
    "DELETE FROM request_limits WHERE expires<?",
  )
    .bind(Date.now())
    .run();
  if (ctx?.waitUntil) ctx.waitUntil(cleanup);
  else await cleanup;
  return json(
    { id: row.id, policyTitle: row.policy_title },
    result.meta?.changes === 0 ? 200 : 201,
  );
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
          { error: "처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." },
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
