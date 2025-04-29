import express from "express"
import * as dotenv from "dotenv"
import cors from "cors"
import { userRouter } from "./src/users/user.routes"
import { taxpayerRouter } from "./src/taxpayer/taxpayer.routes"
import { reportRouter } from "./src/reports/reports.routes"
import path from "path"
dotenv.config()

if (!process.env.PORT) {
    console.log(`No port value specified...`)
}
const PORT = parseInt(process.env.PORT as string, 10)

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const allowedOrigins = [
    "http://localhost:5173",
    "http://172.16.0.145:5173",
    "https://sac-mu.vercel.app",
    "https://sacfrontend-esfdn6llv-sacs-projects-6fc34506.vercel.app",
    "https://main.d2inp34pig64ff.amplifyapp.com"
];

const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: "GET, POST, PUT, DELETE",
    allowedHeaders: "Content-Type, Authorization"
};


app.use(cors({
    origin: (origin, cb) => {
        if (
            !origin ||
            allowedOrigins.includes(origin) ||
            /\.ngrok-free\.app$/.test(origin)
        ) {
            cb(null, true);
        } else {
            cb(new Error("Not allowed by CORS"));
        }
    }
}));
app.use("/user", userRouter)
app.use("/taxpayer", taxpayerRouter)
app.use("/reports", reportRouter)
app.use('/uploads', express.static(path.join(__dirname, './uploads')));




app.listen(PORT, () => {
    console.log(`Server is listening on port: ${PORT}`)
})

export default app