const puppeteer = require("puppeteer");

async function fetchUTRTournaments() {
  const browser = await puppeteer.launch({
    headless: "new"
  });

  const page = await browser.newPage();

  try {
    await page.goto(
      "https://app.utrsports.net/events?latitude=44.9429&longitude=-123.0351&radius=100",
      { waitUntil: "networkidle2" }
    );

    await page.waitForSelector(".event-card", { timeout: 10000 });

    const tournaments = await page.evaluate(() => {
      const cards = document.querySelectorAll(".event-card");

      return Array.from(cards).map((card, index) => {
        const name =
          card.querySelector(".event-name")?.innerText || "UTR Event";

        const location =
          card.querySelector(".event-location")?.innerText || "";

        const date =
          card.querySelector(".event-date")?.innerText || "";

        const link =
          "https://app.utrsports.net" +
          (card.querySelector("a")?.getAttribute("href") || "");

        const [city, state] = location.split(",").map((x) => x?.trim());

        return {
          id: index + 1,
          name,
          city: city || "",
          state: state || "",
          date,
          source: "UTR",
          level: "UTR Event",
          price: 0,
          registrationLink: link,
          latitude: 44.94,
          longitude: -123.03
        };
      });
    });

    await browser.close();

    return tournaments;
  } catch (err) {
    console.error("Puppeteer error:", err.message);
    await browser.close();
    return [];
  }
}

module.exports = fetchUTRTournaments;