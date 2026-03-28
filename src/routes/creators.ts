/**
 * admin-service/src/routes/creators.ts
 *
 * GET  /api/v1/admin/creators       — List all creators with stats
 * POST /api/v1/admin/creators       — Override KYC status
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, getDateRange, safeAll, safeFirst, getNumber } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const creatorsRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

creatorsRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const range = getDateRange(c.req.raw, 30);

  const creators = await safeAll<{
    id: number;
    name: string;
    email: string;
    verified: number;
    kyc_status: string;
    is_adult_verified: number;
    stripe_connect_id: string | null;
    followers: number;
    subscribers: number;
    posts: number;
    tips: number;
    revenue: number;
  }>(
    c.env.DB,
    `
    SELECT 
      u.id,
      COALESCE(u.display_name, u.username, u.email) as name,
      u.email,
      COALESCE(u.verified, 0) as verified,
      COALESCE(u.kyc_status, 'none') as kyc_status,
      COALESCE(u.is_adult_verified, 0) as is_adult_verified,
      sca.stripe_connect_id,
      (SELECT COUNT(*) FROM followers f WHERE f.following_id = u.id) as followers,
      (SELECT COUNT(*) FROM subscriptions s WHERE s.creator_id = u.id AND s.status = 'active') as subscribers,
      (SELECT COUNT(*) FROM content c WHERE c.creator_id = u.id) as posts,
      (SELECT COALESCE(SUM(wl.amount), 0) FROM wallet_ledger wl JOIN wallets w ON wl.to_wallet_id = w.id WHERE w.user_id = u.id AND wl.type = 'TIP') as tips,
      (SELECT COALESCE(SUM(net_amount), 0) FROM earnings_transactions et WHERE et.creator_id = u.id AND et.transaction_type IN ('subscription', 'tip', 'ppv')) as revenue
    FROM users u
    LEFT JOIN stripe_connect_accounts sca ON sca.user_id = u.id
    WHERE u.is_creator_mode = 1 OR u.kyc_status = 'verified'
    ORDER BY u.created_at DESC
    LIMIT 200
    `
  );

  const creatorsWithActivity = await Promise.all(
    creators.map(async (creator) => {
      const lastActivityRow = await safeFirst<{ value: string }>(
        c.env.DB,
        `
        SELECT MAX(activity) as value FROM (
            SELECT MAX(created_at) as activity FROM content WHERE creator_id = ?
            UNION ALL
            SELECT MAX(started_at) as activity FROM live_streams WHERE creator_id = ?
        )
        `,
        [creator.id, creator.id]
      );

      return {
        id: creator.id,
        name: creator.name,
        email: creator.email,
        verified: Boolean(creator.verified),
        kycStatus: creator.kyc_status || "none",
        isAdultVerified: Boolean(creator.is_adult_verified),
        stripeConnectId: creator.stripe_connect_id || null,
        followers: getNumber(creator.followers),
        subscribers: getNumber(creator.subscribers),
        posts: getNumber(creator.posts),
        tips: getNumber(creator.tips),
        revenue: getNumber(creator.revenue),
        lastActivity: lastActivityRow?.value || null,
      };
    })
  );

  return corsJson(c, { range, creators: creatorsWithActivity });
});

creatorsRoute.post("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);
  const { user } = auth;

  const body = await c.req.json<{
    action?: string;
    userId?: number;
    kycStatus?: string;
  }>();

  if (body.action === "override_kyc" && body.userId && body.kycStatus) {
    const validStatuses = ["verified", "failed", "suspended", "none"];
    if (!validStatuses.includes(body.kycStatus)) {
      return corsJson(c, { error: "Invalid KYC status" }, 400);
    }

    const isVerified = body.kycStatus === "verified";
    await c.env.DB
      .prepare(
        `UPDATE users
         SET kyc_status = ?, verified = ?, is_adult_verified = ?, is_creator_mode = ?,
             kyc_verified_at = CASE WHEN ? = 'verified' THEN datetime('now') ELSE kyc_verified_at END,
             updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(body.kycStatus, isVerified ? 1 : 0, isVerified ? 1 : 0, isVerified ? 1 : 0, body.kycStatus, body.userId)
      .run();

    let kycVerifStatus = "pending";
    if (isVerified) kycVerifStatus = "verified";
    else if (body.kycStatus === "failed") kycVerifStatus = "failed";

    await c.env.DB
      .prepare(
        `INSERT INTO kyc_verifications (user_id, status, verification_type, failure_reason, created_at)
         VALUES (?, ?, 'age', ?, datetime('now'))
         ON CONFLICT(user_id, verification_type) DO UPDATE SET
           status = excluded.status,
           failure_reason = excluded.failure_reason,
           verified_at = CASE WHEN excluded.status = 'verified' THEN datetime('now') ELSE verified_at END`
      )
      .bind(body.userId, kycVerifStatus, `Admin override by user ${user.id}`)
      .run();

    return corsJson(c, { success: true, kycStatus: body.kycStatus });
  }

  return corsJson(c, { error: "Invalid action" }, 400);
});
