import express from "express";
import type { Request, Response } from "express";
import { validationResult, query } from "express-validator";
import { container } from "tsyringe";
import { UserController } from "./UserController";
import { authenticateToken, AuthRequest } from "./user-utils";
import { cacheMiddleware, invalidateCacheMiddleware } from "../utils/cache-middleware";

const userController = container.resolve(UserController);

export const userRouter = express.Router();

userRouter.get(
    "/all",
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ["users", "users-list"], includeUser: true }),
    (req: Request, res: Response) => userController.getAllUsers(req, res)
);

userRouter.post("/", (req: Request, res: Response) => userController.login(req, res));

userRouter.post(
    "/sign-up",
    invalidateCacheMiddleware(["users", "users-list", "fiscals"]),
    (req: Request, res: Response) => userController.signUp(req, res)
);

userRouter.get(
    "/me",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["users"], includeUser: true }),
    (req: Request, res: Response) => userController.getMe(req, res)
);

userRouter.get(
    "/get-fiscals-for-review",
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ["users", "fiscals"], includeUser: true }),
    query("year").optional().isInt().withMessage("Year must be an integer"),
    query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
    query("limit")
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage("Limit must be between 1 and 100"),
    (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        return userController.getFiscalsForReview(req, res);
    }
);

userRouter.put(
    "/update-by-name/:name",
    authenticateToken,
    invalidateCacheMiddleware(["users", "users-list"]),
    (req: Request, res: Response) => userController.updateByName(req, res)
);

userRouter.put(
    "/update-password/:id",
    authenticateToken,
    invalidateCacheMiddleware(["users"]),
    (req: Request, res: Response) => userController.updatePassword(req, res)
);

// Restablecimiento de contraseña
userRouter.post(
    "/request-password-reset",
    (req: Request, res: Response) => userController.requestPasswordReset(req, res)
);

userRouter.post(
    "/reset-password",
    (req: Request, res: Response) => userController.resetPasswordWithToken(req, res)
);
