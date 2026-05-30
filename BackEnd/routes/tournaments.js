const express = require("express");
const router = express.Router();

const { getTournamentSearch } = require("../services/tournamentService");

router.get("/", async (req, res) => {
  try {
    const result = await getTournamentSearch(req.query);
    res.json(result);
  } catch (err) {
    console.error("Tournament route failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
