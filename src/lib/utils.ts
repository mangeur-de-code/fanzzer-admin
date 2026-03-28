/**
 * admin-service/src/lib/utils.ts
 *
 * Utility functions shared across all admin route handlers.
 * Adapted from app/lib/admin-api-utils.server.ts in the main app.
 */

import type { Context } from "hono";
import type { Env } from "../types";

export type DateRange = {
  start: string;
  end: string;
};

const toDateString = (date: Date) => date.toISOString().split("T")[0];

const DEV_ORIGINS = ["http://localhost:5175", "http://localhost:5174"];

/**
 * Resolve a safe CORS origin from the incoming Request.
 * Returns the request Origin only if it matches the allowlist, otherwise null.
 */
export function resolveCorsOrigin(request: Request, env: Env): string | null {
  const envOrigins = env.ADMIN_ALLOWED_ORIGINS
    ? env.ADMIN_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : [];

  const dashboardOrigin = env.DASHBOARD_ORIGIN;
  const extraOrigins = dashboardOrigin ? [dashboardOrigin] : [];

  const devAllowed = env.ENVIRONMENT === "production" ? [] : DEV_ORIGINS;
  const allowlist = [...devAllowed, ...envOrigins, ...extraOrigins];

  const origin = request.headers.get("Origin");
  if (origin && allowlist.includes(origin)) {
    return origin;
  }
  return null;
}

/**
 * Apply CORS headers to a Hono response.
 * Only sets Allow-Origin when the request origin is in the allowlist.
 */
export function applyCorsHeaders<E extends { Bindings: Env }>(c: Context<E>, headers: Record<string, string> = {}): void {
  const allowedOrigin = resolveCorsOrigin(c.req.raw, c.env);

  headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE";
  headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";

  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  for (const [key, value] of Object.entries(headers)) {
    c.header(key, value);
  }
}

/**
 * Return a JSON response with CORS headers.
 */
export function corsJson<E extends { Bindings: Env }, T extends Record<string, unknown>>(
  c: Context<E>,
  body: T,
  status: 200 | 201 | 400 | 401 | 403 | 404 | 405 | 500 = 200
): Response {
  applyCorsHeaders(c);
  return c.json(body, status);
}

/** Build date range from query params or fallback to last N days */
export function getDateRange(request: Request, fallbackDays = 30): DateRange {
  const url = new URL(request.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");

  if (startParam && endParam) {
    return { start: startParam, end: endParam };
  }

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - fallbackDays + 1);

  return {
    start: toDateString(startDate),
    end: toDateString(endDate),
  };
}

/** Safe wrapper for D1 `.first()` — returns null on error */
export async function safeFirst<T>(
  db: D1Database,
  sql: string,
  binds: Array<string | number | null> = []
): Promise<T | null> {
  try {
    const result = await db.prepare(sql).bind(...binds).first<T>();
    return (result ?? null) as T | null;
  } catch (error) {
    console.error("Admin API query failed:", error);
    return null;
  }
}

/** Safe wrapper for D1 `.all()` — returns [] on error */
export async function safeAll<T>(
  db: D1Database,
  sql: string,
  binds: Array<string | number | null> = []
): Promise<T[]> {
  try {
    const result = await db.prepare(sql).bind(...binds).all<T>();
    return (result?.results || []) as T[];
  } catch (error) {
    console.error("Admin API query failed:", error);
    return [];
  }
}

/** Safely parse a number from an unknown value */
export function getNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** Send an email via Resend API */
export async function sendEmail(
  opts: { to: string; subject: string; html: string },
  apiKey: string
): Promise<{ success: boolean; messageId?: string }> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "nfluencer <noreply@nfluencer.co>",
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });

    if (!resp.ok) {
      console.error("[email] Resend error:", await resp.text());
      return { success: false };
    }

    const data = await resp.json<{ id?: string }>();
    return { success: true, messageId: data.id };
  } catch (err) {
    console.error("[email] Failed to send:", err);
    return { success: false };
  }
}
