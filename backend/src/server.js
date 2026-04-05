const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { getDb } = require("./config/database");

const routes = require("./routes");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use("/api", routes);
app.get("/api/health", async (req, res) => {
  await getDb();
  res.json({ status: "OK", message: "Server is running", db: "connected" });
});

app.listen(PORT, async () => {
  await getDb();
  console.log(`Server running on http://localhost:${PORT}`);
});
