/**
 * admin-service/src/routes/revenue.ts
 *
 * GET /api/v1/admin/revenue
 * Returns revenue KPIs and daily revenue trend for the selected date range.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, getDateRange, safeAll, safeFirst, getNumber } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const revenueRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

revenueRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const range = getDateRange(c.req.raw, 30);
  const db = c.env.DB;

  const [grossRow, feesRow, netRow, refundsRow, pendingRow, processingRow, completedRow] = await Promise.all([
    safeFirst<{ value: number }>(db, "SELECT COALESCE(SUM(amount), 0) as value FROM earnings_transactions WHERE transaction_type IN ('subscription', 'tip', 'ppv') AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)", [range.start, range.end]),
    safeFirst<{ value: number }>(db, "SELECT COALESCE(SUM(platform_fee), 0) as value FROM earnings_transactions WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?)", [range.start, range.end]),
    safeFirst<{ value: number }>(db, "SELECT COALESCE(SUM(net_amount), 0) as value FROM earnings_transactions WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?)", [range.start, range.end]),
    safeFirst<{ value: number }>(db, "SELECT COALESCE(SUM(amount), 0) as value FROM earnings_transactions WHERE transaction_type = 'refund' AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)", [range.start, range.end]),
    safeFirst<{ value: number }>(db, "SELECT COALESCE(SUM(payout_amount), 0) as value FROM payout_transactions WHERE status = 'pending'"),
    safeFirst<{ value: number }>(db, "SELECT COALESCE(SUM(payout_amount), 0) as value FROM payout_transactions WHERE status = 'processing'"),
    safeFirst<{ value: number }>(db, "SELECT COALESCE(SUM(payout_amount), 0) as value FROM payout_transactions WHERE status = 'completed'"),
  ]);

  const revenueByDay = await safeAll<{ date: string; amount: number }>(
    db,
    `SELECT DATE(created_at) as date, COALESCE(SUM(amount), 0) as amount
     FROM earnings_transactions
     WHERE transaction_type IN ('subscription', 'tip', 'ppv')
       AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [range.start, range.end]
  );

  return corsJson(c, {
    range,
    metrics: {
      grossRevenue: getNumber(grossRow?.value),
      platformFees: getNumber(feesRow?.value),
      netEarnings: getNumber(netRow?.value),
      payoutsPending: getNumber(pendingRow?.value),
      payoutsProcessing: getNumber(processingRow?.value),
      payoutsCompleted: getNumber(completedRow?.value),
      refunds: getNumber(refundsRow?.value),
    },
    series: { revenueByDay },
  });
});
