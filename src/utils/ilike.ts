/**
 * Escape user input so `contains` (DAO: ilike `%value%`) matches it literally.
 * `%` and `_` are SQL LIKE wildcards. `*` is PostgREST's alias for `%`.
 */
export function escapeIlikePattern(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_")
        .replace(/\*/g, "\\*");
}
