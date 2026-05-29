import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [allTournaments, setAllTournaments] = useState([]);
  const [tournaments, setTournaments] = useState([]);

  const [city, setCity] = useState("");
  const [maxMiles, setMaxMiles] = useState(50);
  const [userLocation, setUserLocation] = useState(null);
  const [locationMessage, setLocationMessage] = useState("");

  const [sourceFilter, setSourceFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [maxPrice, setMaxPrice] = useState(500);
  const [sortOption, setSortOption] = useState("date");

  const [aiQuestion, setAiQuestion] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const API_BASE = "http://localhost:5000";

  const formatDate = (dateString) => {
    if (!dateString) return "TBD";

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return dateString;
    }

    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3958.8;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const convertDate = (dateString) => {
    if (!dateString) return new Date(9999, 0, 1);
    const date = new Date(dateString);
    if (!Number.isNaN(date.getTime())) return date;

    const [datePart, timePart] = dateString.split(" ");
    if (!datePart || !timePart) return new Date(9999, 0, 1);

    const match = timePart.match(/(\d+):(\d+)(AM|PM)/);
    if (!match) return new Date(9999, 0, 1);

    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const period = match[3];

    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    return new Date(
      `${datePart}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0"
      )}:00`
    );
  };

  const getMaxUtrFromLevel = (level) => {
    if (!level) return 0;

    const rangeMatch = level.match(/UTR\s*([\d.]+)\s*-\s*([\d.]+)/i);
    if (rangeMatch) return parseFloat(rangeMatch[2]);

    const singleMatch = level.match(/UTR\s*([\d.]+)/i);
    if (singleMatch) return parseFloat(singleMatch[1]);

    return 0;
  };

  const getTournamentHighestUtr = (tournament) => {
    const directUtr = Number(tournament.highestUtrPlayer);

    if (!Number.isNaN(directUtr) && directUtr > 0) {
      return directUtr;
    }

    return getMaxUtrFromLevel(tournament.level);
  };

  const showPlayers = (players) => {
    if (players === 0 || players === "0") return "0";
    if (players === null || players === undefined || players === "") return "TBD";
    return players;
  };

  const showHighestUtrPlayer = (tournament) => {
    const highest = tournament.highestUtrPlayer;

    if (highest !== null && highest !== undefined && highest !== "") {
      return highest;
    }

    const maxUtr = getMaxUtrFromLevel(tournament.level);

    if (maxUtr > 0) {
      return maxUtr;
    }

    return "TBD";
  };

  const sortTournaments = (data) => {
    const sorted = [...data];

    if (sortOption === "date") {
      sorted.sort((a, b) => convertDate(a.date) - convertDate(b.date));
    }

    if (sortOption === "priceLow") {
      sorted.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    }

    if (sortOption === "priceHigh") {
      sorted.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    }

    if (sortOption === "distance") {
      sorted.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
    }

    if (sortOption === "highestUtr") {
      sorted.sort(
        (a, b) => getTournamentHighestUtr(b) - getTournamentHighestUtr(a)
      );
    }

    return sorted;
  };

  const applyFilters = (data) => {
    let filtered = [...data];

    if (sourceFilter !== "All") {
      filtered = filtered.filter((t) => t.source === sourceFilter);
    }

    if (categoryFilter !== "All") {
      filtered = filtered.filter((t) => t.category === categoryFilter);
    }

    filtered = filtered.filter((t) => Number(t.price || 0) <= maxPrice);

    return sortTournaments(filtered);
  };

  const fetchTournaments = () => {
    axios
      .get(`${API_BASE}/api/tournaments-db`)
      .then((res) => {
        let data = res.data.map((t) => ({
          ...t,
          price: Number(t.price || 0),
          latitude: Number(t.latitude),
          longitude: Number(t.longitude)
        }));

        let originLocation = userLocation;

        if (city.trim() !== "") {
          const matchingCity = data.find(
            (t) => t.city.toLowerCase() === city.trim().toLowerCase()
          );

          if (matchingCity) {
            originLocation = {
              latitude: matchingCity.latitude,
              longitude: matchingCity.longitude
            };

            setLocationMessage(
              `Showing tournaments within ${maxMiles} miles of ${matchingCity.city}, ${matchingCity.state}.`
            );
          } else {
            setLocationMessage("City not found in tournament list.");
            setAllTournaments([]);
            setTournaments([]);
            return;
          }
        }

        if (originLocation) {
          data = data
            .map((t) => {
              const miles = getDistance(
                originLocation.latitude,
                originLocation.longitude,
                t.latitude,
                t.longitude
              );

              return {
                ...t,
                distance: Math.round(miles)
              };
            })
            .filter((t) => t.distance <= maxMiles);
        }

        setAllTournaments(data);
        setTournaments(applyFilters(data));
      })
      .catch((err) => {
        console.error(err);
        setLocationMessage("Could not load tournaments from SQL Server.");
      });
  };

  const resetFilters = () => {
    setSourceFilter("All");
    setCategoryFilter("All");
    setMaxPrice(500);
    setSortOption("date");
    setCity("");
    setLocationMessage("");
    setTournaments(sortTournaments(allTournaments));
  };

  const askAiTennisPro = () => {
    if (!aiQuestion.trim()) return;

    const question = aiQuestion.toLowerCase();

    if (
      question.includes("highest utr") ||
      question.includes("highest utrs") ||
      question.includes("best utr") ||
      question.includes("top utr")
    ) {
      const sorted = [...allTournaments].sort(
        (a, b) => getTournamentHighestUtr(b) - getTournamentHighestUtr(a)
      );

      setSortOption("highestUtr");
      setTournaments(applyFilters(sorted));
      setAiMessage("Showing tournaments with the highest UTR levels first.");
      return;
    }

    setAiLoading(true);
    setAiMessage("AI Tennis Pro is thinking...");

    axios
      .post(`${API_BASE}/api/ai/ask`, {
        question: aiQuestion
      })
      .then((res) => {
        const data = res.data.tournaments || [];
        setAiMessage(res.data.message);
        setAllTournaments(data);
        setTournaments(applyFilters(data));
      })
      .catch((err) => {
        console.error(err);
        setAiMessage("AI Tennis Pro had trouble answering.");
      })
      .finally(() => {
        setAiLoading(false);
      });
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

        setLocationMessage("Location added. Click Search to filter by distance.");
      },
      () => {
        setUserLocation(null);
        setLocationMessage(
          "Location permission was denied. You can still search by city."
        );
      }
    );
  };

  useEffect(() => {
    fetchTournaments();
  }, []);

  useEffect(() => {
    setTournaments(applyFilters(allTournaments));
  }, [sourceFilter, categoryFilter, maxPrice, sortOption]);

  return (
    <div className="page">
      <section className="hero">
        <p className="tagline">Find local tennis tournaments faster</p>
        <h1>Tennis Tournament Finder</h1>
        <p className="subtitle">
          Search UTR, USTA, and local tennis events within driving distance.
        </p>

        <div className="searchBox">
          <input
            type="text"
            placeholder="Search by city, like Portland"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <button onClick={fetchTournaments}>Search</button>
        </div>

        <div className="locationControls">
          <button className="locationBtn" onClick={useMyLocation}>
            Use My Location
          </button>

          <div className="sliderBox">
            <label>Distance: {maxMiles} miles</label>
            <input
              type="range"
              min="5"
              max="250"
              step="5"
              value={maxMiles}
              onChange={(e) => setMaxMiles(Number(e.target.value))}
            />
          </div>

          {locationMessage && (
            <p className="locationMessage">{locationMessage}</p>
          )}
        </div>
      </section>

      <section className="filters">
        <div className="filterHeader">
          <h2>Filters</h2>
          <button className="resetBtn" onClick={resetFilters}>
            Reset
          </button>
        </div>

        <div className="filterGrid">
          <div className="filterItem">
            <label>Source</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="All">All Sources</option>
              <option value="UTR">UTR</option>
              <option value="USTA">USTA</option>
              <option value="Local">Local</option>
            </select>
          </div>

          <div className="filterItem">
            <label>Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="All">All Categories</option>
              <option value="Junior">Junior</option>
              <option value="Adult">Adult</option>
              <option value="Prize Money">Prize Money</option>
            </select>
          </div>

          <div className="filterItem">
            <label>Max Price: ${maxPrice}</label>
            <input
              type="range"
              min="0"
              max="500"
              step="5"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
            />
          </div>

          <div className="filterItem">
            <label>Sort By</label>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
            >
              <option value="date">Soonest Date</option>
              <option value="distance">Closest</option>
              <option value="priceLow">Cheapest</option>
              <option value="priceHigh">Most Expensive</option>
              <option value="highestUtr">Highest UTR</option>
            </select>
          </div>
        </div>
      </section>

      <section className="results">
        <h2>Upcoming Tournaments</h2>
        <p className="resultCount">{tournaments.length} tournaments found</p>

        {tournaments.length === 0 ? (
          <p className="empty">No tournaments found. Try changing your filters.</p>
        ) : (
          tournaments.map((t) => (
            <div className="card" key={t.id}>
              <div className="cardTop">
                <span className={`badge ${(t.source || "local").toLowerCase()}`}>
                  {t.source}
                </span>
                <span className="date">{formatDate(t.date)}</span>
              </div>

              <h3>{t.name}</h3>

              <p className="location">
                {t.city}, {t.state}
                {t.distance !== undefined && ` • ${t.distance} miles away`}
              </p>

              <div className="details">
                <p>
                  <span>Level</span>
                  {t.level}
                </p>

                <p>
                  <span>Entry</span>${t.price}
                </p>

                <p>
                  <span>Players</span>
                  {showPlayers(t.players)}
                </p>

                <p>
                  <span>Highest UTR Player</span>
                  <strong className="utrBubble">
                    {showHighestUtrPlayer(t)}
                  </strong>
                </p>
              </div>

              <a
                className="registerBtn"
                href={t.registrationLink}
                target="_blank"
                rel="noreferrer"
              >
                Register
              </a>
            </div>
          ))
        )}
      </section>

      <div className="floatingAi">
        <h3>AI Tennis Pro</h3>

        <p>
          Ask things like “show junior tournaments,” “find prize money
          tournaments,” “show tournaments under $50,” or “highest UTR
          tournaments.”
        </p>

        <div className="aiSearchBox">
          <input
            type="text"
            placeholder="Ask AI Tennis Pro..."
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") askAiTennisPro();
            }}
          />

          <button onClick={askAiTennisPro} disabled={aiLoading}>
            {aiLoading ? "Thinking..." : "Ask AI"}
          </button>
        </div>

        {aiMessage && <p className="aiMessage">{aiMessage}</p>}
      </div>
    </div>
  );
}

export default App;