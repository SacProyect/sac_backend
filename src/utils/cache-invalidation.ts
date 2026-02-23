import { cacheService } from "./cache-service";
import logger from "./logger";

/**
 * Cache invalidation utilities for different data types
 * 
 * These utilities provide a centralized way to invalidate cache
 * when data is modified through any endpoint.
 */

/**
 * Invalidate all taxpayer-related cache entries
 */
export function invalidateTaxpayerCache(): void {
  const tags = [
    'taxpayers',
    'taxpayers-list',
    'taxpayers-events',
    'taxpayers-stats',
    'fiscal-stats',
  ];
  cacheService.invalidateByTags(tags);
  logger.info('[Cache Invalidation] Taxpayer cache invalidated');
}

/**
 * Invalidate cache for a specific taxpayer
 * @param taxpayerId Taxpayer ID
 */
export function invalidateSpecificTaxpayerCache(taxpayerId: string): void {
  const pattern = new RegExp(`taxpayer.*${taxpayerId}`);
  cacheService.invalidateByPattern(pattern);
  
  // Also invalidate list caches that might include this taxpayer
  invalidateTaxpayerCache();
  
  logger.info(`[Cache Invalidation] Specific taxpayer cache invalidated: ${taxpayerId}`);
}

/**
 * Invalidate all report-related cache entries
 */
export function invalidateReportCache(): void {
  const tags = [
    'reports',
    'kpi',
    'performance',
    'statistics',
    'fiscal-groups',
    'group-records',
  ];
  cacheService.invalidateByTags(tags);
  logger.info('[Cache Invalidation] Report cache invalidated');
}

/**
 * Invalidate cache for a specific user's reports
 * @param userId User ID
 */
export function invalidateUserReportCache(userId: string): void {
  const pattern = new RegExp(`.*user:${userId}.*`);
  cacheService.invalidateByPattern(pattern);
  logger.info(`[Cache Invalidation] User report cache invalidated: ${userId}`);
}

/**
 * Invalidate all user-related cache entries
 */
export function invalidateUserCache(): void {
  const tags = [
    'users',
    'users-list',
    'fiscals',
  ];
  cacheService.invalidateByTags(tags);
  logger.info('[Cache Invalidation] User cache invalidated');
}

/**
 * Invalidate cache for a specific user
 * @param userId User ID
 */
export function invalidateSpecificUserCache(userId: string): void {
  const pattern = new RegExp(`user.*${userId}`);
  cacheService.invalidateByPattern(pattern);
  
  // Also invalidate list caches
  invalidateUserCache();
  
  logger.info(`[Cache Invalidation] Specific user cache invalidated: ${userId}`);
}

/**
 * Invalidate all census-related cache entries
 */
export function invalidateCensusCache(): void {
  const tags = ['census', 'census-list'];
  cacheService.invalidateByTags(tags);
  logger.info('[Cache Invalidation] Census cache invalidated');
}

/**
 * Invalidate payment-related cache entries
 */
export function invalidatePaymentCache(): void {
  const tags = [
    'payments',
    'payment-history',
    'pending-payments',
  ];
  cacheService.invalidateByTags(tags);
  
  // Payments affect reports, so invalidate those too
  invalidateReportCache();
  
  logger.info('[Cache Invalidation] Payment cache invalidated');
}

/**
 * Invalidate IVA report cache entries
 */
export function invalidateIvaReportCache(): void {
  const tags = [
    'iva-reports',
    'taxpayer-performance',
  ];
  cacheService.invalidateByTags(tags);
  
  // IVA reports affect overall reports
  invalidateReportCache();
  
  logger.info('[Cache Invalidation] IVA report cache invalidated');
}

/**
 * Invalidate ISLR report cache entries
 */
export function invalidateIslrReportCache(): void {
  const tags = ['islr-reports'];
  cacheService.invalidateByTags(tags);
  
  // ISLR reports affect overall reports
  invalidateReportCache();
  
  logger.info('[Cache Invalidation] ISLR report cache invalidated');
}

/**
 * Invalidate event-related cache entries
 */
export function invalidateEventCache(): void {
  const tags = [
    'events',
    'taxpayers-events',
  ];
  cacheService.invalidateByTags(tags);
  logger.info('[Cache Invalidation] Event cache invalidated');
}

/**
 * Invalidate observation-related cache entries
 */
export function invalidateObservationCache(): void {
  const tags = ['observations'];
  cacheService.invalidateByTags(tags);
  logger.info('[Cache Invalidation] Observation cache invalidated');
}

/**
 * Invalidate fase (phase) related cache entries
 */
export function invalidateFaseCache(): void {
  const tags = ['fase', 'taxpayers'];
  cacheService.invalidateByTags(tags);
  
  // Fase changes affect reports
  invalidateReportCache();
  
  logger.info('[Cache Invalidation] Fase cache invalidated');
}

/**
 * Invalidate repair report cache entries
 */
export function invalidateRepairReportCache(): void {
  const tags = ['repair-reports'];
  cacheService.invalidateByTags(tags);
  logger.info('[Cache Invalidation] Repair report cache invalidated');
}

/**
 * Invalidate fiscal group cache entries
 */
export function invalidateFiscalGroupCache(): void {
  const tags = [
    'fiscal-groups',
    'group-records',
    'group-performance',
  ];
  cacheService.invalidateByTags(tags);
  
  // Group changes affect reports
  invalidateReportCache();
  
  logger.info('[Cache Invalidation] Fiscal group cache invalidated');
}

/**
 * Invalidate all cache entries (nuclear option)
 * Use sparingly - only for major data migrations or system updates
 */
export function invalidateAllCache(): void {
  cacheService.clear();
  logger.warn('[Cache Invalidation] ALL cache cleared');
}

/**
 * Smart invalidation based on operation type
 * @param operation Type of operation performed
 * @param entityId Optional entity ID for specific invalidation
 */
export function smartInvalidate(
  operation: 'taxpayer' | 'report' | 'user' | 'census' | 'payment' | 'event' | 'fase' | 'iva' | 'islr',
  entityId?: string
): void {
  switch (operation) {
    case 'taxpayer':
      if (entityId) {
        invalidateSpecificTaxpayerCache(entityId);
      } else {
        invalidateTaxpayerCache();
      }
      break;
    
    case 'report':
      invalidateReportCache();
      break;
    
    case 'user':
      if (entityId) {
        invalidateSpecificUserCache(entityId);
      } else {
        invalidateUserCache();
      }
      break;
    
    case 'census':
      invalidateCensusCache();
      break;
    
    case 'payment':
      invalidatePaymentCache();
      break;
    
    case 'event':
      invalidateEventCache();
      break;
    
    case 'fase':
      invalidateFaseCache();
      break;
    
    case 'iva':
      invalidateIvaReportCache();
      break;
    
    case 'islr':
      invalidateIslrReportCache();
      break;
    
    default:
      logger.warn(`[Cache Invalidation] Unknown operation type: ${operation}`);
  }
}
