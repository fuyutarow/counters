/**
 * Unified Hono API Router for Solana
 *
 * All API routes are handled here via Hono's routing.
 * This provides a single entry point for the API layer.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { handle } from "hono/vercel";

import { feeSponsorRoutes } from "./routes/fee-sponsor";

const app = new Hono()
  .basePath("/api")
  // Middleware
  .use("*", logger())
  .use("*", cors())
  // Health check
  .get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }))
  // Routes
  .route("/tx/sponsor", feeSponsorRoutes);

// Export type for RPC client
export type AppType = typeof app;

export const runtime = "nodejs";

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
