import { response } from "express";
import { db } from "../db-server";

interface changeUserEvents {
    id: string;
}



async function ChangeUserEventsToTrue() {

    try {
        const response = db.event.updateMany({
            where: { taxpayerId: "05ad485e-1a2e-4b3a-85be-76563664f047" },
            data: {
                status: true
            }
        })

        return response
    } catch (e) {
        console.error("error when changing user events status to true" + e);
    }
}


ChangeUserEventsToTrue()










