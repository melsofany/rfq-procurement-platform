import type { NextFunction, Request, Response } from "express";
import type session from "express-session";

// ── Bearer-token sessions ──────────────────────────────────────────────────
// The customer portal and the admin console are separate static sites on
// different origins from the API. onrender.com is on the Public Suffix List,
// so the session cookie is a blocked third-party cookie in modern browsers.
// Instead, the SPA stores the session id (returned by /auth/login as `token`)
// and sends it as `Authorization: Bearer <sid>` (or `?sid=` for EventSource,
// which cannot set headers). This middleware loads that session from the same
// store express-session uses, so both auth styles share one session pool.

let sessionStore: session.Store | null = null;

/** Called once from app.ts after the session store is created. */
export function registerSessionStore(store: session.Store | undefined): void {
  sessionStore = store ?? null;
}

function extractSessionId(req: Request): string | null {
  const auth = req.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token) return token;
  }
  const querySid = (req.query as Record<string, unknown> | undefined)?.sid;
  if (typeof querySid === "string" && querySid) return querySid;
  return null;
}

export function bearerSession(req: Request, _res: Response, next: NextFunction): void {
  if (req.session?.employeeId || !sessionStore) {
    next();
    return;
  }
  const sid = extractSessionId(req);
  if (!sid) {
    next();
    return;
  }
  sessionStore.get(sid, (err, sess) => {
    if (!err && sess && typeof sess === "object" && (sess as { employeeId?: unknown }).employeeId) {
      Object.assign(req.session, sess);
    }
    next();
  });
}
