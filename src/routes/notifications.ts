/**
 * admin-service/src/routes/notifications.ts
 *
 * GET /api/v1/admin/notifications
 * Returns admin notification counts and a list of actionable items.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, safeAll, safeFirst, getNumber } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const notificationsRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

function toISO(dt: string | null | undefined): string {
  if (!dt) return new Date().toISOString();
  if (dt.includes("T")) return dt;
  return dt.replace(" ", "T") + "Z";
}

notificationsRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const db = c.env.DB;

  const [openReportsRow, pendingVerificationsRow, pendingPayoutsRow, pendingPayoutAmountRow] = await Promise.all([
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM content_flags WHERE status IN ('pending', 'reviewing')"),
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM kyc_verifications WHERE status IN ('pending', 'processing')"),
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM payout_transactions WHERE status IN ('pending', 'processing')"),
    safeFirst<{ value: number }>(db, "SELECT COALESCE(SUM(payout_amount), 0) as value FROM payout_transactions WHERE status IN ('pending', 'processing')"),
  ]);

  const [recentReports, recentVerifications] = await Promise.all([
    safeAll<{ id: number; reason: string; severity: string; created_at: string; reporter_username: string }>(
      db,
      `SELECT cf.id, cf.reason, cf.severity, cf.created_at,
              COALESCE(ru.username, ru.display_name, 'Unknown') as reporter_username
       FROM content_flags cf
       LEFT JOIN users ru ON cf.reporter_user_id = ru.id
       WHERE cf.status IN ('pending', 'reviewing')
       ORDER BY cf.created_at DESC
       LIMIT 5`
    ),
    safeAll<{ id: number; user_id: number; verification_type: string; created_at: string; display_name: string }>(
      db,
      `SELECT kv.id, kv.user_id, kv.verification_type, kv.created_at,
              COALESCE(u.display_name, u.username, u.email, 'Unknown') as display_name
       FROM kyc_verifications kv
       LEFT JOIN users u ON kv.user_id = u.id
       WHERE kv.status IN ('pending', 'processing')
       ORDER BY kv.created_at DESC
       LIMIT 3`
    ),
  ]);

  type Notification = {
    id: string;
    type: "report" | "verification" | "payout";
    title: string;
    body: string;
    createdAt: string;
    href: string;
  };

  const notifications: Notification[] = [
    ...recentReports.map((r) => ({
      id: `report-${r.id}`,
      type: "report" as const,
      title: "Content report",
      body: `${r.reporter_username}: ${r.reason || "Reported content"}`,
      createdAt: toISO(r.created_at),
      href: "/moderation",
    })),
    ...recentVerifications.map((v) => ({
      id: `verification-${v.id}`,
      type: "verification" as const,
      title: "Creator verification request",
      body: `${v.display_name} is awaiting ${v.verification_type} verification`,
      createdAt: toISO(v.created_at),
      href: "/creators",
    })),
  ];

  notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const openReports = getNumber(openReportsRow?.value);
  const pendingVerifications = getNumber(pendingVerificationsRow?.value);
  const pendingPayouts = getNumber(pendingPayoutsRow?.value);

  return corsJson(c, {
    counts: {
      openReports,
      pendingVerifications,
      pendingPayouts,
      pendingPayoutAmount: getNumber(pendingPayoutAmountRow?.value),
    },
    hasAlerts: openReports > 0 || pendingVerifications > 0 || pendingPayouts > 0,
    notifications: notifications.slice(0, 8),
  });
});
