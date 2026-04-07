"use client";

import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";
const RECENT_ROUTES_KEY = "transitiq-recent-routes";

const initialForm = {
  origin: "",
  destination: "",
  driverScore: "3",
};

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function getDelayTone(probability = 0) {
  if (probability > 0.7) {
    return {
      label: "Plan with caution",
      color: "var(--danger)",
      note: "Give this trip extra time and consider a backup route before dispatch.",
    };
  }

  if (probability > 0.4) {
    return {
      label: "Watch closely",
      color: "var(--warning)",
      note: "The route looks workable, though timing may tighten during the trip.",
    };
  }

  return {
    label: "Looks steady",
    color: "var(--success)",
    note: "Current conditions suggest a smoother trip with less schedule pressure.",
  };
}

function buildRouteSummary(result) {
  if (!result) {
    return [];
  }

  const status = getDelayTone(result.delay_probability);

  return [
    `${status.label} for this trip.`,
    `${result.weather.condition} expected in ${result.weather.city.split(",")[0]} at ${result.weather.temperature}°C.`,
    `The route covers approximately ${result.distance_km} km from departure to arrival.`,
  ];
}

function getFriendlyErrorMessage(error) {
  if (error instanceof TypeError) {
    return "We could not reach the route service. Make sure the backend is running on http://localhost:8000 and try again.";
  }

  return error?.message || "Unable to check this route right now.";
}

function buildMapUrl(origin, destination) {
  if (!origin || !destination) {
    return "";
  }

  if (MAPS_KEY) {
    const params = new URLSearchParams({
      key: MAPS_KEY,
      origin,
      destination,
      mode: "driving",
    });
    return `https://www.google.com/maps/embed/v1/directions?${params.toString()}`;
  }

  const query = encodeURIComponent(`${origin} to ${destination}`);
  return `https://www.google.com/maps?q=${query}&output=embed`;
}

function Field({ label, hint, children }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:-translate-y-0.5"
      aria-label="Toggle dark mode"
    >
      <span className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
        {theme === "dark" ? "Night" : "Day"}
      </span>
      <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

function ResultCard({ eyebrow, title, children, tone = "default" }) {
  const toneClasses =
    tone === "risk"
      ? "from-orange-300/25 via-white/70 to-rose-100/40 dark:via-stone-900/65"
      : tone === "weather"
        ? "from-emerald-200/30 via-white/72 to-amber-100/35 dark:via-stone-900/65"
        : "from-orange-100/45 via-white/70 to-teal-50/40 dark:via-stone-900/65";

  return (
    <article
      className={`rounded-[28px] border border-[var(--border)] bg-gradient-to-br ${toneClasses} p-6 shadow-[var(--shadow)] backdrop-blur`}
    >
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--muted)]">{eyebrow}</p>
      <h3 className="mt-3 text-xl font-semibold text-[var(--foreground)]">{title}</h3>
      <div className="mt-5 text-sm text-[var(--muted)]">{children}</div>
    </article>
  );
}

function RouteChip({ route, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(route)}
      className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]"
    >
      {route.origin} to {route.destination}
    </button>
  );
}

export default function Home() {
  const [theme, setTheme] = useState("light");
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recentRoutes, setRecentRoutes] = useState([]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("transitiq-theme");
    const nextTheme =
      savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("transitiq-theme", theme);
  }, [theme]);

  useEffect(() => {
    const savedRoutes = window.localStorage.getItem(RECENT_ROUTES_KEY);

    if (savedRoutes) {
      try {
        setRecentRoutes(JSON.parse(savedRoutes));
      } catch {
        window.localStorage.removeItem(RECENT_ROUTES_KEY);
      }
    }
  }, []);

  const mapUrl = useMemo(() => {
    const origin = result?.origin || form.origin;
    const destination = result?.destination || form.destination;
    return buildMapUrl(origin, destination);
  }, [form.destination, form.origin, result?.destination, result?.origin]);

  const status = getDelayTone(result?.delay_probability);
  const routeSummary = buildRouteSummary(result);

  function saveRecentRoute(origin, destination, driverScore) {
    const nextRoutes = [
      { origin, destination, driverScore: String(driverScore) },
      ...recentRoutes.filter(
        (route) =>
          route.origin.toLowerCase() !== origin.toLowerCase() ||
          route.destination.toLowerCase() !== destination.toLowerCase()
      ),
    ].slice(0, 4);

    setRecentRoutes(nextRoutes);
    window.localStorage.setItem(RECENT_ROUTES_KEY, JSON.stringify(nextRoutes));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const origin = form.origin.trim();
    const destination = form.destination.trim();
    const driverScore = Number(form.driverScore);

    if (!origin || !destination) {
      setError("Please enter both origin and destination cities.");
      return;
    }

    if (Number.isNaN(driverScore) || driverScore < 1 || driverScore > 5) {
      setError("Driver rating must be between 1 and 5.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin,
          destination,
          driver_score: driverScore,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Route check failed.");
      }

      setResult(data);
      saveRecentRoute(origin, destination, driverScore);
    } catch (requestError) {
      setResult(null);
      setError(getFriendlyErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  function swapLocations() {
    setForm((current) => ({
      ...current,
      origin: current.destination,
      destination: current.origin,
    }));
  }

  return (
    <main className="min-h-screen px-4 py-4 text-[var(--foreground)] sm:px-6 lg:px-8">
      <div className="flex min-h-[calc(100vh-2rem)] flex-col gap-5">
        <nav className="flex flex-wrap items-center justify-between gap-3 rounded-[30px] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 backdrop-blur">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--muted)]">TransitIQ</p>
            <h1 className="text-lg font-semibold">Delivery Planner</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2 text-sm text-[var(--muted)]">
              Route view, weather snapshot, and plain-language timing guidance
            </div>
            <ThemeToggle
              theme={theme}
              onToggle={() => setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))}
            />
          </div>
        </nav>

        <section className="grid flex-1 gap-5 xl:grid-cols-[1.02fr_1.18fr]">
          <div className="grid gap-5">
            <form
              onSubmit={handleSubmit}
              className="overflow-hidden rounded-[36px] border border-[var(--border)] bg-[image:var(--hero-glow)] p-6 shadow-[var(--shadow)] backdrop-blur sm:p-8"
            >
              <div className="grid gap-6">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Route planning</p>
                  <h2 className="mt-4 max-w-lg text-4xl font-semibold tracking-[-0.05em] text-balance sm:text-5xl">
                    Find the smoothest way to move between two cities.
                  </h2>
                  <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                    Check the trip outlook before dispatching. You will get a clear route summary, destination
                    weather, and a live map view in one place.
                  </p>
                </div>

                <div className="grid gap-4">
                  <Field label="Start city" hint="Use a city name like Mumbai, Chicago, or Berlin.">
                    <input
                      value={form.origin}
                      onChange={(event) => setForm((current) => ({ ...current, origin: event.target.value }))}
                      placeholder="New York"
                      className="rounded-[22px] border border-[var(--border)] bg-white/60 px-4 py-3.5 text-sm outline-none transition focus:border-[var(--accent)] dark:bg-stone-950/35"
                    />
                  </Field>

                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={swapLocations}
                      className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]"
                    >
                      Swap route
                    </button>
                  </div>

                  <Field label="Destination city" hint="We will check current arrival conditions automatically.">
                    <input
                      value={form.destination}
                      onChange={(event) => setForm((current) => ({ ...current, destination: event.target.value }))}
                      placeholder="Chicago"
                      className="rounded-[22px] border border-[var(--border)] bg-white/60 px-4 py-3.5 text-sm outline-none transition focus:border-[var(--accent)] dark:bg-stone-950/35"
                    />
                  </Field>

                  <Field label="Driver rating" hint="A higher score reflects steadier driving and fewer route surprises.">
                    <input
                      type="number"
                      min="1"
                      max="5"
                      step="0.1"
                      value={form.driverScore}
                      onChange={(event) => setForm((current) => ({ ...current, driverScore: event.target.value }))}
                      className="rounded-[22px] border border-[var(--border)] bg-white/60 px-4 py-3.5 text-sm outline-none transition focus:border-[var(--accent)] dark:bg-stone-950/35"
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    {loading ? "Checking route..." : "Check Route"}
                  </button>
                  <p className="text-sm text-[var(--muted)]">Built for quick trip checks before the route goes live.</p>
                </div>

                {error ? (
                  <div className="rounded-[22px] border border-rose-300/40 bg-rose-50/70 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-950/20 dark:text-rose-200">
                    {error}
                  </div>
                ) : null}
              </div>
            </form>

            <section className="grid gap-5 lg:grid-cols-2">
              <ResultCard eyebrow="Trip outlook" title={result ? status.label : "Ready when you are"} tone="risk">
                {result ? (
                  <div className="space-y-4">
                    <div className="flex items-end justify-between gap-3">
                      <p className="text-5xl font-semibold tracking-[-0.05em] text-[var(--foreground)]">
                        {formatPercent(result.delay_probability)}
                      </p>
                      <span
                        className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]"
                        style={{
                          backgroundColor: `${status.color}1f`,
                          color: status.color,
                        }}
                      >
                        {result.risk_level}
                      </span>
                    </div>
                    <p>{status.note}</p>
                    <div className="flex h-2 overflow-hidden rounded-full bg-[var(--accent-soft)]">
                      <div
                        className="rounded-full transition-all"
                        style={{
                          width: `${Math.max(8, Math.round(result.delay_probability * 100))}%`,
                          backgroundColor: status.color,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p>Check a route to see how stable the trip looks and how much schedule buffer you may want.</p>
                )}
              </ResultCard>

              <ResultCard
                eyebrow="Destination weather"
                title={result ? result.weather.city : "Current conditions"}
                tone="weather"
              >
                {result ? (
                  <div className="space-y-4">
                    <p className="text-5xl font-semibold tracking-[-0.05em] text-[var(--foreground)]">
                      {result.weather.temperature}&deg;C
                    </p>
                    <p>{result.weather.condition}</p>
                    <p>Helpful for departure timing, driver prep, and arrival planning.</p>
                  </div>
                ) : (
                  <p>Destination weather will appear here right after you check a route.</p>
                )}
              </ResultCard>
            </section>

            <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--muted)]">Recent routes</p>
                  <h3 className="mt-2 text-xl font-semibold">Reuse a previous trip</h3>
                </div>
                {recentRoutes.length ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRecentRoutes([]);
                      window.localStorage.removeItem(RECENT_ROUTES_KEY);
                    }}
                    className="text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {recentRoutes.length ? (
                  recentRoutes.map((route) => (
                    <RouteChip
                      key={`${route.origin}-${route.destination}`}
                      route={route}
                      onSelect={(selectedRoute) => setForm(selectedRoute)}
                    />
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted)]">Your recent route checks will appear here for quick reuse.</p>
                )}
              </div>
            </section>
          </div>

          <div className="grid gap-5">
            <section className="rounded-[36px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] backdrop-blur sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--muted)]">Map view</p>
                  <h3 className="mt-2 text-xl font-semibold">Route preview</h3>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  {result ? `${result.origin} to ${result.destination}` : "Waiting for route details"}
                </p>
              </div>

              <div className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-stone-200/40 dark:bg-stone-950/45">
                {mapUrl ? (
                  <iframe
                    title="Route map"
                    src={mapUrl}
                    className="h-[520px] w-full border-0 2xl:h-[620px]"
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : (
                  <div className="flex h-[520px] items-center justify-center px-6 text-center text-sm text-[var(--muted)] 2xl:h-[620px]">
                    Add both cities to open the route preview.
                  </div>
                )}
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
              <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] backdrop-blur">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--muted)]">Trip notes</p>
                <h3 className="mt-2 text-xl font-semibold">What to keep in mind</h3>
                <div className="mt-5 grid gap-3">
                  {routeSummary.length ? (
                    routeSummary.map((item) => (
                      <div
                        key={item}
                        className="rounded-[22px] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-4 text-sm leading-6 text-[var(--foreground)]"
                      >
                        {item}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--muted)]">
                      After you check a route, this panel will turn the result into simple language for your team.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] backdrop-blur">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--muted)]">At a glance</p>
                <h3 className="mt-2 text-xl font-semibold">Quick facts</h3>
                <div className="mt-5 grid gap-3">
                  <div className="rounded-[22px] bg-[var(--surface-soft)] px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Distance</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                      {result ? `${result.distance_km} km` : "Not checked yet"}
                    </p>
                  </div>
                  <div className="rounded-[22px] bg-[var(--surface-soft)] px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Driver rating</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{form.driverScore} / 5</p>
                  </div>
                  <div className="rounded-[22px] bg-[var(--surface-soft)] px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Route status</p>
                    <p className="mt-2 text-2xl font-semibold" style={{ color: status.color }}>
                      {result ? status.label : "Waiting"}
                    </p>
                  </div>
                </div>
              </section>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
