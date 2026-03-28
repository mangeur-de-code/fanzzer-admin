/**
 * admin-service/src/routes/overview.ts
 *
 * GET /api/v1/admin/overview
 * Returns platform KPIs, revenue trends, user growth, and content mix.
 * Stream analytics from Cloudflare GraphQL are skipped in this microservice
 * (they require the CLOUDFLARE_ANALYTICS_API_TOKEN secret which is optional).
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, getDateRange, safeAll, safeFirst, getNumber } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const overviewRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

overviewRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const range = getDateRange(c.req.raw, 30);
  const db = c.env.DB;

  const [
    totalUsersRow, newUsersRow, activeUsers7dRow, activeUsers30dRow,
    activeCreatorsRow, activeSubscribersRow, mrrRow, netRevenueRow,
    pendingPayoutsRow, openReportsRow, flaggedContentRow, liveStreamsRow,
  ] = await Promise.all([
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM users"),
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM users WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?)", [range.start, range.end]),
    safeFirst<{ value: number }>(db, `SELECT COUNT(DISTINCT user_id) as value FROM (SELECT sender_id as user_id FROM messages WHERE created_at >= datetime('now', '-7 days') UNION SELECT receiver_id as user_id FROM messages WHERE created_at >= datetime('now', '-7 days') UNION SELECT creator_id as user_id FROM content WHERE created_at >= datetime('now', '-7 days') UNION SELECT viewer_id as user_id FROM stream_views WHERE joined_at >= datetime('now', '-7 days') AND viewer_id IS NOT NULL)`),
    safeFirst<{ value: number }>(db, `SELECT COUNT(DISTINCT user_id) as value FROM (SELECT sender_id as user_id FROM messages WHERE created_at >= datetime('now', '-30 days') UNION SELECT receiver_id as user_id FROM messages WHERE created_at >= datetime('now', '-30 days') UNION SELECT creator_id as user_id FROM content WHERE created_at >= datetime('now', '-30 days') UNION SELECT viewer_id as user_id FROM stream_views WHERE joined_at >= datetime('now', '-30 days') AND viewer_id IS NOT NULL)`),
    safeFirst<{ value: number }>(db, `SELECT COUNT(DISTINCT creator_id) as value FROM (SELECT creator_id FROM content WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?) UNION SELECT creator_id FROM live_streams WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?))`, [range.start, range.end, range.start, range.end]),
    safeFirst<{ value: number }>(db, "SELECT COUNT(DISTINCT fan_id) as value FROM subscriptions WHERE status = 'active' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)"),
    safeFirst<{ value: number }>(db, "SELECT COALESCE(SUM(amount), 0) as value FROM subscriptions WHERE status = 'active' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)"),
    safeFirst<{ value: number }>(db, "SELECT COALESCE(SUM(net_amount), 0) as value FROM earnings_transactions WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?)", [range.start, range.end]),
    safeFirst<{ value: number }>(db, "SELECT COALESCE(SUM(payout_amount), 0) as value FROM payout_transactions WHERE status IN ('pending', 'processing')"),
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM reports WHERE status = 'pending'"),
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM content_flags WHERE status IN ('pending', 'reviewing')"),
    safeFirst<{ value: number }>(db, "SELECT COUNT(*) as value FROM live_streams WHERE status = 'live'"),
  ]);

  const [userGrowth, revenueTrend, churnTrend, contentMix] = await Promise.all([
    safeAll<{ date: string; count: number }>(db, `SELECT DATE(created_at) as date, COUNT(*) as count FROM users WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?) GROUP BY DATE(created_at) ORDER BY date ASC`, [range.start, range.end]),
    safeAll<{ date: string; amount: number }>(db, `SELECT DATE(created_at) as date, COALESCE(SUM(amount), 0) as amount FROM earnings_transactions WHERE transaction_type IN ('subscription', 'tip', 'ppv') AND DATE(created_at) BETWEEN DATE(?) AND DATE(?) GROUP BY DATE(created_at) ORDER BY date ASC`, [range.start, range.end]),
    safeAll<{ date: string; value: number }>(db, `SELECT DATE(cancelled_at) as date, COUNT(*) as value FROM subscriptions WHERE cancelled_at IS NOT NULL AND DATE(cancelled_at) BETWEEN DATE(?) AND DATE(?) GROUP BY DATE(cancelled_at) ORDER BY date ASC`, [range.start, range.end]),
    safeAll<{ label: string; value: number }>(db, `SELECT type as label, COUNT(*) as value FROM content WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?) GROUP BY type`, [range.start, range.end]),
  ]);

  return corsJson(c, {
    range,
    kpis: {
      totalUsers: getNumber(totalUsersRow?.value),
      newUsers: getNumber(newUsersRow?.value),
      activeUsers7d: getNumber(activeUsers7dRow?.value),
      activeUsers30d: getNumber(activeUsers30dRow?.value),
      activeCreators: getNumber(activeCreatorsRow?.value),
      activeSubscribers: getNumber(activeSubscribersRow?.value),
      mrr: getNumber(mrrRow?.value),
      netRevenue: getNumber(netRevenueRow?.value),
      pendingPayouts: getNumber(pendingPayoutsRow?.value),
      openReports: getNumber(openReportsRow?.value),
      flaggedContent: getNumber(flaggedContentRow?.value),
      liveStreams: getNumber(liveStreamsRow?.value),
    },
    series: {
      userGrowth,
      revenue: revenueTrend,
      churn: churnTrend,
      contentMix,
    },
    analytics: {
      totalMinutesViewed: 0,
      topCountries: [],
      analyticsByDate: [],
      topVideos: [],
      topCreators: [],
    },
  });
});
