// Helpers for the edge function tests (npm run test:functions). The tests run
// in Node under Vitest, with Stripe and the database client replaced by fakes.

import { vi } from "vitest";

type Handler = (req: Request) => Promise<Response>;

/**
 * Loads a function's index.ts and returns the handler it gave to Deno.serve.
 * `env` is what Deno.env.get will return.
 */
export async function loadFunction(load: () => Promise<unknown>, env: Record<string, string> = {}): Promise<Handler> {
    let handler: Handler | undefined;
    vi.stubGlobal("Deno", {
        env: { get: (name: string) => env[name] },
        serve: (h: Handler) => {
            handler = h;
        },
    });
    await load();
    if (!handler) throw new Error("The function never called Deno.serve");
    return handler;
}

export function post(body: unknown): Request {
    return new Request("http://localhost/functions/v1/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

/**
 * Stands in for a supabase-js query. Every filter returns the same object, and
 * awaiting it (or its maybeSingle) gives `result`.
 */
export function fakeQuery(result: { data: unknown; error: unknown }) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "update", "eq", "is"]) {
        query[method] = vi.fn(() => query);
    }
    query.maybeSingle = vi.fn(async () => result);
    query.then = (resolve: (value: typeof result) => unknown) => resolve(result);
    return query as Record<"select" | "update" | "eq" | "is" | "maybeSingle", ReturnType<typeof vi.fn>>;
}
