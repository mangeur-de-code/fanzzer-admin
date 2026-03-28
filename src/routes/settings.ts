/**
 * admin-service/src/routes/settings.ts
 *
 * GET  /api/v1/admin/settings — Load platform settings from D1
 * POST /api/v1/admin/settings — Save / update platform settings
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const settingsRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

const DEFAULT_SETTINGS = {
  siteName: "nfluencer",
  maintenanceMode: false,
  enableSignups: true,
  creatorVerificationRequired: false,
  maxUploadSize: 5000,
  platformFeePercentage: 10,
};

settingsRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  try {
    const rows = await c.env.DB
      .prepare("SELECT key, value FROM platform_settings")
      .all<{ key: string; value: string }>();

    const map: Record<string, string> = {};
    for (const row of (rows.results ?? [])) {
      map[row.key] = row.value;
    }

    const settings = {
      siteName: map.siteName ?? DEFAULT_SETTINGS.siteName,
      maintenanceMode: map.maintenanceMode === "1",
      enableSignups: map.enableSignups !== "0",
      creatorVerificationRequired: map.creatorVerificationRequired === "1",
      maxUploadSize: map.maxUploadSize ? Number(map.maxUploadSize) : DEFAULT_SETTINGS.maxUploadSize,
      platformFeePercentage: map.platformFeePercentage ? Number(map.platformFeePercentage) : DEFAULT_SETTINGS.platformFeePercentage,
    };

    return corsJson(c, { settings });
  } catch {
    return corsJson(c, { settings: DEFAULT_SETTINGS });
  }
});

settingsRoute.post("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);
  const { user } = auth;

  try {
    const body = await c.req.json<Partial<typeof DEFAULT_SETTINGS>>();

    const settings = {
      siteName: String(body.siteName ?? DEFAULT_SETTINGS.siteName),
      maintenanceMode: Boolean(body.maintenanceMode ?? DEFAULT_SETTINGS.maintenanceMode),
      enableSignups: Boolean(body.enableSignups ?? DEFAULT_SETTINGS.enableSignups),
      creatorVerificationRequired: Boolean(body.creatorVerificationRequired ?? DEFAULT_SETTINGS.creatorVerificationRequired),
      maxUploadSize: Number(body.maxUploadSize ?? DEFAULT_SETTINGS.maxUploadSize),
      platformFeePercentage: Number(body.platformFeePercentage ?? DEFAULT_SETTINGS.platformFeePercentage),
    };

    const upsert = async (key: string, value: string) => {
      await c.env.DB
        .prepare(
          `INSERT INTO platform_settings (key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
        )
        .bind(key, value)
        .run();
    };

    await Promise.all([
      upsert("siteName", settings.siteName),
      upsert("maintenanceMode", settings.maintenanceMode ? "1" : "0"),
      upsert("enableSignups", settings.enableSignups ? "1" : "0"),
      upsert("creatorVerificationRequired", settings.creatorVerificationRequired ? "1" : "0"),
      upsert("maxUploadSize", String(settings.maxUploadSize)),
      upsert("platformFeePercentage", String(settings.platformFeePercentage)),
    ]);

    await c.env.DB
      .prepare(
        `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, created_at)
         VALUES (?, 'settings_updated', 'platform', 0, ?, CURRENT_TIMESTAMP)`
      )
      .bind(user.id, JSON.stringify(settings))
      .run();

    return corsJson(c, { success: true, settings });
  } catch (error) {
    console.error("[settings] Error:", error);
    return corsJson(c, { error: "Failed to save settings" }, 500);
  }
});
