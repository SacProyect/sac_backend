import express from "express"
import * as dotenv from "dotenv"
import cors from "cors"
import { userRouter } from "./src/users/user.routes"
import { taxpayerRouter } from "./src/taxpayer/taxpayer.routes"
import { reportRouter } from "./src/reports/reports.routes"
dotenv.config()

if (!process.env.PORT) {
    console.log(`No port value specified...`)
}
const PORT = parseInt(process.env.PORT as string, 10)

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
// CORS configuration allowing only the frontend (localhost:5173)
app.use(
    cors({
        origin: 'http://localhost:5173', // Replace with your frontend URL
        methods: 'GET, POST, PUT, DELETE', // Add the HTTP methods you need
        allowedHeaders: 'Content-Type, Authorization', // Allow headers you need
    })
);
app.use("/user", userRouter)
app.use("/taxpayer", taxpayerRouter)
app.use("/reports", reportRouter)

app.listen(PORT, () => {
    console.log(`Server is listening on port: ${PORT}`)
})

export default app