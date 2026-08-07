import "dotenv/config";
import app from "./app";
import { getDb } from "./config/database";

const PORT = process.env.PORT || 5001;

// listen stays here rather than in app.ts so importing the app in tests
// doesn't bind a port.
app.listen(PORT, async () => {
  await getDb();
  console.log(`Server running on http://localhost:${PORT}`);
});
