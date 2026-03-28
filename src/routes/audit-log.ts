/**
 * admin-service/src/routes/audit-log.ts
 *
 * GET /api/v1/admin/audit-log
 * Returns a paginated list of audit log entries within a date range.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, getDateRange, safeAll } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const auditLogRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

auditLogRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const range = getDateRange(c.req.raw, 30);

  const entries = await safeAll<{
    id: number;
    admin: string;
    action: string;
    target: string;
    details: string | null;
    created_at: string;
  }>(
    c.env.DB,
    `
    SELECT 
      al.id,
      COALESCE(u.display_name, u.username, u.email) as admin,
      al.action,
      COALESCE(al.target_username, al.target_type) as target,
      al.details,
      al.created_at
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.admin_id
    WHERE DATE(al.created_at) BETWEEN DATE(?) AND DATE(?)
    ORDER BY al.created_at DESC
    LIMIT 100
    `,
    [range.start, range.end]
  );

  return corsJson(c, { range, entries });
});
