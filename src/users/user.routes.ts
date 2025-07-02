import express from "express";
import type { Request, Response } from "express";
import * as UserService from "./user.services"
import { body, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from "./user.utils";

export const userRouter = express.Router();


userRouter.get('/all',
    authenticateToken,
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")


        try {
            const users = await UserService.getAllUsers(user);
            return res.status(200).json(users)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)

userRouter.post('/',
    body("personId").isNumeric(),
    body("password").isString(),
    async (req: Request, res: Response) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {

            const { personId, password } = req.body;

            const data = await UserService.logIn(personId, password);

            return res.status(200).json(data)
        } catch (error: any) {
            console.error(error)
            return res.status(500).json(error.message)
        }
    }
);

userRouter.post('/sign-up',
    body("personId").isNumeric(),
    body("password").isString(),
    body("name").isString(),
    body("role").isString(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const input = req.body
            const newUser = UserService.signUp(input);
            res.status(200).json(newUser);
        } catch (error: any) {
            return res.status(500).json(error.message);
        }
    }
);

userRouter.get("/me",
    authenticateToken,
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        try {

            const id = user.id;

            const response = await UserService.getUser(id);

            return res.status(200).json(response);

        } catch (err) {
            console.error("Error in /users/me:", err);
            res.status(500).json({ message: "Server error" });
        }
    }
)

userRouter.put('/update-by-name/:name',
    authenticateToken,
    body("name").optional(),
    body("personId").optional(),
    body("email").optional(),

    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden");

        try {
            const name: string = req.params.name;

            const data = req.body;

            const response = await UserService.updateUserByName(name, data);

            return res.status(200).json(response);

        } catch (e) {
            console.error(e);
            return res.status(500).json(e);
        }

    }
)

userRouter.patch('/update-password/:id',
    authenticateToken,
    body("password").notEmpty(),

    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json({ error: "Unauthorized access" });
        if (!["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"].includes(user.role)) {
            return res.status(403).json({ error: "Forbidden role" });
        }

        try {
            // const userId: string = user.id;
            const userId: string = req.params.id;
            const {password} = req.body;


            const response = await UserService.updatePassword(userId, password);

            return res.status(200).json(response);

        } catch (e) {
            console.error(e);
            return res.status(500).json(e);
        }
    }
)