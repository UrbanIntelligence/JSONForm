const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
};

const badRequest = (message) => {
  return jsonResponse({ error: message }, 400);
};

const tooManyRequests = (message) => {
  return jsonResponse({ error: message }, 429);
};

const validateEntry = (entry) => {
  if (!entry || typeof entry !== "object") return "Invalid JSON payload.";
  const required = ["firstName", "lastName", "age", "sex", "nationality", "phone"];
  for (const key of required) {
    if (entry[key] === undefined || entry[key] === null || `${entry[key]}`.trim() === "") {
      return `Missing field: ${key}`;
    }
  }
  const age = Number(entry.age);
  if (!Number.isFinite(age) || age < 0 || age > 130) return "Age must be between 0 and 130.";
  return null;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/entries") {
      if (request.method === "GET") {
        const result = await env.DB.prepare(
          "SELECT id, first_name, last_name, age, sex, nationality, phone, created_at FROM entries ORDER BY id DESC LIMIT 500"
        ).all();

        const entries = (result.results || []).map((row) => ({
          id: row.id,
          firstName: row.first_name,
          lastName: row.last_name,
          age: row.age,
          sex: row.sex,
          nationality: row.nationality,
          phone: row.phone,
          createdAt: row.created_at
        }));

        return jsonResponse(entries);
      }

      if (request.method === "POST") {
        const ipHeader = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
        const clientIp = ipHeader.split(",")[0].trim();
        const now = Math.floor(Date.now() / 1000);
        const windowSeconds = 60;
        const limit = 5;

        const existing = await env.DB.prepare(
          "SELECT window_start, count FROM rate_limits WHERE ip = ?"
        ).bind(clientIp).first();

        if (!existing) {
          await env.DB.prepare(
            "INSERT INTO rate_limits (ip, window_start, count) VALUES (?, ?, ?)"
          ).bind(clientIp, now, 1).run();
        } else if (now - existing.window_start < windowSeconds) {
          if (existing.count >= limit) {
            return tooManyRequests("Rate limit exceeded. Try again in a minute.");
          }
          await env.DB.prepare(
            "UPDATE rate_limits SET count = count + 1 WHERE ip = ?"
          ).bind(clientIp).run();
        } else {
          await env.DB.prepare(
            "UPDATE rate_limits SET window_start = ?, count = 1 WHERE ip = ?"
          ).bind(now, clientIp).run();
        }

        let payload;
        try {
          payload = await request.json();
        } catch (err) {
          return badRequest("Request body must be valid JSON.");
        }

        const validationError = validateEntry(payload);
        if (validationError) return badRequest(validationError);

        const createdAt = new Date().toISOString();
        const stmt = env.DB.prepare(
          "INSERT INTO entries (first_name, last_name, age, sex, nationality, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          payload.firstName.trim(),
          payload.lastName.trim(),
          Number(payload.age),
          payload.sex,
          payload.nationality.trim(),
          payload.phone.trim(),
          createdAt
        );

        const result = await stmt.run();
        const id = result?.meta?.last_row_id ?? null;

        return jsonResponse({
          id,
          firstName: payload.firstName.trim(),
          lastName: payload.lastName.trim(),
          age: Number(payload.age),
          sex: payload.sex,
          nationality: payload.nationality.trim(),
          phone: payload.phone.trim(),
          createdAt
        }, 201);
      }

      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    if (url.pathname.startsWith("/entries/")) {
      if (request.method === "DELETE") {
        const id = Number(url.pathname.split("/").pop());
        if (!Number.isInteger(id) || id <= 0) return badRequest("Invalid entry id.");

        const result = await env.DB.prepare(
          "DELETE FROM entries WHERE id = ?"
        ).bind(id).run();

        if (!result?.meta?.changes) {
          return jsonResponse({ error: "Entry not found." }, 404);
        }

        return jsonResponse({ ok: true, id });
      }

      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
