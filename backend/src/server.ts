import "dotenv/config";
import app from "./app";
import { getDb } from "./config/database";
import { startBackupScheduler } from "./jobs/backupScheduler";

const PORT = process.env.PORT || 5001;

// listen + scheduler stay here, not in app.ts, so importing the app in tests
// doesn't bind a port or start a live cron job (either would keep Jest from
// exiting).
app.listen(PORT, async () => {
  await getDb();
  console.log(`Server running on http://localhost:${PORT}`);
  startBackupScheduler();
});
