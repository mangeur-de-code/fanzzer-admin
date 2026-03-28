// Hono route handler for /api/v1/admin/streams
// Returns live stream metrics including active streams, peak viewers, watch time, and per-day series.

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, getDateRange, safeAll, safeFirst, getNumber } from "../lib/utils";

type Variables = { adminUser: AdminUser };
export const streamsRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

streamsRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const range = getDateRange(c.req.raw, 30);
  const db = c.env.DB;

  const liveNowRow = await safeFirst<{ value: number }>(
    db,
    "SELECT COUNT(*) as value FROM live_streams WHERE status = 'live'"
  );

  const peakViewersRow = await safeFirst<{ value: number }>(
    db,
    `SELECT COALESCE(MAX(viewer_count), 0) as value
     FROM live_streams
     WHERE started_at >= datetime('now', '-1 day')`
  );

  const watchTimeRow = await safeFirst<{ value: number }>(
    db,
    `SELECT COALESCE(SUM(watch_duration_seconds), 0) as value
     FROM stream_views
     WHERE DATE(joined_at) BETWEEN DATE(?) AND DATE(?)`,
    [range.start, range.end]
  );

  const avgSessionRow = await safeFirst<{ value: number }>(
    db,
    `SELECT COALESCE(AVG(watch_duration_seconds), 0) as value
     FROM stream_views
     WHERE DATE(joined_at) BETWEEN DATE(?) AND DATE(?)`,
    [range.start, range.end]
  );

  const errorRow = await safeFirst<{ value: number }>(
    db,
    `SELECT COUNT(*) as value
     FROM live_streams
     WHERE status = 'error'
       AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)`,
    [range.start, range.end]
  );

  const chatRow = await safeFirst<{ value: number }>(
    db,
    `SELECT COUNT(*) as value
     FROM stream_chat
     WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?)`,
    [range.start, range.end]
  );

  const viewersByDay = await safeAll<{ date: string; viewers: number }>(
    db,
    `SELECT DATE(joined_at) as date, COUNT(DISTINCT viewer_id) as viewers
     FROM stream_views
     WHERE DATE(joined_at) BETWEEN DATE(?) AND DATE(?)
     GROUP BY DATE(joined_at)
     ORDER BY date ASC`,
    [range.start, range.end]
  );

  const watchTimeByDay = await safeAll<{ date: string; minutes: number }>(
    db,
    `SELECT DATE(joined_at) as date, COALESCE(SUM(watch_duration_seconds), 0) / 60 as minutes
     FROM stream_views
     WHERE DATE(joined_at) BETWEEN DATE(?) AND DATE(?)
     GROUP BY DATE(joined_at)
     ORDER BY date ASC`,
    [range.start, range.end]
  );

  return corsJson(c, {
    range,
    metrics: {
      liveNow: getNumber(liveNowRow?.value),
      peakViewers: getNumber(peakViewersRow?.value),
      totalWatchTime: Math.round(getNumber(watchTimeRow?.value) / 60),
      avgSessionDuration: Math.round(getNumber(avgSessionRow?.value) / 60),
      streamErrors: getNumber(errorRow?.value),
      chatMessages: getNumber(chatRow?.value),
    },
    series: {
      viewersByDay,
      watchTimeByDay,
    },
  });
});
