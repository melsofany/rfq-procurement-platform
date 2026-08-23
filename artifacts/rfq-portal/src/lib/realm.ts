/**
 * App realm + cross-origin API access.
 *
 * The same SPA bundle is deployed twice:
 *  - the customer portal  (VITE_APP_REALM=portal)
 *  - the admin console    (VITE_APP_REALM=admin) — superadmin/support only
 *
 * Both are static sites on separate origins from the API. Because
 * onrender.com is on the Public Suffix List, the API session cookie counts as
 * a blocked third-party cookie — so cross-origin deployments authenticate with
 * the session id as a bearer token (stored here after login) instead.
 */

export const APP_REALM: "admin" | "portal" =
  import.meta.env.VITE_APP_REALM === "admin" ? "admin" : "portal";

/** Absolute API origin for cross-origin deployments; "" = same-origin. */
export const API_BASE: string = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

const SID_KEY = "rfq.sid";

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SID_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(SID_KEY, token);
    else localStorage.removeItem(SID_KEY);
  } catch {
    // storage unavailable (private mode) — session simply won't persist
  }
}

/** Rewrite an "/api/..." path to the API origin when cross-origin. */
export function apiUrl(path: string): string {
  return API_BASE && path.startsWith("/api") ? `${API_BASE}${path}` : path;
}

/**
 * EventSource cannot set headers, so the session token travels as a query
 * param instead (the API's bearer-session middleware accepts `?sid=`).
 */
export function sseUrl(path: string): string {
  const url = apiUrl(path);
  const sid = getSessionToken();
  if (!sid) return url;
  return `${url}${url.includes("?") ? "&" : "?"}sid=${encodeURIComponent(sid)}`;
}

/**
 * Install a fetch wrapper that routes every "/api/..." call to the API origin
 * (when cross-origin) and attaches the bearer token + realm header. Covers the
 * generated orval client AND the many direct fetch("/api/...") call sites.
 */
export function installApiFetchBridge(): void {
  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith("/api")) return origFetch(input, init);

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set("x-app-realm", APP_REALM);
    const sid = getSessionToken();
    if (sid) headers.set("Authorization", `Bearer ${sid}`);

    return origFetch(`${API_BASE}${url}`, { ...init, headers, credentials: "include" });
  };
}
