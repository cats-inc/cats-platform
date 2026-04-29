/**
 * Minimal logger interface for product API routes.
 *
 * Products inject this through their `Api*Dependencies.logger` to surface
 * unexpected request handling failures into platform logging without coupling
 * each product to a specific logger implementation. Compatible by structural
 * typing with `CatsAppLogger` so app-SDK loggers can be reused.
 */
export interface PlatformApiLogger {
  error(message: string, context?: Record<string, unknown>): void;
}
