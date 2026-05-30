import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5050";
const SAVED_FILTERS_KEY = "tennisTournamentFinder.filters";

const defaultFilters = {
  q: "",
  city: "",
  source: "All",
  category: "All",
  maxPrice: 500,
  minUtr: "",
  maxUtr: "",
  maxMiles: 50,
  dateRange: "future",
  sort: "date"
};

function loadSavedFilters() {
  try {
    const saved = localStorage.getItem(SAVED_FILTERS_KEY);
    return saved ? { ...defaultFilters, ...JSON.parse(saved) } : defaultFilters;
  } catch {
    return defaultFilters;
  }
}

function formatDate(dateString) {
  if (!dateString) return "TBD";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getDayGroup(dateString) {
  if (!dateString) return "Date TBD";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Date TBD";
  }

  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function showValue(value, fallback = "TBD") {
  if (value === 0 || value === "0") return "0";
  if (value === null || value === undefined || value === "") return fallback;
  return value;
}

function showUtrRange(tournament) {
  if (
    typeof tournament.minUtr === "number" &&
    typeof tournament.maxUtr === "number"
  ) {
    if (tournament.minUtr === tournament.maxUtr) {
      return tournament.maxUtr;
    }

    return `${tournament.minUtr} - ${tournament.maxUtr}`;
  }

  return showValue(tournament.highestUtrPlayer);
}

function App() {
  const [filters, setFilters] = useState(loadSavedFilters);
  const [tournaments, setTournaments] = useState([]);
  const [cities, setCities] = useState([]);
  const [dataSource, setDataSource] = useState("");
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [userLocation, setUserLocation] = useState(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const updateFilter = (name, value) => {
    setFilters((current) => ({
      ...current,
      [name]: value
    }));
  };

  const buildParams = useCallback(() => {
    const params = {};

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== "" && value !== "All") {
        params[key] = value;
      }
    });

    if (userLocation) {
      params.lat = userLocation.latitude;
      params.lon = userLocation.longitude;
      params.maxMiles = filters.maxMiles;
    }

    return params;
  }, [filters, userLocation]);

  const fetchTournaments = useCallback(async () => {
    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await axios.get(`${API_BASE}/api/tournaments`, {
        params: buildParams()
      });

      const payload = response.data;

      setTournaments(payload.tournaments || []);
      setCities(payload.cities || []);
      setDataSource(payload.dataSource || "");
      setTotal(payload.total || 0);
      setStatus("ready");
    } catch (err) {
      console.error(err);
      setTournaments([]);
      setStatus("error");
      setErrorMessage(
        `Could not load tournaments from ${API_BASE}. Check that the backend is running.`
      );
    }
  }, [buildParams]);

  useEffect(() => {
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    const timeout = window.setTimeout(fetchTournaments, 250);
    return () => window.clearTimeout(timeout);
  }, [fetchTournaments]);

  const groupedTournaments = useMemo(() => {
    return tournaments.reduce((groups, tournament) => {
      const label = getDayGroup(tournament.date);

      if (!groups[label]) {
        groups[label] = [];
      }

      groups[label].push(tournament);
      return groups;
    }, {});
  }, [tournaments]);

  const resetFilters = () => {
    setFilters(defaultFilters);
    setUserLocation(null);
    setLocationMessage("");
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Your browser does not support location.");
      return;
    }

    setLocationMessage("Getting your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });

        updateFilter("sort", "distance");
        setLocationMessage("Location added. Results are filtered by distance.");
      },
      () => {
        setUserLocation(null);
        setLocationMessage("Location permission was denied.");
      }
    );
  };

  const applyPreset = (preset) => {
    if (preset === "weekend") {
      setFilters((current) => ({
        ...current,
        dateRange: "weekend",
        sort: userLocation ? "distance" : "date"
      }));
      return;
    }

    if (preset === "cheap") {
      setFilters((current) => ({
        ...current,
        maxPrice: 50,
        sort: "priceLow"
      }));
      return;
    }

    if (preset === "junior") {
      setFilters((current) => ({
        ...current,
        category: "Junior",
        sort: "date"
      }));
      return;
    }

    if (preset === "utr") {
      setFilters((current) => ({
        ...current,
        sort: "highestUtr"
      }));
    }
  };

  const askAiTennisPro = async () => {
    if (!aiQuestion.trim()) return;

    const question = aiQuestion.toLowerCase();

    if (
      question.includes("highest utr") ||
      question.includes("best utr") ||
      question.includes("top utr")
    ) {
      updateFilter("sort", "highestUtr");
      setAiMessage("Sorted tournaments by highest UTR.");
      return;
    }

    setAiLoading(true);
    setAiMessage("AI Tennis Pro is thinking...");

    try {
      const response = await axios.post(`${API_BASE}/api/ai/ask`, {
        question: aiQuestion
      });

      const data = response.data.tournaments || [];
      setAiMessage(response.data.message);
      setTournaments(data);
    } catch (err) {
      console.error(err);
      setAiMessage("AI Tennis Pro needs a valid OPENROUTER_API_KEY.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <main className="page">
      <header className="appHeader">
        <div>
          <p className="eyebrow">Tournament discovery</p>
          <h1>Tennis Tournament Finder</h1>
          <p className="subtitle">
            Search upcoming events by city, level, price, source, and distance.
          </p>
        </div>

        <div className="statusPanel">
          <span>{status === "loading" ? "Loading" : `${tournaments.length} shown`}</span>
          <strong>{total} total</strong>
          {dataSource && <em>{dataSource.toUpperCase()} data</em>}
        </div>
      </header>

      <section className="quickActions" aria-label="Quick filters">
        <button type="button" onClick={() => applyPreset("weekend")}>
          This weekend
        </button>
        <button type="button" onClick={useMyLocation}>
          Near me
        </button>
        <button type="button" onClick={() => applyPreset("cheap")}>
          Under $50
        </button>
        <button type="button" onClick={() => applyPreset("junior")}>
          Juniors
        </button>
        <button type="button" onClick={() => applyPreset("utr")}>
          Highest UTR
        </button>
      </section>

      <section className="workspace">
        <aside className="filters" aria-label="Tournament filters">
          <div className="filterHeader">
            <h2>Filters</h2>
            <button type="button" className="textButton" onClick={resetFilters}>
              Reset
            </button>
          </div>

          <label>
            Search
            <input
              type="search"
              placeholder="Name, level, source"
              value={filters.q}
              onChange={(event) => updateFilter("q", event.target.value)}
            />
          </label>

          <label>
            City
            <input
              list="city-options"
              placeholder="Portland"
              value={filters.city}
              onChange={(event) => updateFilter("city", event.target.value)}
            />
            <datalist id="city-options">
              {cities.map((city) => (
                <option value={city} key={city} />
              ))}
            </datalist>
          </label>

          <div className="filterRow">
            <label>
              Source
              <select
                value={filters.source}
                onChange={(event) => updateFilter("source", event.target.value)}
              >
                <option value="All">All</option>
                <option value="UTR">UTR</option>
                <option value="USTA">USTA</option>
                <option value="Local">Local</option>
              </select>
            </label>

            <label>
              Category
              <select
                value={filters.category}
                onChange={(event) => updateFilter("category", event.target.value)}
              >
                <option value="All">All</option>
                <option value="Junior">Junior</option>
                <option value="Adult">Adult</option>
                <option value="Prize Money">Prize Money</option>
              </select>
            </label>
          </div>

          <label>
            Max price: ${filters.maxPrice}
            <input
              type="range"
              min="0"
              max="500"
              step="5"
              value={filters.maxPrice}
              onChange={(event) => updateFilter("maxPrice", Number(event.target.value))}
            />
          </label>

          <div className="filterRow">
            <label>
              Min UTR
              <input
                type="number"
                min="0"
                max="16"
                step="0.5"
                placeholder="Any"
                value={filters.minUtr}
                onChange={(event) => updateFilter("minUtr", event.target.value)}
              />
            </label>

            <label>
              Max UTR
              <input
                type="number"
                min="0"
                max="16"
                step="0.5"
                placeholder="Any"
                value={filters.maxUtr}
                onChange={(event) => updateFilter("maxUtr", event.target.value)}
              />
            </label>
          </div>

          <label>
            Distance: {filters.maxMiles} miles
            <input
              type="range"
              min="5"
              max="250"
              step="5"
              value={filters.maxMiles}
              onChange={(event) => updateFilter("maxMiles", Number(event.target.value))}
              disabled={!userLocation}
            />
          </label>

          {locationMessage && <p className="helperText">{locationMessage}</p>}

          <div className="filterRow">
            <label>
              Date
              <select
                value={filters.dateRange}
                onChange={(event) => updateFilter("dateRange", event.target.value)}
              >
                <option value="all">All</option>
                <option value="future">Upcoming</option>
                <option value="weekend">This weekend</option>
              </select>
            </label>

            <label>
              Sort
              <select
                value={filters.sort}
                onChange={(event) => updateFilter("sort", event.target.value)}
              >
                <option value="date">Soonest</option>
                <option value="distance">Closest</option>
                <option value="priceLow">Cheapest</option>
                <option value="priceHigh">Most expensive</option>
                <option value="highestUtr">Highest UTR</option>
              </select>
            </label>
          </div>
        </aside>

        <section className="results" aria-label="Tournament results">
          {errorMessage && <div className="notice error">{errorMessage}</div>}

          {dataSource === "json" && status === "ready" && (
            <div className="notice">
              Running from bundled sample data. Set DATA_SOURCE=sql to use SQL Server.
            </div>
          )}

          {status === "loading" && <div className="empty">Loading tournaments...</div>}

          {status === "ready" && tournaments.length === 0 && (
            <div className="empty">
              <strong>No tournaments found.</strong>
              <span>Try widening distance, price, date, or UTR filters.</span>
            </div>
          )}

          {status === "ready" &&
            Object.entries(groupedTournaments).map(([dateLabel, group]) => (
              <section className="dayGroup" key={dateLabel}>
                <div className="dayHeader">
                  <h2>{dateLabel}</h2>
                  <span>{group.length} events</span>
                </div>

                <div className="cardList">
                  {group.map((tournament) => (
                    <article className="card" key={tournament.id}>
                      <div className="cardTop">
                        <span className={`badge ${tournament.source.toLowerCase()}`}>
                          {tournament.source}
                        </span>
                        <span className="date">{formatDate(tournament.date)}</span>
                      </div>

                      <h3>{tournament.name}</h3>
                      <p className="location">
                        {tournament.city}, {tournament.state}
                        {tournament.distance !== null &&
                          tournament.distance !== undefined &&
                          `, ${tournament.distance} miles away`}
                      </p>

                      <dl className="details">
                        <div>
                          <dt>Category</dt>
                          <dd>{tournament.category}</dd>
                        </div>
                        <div>
                          <dt>Level</dt>
                          <dd>{tournament.level}</dd>
                        </div>
                        <div>
                          <dt>Entry</dt>
                          <dd>${tournament.price}</dd>
                        </div>
                        <div>
                          <dt>Players</dt>
                          <dd>{showValue(tournament.players)}</dd>
                        </div>
                        <div>
                          <dt>UTR Range</dt>
                          <dd>{showUtrRange(tournament)}</dd>
                        </div>
                      </dl>

                      {tournament.registrationLink ? (
                        <a
                          className="registerBtn"
                          href={tournament.registrationLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Register
                        </a>
                      ) : (
                        <span className="missingLink">No registration link</span>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
        </section>
      </section>

      <aside className="floatingAi" aria-label="AI Tennis Pro">
        <h2>AI Tennis Pro</h2>
        <div className="aiSearchBox">
          <input
            type="text"
            placeholder="Ask a tournament question"
            value={aiQuestion}
            onChange={(event) => setAiQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") askAiTennisPro();
            }}
          />
          <button type="button" onClick={askAiTennisPro} disabled={aiLoading}>
            {aiLoading ? "Thinking" : "Ask"}
          </button>
        </div>
        {aiMessage && <p className="aiMessage">{aiMessage}</p>}
      </aside>
    </main>
  );
}

export default App;
