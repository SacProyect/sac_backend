import express from "express";
import cors from "cors";
import path from "path";
import { userRouter } from "./users/user.routes";
import { taxpayerRouter } from "./taxpayer/taxpayer.routes";
import { reportRouter } from "./reports/reports.routes";
import { censusRouter } from "./census/census.routes";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = [
  "http://localhost:5173",
  "http://172.16.0.145:5173",
  "https://sac-mu.vercel.app",
  "https://sacfrontend-esfdn6llv-sacs-projects-6fc34506.vercel.app",
  "https://main.d2inp34pig64ff.amplifyapp.com",
  "https://sac-app.com",
  "https://www.sac-app.com",
  "http://localhost:39733",
];

app.use(
  cors({
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
    credentials: true,
  })
);

app.get("/", (req, res) => {
  res.send("API is working!");
});

app.use("/user", userRouter);
app.use("/taxpayer", taxpayerRouter);
app.use("/reports", reportRouter);
app.use("/census", censusRouter);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

export default app;
