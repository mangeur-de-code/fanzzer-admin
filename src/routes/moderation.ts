/**
 * admin-service/src/routes/moderation.ts
 *
 * GET /api/v1/admin/moderation
 * Returns moderation dashboard metrics: open reports, flagged content, etc.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, getDateRange, safeAll, safeFirst, getNumber } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const moderationRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

moderationRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const range = getDateRange(c.req.raw, 30);
  const db = c.env.DB;

  const [openReportsRow, resolveTimeRow, flaggedContentRow, autoActionsRow,
    pendingVerificationsRow, activeSuspensionsRow, openAppealsRow] = await Promise.all([
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM content_flags WHERE status IN ('pending', 'reviewing')"),
    safeFirst<{ value: number }>(db, `SELECT COALESCE(AVG((julianday(updated_at) - julianday(created_at)) * 24), 0) as value FROM content_flags WHERE status IN ('dismissed', 'approved', 'removed') AND DATE(updated_at) BETWEEN DATE(?) AND DATE(?)`, [range.start, range.end]),
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM content_flags"),
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM moderation_rules WHERE is_active = 1"),
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM user_verifications WHERE status IN ('pending', 'submitted')"),
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM user_suspensions WHERE is_active = 1"),
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM creator_appeals WHERE status IN ('pending', 'under_review')"),
  ]);

  const recentReports = await safeAll<{
    id: number;
    reason: string;
    status: string;
    created_at: string;
    rule_name: string | null;
    severity: string;
  }>(
    db,
    `
    SELECT cf.id, cf.reason, cf.status, cf.created_at, cf.severity, mr.name as rule_name
    FROM content_flags cf
    LEFT JOIN moderation_rules mr ON cf.rule_id = mr.id
    ORDER BY cf.created_at DESC
    LIMIT 10
    `
  );

  const systemFlaggedContent = await safeAll<{
    id: number;
    content_id: number;
    content_type: string;
    reason: string;
    severity: string;
    status: string;
    created_at: string;
  }>(
    db,
    `
    SELECT cf.id, cf.content_id, cf.content_type, cf.reason, cf.severity, cf.status, cf.created_at
    FROM content_flags cf
    WHERE cf.flagged_by = 'system' AND cf.status IN ('pending', 'reviewing')
    ORDER BY cf.created_at DESC
    LIMIT 50
    `
  );

  return corsJson(c, {
    range,
    metrics: {
      openReports: getNumber(openReportsRow?.value),
      timeToResolveHours: Number(getNumber(resolveTimeRow?.value).toFixed(1)),
      flaggedContent: getNumber(flaggedContentRow?.value),
      autoActions: getNumber(autoActionsRow?.value),
      pendingVerifications: getNumber(pendingVerificationsRow?.value),
      activeSuspensions: getNumber(activeSuspensionsRow?.value),
      openAppeals: getNumber(openAppealsRow?.value),
    },
    recentReports: recentReports.map((report) => ({
      id: report.id,
      subject: report.reason || report.rule_name || `Flag #${report.id}`,
      status: report.status || "open",
      createdAt: report.created_at,
      severity: report.severity,
    })),
    systemFlaggedContent: systemFlaggedContent.map((flag) => ({
      id: flag.id,
      contentId: flag.content_id,
      contentType: flag.content_type,
      reason: flag.reason,
      severity: flag.severity,
      status: flag.status,
      createdAt: flag.created_at,
    })),
  });
});
