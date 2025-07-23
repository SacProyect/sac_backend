import { JwtPayload, sign, verify } from "jsonwebtoken"
import { NextFunction, Request, Response } from "express"
import { hash } from "bcrypt";
import { Taxpayer } from "../taxpayer/taxpayer.utils";
import { Taxpayer_Fases, user_roles } from "@prisma/client";

const TOKEN_SECRET = process.env.TOKEN_SECRET as string


export interface AuthRequest extends Request {
    user?: { id: string; role: string }; // Store user ID and role
}

export type AuthUser = {
    id: string;
    role: string;
};

export type User = {
    id: string;
    personId: number;
    name: string;
    role: string;
    supervised_members?: User[],
    taxpayer?: Taxpayer[];
    // fase?: Taxpayer_Fases;
};

export type UpdateUserByNameInput = {
    name: string,
    data: DataUserByNameInput,
}

export type DataUserByNameInput = {
    name?: string;
    personId?: string;
    email?: string;
}



export type NewUserInput = {
    id: string;
    personId: number;
    name: string;
    role: user_roles;
    password: string;
}

export interface AuthRequest extends Request {
    token: string | JwtPayload;
}

export const generateAcessToken = (user: User) => {
    return sign(
        {
            type: user.role,
            user: user.id,
        },
        TOKEN_SECRET,
    )
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "Access denied. No token provided." });
        }

        const decoded = verify(token, TOKEN_SECRET) as { type: string; user: string };

        if (!decoded || !decoded.user || !decoded.type) {
            return res.status(401).json({ message: "Invalid token." });
        }

        // ✅ Correctly attach user data by explicitly casting `req`
        (req as AuthRequest).user = { id: decoded.user, role: decoded.type };

        next();
    } catch (error) {
        console.error("Authentication error:", error);
        return res.status(401).json({ message: "Error while authenticating." });
    }
};


export const passwordHashing = async (password: string) => {
    const hashedPassword = await hash(password, 10)
    return hashedPassword
}