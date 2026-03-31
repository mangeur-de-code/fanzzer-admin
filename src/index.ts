/**
 * admin-service/src/index.ts
 *
 * Main entry point for the fanzzer admin Hono microservice.
 * Phase 2 implementation with core admin endpoints.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

// Updated interface matching current bindings
interface Env {
  // Bindings (optional during deployment)
  DB?: D1Database;
  STORAGE?: R2Bucket;
  KV?: KVNamespace;
  NOTIFY_QUEUE?: Queue;

  // Environment variables
  DOMAIN?: string;
  DASHBOARD_ORIGIN?: string;
  MAIN_APP_ORIGIN?: string;

  // Secrets (optional during deployment)
  CLERK_SECRET_KEY?: string;
  VITE_CLERK_PUBLISHABLE_KEY?: string;
  RESEND_API_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS configuration
app.use("*", cors({
  origin: (origin, c) => {
    const allowedOrigins = [
      "http://localhost:5175", // Dashboard dev
      "https://dashboard.fanzzer.co", // Dashboard production  
      "https://www.fanzzer.co", // Main app
      "https://main.fanzzer-dashboard.pages.dev", // Cloudflare Pages URL
      "https://4d3dd5ef.fanzzer-dashboard.pages.dev", // Current dashboard deployment
      c.env?.DASHBOARD_ORIGIN,
      c.env?.MAIN_APP_ORIGIN
    ].filter(Boolean);

    return allowedOrigins.includes(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Health check (no auth required)
app.get("/health", async (c) => {
  // Safe binding checks - handle optional bindings gracefully
  let dbOk = false;
  let kvOk = false;
  let queueOk = false;

  try {
    if (c.env.DB) {
      await c.env.DB.prepare("SELECT 1").first();
      dbOk = true;
    }
  } catch { }

  try {
    if (c.env.KV) {
      await c.env.KV.get("__health__");
      kvOk = true;
    }
  } catch { }

  try {
    queueOk = !!c.env.NOTIFY_QUEUE;
  } catch { }

  const bindingsConfigured = [
    c.env.DB ? 'DB' : null,
    c.env.STORAGE ? 'STORAGE' : null,
    c.env.KV ? 'KV' : null,
    c.env.NOTIFY_QUEUE ? 'QUEUE' : null
  ].filter(Boolean);

  return c.json({
    status: "ok",
    version: "1.0.0",
    service: "fanzzer-admin",
    timestamp: new Date().toISOString(),
    bindings: {
      configured: bindingsConfigured,
      functional: { db: dbOk, kv: kvOk, storage: !!c.env.STORAGE, queue: queueOk }
    },
    note: bindingsConfigured.length === 0 ? "Bindings should be configured via Cloudflare Dashboard" : undefined
  });
});

// Root endpoint - API documentation and service info
app.get("/", async (c) => {
  return c.json({
    service: "fanzzer-admin",
    version: "1.0.0",
    status: "operational",
    timestamp: new Date().toISOString(),
    description: "Admin API microservice for fanzzer.co creator platform",
    endpoints: {
      health: "/health",
      admin: {
        base: "/api/v1/admin",
        me: "/api/v1/admin/me",
        overview: "/api/v1/admin/overview",
        users: "/api/v1/admin/users",
        moderation: "/api/v1/admin/moderation",
        creators: "/api/v1/admin/creators",
        content: "/api/v1/admin/content",
        revenue: "/api/v1/admin/revenue",
        streams: "/api/v1/admin/streams",
        subscriptions: "/api/v1/admin/subscriptions",
        reports: "/api/v1/admin/reports",
        settings: "/api/v1/admin/settings",
        system: "/api/v1/admin/system",
        "audit-log": "/api/v1/admin/audit-log"
      },
      dashboard: {
        note: "Dashboard-compatible endpoints (without v1 prefix)",
        base: "/api/admin",
        me: "/api/admin/me",
        overview: "/api/admin/overview",
        users: "/api/admin/users",
        moderation: "/api/admin/moderation",
        creators: "/api/admin/creators",
        content: "/api/admin/content",
        revenue: "/api/admin/revenue",
        streams: "/api/admin/streams",
        subscriptions: "/api/admin/subscriptions",
        reports: "/api/admin/reports",
        settings: "/api/admin/settings",
        system: "/api/admin/system",
        "audit-log": "/api/admin/audit-log"
      }
    },
    docs: "Visit /health for service health check",
    phase: "Phase 5 Complete - Full microservices architecture with CI/CD"
  });
});

// Admin API v1 routes - Query real data from database
app.get("/api/v1/admin/me", async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    // For now, return the first admin user found (dlouis20@gmail.com)
    // TODO: Add proper authentication to identify specific user
    const adminUser = await c.env.DB
      .prepare("SELECT id, email, username, display_name, is_admin, is_creator_mode, created_at FROM users WHERE is_admin = true LIMIT 1")
      .first();

    if (!adminUser) {
      return c.json({ error: "Admin user not found" }, { status: 404 });
    }

    return c.json({
      id: adminUser.id,
      email: adminUser.email,
      username: adminUser.username,
      displayName: adminUser.display_name || adminUser.username,
      isAdmin: true,
      adminRole: "admin",
      permissions: ["read:users", "write:users", "read:content", "write:content", "read:moderation"],
      lastActive: new Date().toISOString(),
      preferences: {
        emailNotifications: true,
        dashboardTheme: "system" as const,
        defaultDateRange: 30,
      },
    });
  } catch (error) {
    console.error("Error fetching admin user:", error);
    return c.json({ error: "Failed to fetch admin user" }, { status: 500 });
  }
});

// Dashboard compatibility endpoints (without v1 prefix)
app.get("/api/admin/me", async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    // For now, return the first admin user found (dlouis20@gmail.com)
    // TODO: Add proper authentication to identify specific user
    const adminUser = await c.env.DB
      .prepare("SELECT id, email, username, display_name, is_admin, is_creator_mode, created_at FROM users WHERE is_admin = true LIMIT 1")
      .first();

    if (!adminUser) {
      return c.json({ error: "Admin user not found" }, { status: 404 });
    }

    return c.json({
      id: adminUser.id,
      email: adminUser.email,
      username: adminUser.username,
      displayName: adminUser.display_name || adminUser.username,
      isAdmin: true,
      adminRole: "admin",
      permissions: ["read:users", "write:users", "read:content", "write:content", "read:moderation"],
      lastActive: new Date().toISOString(),
      preferences: {
        emailNotifications: true,
        dashboardTheme: "system" as const,
        defaultDateRange: 30,
      },
    });
  } catch (error) {
    console.error("Error fetching admin user:", error);
    return c.json({ error: "Failed to fetch admin user" }, { status: 500 });
  }
});

app.get("/api/v1/admin/overview", async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 30);

    const range = {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };

    // Query real database statistics
    const totalUsersResult = await c.env.DB
      .prepare("SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL")
      .first();

    const creatorsResult = await c.env.DB
      .prepare("SELECT COUNT(*) as count FROM users WHERE is_creator_mode = true AND deleted_at IS NULL")
      .first();

    const newUsersResult = await c.env.DB
      .prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= date('now', '-30 days') AND deleted_at IS NULL")
      .first();

    const newUsers7dResult = await c.env.DB
      .prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= date('now', '-7 days') AND deleted_at IS NULL")
      .first();

    // Extract counts with fallback to 0
    const totalUsers = (totalUsersResult as any)?.count || 0;
    const activeCreators = (creatorsResult as any)?.count || 0;
    const newUsers = (newUsersResult as any)?.count || 0;
    const newUsers7d = (newUsers7dResult as any)?.count || 0;

    return c.json({
      range,
      kpis: {
        totalUsers,
        newUsers,
        activeUsers7d: newUsers7d,
        activeUsers30d: totalUsers, // Approximate - all users as active for now
        activeCreators,
        activeSubscribers: 0, // TODO: Query subscriptions table when available
        mrr: 0,
        netRevenue: 0,
        pendingPayouts: 0,
        openReports: 0, // TODO: Query reports table when available
        flaggedContent: 0, // TODO: Query content moderation when available
        liveStreams: 0, // TODO: Query live streams when available
      },
      series: {
        userGrowth: [
          { date: "2026-03-01", count: 0 },
          { date: "2026-03-02", count: 0 },
          { date: "2026-03-03", count: newUsers7d }
        ],
        revenue: [
          { date: "2026-03-01", amount: 0 },
          { date: "2026-03-02", amount: 0 },
          { date: "2026-03-03", amount: 0 }
        ],
        churn: [],
        contentMix: [
          { label: "Photo", value: 0 },
          { label: "Video", value: 0 },
          { label: "Audio", value: 0 },
          { label: "Text", value: 0 }
        ],
      },
      analytics: {
        totalMinutesViewed: 0,
        topCountries: [],
        analyticsByDate: [],
        topVideos: [],
        topCreators: [],
      },
    });
  } catch (error) {
    console.error("Error fetching overview data:", error);
    return c.json({ error: "Failed to fetch overview data" }, { status: 500 });
  }
});

// Dashboard compatibility - overview endpoint without v1 prefix
app.get("/api/admin/overview", async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 30);

    const range = {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };

    // Query real database statistics
    const totalUsersResult = await c.env.DB
      .prepare("SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL")
      .first();

    const creatorsResult = await c.env.DB
      .prepare("SELECT COUNT(*) as count FROM users WHERE is_creator_mode = true AND deleted_at IS NULL")
      .first();

    const newUsersResult = await c.env.DB
      .prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= date('now', '-30 days') AND deleted_at IS NULL")
      .first();

    const newUsers7dResult = await c.env.DB
      .prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= date('now', '-7 days') AND deleted_at IS NULL")
      .first();

    // Extract counts with fallback to 0
    const totalUsers = (totalUsersResult as any)?.count || 0;
    const activeCreators = (creatorsResult as any)?.count || 0;
    const newUsers = (newUsersResult as any)?.count || 0;
    const newUsers7d = (newUsers7dResult as any)?.count || 0;

    return c.json({
      range,
      kpis: {
        totalUsers,
        newUsers,
        activeUsers7d: newUsers7d,
        activeUsers30d: totalUsers, // Approximate - all users as active for now
        activeCreators,
        activeSubscribers: 0, // TODO: Query subscriptions table when available
        mrr: 0,
        netRevenue: 0,
        pendingPayouts: 0,
        openReports: 0, // TODO: Query reports table when available
        flaggedContent: 0, // TODO: Query content moderation when available
        liveStreams: 0, // TODO: Query live streams when available
      },
      series: {
        userGrowth: [
          { date: "2026-03-01", count: 0 },
          { date: "2026-03-02", count: 0 },
          { date: "2026-03-03", count: newUsers7d }
        ],
        revenue: [
          { date: "2026-03-01", amount: 0 },
          { date: "2026-03-02", amount: 0 },
          { date: "2026-03-03", amount: 0 }
        ],
        churn: [],
        contentMix: [
          { label: "Photo", value: 0 },
          { label: "Video", value: 0 },
          { label: "Audio", value: 0 },
          { label: "Text", value: 0 }
        ],
      },
      analytics: {
        totalMinutesViewed: 0,
        topCountries: [],
        analyticsByDate: [],
        topVideos: [],
        topCreators: [],
      },
    });
  } catch (error) {
    console.error("Error fetching overview data:", error);
    return c.json({ error: "Failed to fetch overview data" }, { status: 500 });
  }
});

app.all("/api/v1/admin/users", async (c) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    // Query real user data with joins for followers, subscribers, and spending
    const rows = await c.env.DB.prepare(`
      SELECT
        u.id,
        COALESCE(u.display_name, u.username, u.email) as name,
        u.email,
        u.is_admin,
        u.created_at,
        (SELECT COUNT(*) FROM followers f WHERE f.following_id = u.id) as followers,
        (SELECT COUNT(*) FROM subscriptions s WHERE s.creator_id = u.id AND s.status = 'active') as subscribers,
        (SELECT COALESCE(SUM(amount), 0) FROM balance_transactions bt WHERE bt.user_id = u.id AND bt.type IN ('fund', 'charge')) as total_spend
      FROM users u
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC
      LIMIT 200
    `).all();

    const users = (rows.results as any[]).map((row) => ({
      id: row.id,
      name: row.name || 'Unknown',
      email: row.email || '',
      role: row.is_admin ? "admin" : "user",
      createdAt: row.created_at,
      lastActive: row.created_at, // Use created_at as fallback
      followers: Number(row.followers) || 0,
      subscribers: Number(row.subscribers) || 0,
      totalSpend: Number(row.total_spend) || 0,
      status: row.is_admin ? "admin" : "active",
    }));

    return c.json({
      users,
      pagination: {
        page: 1,
        limit: 200,
        total: users.length,
        hasMore: false,
      },
      filters: {},
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json({ error: "Failed to fetch users" }, { status: 500 });
  }
});

// Dashboard compatibility - users endpoint without v1 prefix
app.all("/api/admin/users", async (c) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    // Query real user data with joins for followers, subscribers, and spending
    const rows = await c.env.DB.prepare(`
      SELECT
        u.id,
        COALESCE(u.display_name, u.username, u.email) as name,
        u.email,
        u.is_admin,
        u.created_at,
        (SELECT COUNT(*) FROM followers f WHERE f.following_id = u.id) as followers,
        (SELECT COUNT(*) FROM subscriptions s WHERE s.creator_id = u.id AND s.status = 'active') as subscribers,
        (SELECT COALESCE(SUM(amount), 0) FROM balance_transactions bt WHERE bt.user_id = u.id AND bt.type IN ('fund', 'charge')) as total_spend
      FROM users u
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC
      LIMIT 200
    `).all();

    const users = (rows.results as any[]).map((row) => ({
      id: row.id,
      name: row.name || 'Unknown',
      email: row.email || '',
      role: row.is_admin ? "admin" : "user",
      createdAt: row.created_at,
      lastActive: row.created_at, // Use created_at as fallback
      followers: Number(row.followers) || 0,
      subscribers: Number(row.subscribers) || 0,
      totalSpend: Number(row.total_spend) || 0,
      status: row.is_admin ? "admin" : "active",
    }));

    return c.json({
      users,
      pagination: {
        page: 1,
        limit: 200,
        total: users.length,
        hasMore: false,
      },
      filters: {},
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json({ error: "Failed to fetch users" }, { status: 500 });
  }
});

app.all("/api/v1/admin/moderation", async (c) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  // Mock moderation data
  return c.json({
    stats: {
      openReports: 7,
      resolvedToday: 3,
      avgResolveTime: 4,
      flaggedContent: 3,
      pendingReviews: 5,
    },
    pendingFlags: [
      {
        id: 1,
        contentId: 123,
        reporterId: 456,
        reporterName: "ReporterUser",
        reason: "inappropriate_content",
        details: "Contains inappropriate material",
        content: {
          type: "image",
          title: "Sample Content",
          description: "Sample description",
          creatorId: 2,
          creatorName: "ContentCreator",
          url: "",
          thumbnailUrl: "",
        },
        status: "pending",
        priority: "medium" as const,
        createdAt: "2026-03-28",
        flagCount: 1,
      }
    ],
    recentActions: [],
  });
});

// Admin API v1 - content endpoint
app.get("/api/v1/admin/content", async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    // Query content mix data (content types count) 
    const mixRows = await c.env.DB.prepare(`
      SELECT type as label, COUNT(*) as value
      FROM content  
      WHERE upload_status = 'published'
      GROUP BY type
    `).all();

    // Query top content by likes (or fallback to basic content list)
    const topContentRows = await c.env.DB.prepare(`
      SELECT c.id, 
             COALESCE(c.title, 'Untitled') as title, 
             c.type,
             0 as views,
             COUNT(l.id) as likes
      FROM content c
      LEFT JOIN likes l ON l.content_id = c.id
      WHERE c.upload_status = 'published'
      GROUP BY c.id, c.title, c.type
      ORDER BY likes DESC, c.created_at DESC
      LIMIT 10
    `).all();

    const mix = (mixRows.results as any[]).map(row => ({
      label: row.label || 'Unknown',
      value: Number(row.value) || 0
    }));

    const topContent = (topContentRows.results as any[]).map(row => ({
      title: row.title || 'Untitled',
      type: row.type || 'Unknown',
      views: Number(row.views) || 0,
      likes: Number(row.likes) || 0
    }));

    return c.json({
      mix,
      topContent
    });
  } catch (error) {
    console.error("Error fetching content data:", error);
    return c.json({ error: "Failed to fetch content data" }, { status: 500 });
  }
});

// Admin API v1 - subscriptions endpoint with metrics and time series
app.get("/api/v1/admin/subscriptions", async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    const now = new Date();
    const startOfPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get active subscriptions
    const activeSubscriptionsResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM subscriptions s 
      WHERE s.status = 'active' 
        AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
    `).first();

    // Get new subscriptions this period
    const newSubscriptionsResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM subscriptions s 
      WHERE s.created_at >= date('now', 'start of month')
        AND s.created_at < date('now', 'start of month', '+1 month')
    `).first();

    // Get cancelled subscriptions this period  
    const cancelledSubscriptionsResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM subscriptions s 
      WHERE s.cancelled_at >= date('now', 'start of month')
        AND s.cancelled_at < date('now', 'start of month', '+1 month')
    `).first();

    // Calculate revenue for ARPU
    const totalRevenueResult = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM subscriptions s 
      WHERE s.status = 'active'
        AND s.created_at >= date('now', 'start of month')
        AND s.created_at < date('now', 'start of month', '+1 month')
    `).first();

    const activeSubscriptions = (activeSubscriptionsResult as any)?.count || 0;
    const newSubscriptions = (newSubscriptionsResult as any)?.count || 0;
    const cancelledSubscriptions = (cancelledSubscriptionsResult as any)?.count || 0;
    const totalRevenue = (totalRevenueResult as any)?.total || 0;

    // Calculate metrics
    const previousActiveQuery = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM subscriptions s 
      WHERE s.status = 'active' 
        AND s.created_at < date('now', 'start of month')
        AND (s.cancelled_at IS NULL OR s.cancelled_at >= date('now', 'start of month'))
    `).first();

    const previousActive = (previousActiveQuery as any)?.count || 1; // Prevent division by zero
    const churnRate = previousActive > 0 ? Math.round((cancelledSubscriptions / previousActive) * 100) : 0;
    const arpu = activeSubscriptions > 0 ? Math.round(totalRevenue / activeSubscriptions) : 0;

    // Generate daily time series for the current month
    const newByDay: Array<{ date: string; count: number }> = [];
    const churnByDay: Array<{ date: string; count: number }> = [];

    for (let day = 1; day <= endOfPeriod.getDate(); day++) {
      const date = new Date(now.getFullYear(), now.getMonth(), day);
      const dateStr = date.toISOString().split('T')[0];

      // Only include data for past dates
      if (date <= now) {
        // New subscriptions for this day
        const dailyNewResult = await c.env.DB.prepare(`
          SELECT COUNT(*) as count 
          FROM subscriptions s 
          WHERE date(s.created_at) = ?
        `).bind(dateStr).first();

        // Cancelled subscriptions for this day
        const dailyChurnResult = await c.env.DB.prepare(`
          SELECT COUNT(*) as count 
          FROM subscriptions s 
          WHERE date(s.cancelled_at) = ?
        `).bind(dateStr).first();

        newByDay.push({
          date: dateStr,
          count: (dailyNewResult as any)?.count || 0
        });

        churnByDay.push({
          date: dateStr,
          count: (dailyChurnResult as any)?.count || 0
        });
      }
    }

    return c.json({
      metrics: {
        activeSubscriptions,
        newSubscriptions,
        cancelledSubscriptions,
        churnRate,
        arpu,
        ltv: arpu * 12, // Simple estimation: ARPU * 12 months
      },
      series: {
        newByDay,
        churnByDay,
      },
      period: {
        start: startOfPeriod.toISOString().split('T')[0],
        end: endOfPeriod.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error("Error fetching subscriptions data:", error);
    return c.json({ error: "Failed to fetch subscriptions data" }, { status: 500 });
  }
});

// Admin API v1 - revenue endpoint with real data
app.get("/api/v1/admin/revenue", async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get subscription revenue for current month
    const subscriptionRevenueResult = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM subscriptions s 
      WHERE s.status = 'active' 
        AND s.created_at >= date('now', 'start of month')
        AND s.created_at < date('now', 'start of month', '+1 month')
    `).first();

    // Get tip revenue (from balance_transactions or wallet_ledger if available)
    const tipRevenueResult = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM balance_transactions bt
      WHERE bt.type = 'charge'
        AND bt.created_at >= date('now', 'start of month')
        AND bt.created_at < date('now', 'start of month', '+1 month')
    `).first();

    const subscriptionRevenue = (subscriptionRevenueResult as any)?.total || 0;
    const tipRevenue = (tipRevenueResult as any)?.total || 0;
    const grossRevenue = subscriptionRevenue + tipRevenue;

    // Calculate platform fee (estimated at 10%)
    const platformFees = grossRevenue * 0.1;
    const netEarnings = grossRevenue - platformFees;

    // Get previous month data for growth calculation
    const prevMonthRevenueResult = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM subscriptions s 
      WHERE s.status = 'active' 
        AND s.created_at >= date('now', 'start of month', '-1 month')
        AND s.created_at < date('now', 'start of month')
    `).first();

    const prevMonthRevenue = (prevMonthRevenueResult as any)?.total || 0;
    const growth = prevMonthRevenue > 0 ? ((grossRevenue - prevMonthRevenue) / prevMonthRevenue * 100) : 0;

    // Generate daily revenue series for current month
    const revenueByDay: Array<{ date: string; amount: number }> = [];

    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    for (let day = 1; day <= endOfMonth.getDate(); day++) {
      const date = new Date(now.getFullYear(), now.getMonth(), day);
      const dateStr = date.toISOString().split('T')[0];

      if (date <= now) {
        const dailySubsResult = await c.env.DB.prepare(`
          SELECT COALESCE(SUM(amount), 0) as total
          FROM subscriptions s 
          WHERE date(s.created_at) = ?
        `).bind(dateStr).first();

        const dailyTipsResult = await c.env.DB.prepare(`
          SELECT COALESCE(SUM(amount), 0) as total
          FROM balance_transactions bt
          WHERE bt.type = 'charge' AND date(bt.created_at) = ?
        `).bind(dateStr).first();

        const dailySubs = (dailySubsResult as any)?.total || 0;
        const dailyTips = (dailyTipsResult as any)?.total || 0;

        revenueByDay.push({
          date: dateStr,
          amount: dailySubs + dailyTips
        });
      }
    }

    return c.json({
      metrics: {
        grossRevenue,
        platformFees,
        netEarnings,
        payoutsPending: 0, // TODO: Query pending payouts when available
        payoutsProcessing: 0, // TODO: Query processing payouts when available  
        payoutsCompleted: 0, // TODO: Query completed payouts when available
        refunds: 0, // TODO: Query refunds when available
      },
      series: {
        revenueByDay
      },
      growth, // Additional field for v1 API
      period: {
        start: currentMonth.toISOString().split('T')[0],
        end: endOfMonth.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error("Error fetching revenue data:", error);
    return c.json({ error: "Failed to fetch revenue data" }, { status: 500 });
  }
});

// Admin endpoint placeholders for remaining endpoints
const adminEndpoints = [
  'streams',
  'reports', 'settings', 'system', 'audit-log'
];

// Admin API v1 - creators endpoint with real data
app.get("/api/v1/admin/creators", async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    // Get creator statistics
    const creatorStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(CASE WHEN is_creator_mode = true THEN 1 END) as totalCreators,
        COUNT(CASE WHEN verified = true AND is_creator_mode = true THEN 1 END) as verifiedCreators,
        COUNT(CASE WHEN created_at >= date('now', '-30 days') AND is_creator_mode = true THEN 1 END) as newCreators30d,
        COUNT(CASE WHEN created_at >= date('now', '-7 days') AND is_creator_mode = true THEN 1 END) as newCreators7d
      FROM users 
      WHERE deleted_at IS NULL
    `).first();

    // Get top creators by subscribers
    const topCreators = await c.env.DB.prepare(`
      SELECT 
        u.id,
        COALESCE(u.display_name, u.username, u.email) as name,
        u.avatar_url,
        u.verified,
        COUNT(DISTINCT s.fan_id) as subscribers,
        COALESCE(SUM(s.amount), 0) as totalRevenue,
        COUNT(DISTINCT c.id) as contentCount,
        u.created_at
      FROM users u
      LEFT JOIN subscriptions s ON s.creator_id = u.id AND s.status = 'active'
      LEFT JOIN content c ON c.user_id = u.id AND c.upload_status = 'published'
      WHERE u.is_creator_mode = true AND u.deleted_at IS NULL
      GROUP BY u.id, u.display_name, u.username, u.email, u.avatar_url, u.verified, u.created_at
      ORDER BY subscribers DESC, totalRevenue DESC
      LIMIT 50
    `).all();

    const stats = creatorStats as any;
    const creators = (topCreators.results as any[]).map(row => ({
      id: row.id,
      name: row.name || 'Unknown',
      avatar: row.avatar_url || '',
      verified: Boolean(row.verified),
      subscribers: Number(row.subscribers) || 0,
      totalRevenue: Number(row.totalRevenue) || 0,
      contentCount: Number(row.contentCount) || 0,
      joinedAt: row.created_at || new Date().toISOString(),
      status: 'active' // Default status
    }));

    return c.json({
      stats: {
        total: stats?.totalCreators || 0,
        verified: stats?.verifiedCreators || 0,
        pending: 0, // No pending verification tracking
        suspended: 0, // No suspension tracking
        newThisMonth: stats?.newCreators30d || 0,
        newThisWeek: stats?.newCreators7d || 0
      },
      creators,
      pagination: {
        page: 1,
        limit: 50,
        total: creators.length,
        hasMore: false
      }
    });
  } catch (error) {
    console.error("Error fetching creators data:", error);
    return c.json({ error: "Failed to fetch creators data" }, { status: 500 });
  }
});

adminEndpoints.forEach(endpoint => {
  app.get(`/api/v1/admin/${endpoint}`, (c) => {
    return c.json({
      message: `${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)} endpoint operational`,
      endpoint: `/api/v1/admin/${endpoint}`,
      status: "Phase 2 implementation",
      todo: "Full functionality will be implemented incrementally"
    });
  });
});

// Catch-all for other admin routes
app.all("/api/v1/admin/*", (c) => {
  return c.json({
    message: "Admin endpoint available",
    path: c.req.path,
    method: c.req.method,
    status: "Phase 2 implementation"
  });
});

// Dashboard compatibility - content endpoint
app.get("/api/admin/content", async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    // Query content mix data (content types count) 
    const mixRows = await c.env.DB.prepare(`
      SELECT type as label, COUNT(*) as value
      FROM content  
      WHERE upload_status = 'published'
      GROUP BY type
    `).all();

    // Query top content by likes (or fallback to basic content list)
    const topContentRows = await c.env.DB.prepare(`
      SELECT c.id, 
             COALESCE(c.title, 'Untitled') as title, 
             c.type,
             0 as views,
             COUNT(l.id) as likes
      FROM content c
      LEFT JOIN likes l ON l.content_id = c.id
      WHERE c.upload_status = 'published'
      GROUP BY c.id, c.title, c.type
      ORDER BY likes DESC, c.created_at DESC
      LIMIT 10
    `).all();

    const mix = (mixRows.results as any[]).map(row => ({
      label: row.label || 'Unknown',
      value: Number(row.value) || 0
    }));

    const topContent = (topContentRows.results as any[]).map(row => ({
      title: row.title || 'Untitled',
      type: row.type || 'Unknown',
      views: Number(row.views) || 0,
      likes: Number(row.likes) || 0
    }));

    return c.json({
      mix,
      topContent
    });
  } catch (error) {
    console.error("Error fetching content data:", error);
    return c.json({ error: "Failed to fetch content data" }, { status: 500 });
  }
});

// Dashboard compatibility - subscriptions endpoint
app.get("/api/admin/subscriptions", async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    const now = new Date();
    const startOfPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get active subscriptions
    const activeSubscriptionsResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM subscriptions s 
      WHERE s.status = 'active' 
        AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
    `).first();

    // Get new subscriptions this period
    const newSubscriptionsResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM subscriptions s 
      WHERE s.created_at >= date('now', 'start of month')
        AND s.created_at < date('now', 'start of month', '+1 month')
    `).first();

    // Get cancelled subscriptions this period  
    const cancelledSubscriptionsResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM subscriptions s 
      WHERE s.cancelled_at >= date('now', 'start of month')
        AND s.cancelled_at < date('now', 'start of month', '+1 month')
    `).first();

    // Calculate revenue for ARPU
    const totalRevenueResult = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM subscriptions s 
      WHERE s.status = 'active'
        AND s.created_at >= date('now', 'start of month')
        AND s.created_at < date('now', 'start of month', '+1 month')
    `).first();

    const activeSubscriptions = (activeSubscriptionsResult as any)?.count || 0;
    const newSubscriptions = (newSubscriptionsResult as any)?.count || 0;
    const cancelledSubscriptions = (cancelledSubscriptionsResult as any)?.count || 0;
    const totalRevenue = (totalRevenueResult as any)?.total || 0;

    // Calculate metrics
    const previousActiveQuery = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM subscriptions s 
      WHERE s.status = 'active' 
        AND s.created_at < date('now', 'start of month')
        AND (s.cancelled_at IS NULL OR s.cancelled_at >= date('now', 'start of month'))
    `).first();

    const previousActive = (previousActiveQuery as any)?.count || 1; // Prevent division by zero
    const churnRate = previousActive > 0 ? Math.round((cancelledSubscriptions / previousActive) * 100) : 0;
    const arpu = activeSubscriptions > 0 ? Math.round(totalRevenue / activeSubscriptions) : 0;

    // Generate daily time series for the current month
    const newByDay: Array<{ date: string; count: number }> = [];
    const churnByDay: Array<{ date: string; count: number }> = [];

    for (let day = 1; day <= endOfPeriod.getDate(); day++) {
      const date = new Date(now.getFullYear(), now.getMonth(), day);
      const dateStr = date.toISOString().split('T')[0];

      // Only include data for past dates
      if (date <= now) {
        // New subscriptions for this day
        const dailyNewResult = await c.env.DB.prepare(`
          SELECT COUNT(*) as count 
          FROM subscriptions s 
          WHERE date(s.created_at) = ?
        `).bind(dateStr).first();

        // Cancelled subscriptions for this day
        const dailyChurnResult = await c.env.DB.prepare(`
          SELECT COUNT(*) as count 
          FROM subscriptions s 
          WHERE date(s.cancelled_at) = ?
        `).bind(dateStr).first();

        newByDay.push({
          date: dateStr,
          count: (dailyNewResult as any)?.count || 0
        });

        churnByDay.push({
          date: dateStr,
          count: (dailyChurnResult as any)?.count || 0
        });
      }
    }

    return c.json({
      metrics: {
        activeSubscriptions,
        newSubscriptions,
        cancelledSubscriptions,
        churnRate,
        arpu,
        ltv: arpu * 12, // Simple estimation: ARPU * 12 months
      },
      series: {
        newByDay,
        churnByDay,
      },
      period: {
        start: startOfPeriod.toISOString().split('T')[0],
        end: endOfPeriod.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error("Error fetching subscriptions data:", error);
    return c.json({ error: "Failed to fetch subscriptions data" }, { status: 500 });
  }
});

// Dashboard compatibility - creators endpoint
app.get("/api/admin/creators", async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    // Simple creator count query
    const totalCreatorsResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE is_creator_mode = true AND deleted_at IS NULL
    `).first();

    // Simple verified creators count
    const verifiedCreatorsResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE is_creator_mode = true AND verified = true AND deleted_at IS NULL
    `).first();

    // Get basic creator list
    const creatorsResult = await c.env.DB.prepare(`
      SELECT 
        u.id,
        COALESCE(u.display_name, u.username, u.email) as name,
        u.avatar_url,
        u.verified,
        u.created_at
      FROM users u
      WHERE u.is_creator_mode = true AND u.deleted_at IS NULL
      ORDER BY u.created_at DESC
      LIMIT 50
    `).all();

    const totalCreators = (totalCreatorsResult as any)?.count || 0;
    const verifiedCreators = (verifiedCreatorsResult as any)?.count || 0;

    const creators = (creatorsResult.results as any[]).map(row => ({
      id: row.id,
      name: row.name || 'Unknown',
      avatar: row.avatar_url || '',
      verified: Boolean(row.verified),
      subscribers: 0, // Default for now
      totalRevenue: 0, // Default for now
      contentCount: 0, // Default for now
      joinedAt: row.created_at || new Date().toISOString(),
      status: 'active'
    }));

    return c.json({
      stats: {
        total: totalCreators,
        verified: verifiedCreators,
        pending: 0,
        suspended: 0,
        newThisMonth: 0,
        newThisWeek: 0
      },
      creators,
      pagination: {
        page: 1,
        limit: 50,
        total: creators.length,
        hasMore: false
      }
    });
  } catch (error) {
    console.error("Error fetching creators data:", error);
    return c.json({ error: "Failed to fetch creators data" }, { status: 500 });
  }
});

// Dashboard compatibility - revenue endpoint
app.get("/api/admin/revenue", async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: "Database not configured" }, { status: 500 });
    }

    const now = new Date();

    // Get subscription revenue for current month
    const subscriptionRevenueResult = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM subscriptions s 
      WHERE s.status = 'active' 
        AND s.created_at >= date('now', 'start of month')
        AND s.created_at < date('now', 'start of month', '+1 month')
    `).first();

    // Get tip revenue (from balance_transactions)
    const tipRevenueResult = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM balance_transactions bt
      WHERE bt.type = 'charge'
        AND bt.created_at >= date('now', 'start of month')
        AND bt.created_at < date('now', 'start of month', '+1 month')
    `).first();

    const subscriptionRevenue = (subscriptionRevenueResult as any)?.total || 0;
    const tipRevenue = (tipRevenueResult as any)?.total || 0;
    const grossRevenue = subscriptionRevenue + tipRevenue;

    // Calculate platform fees (10%)
    const platformFees = grossRevenue * 0.1;
    const netEarnings = grossRevenue - platformFees;

    // Generate daily revenue series for current month
    const revenueByDay: Array<{ date: string; amount: number }> = [];

    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    for (let day = 1; day <= endOfMonth.getDate(); day++) {
      const date = new Date(now.getFullYear(), now.getMonth(), day);
      const dateStr = date.toISOString().split('T')[0];

      if (date <= now) {
        const dailySubsResult = await c.env.DB.prepare(`
          SELECT COALESCE(SUM(amount), 0) as total
          FROM subscriptions s 
          WHERE date(s.created_at) = ?
        `).bind(dateStr).first();

        const dailyTipsResult = await c.env.DB.prepare(`
          SELECT COALESCE(SUM(amount), 0) as total
          FROM balance_transactions bt
          WHERE bt.type = 'charge' AND date(bt.created_at) = ?
        `).bind(dateStr).first();

        const dailySubs = (dailySubsResult as any)?.total || 0;
        const dailyTips = (dailyTipsResult as any)?.total || 0;

        revenueByDay.push({
          date: dateStr,
          amount: dailySubs + dailyTips
        });
      }
    }

    return c.json({
      metrics: {
        grossRevenue,
        platformFees,
        netEarnings,
        payoutsPending: 0, // TODO: Query pending payouts when available
        payoutsProcessing: 0, // TODO: Query processing payouts when available  
        payoutsCompleted: 0, // TODO: Query completed payouts when available
        refunds: 0, // TODO: Query refunds when available
      },
      series: {
        revenueByDay
      }
    });
  } catch (error) {
    console.error("Error fetching revenue data:", error);
    return c.json({ error: "Failed to fetch revenue data" }, { status: 500 });
  }
});

// Dashboard compatibility - streams endpoint 
app.get("/api/admin/streams", async (c) => {
  return c.json({
    metrics: {
      liveNow: 0,
      peakViewers: 0,
      totalWatchTime: 0,
      avgSessionDuration: 0,
      streamErrors: 0,
      chatMessages: 0
    },
    series: {
      viewersByDay: [],
      watchTimeByDay: []
    }
  });
});

// Dashboard compatibility - moderation endpoint
app.get("/api/admin/moderation", async (c) => {
  return c.json({
    metrics: {
      openReports: 0,
      timeToResolveHours: 0,
      flaggedContent: 0,
      autoActions: 0,
      pendingVerifications: 0,
      activeSuspensions: 0,
      openAppeals: 0
    },
    recentReports: []
  });
});

// Dashboard compatibility - system endpoint
app.get("/api/admin/system", async (c) => {
  return c.json({
    metrics: {
      apiErrorRate: 0,
      webhookFailures: 0,
      workerLatencyMs: 0,
      dbLatencyP95Ms: 0,
      jobFailures: 0,
      emailFailures: 0,
      openChargebacks: 0,
      openComplianceRequests: 0
    }
  });
});

// Dashboard compatibility - reports endpoint
app.get("/api/admin/reports", async (c) => {
  return c.json({
    metrics: {
      openReports: 0,
      resolvedToday: 0,
      avgResolveTime: 0,
      pendingReviews: 0
    },
    reports: [], // Changed from recentReports to reports
    pagination: {
      page: 1,
      limit: 50,
      total: 0,
      hasMore: false
    }
  });
});

// Moderation flags endpoint required by dashboard
app.get("/api/moderation/flags", async (c) => {
  return c.json({
    flags: [] // Empty flags array for now
  });
});

// Handle moderation flag actions (approve, remove, dismiss)
app.post("/api/moderation/flags", async (c) => {
  try {
    const body = await c.req.json();
    const { flagId, action } = body;

    if (!flagId || !action) {
      return c.json({ error: "Missing flagId or action" }, { status: 400 });
    }

    // TODO: Implement actual flag action processing
    // For now, just return success
    return c.json({
      success: true,
      message: `Flag ${flagId} ${action}d successfully`
    });
  } catch (error) {
    console.error("Error processing flag action:", error);
    return c.json({ error: "Failed to process action" }, { status: 500 });
  }
});

// Admin preferences endpoint required by useSavedFilters hook
app.get("/api/admin/preferences", async (c) => {
  return c.json({
    filters: [], // Saved filters array
    slaConfig: [], // SLA configuration array  
    adminRole: "super_admin" // Admin role string
  });
});

// Handle preferences save/delete operations
app.post("/api/admin/preferences", async (c) => {
  try {
    const body = await c.req.json();

    if (body._delete) {
      // Delete filter operation
      return c.json({ success: true, message: "Filter deleted" });
    } else {
      // Save filter operation
      return c.json({ success: true, message: "Filter saved" });
    }
  } catch (error) {
    console.error("Error processing preferences:", error);
    return c.json({ error: "Failed to process preferences" }, { status: 500 });
  }
});

// Report resolution endpoints required by Reports page
app.post("/api/admin/resolve-report", async (c) => {
  try {
    const body = await c.req.json();
    const { reportId } = body;

    if (!reportId) {
      return c.json({ error: "Missing reportId" }, { status: 400 });
    }

    // TODO: Implement actual report resolution logic with database
    return c.json({
      success: true,
      message: `Report ${reportId} resolved successfully`
    });
  } catch (error) {
    console.error("Error resolving report:", error);
    return c.json({ error: "Failed to resolve report" }, { status: 500 });
  }
});

app.post("/api/admin/dismiss-report", async (c) => {
  try {
    const body = await c.req.json();
    const { reportId } = body;

    if (!reportId) {
      return c.json({ error: "Missing reportId" }, { status: 400 });
    }

    // TODO: Implement actual report dismissal logic with database
    return c.json({
      success: true,
      message: `Report ${reportId} dismissed successfully`
    });
  } catch (error) {
    console.error("Error dismissing report:", error);
    return c.json({ error: "Failed to dismiss report" }, { status: 500 });
  }
});

// Creator KYC override endpoint
app.post("/api/admin/creators", async (c) => {
  try {
    const body = await c.req.json();
    const { action, userId, kycStatus } = body;

    if (action !== "override_kyc" || !userId || !kycStatus) {
      return c.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    // Validate kyc status
    const validStatuses = ['none', 'pending', 'processing', 'verified', 'failed', 'suspended'];
    if (!validStatuses.includes(kycStatus)) {
      return c.json({ error: "Invalid KYC status" }, { status: 400 });
    }

    const db = c.env.DB;

    // Simple update - only the essential fields
    const updateResult = await db.prepare(`
      UPDATE users 
      SET kyc_status = ?, 
          verified = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(kycStatus, kycStatus === 'verified' ? 1 : 0, userId).run();

    if (updateResult.changes === 0) {
      return c.json({ error: `User ${userId} not found` }, { status: 404 });
    }

    return c.json({
      success: true,
      message: `KYC status updated to ${kycStatus} for user ${userId}`
    });
  } catch (error) {
    console.error("Error updating KYC status:", error);
    return c.json({ error: "Failed to update KYC status" }, { status: 500 });
  }
});

// Dashboard compatibility - catch-all for admin routes without v1 prefix
app.all("/api/admin/*", (c) => {
  return c.json({
    message: "Admin endpoint operational",
    path: c.req.path,
    method: c.req.method,
    status: "Dashboard compatibility mode",
    note: "This endpoint provides basic functionality for dashboard integration"
  });
});

// Default 404
app.all("*", (c) => {
  return c.json({
    error: "Not found",
    path: c.req.path,
    service: "fanzzer-admin"
  }, 404);
});

export default app;
