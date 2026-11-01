import type { Server } from "node:http";
import type { HealthResponse } from "@platform/shared-types";
import cors from "cors";
import express, { type Express } from "express";
import { auditLogger, type AuditLoggerOptions } from "../audit/middleware.js";
import { createErrorHandler, notFoundHandler } from "./errors.js";
import { createLogger, type Logger } from "./logger.js";

export interface ServiceAppOptions {
  /** e.g. `compliance-service`. */
  name: string;
  /** Browser origins allowed to call this BFF — normally just its paired app. */
  allowedOrigins: string[];
  logger?: Logger;
  /**
   * Audit trail for POST/PUT/PATCH/DELETE (see `auditLogger`), on by default with `name` as
   * `targetService` and lines on stdout. Pass options to customise, or `false` to disable.
   */
  audit?: Omit<AuditLoggerOptions, "targetService"> | false;
  /** Mount the service's routers. Called after common middleware, before error handling. */
  routes: (app: Express) => void;
}

/**
 * Builds an Express app with the platform's standard middleware stack:
 * CORS locked to the paired frontend, the audit trail, JSON parsing, request
 * logging, `/health`, 404 handling and the shared error envelope.
 */
export function createServiceApp(options: ServiceAppOptions): Express {
  const logger = options.logger ?? createLogger(options.name);
  const startedAt = Date.now();
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: options.allowedOrigins }));
  if (options.audit !== false) {
    app.use(
      auditLogger({
        onError: (error) =>
          logger.error("Failed to write audit line", { error: error instanceof Error ? error.stack : String(error) }),
        ...options.audit,
        targetService: options.name,
      }),
    );
  }
  app.use(express.json({ limit: "100kb" }));
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode}`, { ms: Math.round(ms * 10) / 10 });
    });
    next();
  });

  app.get("/health", (_req, res) => {
    const body: HealthResponse = {
      service: options.name,
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  });

  options.routes(app);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}

export interface StartOptions {
  name: string;
  port: number;
  /** Interface to bind. Defaults to HOST env or 127.0.0.1 so BFFs are not exposed off-machine. */
  host?: string;
  logger?: Logger;
}

/** Starts listening and wires graceful shutdown on SIGINT/SIGTERM. */
export function startService(app: Express, options: StartOptions): Server {
  const logger = options.logger ?? createLogger(options.name);
  const host = options.host ?? process.env.HOST ?? "127.0.0.1";
  const server = app.listen(options.port, host, () => {
    logger.info(`listening on http://${host}:${options.port}`);
  });
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  return server;
}
