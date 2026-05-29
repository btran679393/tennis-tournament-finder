const { chromium } = require("playwright");
const { sql, poolPromise } = require("../db");

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanPrice(text) {
  const match = cleanText(text).match(/\$([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

function parseDate(text) {
  const clean = cleanText(text);

  const dateRangeMatch = clean.match(
    /([A-Z][a-z]+\.?\s+\d{1,2}\s*-\s*\d{1,2},\s*\d{4})/
  );

  if (dateRangeMatch) {
    const startDateText = dateRangeMatch[1].replace(
      /([A-Z][a-z]+\.?\s+\d{1,2})\s*-\s*\d{1,2},\s*(\d{4})/,
      "$1, $2"
    );

    const date = new Date(startDateText);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateMatch = clean.match(/([A-Z][a-z]+\.?\s+\d{1,2},\s*\d{4})/);

  if (dateMatch) {
    const date = new Date(dateMatch[1]);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function parseCityState(text) {
  const clean = cleanText(text);

  const cityStateZipMatch = clean.match(
    /([A-Za-z\s.'-]+),\s*([A-Z]{2}),?\s*\d{5}/
  );

  if (cityStateZipMatch) {
    return {
      city: cleanText(cityStateZipMatch[1]),
      state: cleanText(cityStateZipMatch[2])
    };
  }

  const cityStateMatch = clean.match(/([A-Za-z\s.'-]+),\s*([A-Z]{2})/);

  return {
    city: cityStateMatch ? cleanText(cityStateMatch[1]) : "",
    state: cityStateMatch ? cleanText(cityStateMatch[2]) : ""
  };
}

function getCategory(text) {
  const value = cleanText(text).toLowerCase();

  if (value.includes("junior") || value.includes("boys") || value.includes("girls")) {
    return "Junior";
  }

  if (value.includes("prize") || value.includes("open")) {
    return "Prize Money";
  }

  return "Adult";
}

function getLevel(text) {
  const clean = cleanText(text);

  const levelMatch = clean.match(/Level\s*\d+/i);
  if (levelMatch) return levelMatch[0];

  const ntrpMatch = clean.match(/NTRP\s*[A-Za-z0-9\s/.-]*/i);
  if (ntrpMatch) return cleanText(ntrpMatch[0]);

  return "USTA Tournament";
}

function isBadName(name) {
  const value = cleanText(name).toLowerCase();

  const badNames = [
    "sign in",
    "main menu",
    "my profile settings",
    "programs",
    "search by keyword",
    "find local tennis",
    "enable accessibility",
    "skip to content",
    "usta sites",
    "about",
    "help",
    "contact",
    "tournaments",
    "home",
    "menu",
    "register",
    "view",
    "location",
    "distance"
  ];

  return badNames.includes(value);
}

function limitText(value, maxLength) {
  const text = cleanText(value);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

async function getTournamentDetails(browser, link) {
  const detailPage = await browser.newPage();

  try {
    await detailPage.goto(link, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await detailPage.waitForTimeout(3500);

    return await detailPage.evaluate(() => {
      const bodyText = document.body.innerText || "";

      const lines = bodyText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const title =
        document.querySelector("h1")?.innerText ||
        lines.find((line) => line.length > 12 && !line.includes("USTA")) ||
        "";

      const dateLine =
        lines.find((line) => /[A-Z][a-z]+\.?\s+\d{1,2}\s*-\s*\d{1,2},\s*\d{4}/.test(line)) ||
        lines.find((line) => /[A-Z][a-z]+\.?\s+\d{1,2},\s*\d{4}/.test(line)) ||
        "";

      const venueLine =
        lines.find(
          (line) =>
            line.includes(",") &&
            /\b[A-Z]{2}\b/.test(line) &&
            line.length < 160
        ) || "";

      const priceLine =
        lines.find((line) => /\$[\d.]+/.test(line)) || "";

      const levelLine =
        lines.find((line) => /Level\s*\d+/i.test(line)) ||
        lines.find((line) => /NTRP/i.test(line)) ||
        "";

      const playersLine =
        lines.find((line) => /players/i.test(line)) || "";

      const eventTypeLine =
        lines.find((line) => /Singles|Doubles|Tournament|Championship|Open/i.test(line)) || "";

      const divisions = lines
        .filter((line) =>
          /Singles|Doubles|Boys|Girls|Adult|Junior|Level|NTRP|Open/i.test(line)
        )
        .slice(0, 12)
        .join(" | ");

      const description = lines.slice(0, 20).join(" ");

      return {
        title,
        rawText: bodyText,
        dateLine,
        venue: venueLine,
        priceText: priceLine,
        level: levelLine,
        playersText: playersLine,
        eventType: eventTypeLine,
        divisions,
        description
      };
    });
  } catch (err) {
    console.log("Detail page failed:", link);
    console.log(err.message);

    return {
      title: "",
      rawText: "",
      dateLine: "",
      venue: "",
      priceText: "",
      level: "",
      playersText: "",
      eventType: "",
      divisions: "",
      description: ""
    };
  } finally {
    await detailPage.close();
  }
}

async function scrapeUstaToSql() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    const searchUrl =
      "https://playtennis.usta.com/tournaments?location=McMinnville,%20OR&date-range[]=&date-range[]=2026-07-25T00:00:00.000Z&distance=200&event-wtn-level[]=1&event-wtn-level[]=40&event-division-age-range[]=5&event-division-age-range[]=99";

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(10000);
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(3000);

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map((link) => link.href)
        .filter((href) => href && href.includes("/Tournaments/overview/"));
    });

    const uniqueLinks = [...new Set(links)];

    console.log(`Found ${uniqueLinks.length} USTA tournament detail links`);

    const tournaments = [];

    for (const link of uniqueLinks) {
      const detail = await getTournamentDetails(browser, link);

      const name = cleanText(detail.title);

      if (!name || isBadName(name)) {
        continue;
      }

      tournaments.push({
        source: "USTA",
        name,
        rawText: cleanText(detail.rawText),
        registrationLink: link,
        date: parseDate(detail.dateLine || detail.rawText),
        cityStateText: detail.venue,
        price: cleanPrice(detail.priceText || detail.rawText),
        level: getLevel(detail.level || detail.rawText),
        category: getCategory(`${name} ${detail.rawText}`),
        venue: limitText(detail.venue, 255),
        description: limitText(detail.description, 2000),
        eventType: limitText(detail.eventType, 100),
        divisions: limitText(detail.divisions, 2000)
      });

      console.log("Scraped detail:", name);
    }

    console.log(`Scraped ${tournaments.length} clean USTA tournaments`);

    const pool = await poolPromise;

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const t of tournaments) {
      try {
        const { city, state } = parseCityState(t.cityStateText || t.rawText);

        if (!t.name || !t.registrationLink) {
          skipped++;
          continue;
        }

        const duplicate = await pool
          .request()
          .input("registrationLink", sql.NVarChar, t.registrationLink)
          .input("name", sql.NVarChar, t.name)
          .query(`
            SELECT TOP 1 id
            FROM Tournaments
            WHERE registrationLink = @registrationLink
               OR name = @name
          `);

        if (duplicate.recordset.length > 0) {
          await pool
            .request()
            .input("id", sql.Int, duplicate.recordset[0].id)
            .input("source", sql.NVarChar, "USTA")
            .input("name", sql.NVarChar, t.name)
            .input("category", sql.NVarChar, t.category)
            .input("city", sql.NVarChar, city)
            .input("state", sql.NVarChar, state)
            .input("date", sql.DateTime, t.date)
            .input("level", sql.NVarChar, t.level)
            .input("price", sql.Decimal(10, 2), t.price)
            .input("registrationLink", sql.NVarChar, t.registrationLink)
            .input("venue", sql.NVarChar, t.venue)
            .input("description", sql.NVarChar, t.description)
            .input("eventType", sql.NVarChar, t.eventType)
            .input("divisions", sql.NVarChar, t.divisions)
            .query(`
              UPDATE Tournaments
              SET
                source = @source,
                name = @name,
                category = @category,
                city = @city,
                state = @state,
                date = @date,
                level = @level,
                price = @price,
                registrationLink = @registrationLink,
                venue = @venue,
                description = @description,
                eventType = @eventType,
                divisions = @divisions
              WHERE id = @id
            `);

          updated++;
          console.log("Updated:", t.name);
        } else {
          await pool
            .request()
            .input("name", sql.NVarChar, t.name)
            .input("source", sql.NVarChar, "USTA")
            .input("category", sql.NVarChar, t.category)
            .input("city", sql.NVarChar, city)
            .input("state", sql.NVarChar, state)
            .input("date", sql.DateTime, t.date)
            .input("level", sql.NVarChar, t.level)
            .input("price", sql.Decimal(10, 2), t.price)
            .input("registrationLink", sql.NVarChar, t.registrationLink)
            .input("latitude", sql.Float, 0)
            .input("longitude", sql.Float, 0)
            .input("venue", sql.NVarChar, t.venue)
            .input("description", sql.NVarChar, t.description)
            .input("eventType", sql.NVarChar, t.eventType)
            .input("divisions", sql.NVarChar, t.divisions)
            .query(`
              INSERT INTO Tournaments
              (
                name,
                source,
                category,
                city,
                state,
                date,
                level,
                price,
                registrationLink,
                latitude,
                longitude,
                venue,
                description,
                eventType,
                divisions
              )
              VALUES
              (
                @name,
                @source,
                @category,
                @city,
                @state,
                @date,
                @level,
                @price,
                @registrationLink,
                @latitude,
                @longitude,
                @venue,
                @description,
                @eventType,
                @divisions
              )
            `);

          inserted++;
          console.log("Inserted:", t.name);
        }
      } catch (err) {
        skipped++;
        console.log("Failed:", t.name);
        console.log(err.message);
      }
    }

    console.log("");
    console.log("Finished USTA scrape");
    console.log("Inserted:", inserted);
    console.log("Updated:", updated);
    console.log("Skipped:", skipped);
  } catch (err) {
    console.error("USTA scrape failed:", err.message);
  } finally {
    await browser.close();
  }
}

module.exports = scrapeUstaToSql;

if (require.main === module) {
  scrapeUstaToSql();
}