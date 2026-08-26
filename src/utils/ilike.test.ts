import { escapeIlikePattern } from "./ilike";

describe("escapeIlikePattern", () => {
    test("leaves ordinary text unchanged", () => {
        expect(escapeIlikePattern("open studio")).toBe("open studio");
    });

    test("escapes SQL and PostgREST wildcards", () => {
        expect(escapeIlikePattern("%")).toBe("\\%");
        expect(escapeIlikePattern("*")).toBe("\\*");
        expect(escapeIlikePattern("_")).toBe("\\_");
        expect(escapeIlikePattern("a%b_c*d")).toBe("a\\%b\\_c\\*d");
    });

    test("escapes backslashes so they are not themselves escape chars", () => {
        expect(escapeIlikePattern("\\")).toBe("\\\\");
        expect(escapeIlikePattern("\\%")).toBe("\\\\\\%");
    });
});
