import express from "express"
import * as dotenv from "dotenv"
import cors from "cors"
import { userRouter } from "./src/users/user.routes"
import { taxpayerRouter } from "./src/taxpayer/taxpayer.routes"
import { reportRouter } from "./src/reports/reports.routes"
import { censusRouter } from "./src/census/census.routes"
import path from "path"
dotenv.config()

/** Log de conexión a BD al iniciar: host, nombre de BD y entorno inferido (desarrollo/producción) */
function logDatabaseConnection() {
    const url = process.env.DATABASE_URL
    if (!url) {
        console.warn("[DB] DATABASE_URL no definida")
        return
    }
    try {
        const u = new URL(url.replace(/^mysql:\/\//, "https://"))
        const host = u.hostname
        const port = u.port || "3306"
        const dbName = (u.pathname || "").replace(/^\//, "") || "(sin nombre)"
        const envLabel = /development|dev|local|test/i.test(dbName) ? "DESARROLLO" : "PRODUCCIÓN"
        console.log("----------------------------------------")
        console.log("[DB] Conexión activa:")
        console.log(`[DB]   Host: ${host}:${port}`)
        console.log(`[DB]   Base de datos: ${dbName}`)
        console.log(`[DB]   Entorno: ${envLabel}`)
        console.log("----------------------------------------")
    } catch {
        console.warn("[DB] No se pudo interpretar DATABASE_URL (solo se muestra que está definida)")
    }
}

logDatabaseConnection()

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
    "https://main.d2inp34pig64ff.amplifyapp.com",
    "https://sac-app.com",
    "https://www.sac-app.com",
    "http://localhost:39733"
];

app.use(cors({
    origin: (origin, callback) => {
        if (
            !origin ||
            allowedOrigins.includes(origin) ||
            /\.ngrok-free\.app$/.test(origin)
        ) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

app.get("/", (req, res) => {
    res.send("API is working!");
});


app.use("/user", userRouter)
app.use("/taxpayer", taxpayerRouter)
app.use("/reports", reportRouter)
app.use("/census", censusRouter)
app.use('/uploads', express.static(path.join(__dirname, './uploads')));




app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is listening on port: ${PORT}`)
})

export default app