// Shared helpers for edge functions called from the public website.

// The site is a static export on another origin, so browser calls need CORS.
// Access is still controlled by the database functions, not by origin.
export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
    return typeof value === "string" && UUID.test(value);
}

// Answers the CORS preflight and reads the JSON body of a POST. Returns the
// response to send instead when the request isn't a POST with a JSON object.
export async function readPost(req: Request): Promise<Record<string, unknown> | Response> {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" }, 405);
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
        return json({ error: "Invalid request.", code: "BAD_REQUEST" }, 400);
    }
    return body;
}

export function requireEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) {
        throw new Error(`Missing environment variable ${name}`);
    }
    return value;
}
