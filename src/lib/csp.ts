/**
 * The one Content-Security-Policy for every route (docs/features/snap-incognito.md §9): nothing loads from, and nothing
 * is sent to, another origin. Next emits inline scripts, so `'unsafe-inline'` stays in `script-src`; development adds
 * `'unsafe-eval'`, which React's debugging needs. `next.config.ts` sets the string as a header; if a page breaks under
 * it, the page is fixed, never the policy.
 */
export function contentSecurityPolicy(dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}
