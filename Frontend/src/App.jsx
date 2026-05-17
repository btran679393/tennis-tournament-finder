import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [tournaments, setTournaments] = useState([]);
  const [city, setCity] = useState("");
  const [maxMiles, setMaxMiles] = useState(50);
  const [userLocation, setUserLocation] = useState(null);
  const [locationMessage, setLocationMessage] = useState("");

  const [aiQuestion, setAiQuestion] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

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
    const [datePart, timePart] = dateString.split(" ");

    if (!datePart || !timePart) return new Date(dateString);

    const match = timePart.match(/(\d+):(\d+)(AM|PM)/);

    if (!match) return new Date(dateString);

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

  const sortByDate = (data) => {
    return [...data].sort((a, b) => convertDate(a.date) - convertDate(b.date));
  };

  const fetchTournaments = () => {
    axios
      .get("http://localhost:5000/api/tournaments")
      .then((res) => {
        let data = res.data;
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

        setTournaments(sortByDate(data));
      })
      .catch((err) => console.error(err));
  };

  const askAiTennisPro = () => {
    if (!aiQuestion.trim()) return;

    setAiLoading(true);
    setAiMessage("AI Tennis Pro is thinking...");

    axios
      .post("http://localhost:5000/api/ai/ask", {
        question: aiQuestion
      })
      .then((res) => {
        setAiMessage(res.data.message);
        setTournaments(sortByDate(res.data.tournaments));
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

      <section className="results">
        <h2>Upcoming Tournaments</h2>

        {tournaments.length === 0 ? (
          <p className="empty">No tournaments found. Try increasing the miles.</p>
        ) : (
          tournaments.map((t) => (
            <div className="card" key={t.id}>
              <div className="cardTop">
                <span className={`badge ${t.source.toLowerCase()}`}>
                  {t.source}
                </span>
                <span className="date">{t.date}</span>
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
          tournaments,” or “show tournaments under $50.”
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