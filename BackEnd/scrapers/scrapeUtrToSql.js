const { chromium } = require("playwright");
const { sql, poolPromise } = require("../db");

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanPrice(priceText) {
  const match = cleanText(priceText).match(/\$([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

function parsePlayers(text) {
  const match = cleanText(text).match(/(\d+)\s*Players?/i);
  return match ? Number(match[1]) : null;
}

function parseHighestUtr(levelText) {
  const text = cleanText(levelText);

  const rangeMatch = text.match(/UTR\s*([\d.]+)\s*-\s*([\d.]+)/i);
  if (rangeMatch) return parseFloat(rangeMatch[2]);

  const singleMatch = text.match(/UTR\s*([\d.]+)/i);
  if (singleMatch) return parseFloat(singleMatch[1]);

  return null;
}

function parseCity(cityState) {
  const text = cleanText(cityState);

  if (!text || !text.includes(",")) {
    return { city: "", state: "" };
  }

  const parts = text.split(",");

  return {
    city: cleanText(parts[0]),
    state: cleanText(parts[1])
  };
}

function getCategory(name, level, eventType) {
  const text = `${name} ${level} ${eventType}`.toLowerCase();

  if (text.includes("junior") || text.includes("boys") || text.includes("girls")) {
    return "Junior";
  }

  if (text.includes("prize") || text.includes("open")) {
    return "Prize Money";
  }

  return "Adult";
}

function limitText(value, maxLength) {
  const text = cleanText(value);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

async function getEventDetails(browser, eventLink) {
  const detailPage = await browser.newPage();

  try {
    await detailPage.goto(eventLink, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await detailPage.waitForTimeout(4000);

    const details = await detailPage.evaluate(() => {
      const bodyText = document.body.innerText || "";

      const lines = bodyText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const playersLine =
        lines.find((line) => /(\d+)\s*Players?/i.test(line)) || "";

      const utrLine =
        lines.find((line) => /UTR\s*[\d.]+\s*-\s*[\d.]+/i.test(line)) ||
        lines.find((line) => /UTR\s*[\d.]+/i.test(line)) ||
        "";

      const priceLine =
        lines.find((line) => /\$[\d.]+/.test(line)) || "";

      const dateLine =
        lines.find((line) => /TODAY|TOMORROW/i.test(line)) ||
        lines.find((line) => /\d{1,2}:\d{2}\s*(AM|PM)/i.test(line)) ||
        lines.find((line) => /\w{3,9}\s+\d{1,2}/i.test(line)) ||
        "";

      const eventTypeLine =
        lines.find((line) => /Singles|Doubles|Match Play|Tournament|Camp/i.test(line)) || "";

      const venueLine =
        lines.find(
          (line) =>
            !line.includes("UTR") &&
            !line.includes("$") &&
            !line.includes("Players") &&
            !line.includes("Registration") &&
            line.includes(",") &&
            line.length < 100
        ) || "";

      const divisionLines = lines.filter(
        (line) =>
          /UTR|Singles|Doubles|Boys|Girls|Co-ed|Adult|Junior|NTRP/i.test(line) &&
          line.length < 160
      );

      const descriptionStartIndex = lines.findIndex((line) =>
        /description|overview|about|details/i.test(line)
      );

      let description = "";

      if (descriptionStartIndex !== -1) {
        description = lines
          .slice(descriptionStartIndex + 1, descriptionStartIndex + 8)
          .join(" ");
      } else {
        description = lines.slice(0, 12).join(" ");
      }

      return {
        playersText: playersLine,
        level: utrLine,
        priceText: priceLine,
        dateText: dateLine,
        venue: venueLine,
        eventType: eventTypeLine,
        divisions: divisionLines.join(" | "),
        description
      };
    });

    return details;
  } catch (err) {
    console.log("Detail page failed:", eventLink);
    console.log(err.message);

    return {
      playersText: "",
      level: "",
      priceText: "",
      dateText: "",
      venue: "",
      eventType: "",
      divisions: "",
      description: ""
    };
  } finally {
    await detailPage.close();
  }
}

async function scrapeUTRToSql() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    const searchUrl =
      "https://app.utrsports.net/search?lat=44.9429&lng=-123.0351&distance=200mi&eventState=open_registration&utrMin=1&utrMax=16&utrType=verified&utrTeamType=singles&type=events";

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(8000);
    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(2000);

    const scrapedFromSearch = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[href*='/events/']"));

      return links
        .map((link) => {
          const card = link.closest("div") || link;
          const text = card.innerText || link.innerText || "";

          const lines = text
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

          const nameLine =
            lines.find(
              (line) =>
                !line.includes("Registration Open") &&
                !line.includes("TENNIS") &&
                !line.includes("TODAY") &&
                !line.includes("TOMORROW") &&
                !line.includes("UTR") &&
                !line.includes("$") &&
                !line.includes(",") &&
                !line.includes("Players")
            ) || "";

          const cityStateLine = lines.find((line) => line.includes(",")) || "";

          const levelLine =
            lines.find((line) => line.includes("UTR")) ||
            lines.find((line) => line.includes("Singles")) ||
            "";

          const priceLine = lines.find((line) => line.includes("$")) || "";

          const dateLine =
            lines.find((line) => line.includes("TODAY")) ||
            lines.find((line) => line.includes("TOMORROW")) ||
            lines.find((line) => line.includes("|")) ||
            "";

          const playersLine =
            lines.find((line) => /Players?/i.test(line)) || "";

          return {
            source: "UTR",
            name: nameLine,
            cityState: cityStateLine,
            level: levelLine,
            dateText: dateLine,
            priceText: priceLine,
            playersText: playersLine,
            registrationLink: link.href
          };
        })
        .filter(
          (t) =>
            t.name &&
            t.cityState &&
            t.registrationLink &&
            t.registrationLink.includes("/events/")
        );
    });

    const uniqueScraped = [];
    const seen = new Set();

    for (const t of scrapedFromSearch) {
      const key = `${t.name}-${t.cityState}-${t.registrationLink}`;

      if (!seen.has(key)) {
        seen.add(key);
        uniqueScraped.push(t);
      }
    }

    console.log(`Found ${uniqueScraped.length} UTR tournament links`);

    const enrichedTournaments = [];

    for (const t of uniqueScraped) {
      const detail = await getEventDetails(browser, t.registrationLink);

      enrichedTournaments.push({
        ...t,
        level: cleanText(detail.level) || cleanText(t.level),
        priceText: cleanText(detail.priceText) || cleanText(t.priceText),
        dateText: cleanText(detail.dateText) || cleanText(t.dateText),
        playersText: cleanText(detail.playersText) || cleanText(t.playersText),
        venue: cleanText(detail.venue),
        description: limitText(detail.description, 2000),
        eventType: cleanText(detail.eventType),
        divisions: limitText(detail.divisions, 2000)
      });

      console.log("Enriched:", t.name);
    }

    const pool = await poolPromise;

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const t of enrichedTournaments) {
      try {
        const name = cleanText(t.name);
        const { city, state } = parseCity(t.cityState);
        const level = cleanText(t.level);
        const price = cleanPrice(t.priceText);
        const players = parsePlayers(t.playersText);
        const highestUtrPlayer = parseHighestUtr(level);
        const registrationLink = cleanText(t.registrationLink);
        const venue = limitText(t.venue, 255);
        const description = limitText(t.description, 2000);
        const eventType = limitText(t.eventType, 100);
        const divisions = limitText(t.divisions, 2000);
        const category = getCategory(name, level, eventType);

        if (!name || !city || !state || !registrationLink) {
          skipped++;
          continue;
        }

        const duplicateCheck = await pool
          .request()
          .input("registrationLink", sql.NVarChar, registrationLink)
          .input("name", sql.NVarChar, name)
          .query(`
            SELECT TOP 1 id
            FROM Tournaments
            WHERE registrationLink = @registrationLink
               OR name = @name
          `);

        if (duplicateCheck.recordset.length > 0) {
          await pool
            .request()
            .input("id", sql.Int, duplicateCheck.recordset[0].id)
            .input("source", sql.NVarChar, "UTR")
            .input("category", sql.NVarChar, category)
            .input("city", sql.NVarChar, city)
            .input("state", sql.NVarChar, state)
            .input("level", sql.NVarChar, level)
            .input("price", sql.Decimal(10, 2), price)
            .input("registrationLink", sql.NVarChar, registrationLink)
            .input("players", sql.Int, players)
            .input("highestUtrPlayer", sql.Float, highestUtrPlayer)
            .input("venue", sql.NVarChar, venue)
            .input("description", sql.NVarChar, description)
            .input("eventType", sql.NVarChar, eventType)
            .input("divisions", sql.NVarChar, divisions)
            .query(`
              UPDATE Tournaments
              SET
                source = @source,
                category = @category,
                city = @city,
                state = @state,
                level = @level,
                price = @price,
                registrationLink = @registrationLink,
                players = @players,
                highestUtrPlayer = @highestUtrPlayer,
                venue = @venue,
                description = @description,
                eventType = @eventType,
                divisions = @divisions
              WHERE id = @id
            `);

          updated++;
          console.log("Updated:", name);
          continue;
        }

        await pool
          .request()
          .input("name", sql.NVarChar, name)
          .input("source", sql.NVarChar, "UTR")
          .input("category", sql.NVarChar, category)
          .input("city", sql.NVarChar, city)
          .input("state", sql.NVarChar, state)
          .input("date", sql.DateTime, null)
          .input("level", sql.NVarChar, level)
          .input("price", sql.Decimal(10, 2), price)
          .input("registrationLink", sql.NVarChar, registrationLink)
          .input("latitude", sql.Float, 0)
          .input("longitude", sql.Float, 0)
          .input("players", sql.Int, players)
          .input("highestUtrPlayer", sql.Float, highestUtrPlayer)
          .input("venue", sql.NVarChar, venue)
          .input("description", sql.NVarChar, description)
          .input("eventType", sql.NVarChar, eventType)
          .input("divisions", sql.NVarChar, divisions)
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
              players,
              highestUtrPlayer,
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
              @players,
              @highestUtrPlayer,
              @venue,
              @description,
              @eventType,
              @divisions
            )
          `);

        inserted++;
        console.log("Inserted:", name);
      } catch (err) {
        skipped++;
        console.log("Failed:", t.name);
        console.log(err.message);
      }
    }

    console.log("");
    console.log("Finished importing enriched UTR tournaments");
    console.log("Inserted:", inserted);
    console.log("Updated:", updated);
    console.log("Skipped:", skipped);
  } catch (err) {
    console.error("UTR scrape failed:", err.message);
  } finally {
    await browser.close();
  }
}

module.exports = scrapeUTRToSql;

if (require.main === module) {
  scrapeUTRToSql();
}