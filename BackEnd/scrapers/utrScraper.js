const { chromium } = require("playwright");

async function scrapeUTR() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    const searchUrl =
      "https://app.utrsports.net/search?lat=44.9429&lng=-123.0351&distance=200mi&eventState=open_registration&utrMin=1&utrMax=16&utrType=verified&utrTeamType=singles&type=events";

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(7000);

    const tournaments = await page.evaluate((currentUrl) => {
      const cards = Array.from(document.querySelectorAll("div"));

      return cards
        .map((card) => card.innerText)
        .filter((text) => text && text.includes("Registration Open"))
        .map((text) => {
          const lines = text
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

          return {
            source: "UTR",
            category: "",
            name: lines[1] || "",
            cityState: lines[2] || "",
            level: lines.find((line) => line.includes("UTR")) || "",
            dateText:
              lines.find((line) => line.includes("TODAY")) ||
              lines.find((line) => line.includes("TOMORROW")) ||
              "",
            priceText: lines.find((line) => line.includes("$")) || "",
            registrationLink: currentUrl
          };
        })
        .filter(
          (t) =>
            t.name &&
            t.cityState &&
            t.level &&
            t.level.includes("UTR") &&
            !t.name.includes("Registration Open")
        );
    }, page.url());

    console.log(JSON.stringify(tournaments, null, 2));
    console.log(`Found ${tournaments.length} UTR tournaments within 200 miles of Salem, OR`);
  } catch (err) {
    console.error("UTR scrape failed:", err.message);
  } finally {
    await browser.close();
  }
}

scrapeUTR();