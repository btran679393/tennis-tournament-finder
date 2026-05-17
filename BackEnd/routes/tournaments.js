const express = require("express");
const router = express.Router();

const tournaments = require("../data/tournaments.json");

router.get("/", (req, res) => {
  const city = req.query.city?.toLowerCase() || "";

  let filtered = tournaments;

  if (city) {
    filtered = filtered.filter((t) =>
      t.city.toLowerCase().includes(city)
    );
  }

  filtered = [...filtered].sort((a, b) => {
    return new Date(a.date) - new Date(b.date);
  });

  res.json(filtered);
});

module.exports = router;