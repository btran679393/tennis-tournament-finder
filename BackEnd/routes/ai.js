const express = require("express");
const router = express.Router();

const tournaments = require("../data/tournaments.json");

router.post("/ask", async (req, res) => {
  const { question } = req.body;

  const prompt = `
You are AI Tennis Pro.

You help users find tennis tournaments from the website data.

Important rules:
- Return ONLY valid JSON.
- Do not use markdown.
- Do not make up tournaments.
- Only return tournament objects that already exist in the tournament data.
- Junior tournaments include tournaments where category is "Junior", or the name/level includes Boys, Girls, Junior, Junior Circuits, Kids N' Tennis, or school.
- Adult tournaments include tournaments where category is "Adult", or the name/level includes Adult or NTRP.
- Prize money tournaments include tournaments where category is "Prize Money", or the name/level includes PRIZE Money.
- Cheap tournaments means price under 50.
- Expensive tournaments means price 75 or higher.
- UTR tournaments have source "UTR".
- USTA tournaments have source "USTA".
- If the user asks for a city, return tournaments in that city.
- If the user asks for singles, return tournaments where level or name includes Singles.
- If the user asks for doubles, return tournaments where level or name includes Doubles.
- Always return the matching tournaments sorted from earliest date to latest date.

Tournament data:
${JSON.stringify(tournaments)}

User question:
${question}

Response format:
{
  "message": "short response",
  "tournaments": []
}
`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const data = await response.json();

    if (!data.choices || !data.choices[0]) {
      return res.status(500).json({
        message: "AI Tennis Pro did not return a response.",
        tournaments: []
      });
    }

    let text = data.choices[0].message.content.trim();

    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(text);

    res.json(parsed);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "AI Tennis Pro failed.",
      tournaments: []
    });
  }
});

module.exports = router;