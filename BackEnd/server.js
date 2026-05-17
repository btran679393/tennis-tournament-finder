require("dotenv").config();

const express = require("express");
const cors = require("cors");

const tournamentRoutes = require("./routes/tournaments");
const aiRoutes = require("./routes/ai");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.use("/api/tournaments", tournamentRoutes);
app.use("/api/ai", aiRoutes);

app.get("/", (req, res) => {
  res.send("Tennis Tournament Finder API is running");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});