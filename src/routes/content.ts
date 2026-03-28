/**
 * admin-service/src/routes/content.ts
 *
 * GET /api/v1/admin/content
 * Returns content type distribution and top content by engagement.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, getDateRange, safeAll, getNumber } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const contentRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

contentRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const range = getDateRange(c.req.raw, 30);

  const mix = await safeAll<{ label: string; value: number }>(
    c.env.DB,
    `
    SELECT type as label, COUNT(*) as value
    FROM content
    WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?)
    GROUP BY type
    `,
    [range.start, range.end]
  );

  const topContent = await safeAll<{
    id: number;
    title: string;
    type: string;
    views: number;
    likes: number;
  }>(
    c.env.DB,
    `
    SELECT c.id, c.title, c.type,
           COALESCE(c.view_count, 0) as views,
           COUNT(l.id) as likes
    FROM content c
    LEFT JOIN likes l ON l.content_id = c.id
    GROUP BY c.id
    ORDER BY likes DESC
    LIMIT 10
    `
  );

  return corsJson(c, {
    range,
    mix,
    topContent: topContent.map((item) => ({
      title: item.title,
      type: item.type,
      views: getNumber(item.views),
      likes: getNumber(item.likes),
    })),
  });
});
