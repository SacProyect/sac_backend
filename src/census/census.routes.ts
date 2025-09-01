import express from "express";
import { Router } from "express";
import type { Request, Response } from "express";
import * as CensusServices from "./census.services"
import { body, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from "../users/user.utils";
// import multer, { StorageEngine } from "multer";
// import path from "path";
import fs from 'fs'
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createLocalUpload } from "../utils/multer.local";
import { uploadMemory } from "../utils/multer.memory";
export const censusRouter = Router();


censusRouter.post(
    '/',
    authenticateToken,
    body("number").isNumeric(),
    body("process").isString(),
    body("name").isString(),
    body("rif").matches(/^[JVEPG]\d{9}$/).withMessage("RIF format is invalid"),
    body("type").isString(),
    body("userId").isString(),
    body("address").notEmpty(),
    body("emition_date").notEmpty().isString(),

    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log("Validation Errors:", errors.array()); // 👈 imprime en consola del backend
            return res.status(400).json({ errors: errors.array() });
        }



        try {

            const { user } = req as AuthRequest;
            const role = user?.role;

            const { number, process, name, rif, type, userId, address, emition_date } = req.body;


            const newTaxpayerCensus = await CensusServices.createTaxpayerCensus({
                number: Number(number),
                process,
                name,
                rif,
                type,
                userId,
                emition_date: new Date(emition_date),
                address,
                role: role,
            });

            return res.status(200).json(newTaxpayerCensus);
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    }
);


censusRouter.get('/getCensus',
    authenticateToken,

    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest;

        if (!user) return res.status(401).json({ error: "Unauthorized access" });
        if (!["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"].includes(user.role)) {
            return res.status(403).json({ error: "Forbidden role" });
        }

        try {
            const taxpayer = await CensusServices.getTaxpayerCensus();

            return res.status(200).json(taxpayer)
        } catch (error: any) {
            return res.status(500).json(error.message);
        }

    }
)

censusRouter.delete('/delete-census/:id',
    authenticateToken,

    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest;

        if (!user) return res.status(401).json({ error: "Unauthorized access" });
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden.")

        const id: string = req.params.id;

        try {
            const taxpayer = await CensusServices.deleteTaxpayerCensus(id);

            return res.status(201).json(taxpayer)
        } catch (error: any) {
            return res.status(500).json(error.message);
        }

    }
);

censusRouter.get('/processes/active',
    authenticateToken,
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json({ error: "Unauthorized access" });
        if (!["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"].includes(user.role)) {
            return res.status(403).json({ error: "Forbidden role" });
        }
        try {
            const activeProcesses = await CensusServices.getActiveProcesses();
            return res.status(200).json(activeProcesses);
        } catch (error: any) {
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    }
);

censusRouter.get('/processes/completed',
    authenticateToken,
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json({ error: "Unauthorized access" });
        if (!["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"].includes(user.role)) {
            return res.status(403).json({ error: "Forbidden role" });
        }
        try {
            const completedProcesses = await CensusServices.getCompletedProcesses();
            return res.status(200).json(completedProcesses);
        } catch (error: any) {
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    }
);


