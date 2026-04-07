import json
import math
import os
import warnings
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from app.model import predict_delay

app = FastAPI(
    title="TransitIQ",
    docs_url=None,
    redoc_url=None,
    openapi_url=None
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RoutePredictionRequest(BaseModel):
    origin: str = Field(..., min_length=2, max_length=120)
    destination: str = Field(..., min_length=2, max_length=120)
    driver_score: float = Field(..., ge=1, le=5)


WEATHER_LABELS = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    56: "Freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Heavy freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Heavy rain showers",
    82: "Violent rain showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm",
}


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def risk_level_from_delay(delay: float) -> str:
    if delay > 0.7:
        return "High Risk"
    if delay > 0.4:
        return "Moderate Risk"
    return "Low Risk"


def run_prediction(traffic: float, cost: float, risk: float, lead_time: float, driver_score: float) -> float:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        return predict_delay(traffic, cost, risk, lead_time, driver_score)


def fetch_json(url: str) -> dict:
    try:
        with urlopen(url, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="Upstream route intelligence service is unavailable.") from exc


def geocode_city(city: str) -> dict:
    encoded_city = quote(city.strip())
    data = fetch_json(
        f"https://geocoding-api.open-meteo.com/v1/search?name={encoded_city}&count=1&language=en&format=json"
    )
    results = data.get("results") or []

    if not results:
        raise HTTPException(status_code=404, detail=f'City "{city}" could not be located.')

    match = results[0]
    region = match.get("admin1")
    country = match.get("country")
    label_parts = [match.get("name")]
    if region:
        label_parts.append(region)
    if country:
        label_parts.append(country)

    return {
        "name": match.get("name", city.strip()),
        "label": ", ".join(part for part in label_parts if part),
        "latitude": match["latitude"],
        "longitude": match["longitude"],
    }


def fetch_weather(city_info: dict) -> dict:
    lat = city_info["latitude"]
    lon = city_info["longitude"]
    data = fetch_json(
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}&current=temperature_2m,weather_code&timezone=auto"
    )
    current = data.get("current") or {}
    weather_code = int(current.get("weather_code", 0))

    return {
        "city": city_info["label"],
        "temperature": round(float(current.get("temperature_2m", 0.0)), 1),
        "condition": WEATHER_LABELS.get(weather_code, "Unavailable"),
        "code": weather_code,
    }


def weather_severity(weather_code: int) -> float:
    if weather_code == 0:
        return 0.05
    if weather_code in {1, 2, 3}:
        return 0.15
    if weather_code in {45, 48}:
        return 0.35
    if weather_code in {51, 53, 55, 56, 57, 61, 63, 66, 71, 73, 77, 80, 85}:
        return 0.6
    if weather_code in {65, 67, 75, 81, 82, 86, 95, 96, 99}:
        return 0.9
    return 0.3


def haversine_km(origin: dict, destination: dict) -> float:
    earth_radius_km = 6371.0
    origin_lat = math.radians(origin["latitude"])
    origin_lon = math.radians(origin["longitude"])
    destination_lat = math.radians(destination["latitude"])
    destination_lon = math.radians(destination["longitude"])

    delta_lat = destination_lat - origin_lat
    delta_lon = destination_lon - origin_lon

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(origin_lat) * math.cos(destination_lat) * math.sin(delta_lon / 2) ** 2
    )
    return earth_radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def derive_model_inputs(distance_km: float, driver_score: float, weather_code: int) -> dict:
    severity = weather_severity(weather_code)
    traffic = clamp((distance_km / 85) + (severity * 2.5), 0, 10)
    shipping_cost = clamp(100 + (distance_km * 1.2) + (severity * 125), 100, 1000)
    route_risk = clamp((distance_km / 120) + (severity * 5) + ((5 - driver_score) * 0.75), 0, 10)
    lead_time = clamp(1 + (distance_km / 320) + (severity * 2.2), 1, 15)
    driver_behavior = clamp((driver_score - 1) / 4, 0, 1)

    return {
        "traffic": round(traffic, 3),
        "cost": round(shipping_cost, 3),
        "risk": round(route_risk, 3),
        "lead_time": round(lead_time, 3),
        "driver_score": round(driver_behavior, 3),
    }


@app.get("/api/predict")
def predict(
    traffic: float,
    cost: float,
    risk: float,
    lead_time: float,
    driver_score: float,
):
    delay = run_prediction(traffic, cost, risk, lead_time, driver_score)

    return {
        "delay_probability": delay,
        "risk_level": risk_level_from_delay(delay)
    }


@app.post("/api/predict")
def predict_route(payload: RoutePredictionRequest):
    origin = geocode_city(payload.origin)
    destination = geocode_city(payload.destination)
    weather = fetch_weather(destination)
    distance_km = haversine_km(origin, destination)
    features = derive_model_inputs(distance_km, payload.driver_score, weather["code"])
    delay = run_prediction(
        features["traffic"],
        features["cost"],
        features["risk"],
        features["lead_time"],
        features["driver_score"],
    )

    return {
        "origin": origin["label"],
        "destination": destination["label"],
        "distance_km": round(distance_km, 1),
        "delay_probability": delay,
        "risk_level": risk_level_from_delay(delay),
        "weather": {
            "city": weather["city"],
            "temperature": weather["temperature"],
            "condition": weather["condition"],
        },
        "model_inputs": features,
    }

legacy_frontend_dir = "frontend"

if os.path.isdir(legacy_frontend_dir):
    app.mount("/", StaticFiles(directory=legacy_frontend_dir, html=True), name="frontend")
