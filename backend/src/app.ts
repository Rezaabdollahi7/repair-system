import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import "dotenv/config";
import { getDb } from "./config/database";
import routes from "./routes";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api", routes);

app.get("/api/health", async (req: Request, res: Response) => {
  await getDb();
  res.json({ status: "OK", message: "Server is running", db: "connected" });
});

export default app;
