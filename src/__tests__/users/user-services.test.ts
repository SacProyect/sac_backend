import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { mockDb } from "../setup";
import * as UserServices from "../../users/user-services";
import { compareSync } from "bcryptjs";

vi.mock("bcryptjs", () => ({
  compareSync: vi.fn(),
  hash: vi.fn((pass: string) => Promise.resolve("hashed_" + pass)),
}));

beforeAll(() => {
  process.env.TOKEN_SECRET = "test-secret-for-jwt";
});

describe("User Services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(compareSync).mockReturnValue(true);
  });

  describe("logIn", () => {
    it("returns user and token on successful login", async () => {
      const user = {
        id: "u1",
        personId: 123,
        name: "Test User",
        role: "FISCAL",
        password: "hashed",
        coordinatedGroup: null,
      };
      (mockDb.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const result = await UserServices.logIn(123, "correct-password");
      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.user.id).toBe("u1");
      expect((result.user as { password?: string }).password).toBe("");
    });

    it("rejects when personId not found", async () => {
      (mockDb.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(UserServices.logIn(999, "any")).rejects.toThrow("Usuario no encontrado");
    });

    it("rejects when password is incorrect", async () => {
      vi.mocked(compareSync).mockReturnValue(false);
      (mockDb.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "u1",
        personId: 123,
        password: "hash",
        coordinatedGroup: null,
      });
      await expect(UserServices.logIn(123, "wrong")).rejects.toThrow("Las credenciales no son correctas");
    });

    it("clears password before returning user", async () => {
      const user = { id: "u1", personId: 1, name: "A", role: "ADMIN", password: "secret", coordinatedGroup: null };
      (mockDb.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      const result = await UserServices.logIn(1, "pass");
      expect((result.user as { password?: string }).password).toBe("");
    });
  });

  describe("signUp", () => {
    it("creates user successfully with valid data", async () => {
      const input = {
        id: "new-id",
        personId: 456,
        name: "New User",
        role: "FISCAL",
        password: "password123",
      };
      const created = { ...input, password: "hashed_password123" };
      (mockDb.user.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);
      const result = await UserServices.signUp(input as any);
      expect(result).toEqual(created);
      expect(mockDb.user.create).toHaveBeenCalled();
      const callData = (mockDb.user.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
      expect(callData.password).toMatch(/^hashed_/);
    });

    it("rejects password shorter than 8 characters", async () => {
      await expect(
        UserServices.signUp({
          id: "x",
          personId: 1,
          name: "X",
          role: "FISCAL",
          password: "short",
        } as any)
      ).rejects.toThrow("mínimo de 8 caracteres");
      expect(mockDb.user.create).not.toHaveBeenCalled();
    });
  });

  describe("getAllUsers", () => {
    it("ADMIN sees all users (excluding ADMIN and COORDINATOR from result)", async () => {
      const allUsers = [
        { id: "1", role: "ADMIN", name: "A" },
        { id: "2", role: "COORDINATOR", name: "B" },
        { id: "3", role: "FISCAL", name: "C" },
        { id: "4", role: "SUPERVISOR", name: "D" },
      ];
      (mockDb.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(allUsers);
      const result = await UserServices.getAllUsers({ id: "admin-1", role: "ADMIN" });
      expect(Array.isArray(result)).toBe(true);
      expect((result as any[]).filter((u) => u.role === "ADMIN" || u.role === "COORDINATOR")).toHaveLength(0);
      expect((result as any[]).length).toBe(2);
    });

    it("COORDINATOR sees only group members", async () => {
      (mockDb.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "coord-1",
        coordinatedGroup: {
          members: [
            { id: "m1", role: "FISCAL", name: "M1" },
            { id: "m2", role: "FISCAL", name: "M2" },
          ],
        },
      });
      const result = await UserServices.getAllUsers({ id: "coord-1", role: "COORDINATOR" });
      expect(Array.isArray(result)).toBe(true);
      expect((result as any[]).length).toBe(2);
    });

    it("SUPERVISOR sees supervised members plus self", async () => {
      (mockDb.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "sup-1",
        role: "SUPERVISOR",
        name: "Supervisor",
        supervised_members: [
          { id: "f1", role: "FISCAL", name: "F1" },
        ],
      });
      const result = await UserServices.getAllUsers({ id: "sup-1", role: "SUPERVISOR" });
      expect(Array.isArray(result)).toBe(true);
      expect((result as any[]).length).toBe(2);
    });

    it("FISCAL gets empty array", async () => {
      const result = await UserServices.getAllUsers({ id: "fiscal-1", role: "FISCAL" });
      expect(Array.isArray(result)).toBe(true);
      expect((result as any[]).length).toBe(0);
      expect(mockDb.user.findMany).not.toHaveBeenCalled();
      expect(mockDb.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
