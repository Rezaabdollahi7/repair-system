import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import "dotenv/config";
import { getDb } from "./config/database";
import { startBackupScheduler } from "./jobs/backupScheduler";
import routes from "./routes";

const app = express();
const PORT = process.env.PORT || 5001;

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

app.listen(PORT, async () => {
  await getDb();
  console.log(`Server running on http://localhost:${PORT}`);
  startBackupScheduler();
});
