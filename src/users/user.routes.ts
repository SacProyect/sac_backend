import express from "express";
import type { Request, Response } from "express";
import * as UserService from "./user.services"
import { body, validationResult } from 'express-validator';
import { authenticateToken, generateAcessToken, User } from "./user.utils";

export const userRouter = express.Router();


userRouter.get('/all',
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
    body("cedula").isNumeric(),
    body("password").isString(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const { cedula, password } = req.body;
            const { user, token } = await UserService.logIn(cedula, password);
            return res.status(200).json(user)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
);

userRouter.post('/sign-up',
    body("cedula").isNumeric(),
    body("contrasena").isString(),
    body("nombre").isString(),
    body("tipo").isString(),
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