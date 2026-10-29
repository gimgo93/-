import { validateOpinion } from "../public/app/logic.js";

const headers = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { ...headers, "Cache-Control": "no-store" },
  });
}
async function api(request, env, url) {
  if (!env.APP_DB)
    return json(
      {
        error: "의견 저장소가 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.",
      },
      503,
    );
  if (url.pathname === "/app/api/dashboard" && request.method === "GET") {
    const source = url.searchParams.get("source") === "community" ? 0 : 1;
    const results = await env.APP_DB.batch([
      env.APP_DB.prepare("SELECT * FROM policies ORDER BY id"),
      env.APP_DB.prepare(
        "SELECT id,title,content,district,category,policy_id,severity,vulnerability,classification_method,is_demo,created_at FROM opinions WHERE is_demo=? ORDER BY created_at DESC,id DESC LIMIT 500",
      ).bind(source),
      env.APP_DB.prepare(
        "SELECT COUNT(*) AS total FROM opinions WHERE is_demo=?",
      ).bind(source),
    ]);
    return json({
      policies: results[0].results,
      opinions: results[1].results,
      total: results[2].results[0].total,
      source: source ? "demo" : "community",
      analysisLimit: 500,
      updatedAt: new Date().toISOString(),
    });
  }
  if (url.pathname === "/app/api/opinions" && request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin)
      return json({ error: "같은 앱 화면에서 의견을 제출해 주세요." }, 403);
    if (!request.headers.get("content-type")?.includes("application/json"))
      return json({ error: "JSON 형식의 요청이 필요합니다." }, 415);
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
    if (!input || typeof input !== "object" || Array.isArray(input))
      return json({ error: "입력 내용을 확인해 주세요." }, 400);
    const result = validateOpinion(input);
    if (result.error) return json(result, 400);
    const opinion = result.value;
    const existing = await env.APP_DB.prepare(
      "SELECT id,title,content,district,category,severity,vulnerability FROM opinions WHERE id=?",
    )
      .bind(opinion.id)
      .first();
    if (existing) {
      const same = [
        "title",
        "content",
        "district",
        "category",
        "severity",
        "vulnerability",
      ].every((key) => existing[key] === opinion[key]);
      return same
        ? json({
            id: existing.id,
            category: existing.category,
            duplicate: true,
          })
        : json(
            {
              error:
                "접수 번호가 중복되었습니다. 새 의견으로 다시 제출해 주세요.",
            },
            409,
          );
    }
    const ip = request.headers.get("CF-Connecting-IP") || "local-development";
    const day = new Date().toISOString().slice(0, 10);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${day}:${ip}`),
    );
    const key = Array.from(new Uint8Array(digest), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("");
    const limit = await env.APP_DB.prepare(
      "INSERT INTO request_limits(id,hits,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits",
    )
      .bind(key, Date.now() + 86400000)
      .first();
    if (limit.hits > 20)
      return json(
        {
          error:
            "오늘 접수 가능한 횟수를 초과했습니다. 내일 다시 참여해 주세요.",
        },
        429,
      );
    await env.APP_DB.batch([
      env.APP_DB.prepare(
        "INSERT INTO opinions(id,title,content,district,category,policy_id,severity,vulnerability,classification_method,is_demo,created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?) ON CONFLICT(id) DO NOTHING",
      ).bind(
        opinion.id,
        opinion.title,
        opinion.content,
        opinion.district,
        opinion.category,
        opinion.policy_id,
        opinion.severity,
        opinion.vulnerability,
        opinion.classification_method,
        new Date().toISOString(),
      ),
      env.APP_DB.prepare("DELETE FROM request_limits WHERE expires<?").bind(
        Date.now(),
      ),
    ]);
    return json(
      {
        id: opinion.id,
        category: opinion.category,
        keywords: opinion.keywords,
      },
      201,
    );
  }
  return json({ error: "지원하지 않는 요청입니다." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Route only the independent application, including during local development.
    if (url.pathname !== "/app" && !url.pathname.startsWith("/app/")) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname.startsWith("/app/api/")) {
      try {
        return await api(request, env, url);
      } catch (error) {
        console.error("App API:", error?.name || "Error");
        return json(
          {
            error: "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
          },
          503,
        );
      }
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }
    if (url.pathname === "/app") {
      url.pathname = "/app/";
      return Response.redirect(url.toString(), 308);
    }
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [key, value] of Object.entries(headers))
      response.headers.set(key, value);
    return response;
  },
};
