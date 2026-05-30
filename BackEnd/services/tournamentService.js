const rawTournaments = require("../data/tournaments.json");
const { poolPromise } = require("../db");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;

  const number = Number(value);
  return Number.isNaN(number) ? fallback : number;
}

function parseDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = cleanText(value);
  const direct = new Date(text);

  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const compactMatch = text.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(AM|PM)$/i
  );

  if (!compactMatch) return null;

  const [, datePart, hourPart, minutePart, periodPart] = compactMatch;
  let hours = Number(hourPart);
  const period = periodPart.toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  const parsed = new Date(
    `${datePart}T${String(hours).padStart(2, "0")}:${minutePart}:00`
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inferCategory(tournament) {
  const text = `${tournament.category || ""} ${tournament.name || ""} ${
    tournament.level || ""
  }`.toLowerCase();

  if (text.includes("junior") || text.includes("boys") || text.includes("girls")) {
    return "Junior";
  }

  if (text.includes("prize") || text.includes("open")) {
    return "Prize Money";
  }

  return "Adult";
}

function parseUtrRange(tournament) {
  const text = `${tournament.level || ""} ${tournament.highestUtrPlayer || ""}`;
  const rangeMatch = text.match(/UTR\s*([\d.]+)\s*[-–]\s*([\d.]+)/i);

  if (rangeMatch) {
    return {
      minUtr: Number(rangeMatch[1]),
      maxUtr: Number(rangeMatch[2])
    };
  }

  const simpleRangeMatch = text.match(/([\d.]+)\s*[-–]\s*([\d.]+)\s*xx/i);

  if (simpleRangeMatch) {
    return {
      minUtr: Number(simpleRangeMatch[1]),
      maxUtr: Number(simpleRangeMatch[2])
    };
  }

  const singleMatch = text.match(/UTR\s*([\d.]+)/i) || text.match(/([\d.]+)\.xx/i);

  if (singleMatch) {
    const value = Number(singleMatch[1]);
    return {
      minUtr: value,
      maxUtr: value
    };
  }

  return {
    minUtr: null,
    maxUtr: null
  };
}

function getDistanceMiles(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((value) => value === null)) return null;

  const radiusMiles = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeTournament(tournament, index = 0) {
  const parsedDate = parseDate(tournament.date);
  const { minUtr, maxUtr } = parseUtrRange(tournament);
  const price = cleanNumber(tournament.price, 0);
  const latitude = cleanNumber(tournament.latitude);
  const longitude = cleanNumber(tournament.longitude);

  return {
    id: tournament.id || `${cleanText(tournament.name)}-${index}`,
    name: cleanText(tournament.name) || "Untitled Tournament",
    source: cleanText(tournament.source) || "Local",
    category: cleanText(tournament.category) || inferCategory(tournament),
    city: cleanText(tournament.city),
    state: cleanText(tournament.state),
    date: parsedDate ? parsedDate.toISOString() : cleanText(tournament.date),
    rawDate: cleanText(tournament.date),
    startTimestamp: parsedDate ? parsedDate.getTime() : null,
    level: cleanText(tournament.level) || "TBD",
    price,
    players: cleanNumber(tournament.players),
    highestUtrPlayer: cleanText(tournament.highestUtrPlayer) || "TBD",
    minUtr,
    maxUtr,
    registrationLink: cleanText(tournament.registrationLink),
    latitude,
    longitude
  };
}

async function loadSqlTournaments() {
  const pool = await poolPromise;

  if (!pool) {
    return null;
  }

  const result = await pool.request().query(`
    SELECT *
    FROM Tournaments
    ORDER BY date ASC
  `);

  return result.recordset;
}

async function loadTournaments() {
  const useSql = process.env.DATA_SOURCE === "sql";

  if (useSql) {
    const sqlRows = await loadSqlTournaments();

    if (sqlRows) {
      return {
        source: "sql",
        tournaments: sqlRows.map(normalizeTournament)
      };
    }
  }

  return {
    source: "json",
    tournaments: rawTournaments.map(normalizeTournament)
  };
}

function isThisWeekend(timestamp) {
  if (!timestamp) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = today.getDay();
  const daysUntilFriday = (5 - day + 7) % 7;
  const friday = new Date(today.getTime() + daysUntilFriday * MS_PER_DAY);
  const monday = new Date(friday.getTime() + 3 * MS_PER_DAY);

  return timestamp >= friday.getTime() && timestamp < monday.getTime();
}

function applyFilters(tournaments, query = {}) {
  const q = cleanText(query.q).toLowerCase();
  const city = cleanText(query.city).toLowerCase();
  const source = cleanText(query.source);
  const category = cleanText(query.category);
  const maxPrice = cleanNumber(query.maxPrice);
  const minUtr = cleanNumber(query.minUtr);
  const maxUtr = cleanNumber(query.maxUtr);
  const userLat = cleanNumber(query.lat);
  const userLon = cleanNumber(query.lon);
  const maxMiles = cleanNumber(query.maxMiles);
  const dateRange = cleanText(query.dateRange) || "all";
  const sort = cleanText(query.sort) || "date";
  const now = Date.now();

  let filtered = tournaments.map((tournament) => {
    const distance = getDistanceMiles(
      userLat,
      userLon,
      tournament.latitude,
      tournament.longitude
    );

    return {
      ...tournament,
      distance: distance === null ? null : Math.round(distance)
    };
  });

  if (q) {
    filtered = filtered.filter((tournament) =>
      [
        tournament.name,
        tournament.source,
        tournament.category,
        tournament.city,
        tournament.state,
        tournament.level
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }

  if (city) {
    filtered = filtered.filter((tournament) =>
      tournament.city.toLowerCase().includes(city)
    );
  }

  if (source && source !== "All") {
    filtered = filtered.filter((tournament) => tournament.source === source);
  }

  if (category && category !== "All") {
    filtered = filtered.filter((tournament) => tournament.category === category);
  }

  if (maxPrice !== null) {
    filtered = filtered.filter((tournament) => tournament.price <= maxPrice);
  }

  if (minUtr !== null) {
    filtered = filtered.filter(
      (tournament) => tournament.maxUtr !== null && tournament.maxUtr >= minUtr
    );
  }

  if (maxUtr !== null) {
    filtered = filtered.filter(
      (tournament) => tournament.minUtr !== null && tournament.minUtr <= maxUtr
    );
  }

  if (userLat !== null && userLon !== null && maxMiles !== null) {
    filtered = filtered.filter(
      (tournament) =>
        tournament.distance !== null && tournament.distance <= maxMiles
    );
  }

  if (dateRange === "weekend") {
    filtered = filtered.filter((tournament) =>
      isThisWeekend(tournament.startTimestamp)
    );
  }

  if (dateRange === "future") {
    filtered = filtered.filter(
      (tournament) =>
        !tournament.startTimestamp || tournament.startTimestamp >= now
    );
  }

  filtered.sort((a, b) => {
    if (sort === "distance") {
      return (a.distance ?? 9999) - (b.distance ?? 9999);
    }

    if (sort === "priceLow") {
      return a.price - b.price;
    }

    if (sort === "priceHigh") {
      return b.price - a.price;
    }

    if (sort === "highestUtr") {
      return (b.maxUtr ?? 0) - (a.maxUtr ?? 0);
    }

    return (a.startTimestamp ?? Number.MAX_SAFE_INTEGER) -
      (b.startTimestamp ?? Number.MAX_SAFE_INTEGER);
  });

  return filtered;
}

async function getTournamentSearch(query) {
  const { source, tournaments } = await loadTournaments();
  const filtered = applyFilters(tournaments, query);
  const cities = [...new Set(tournaments.map((tournament) => tournament.city).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  return {
    dataSource: source,
    count: filtered.length,
    total: tournaments.length,
    cities,
    tournaments: filtered
  };
}

module.exports = {
  getTournamentSearch,
  normalizeTournament,
  applyFilters
};
