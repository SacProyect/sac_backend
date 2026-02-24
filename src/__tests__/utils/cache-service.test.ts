import { describe, it, expect, beforeEach } from "vitest";
import { cacheService } from "../../utils/cache-service";

describe("CacheService", () => {
  beforeEach(() => {
    cacheService.clear();
    cacheService.resetMetrics();
  });

  describe("get/set", () => {
    it("returns null for missing key", () => {
      expect(cacheService.get("missing")).toBeNull();
    });

    it("returns cached value after set", () => {
      cacheService.set("key1", { foo: "bar" });
      expect(cacheService.get("key1")).toEqual({ foo: "bar" });
    });

    it("returns null after delete", () => {
      cacheService.set("key1", "value");
      cacheService.delete("key1");
      expect(cacheService.get("key1")).toBeNull();
    });
  });

  describe("TTL", () => {
    it("returns value within TTL", () => {
      cacheService.set("ttl-key", "alive", { ttl: 5000 });
      expect(cacheService.get("ttl-key")).toBe("alive");
    });

    it("returns null after TTL expires", async () => {
      cacheService.set("expire-key", "gone", { ttl: 50 });
      expect(cacheService.get("expire-key")).toBe("gone");
      await new Promise((r) => setTimeout(r, 60));
      expect(cacheService.get("expire-key")).toBeNull();
    });
  });

  describe("tags and invalidation", () => {
    it("invalidates by tag", () => {
      cacheService.set("a", 1, { ttl: 60000, tags: ["tag1"] });
      cacheService.set("b", 2, { ttl: 60000, tags: ["tag1", "tag2"] });
      cacheService.set("c", 3, { ttl: 60000, tags: ["tag2"] });

      const count = cacheService.invalidateByTag("tag1");
      expect(count).toBe(2);
      expect(cacheService.get("a")).toBeNull();
      expect(cacheService.get("b")).toBeNull();
      expect(cacheService.get("c")).toBe(3);
    });

    it("invalidates by multiple tags", () => {
      cacheService.set("x", 1, { ttl: 60000, tags: ["reports"] });
      cacheService.set("y", 2, { ttl: 60000, tags: ["taxpayers"] });
      cacheService.set("z", 3, { ttl: 60000, tags: ["reports", "kpi"] });

      const count = cacheService.invalidateByTags(["reports", "kpi"]);
      expect(count).toBe(2);
      expect(cacheService.get("x")).toBeNull();
      expect(cacheService.get("z")).toBeNull();
      expect(cacheService.get("y")).toBe(2);
    });
  });

  describe("metrics", () => {
    it("tracks hits and misses", () => {
      cacheService.set("m", "v");
      cacheService.get("m");
      cacheService.get("m");
      cacheService.get("missing");

      const metrics = cacheService.getMetrics();
      expect(metrics.hits).toBe(2);
      expect(metrics.misses).toBe(1);
      expect(metrics.sets).toBe(1);
    });

    it("computes hit rate", () => {
      cacheService.set("k", 1);
      cacheService.get("k");
      cacheService.get("k");
      cacheService.get("miss");

      const rate = cacheService.getHitRate();
      expect(rate).toBe((2 / 3) * 100);
    });

    it("getStats returns size and metrics", () => {
      cacheService.set("s1", { data: "x" });
      cacheService.set("s2", { data: "y" });

      const stats = cacheService.getStats();
      expect(stats.size).toBe(2);
      expect(stats.metrics.sets).toBe(2);
      expect(typeof stats.hitRate).toBe("number");
      expect(stats.memoryUsage).toMatch(/MB/);
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      cacheService.set("c1", 1);
      cacheService.set("c2", 2);
      cacheService.clear();
      expect(cacheService.size()).toBe(0);
      expect(cacheService.get("c1")).toBeNull();
      expect(cacheService.get("c2")).toBeNull();
    });
  });
});
