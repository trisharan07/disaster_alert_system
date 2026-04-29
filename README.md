# 🌍 Real-Time Disaster Alert System

> **Event-Driven · Serverless · Cloud-Native**  
> A complete full-stack project built on AWS demonstrating real-world cloud architecture.

---

## 📁 Project Structure

```
disaster-alert-system/
├── backend/
│   ├── template.yaml                    ← AWS SAM (Infrastructure as Code)
│   └── functions/
│       ├── fetchDisasterData/
│       │   └── index.js                 ← Cron: fetches USGS + weather every 5min
│       ├── getDisasters/
│       │   └── index.js                 ← GET /disasters API endpoint
│       ├── subscribe/
│       │   └── index.js                 ← POST /subscribe API endpoint
│       └── sendEmailAlert/
│           └── index.js                 ← Email alerts via SES (SNS-triggered)
├── frontend/
│   └── src/
│       ├── App.jsx                      ← Main React dashboard (full UI)
│       └── hooks/
│           └── useDisasters.js          ← Custom hook: polling + data state
└── docs/
    ├── ARCHITECTURE.md                  ← Full system design explanation
    └── DEPLOYMENT.md                    ← Step-by-step deploy guide
```

---

## ⚡ Quick Start (Frontend Only — Zero Config)

```bash
cd frontend
npm create vite@latest . -- --template react
# Replace src/App.jsx with our App.jsx
npm install
npm run dev
```

**That's it.** The dashboard loads live earthquake data from USGS immediately.  
No API keys, no backend, no AWS account needed for the frontend demo!

---

## 🏗️ Full AWS Deployment

```bash
cd backend
sam build && sam deploy --guided
```

See `docs/DEPLOYMENT.md` for the complete step-by-step guide.

---

## 🧠 Key Concepts Demonstrated

| Concept                  | Implementation                                    |
|--------------------------|---------------------------------------------------|
| Event-Driven Architecture| EventBridge → Lambda → SNS fan-out               |
| Serverless Computing     | All logic in AWS Lambda (no servers)             |
| Real-Time Data           | USGS GeoJSON API + OpenWeatherMap                |
| NoSQL Database           | DynamoDB with TTL (auto-expiry)                  |
| Pub/Sub Messaging        | SNS Topic with multiple subscribers             |
| REST API                 | API Gateway + Lambda                             |
| Frontend                 | React SPA with auto-refresh every 30s           |
| Infrastructure as Code   | AWS SAM (CloudFormation)                         |
| Free Tier Compatible     | All services within AWS free tier limits        |

---

## 📡 Data Sources

| Source        | Data Type        | Endpoint                                             | Auth     |
|--------------|------------------|------------------------------------------------------|----------|
| USGS         | Earthquakes M4.5+| earthquake.usgs.gov/earthquakes/feed/v1.0/summary/  | None     |
| OpenWeatherMap| Storms, Alerts  | api.openweathermap.org/data/3.0/onecall              | API Key  |

---

## 🎯 Severity Classification Logic

```
EARTHQUAKE:
  M ≥ 7.0  → CRITICAL  (Major — devastating damage)
  M ≥ 6.0  → HIGH      (Strong — significant damage)
  M ≥ 5.0  → MEDIUM    (Moderate — felt widely)
  M < 5.0  → LOW       (Minor — slight impact)

WIND SPEED:
  ≥ 180 km/h → CRITICAL  (Category 5 hurricane)
  ≥ 120 km/h → HIGH      (Category 3+)
  ≥  80 km/h → MEDIUM    (Severe)
```

---

## 💡 Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js 18 on AWS Lambda
- **Database**: AWS DynamoDB (NoSQL)
- **Messaging**: AWS SNS (Simple Notification Service)
- **Email**: AWS SES (Simple Email Service)
- **API**: AWS API Gateway (REST)
- **Scheduler**: AWS EventBridge
- **Hosting**: AWS S3 + CloudFront
- **IaC**: AWS SAM (Serverless Application Model)
