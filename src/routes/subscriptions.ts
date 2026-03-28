// Hono route handler for /api/v1/admin/subscriptions
// Returns subscription metrics: active, new, cancelled, churn rate, ARPU, LTV, and per-day series.

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, getDateRange, safeAll, safeFirst, getNumber } from "../lib/utils";

type Variables = { adminUser: AdminUser };
export const subscriptionsRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

subscriptionsRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const range = getDateRange(c.req.raw, 30);
  const db = c.env.DB;

  const activeSubscriptionsRow = await safeFirst<{ value: number }>(
    db,
    `SELECT COUNT(*) as value
     FROM subscriptions
     WHERE status = 'active'
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`
  );

  const newSubscriptionsRow = await safeFirst<{ value: number }>(
    db,
    `SELECT COUNT(*) as value
     FROM subscriptions
     WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?)`,
    [range.start, range.end]
  );

  const cancelledSubscriptionsRow = await safeFirst<{ value: number }>(
    db,
    `SELECT COUNT(*) as value
     FROM subscriptions
     WHERE cancelled_at IS NOT NULL
       AND DATE(cancelled_at) BETWEEN DATE(?) AND DATE(?)`,
    [range.start, range.end]
  );

  const activeAtStartRow = await safeFirst<{ value: number }>(
    db,
    `SELECT COUNT(*) as value
     FROM subscriptions
     WHERE created_at <= datetime(?)
       AND (cancelled_at IS NULL OR cancelled_at >= datetime(?))`,
    [`${range.start} 23:59:59`, `${range.start} 00:00:00`]
  );

  const revenueRow = await safeFirst<{ value: number }>(
    db,
    `SELECT COALESCE(SUM(amount), 0) as value
     FROM earnings_transactions
     WHERE transaction_type = 'subscription'
       AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)`,
    [range.start, range.end]
  );

  const churnRate = (() => {
    const cancelled = getNumber(cancelledSubscriptionsRow?.value);
    const activeStart = getNumber(activeAtStartRow?.value);
    if (!activeStart) return 0;
    return (cancelled / activeStart) * 100;
  })();

  const activeSubscriptions = getNumber(activeSubscriptionsRow?.value);
  const arpu = activeSubscriptions ? getNumber(revenueRow?.value) / activeSubscriptions : 0;
  const ltv = churnRate > 0 ? arpu / (churnRate / 100) : 0;

  const newByDay = await safeAll<{ date: string; value: number }>(
    db,
    `SELECT DATE(created_at) as date, COUNT(*) as value
     FROM subscriptions
     WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?)
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [range.start, range.end]
  );

  const churnByDay = await safeAll<{ date: string; value: number }>(
    db,
    `SELECT DATE(cancelled_at) as date, COUNT(*) as value
     FROM subscriptions
     WHERE cancelled_at IS NOT NULL
       AND DATE(cancelled_at) BETWEEN DATE(?) AND DATE(?)
     GROUP BY DATE(cancelled_at)
     ORDER BY date ASC`,
    [range.start, range.end]
  );

  return corsJson(c, {
    range,
    metrics: {
      activeSubscriptions,
      newSubscriptions: getNumber(newSubscriptionsRow?.value),
      cancelledSubscriptions: getNumber(cancelledSubscriptionsRow?.value),
      churnRate,
      arpu,
      ltv,
    },
    series: {
      newByDay,
      churnByDay,
    },
  });
});
