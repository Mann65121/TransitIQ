import pandas as pd
import os
from sklearn.ensemble import RandomForestRegressor

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, "data", "logistics.csv")

data = pd.read_csv(DATA_PATH)

X = data[
    [
        "traffic_congestion_level",
        "shipping_costs",
        "route_risk_level",
        "lead_time_days",
        "driver_behavior_score",
    ]
]

y = data["delay_probability"]

model = RandomForestRegressor(
    n_estimators=100,
    random_state=42
)
model.fit(X, y)

def predict_delay(traffic, cost, risk, lead_time, driver_score):
    pred = model.predict([[traffic, cost, risk, lead_time, driver_score]])
    return round(float(pred[0]), 3)
