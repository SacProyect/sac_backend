import { JwtPayload, sign, verify } from "jsonwebtoken"
import { NextFunction, Request, Response } from "express"
import { hash } from "bcrypt";
import { Taxpayer } from "../taxpayer/taxpayer.utils";

const TOKEN_SECRET = process.env.TOKEN_SECRET as string

export type User = {
    id: string;
    cedula: number;
    nombre: string;
    tipo: string;
    contribuyente?: Taxpayer[]
};
export type NewUserInput = {
    cedula: number;
    nombre: string;
    tipo: string;
    contrasena: string
}

export interface AuthRequest extends Request {
    token: string | JwtPayload;
}

export const generateAcessToken = (user: User) => {
    return sign(
        {
            tipo: user.tipo,
            user: user.id,
        },
        TOKEN_SECRET,
    )
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(' ')[1]
        if (!token) {
            throw new Error();
        }
        const decoded = verify(token, TOKEN_SECRET);
        (req as AuthRequest).token = decoded;
        next()
    } catch (error) {
        console.log(error)
        res.status(401).json('Error while authenticating')
    }
}

export const passwordHashing = async (password: string) => {
    const hashedPassword = await hash(password, 10)
    return hashedPassword
}