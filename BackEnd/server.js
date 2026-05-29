require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cron = require("node-cron");

const { poolPromise } = require("./db");
const scrapeUTRToSql = require("./scrapers/scrapeUtrToSql");

const tournamentRoutes = require("./routes/tournaments");
const aiRoutes = require("./routes/ai");

const app = express();
const PORT = process.env.PORT || 5000;

console.log("Loaded server.js with SQL database route");

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Tennis Tournament Finder API is running");
});

app.get("/api/test", (req, res) => {
  res.json({ message: "Backend is working" });
});

app.get("/api/tournaments-db", async (req, res) => {
  try {
    const pool = await poolPromise;

    if (!pool) {
      return res.status(500).json({ error: "Database pool was not created" });
    }

    const result = await pool.request().query(`
      SELECT *
      FROM Tournaments
      ORDER BY date ASC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("SQL Server error:", err);
    res.status(500).json({ error: err.message });
  }
});

cron.schedule("0 */6 * * *", async () => {
  console.log("Running scheduled UTR scrape...");

  try {
    await scrapeUTRToSql();
    console.log("Scheduled UTR scrape finished");
  } catch (err) {
    console.error("Scheduled UTR scrape failed:", err.message);
  }
});

app.use("/api/tournaments", tournamentRoutes);
app.use("/api/ai", aiRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});