# TransitIQ

TransitIQ is a route planning and delivery insight application with:

- a `Next.js` frontend in `transitiq-frontend/`
- a `FastAPI` backend in `app/`
- an existing ML model in `app/model.py`

The app lets a user:

- enter an origin city
- enter a destination city
- add a driver rating
- view route risk
- view destination weather
- preview the route on a map

## Project Structure

```text
TransitIQ/
├── app/
│   ├── main.py
│   └── model.py
├── data/
├── frontend/              # old static frontend
├── transitiq-frontend/    # current Next.js frontend
├── requirements.txt
└── README.md
```

## Local Setup

### 1. Backend

Create or activate your virtual environment, then install Python dependencies:

```powershell
cd c:\Users\bhatt\NavLogix
.\venv\Scripts\activate
pip install -r requirements.txt
```

Run the FastAPI server:

```powershell
cd c:\Users\bhatt\NavLogix
.\venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

Install frontend dependencies:

```powershell
cd c:\Users\bhatt\NavLogix\transitiq-frontend
npm install
```

Run the Next.js app:

```powershell
cd c:\Users\bhatt\NavLogix\transitiq-frontend
npm run dev
```

Open:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

## Frontend Environment Variables

Create `transitiq-frontend/.env.local` with:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_GOOGLE_MAPS_KEY=
NEXT_PUBLIC_WEATHER_KEY=
```

Notes:

- `NEXT_PUBLIC_GOOGLE_MAPS_KEY` can stay empty if you want to use the free iframe fallback.
- Weather is fetched through the backend, not the frontend.

## Deploying Frontend to Vercel

Vercel should deploy the frontend only.

When importing the GitHub repository into Vercel:

- Framework preset: `Next.js`
- Root directory: `transitiq-frontend`
- Environment variable:
  - `NEXT_PUBLIC_API_URL=<your-backend-url>`

Important:

- Vercel will host the Next.js frontend.
- Your FastAPI backend must be deployed separately on another platform.
- Once the backend is live, update `NEXT_PUBLIC_API_URL` in Vercel.

## Backend Deployment Note

The backend:

- serves the prediction API
- fetches free geocoding and weather data at runtime
- should be deployed on a Python-friendly host

Examples include Render, Koyeb, Railway, or another Python hosting service.

## Production Build Check

Frontend:

```powershell
cd c:\Users\bhatt\NavLogix\transitiq-frontend
npm run build
```

## GitHub Push Workflow

Initialize git, commit, and push:

```powershell
cd c:\Users\bhatt\NavLogix
git init
git add .
git commit -m "Final TransitIQ project"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

If the remote already exists:

```powershell
cd c:\Users\bhatt\NavLogix
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

## Current Stack

- Frontend: Next.js, React, Tailwind CSS
- Backend: FastAPI
- Model: scikit-learn RandomForestRegressor
