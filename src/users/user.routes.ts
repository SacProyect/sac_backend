import express from "express";
import type { Request, Response } from "express";
import * as UserService from "./user.services"
import { body, validationResult } from 'express-validator';
import { authenticateToken } from "./user.utils";

export const userRouter = express.Router();


userRouter.get('/all',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const users = await UserService.getAllUsers();
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
            console.log(error)
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