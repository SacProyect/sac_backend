import { Request, Response, NextFunction } from "express";
import { cacheService, CacheConfig } from "./cache-service";
import { AuthRequest } from "../users/user-utils";
import logger from "./logger";

/**
 * Generate a cache key based on request parameters and user context
 * @param req Express request
 * @param includeUser Whether to include user ID in cache key
 * @returns Cache key string
 */
export function generateCacheKey(req: Request, includeUser: boolean = false): string {
  const parts: string[] = [
    req.method,
    req.baseUrl,
    req.path,
  ];

  // Include user ID if specified
  if (includeUser) {
    const authReq = req as AuthRequest;
    if (authReq.user?.id) {
      parts.push(`user:${authReq.user.id}`);
    }
  }

  // Include query parameters (sorted for consistency)
  const queryKeys = Object.keys(req.query).sort();
  if (queryKeys.length > 0) {
    const queryString = queryKeys
      .map(key => `${key}=${req.query[key]}`)
      .join('&');
    parts.push(`query:${queryString}`);
  }

  // Include route parameters
  const paramKeys = Object.keys(req.params).sort();
  if (paramKeys.length > 0) {
    const paramString = paramKeys
      .map(key => `${key}=${req.params[key]}`)
      .join('&');
    parts.push(`params:${paramString}`);
  }

  return parts.join('::');
}

/**
 * Cache middleware options
 */
interface CacheMiddlewareOptions {
  ttl?: number; // Time to live in milliseconds
  tags?: string[]; // Tags for group invalidation
  includeUser?: boolean; // Include user ID in cache key
  keyGenerator?: (req: Request) => string; // Custom key generator
  condition?: (req: Request) => boolean; // Condition to enable caching
}

/**
 * Middleware to cache GET requests
 * 
 * Usage:
 * router.get('/endpoint', cacheMiddleware({ ttl: 60000, tags: ['taxpayers'] }), handler)
 * 
 * @param options Cache configuration options
 */
export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check condition if provided
    if (options.condition && !options.condition(req)) {
      return next();
    }

    // Generate cache key
    const cacheKey = options.keyGenerator
      ? options.keyGenerator(req)
      : generateCacheKey(req, options.includeUser);

    // Try to get from cache
    const cachedData = cacheService.get(cacheKey);

    if (cachedData !== null) {
      logger.debug(`[Cache] HIT: ${cacheKey}`);
      return res.status(200).json(cachedData);
    }

    logger.debug(`[Cache] MISS: ${cacheKey}`);

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache the response
    res.json = function (data: any) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const config: CacheConfig = {
          ttl: options.ttl ?? 2 * 60 * 1000, // default 2 minutes
          tags: options.tags,
        };
        cacheService.set(cacheKey, data, config);
        logger.debug(`[Cache] SET: ${cacheKey}`);
      }

      // Call original json method
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache by tags after mutation operations
 * 
 * Usage:
 * router.post('/endpoint', handler, invalidateCacheMiddleware(['taxpayers']))
 * 
 * @param tags Tags to invalidate
 */
export function invalidateCacheMiddleware(tags: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to invalidate cache after response
    res.json = function (data: any) {
      // Only invalidate on successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheService.invalidateByTags(tags);
        logger.debug(`[Cache] Invalidated tags: ${tags.join(', ')}`);
      }

      // Call original json method
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache by pattern after mutation operations
 * 
 * Usage:
 * router.put('/taxpayer/:id', handler, invalidateCacheByPatternMiddleware(/taxpayer/))
 * 
 * @param pattern Regex pattern to match cache keys
 */
export function invalidateCacheByPatternMiddleware(pattern: RegExp) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to invalidate cache after response
    res.json = function (data: any) {
      // Only invalidate on successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheService.invalidateByPattern(pattern);
        logger.debug(`[Cache] Invalidated pattern: ${pattern}`);
      }

      // Call original json method
      return originalJson(data);
    };

    next();
  };
}

/**
 * Middleware to expose cache stats endpoint
 * 
 * Usage:
 * app.get('/cache/stats', authenticateToken, cacheStatsMiddleware)
 */
export function cacheStatsMiddleware(req: Request, res: Response) {
  const stats = cacheService.getStats();
  res.status(200).json({
    success: true,
    data: stats,
  });
}

/**
 * Middleware to clear cache (admin only)
 * 
 * Usage:
 * app.post('/cache/clear', authenticateToken, cacheClearMiddleware)
 */
export function cacheClearMiddleware(req: Request, res: Response) {
  const authReq = req as AuthRequest;
  
  // Only allow admins to clear cache
  if (!authReq.user || authReq.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Only admins can clear cache',
    });
  }

  cacheService.clear();
  
  res.status(200).json({
    success: true,
    message: 'Cache cleared successfully',
  });
}
