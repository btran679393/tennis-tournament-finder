require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { poolPromise } = require("./db");

function cleanDate(value) {
  if (!value) return null;

  const text = String(value).trim();

  const normalDate = new Date(text);
  if (!Number.isNaN(normalDate.getTime())) {
    return normalDate;
  }

  const match = text.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(AM|PM)$/i
  );

  if (!match) return null;

  const datePart = match[1];
  let hours = Number(match[2]);
  const minutes = match[3];
  const period = match[4].toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return new Date(
    `${datePart}T${String(hours).padStart(2, "0")}:${minutes}:00`
  );
}

function cleanNumber(value) {
  const number = parseFloat(value);

  if (Number.isNaN(number)) {
    return 0;
  }

  return number;
}

async function seedTournaments() {
  try {
    const filePath = path.join(__dirname, "data", "tournaments.json");
    const tournaments = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const pool = await poolPromise;

    await pool.request().query("DELETE FROM Tournaments");

    let insertedCount = 0;
    let failedCount = 0;

    for (const t of tournaments) {
      try {
        const cleanedDate = cleanDate(t.date);

        await pool
          .request()
          .input("name", String(t.name || ""))
          .input("source", String(t.source || ""))
          .input("category", String(t.category || ""))
          .input("city", String(t.city || ""))
          .input("state", String(t.state || ""))
          .input("date", cleanedDate)
          .input("level", String(t.level || ""))
          .input("price", cleanNumber(t.price))
          .input("registrationLink", String(t.registrationLink || ""))
          .input("latitude", cleanNumber(t.latitude))
          .input("longitude", cleanNumber(t.longitude))
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
              longitude
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
              @longitude
            )
          `);

        insertedCount++;
        console.log("Inserted:", t.name, "| Date:", cleanedDate);
      } catch (err) {
        failedCount++;
        console.log("Failed:", t.name);
        console.log(err.message);
      }
    }

    console.log("Finished seeding SQL Server.");
    console.log(`Inserted: ${insertedCount}`);
    console.log(`Failed: ${failedCount}`);

    process.exit();
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
}

seedTournaments();