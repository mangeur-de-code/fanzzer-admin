// Hono route handler for /api/v1/admin/system
// Returns system health metrics: email failures, webhook failures, open chargebacks, open compliance requests.

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, getDateRange, safeFirst, getNumber } from "../lib/utils";

type Variables = { adminUser: AdminUser };
export const systemRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

systemRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const range = getDateRange(c.req.raw, 30);
  const db = c.env.DB;

  const emailFailuresRow = await safeFirst<{ value: number }>(
    db,
    `SELECT COUNT(*) as value
     FROM email_logs
     WHERE status IN ('failed', 'bounced')
       AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)`,
    [range.start, range.end]
  );

  const webhookFailuresRow = await safeFirst<{ value: number }>(
    db,
    `SELECT COUNT(*) as value
     FROM stripe_subscriptions
     WHERE status IN ('past_due', 'unpaid')
       AND DATE(updated_at) BETWEEN DATE(?) AND DATE(?)`,
    [range.start, range.end]
  );

  const openChargebacksRow = await safeFirst<{ value: number }>(
    db,
    "SELECT COUNT(*) as value FROM payment_chargebacks WHERE status = 'pending'"
  );

  const openComplianceRow = await safeFirst<{ value: number }>(
    db,
    "SELECT COUNT(*) as value FROM compliance_requests WHERE status IN ('pending', 'processing')"
  );

  return corsJson(c, {
    range,
    metrics: {
      apiErrorRate: 0,
      webhookFailures: getNumber(webhookFailuresRow?.value),
      workerLatencyMs: 0,
      dbLatencyP95Ms: 0,
      jobFailures: 0,
      emailFailures: getNumber(emailFailuresRow?.value),
      openChargebacks: getNumber(openChargebacksRow?.value),
      openComplianceRequests: getNumber(openComplianceRow?.value),
    },
  });
});
