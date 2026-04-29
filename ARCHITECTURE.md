# Real-Time Disaster Alert System — Architecture Guide

## 🏗️ System Overview

This system follows an **Event-Driven Serverless Architecture** on AWS.
Every disaster event flows through a pipeline:  
**Fetch → Evaluate → Alert → Store → Display**

---

## 📐 Architecture Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────┐
│                         EXTERNAL APIs                           │
│  USGS Earthquake API  │  OpenWeatherMap API  │  GDACS (Floods)  │
└──────────────┬──────────────────────────────────────────────────┘
               │ HTTP Polling (every 5 min via EventBridge)
               ▼
┌─────────────────────────────┐
│  AWS EventBridge (Scheduler)│  ← Cron trigger: rate(5 minutes)
│  Triggers Lambda Fetcher    │
└──────────────┬──────────────┘
               │ Invokes
               ▼
┌─────────────────────────────┐
│  Lambda: fetchDisasterData  │  ← Fetches & normalizes API data
│  (Node.js 18)               │
└──────┬───────────┬──────────┘
       │           │
       │ Publish   │ Store raw event
       ▼           ▼
┌──────────┐  ┌─────────────────────────┐
│  AWS SNS │  │  DynamoDB: DisasterEvents│
│  Topic   │  │  (historical log)        │
└────┬─────┘  └─────────────────────────┘
     │ Fan-out
     ├──────────────────────────────────────┐
     ▼                                      ▼
┌──────────────────────────┐    ┌───────────────────────────┐
│  Lambda: sendEmailAlert  │    │  Lambda: sendSMSAlert     │
│  (AWS SES / SNS email)   │    │  (AWS SNS SMS)            │
└──────────────────────────┘    └───────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                        │
│  Hosted on: AWS S3 + CloudFront (or Firebase Hosting)           │
│  ┌─────────────┐  ┌───────────┐  ┌───────────────────────────┐ │
│  │  Live Map   │  │ Alert Feed│  │  Subscribe (email/phone)  │ │
│  │  (Leaflet)  │  │           │  │                           │ │
│  └─────────────┘  └───────────┘  └───────────────────────────┘ │
│          ↕ REST API calls via API Gateway                        │
└─────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────┐
│  AWS API Gateway (REST)     │
│  /disasters  GET            │
│  /subscribe  POST           │
│  /alerts     GET            │
└──────┬───────────┬──────────┘
       ▼           ▼
 Lambda:      Lambda:
 getDisasters  subscribe
```

---

## 🔄 Event-Driven Flow (Step by Step)

1. **EventBridge** fires every 5 minutes
2. **fetchDisasterData** Lambda runs:
   - Calls USGS API for earthquakes
   - Calls OpenWeatherMap for severe storms
   - Normalizes data into a standard schema
   - Checks thresholds (magnitude > 5.0, wind > 100 km/h)
3. If threshold exceeded:
   - Publishes message to **SNS Topic**
   - Stores event in **DynamoDB**
4. SNS fans out to two Lambda subscribers:
   - **sendEmailAlert** → sends via SES
   - **sendSMSAlert** → sends via SNS SMS
5. **React Dashboard** polls API Gateway every 30s to show live updates

---

## 🗃️ DynamoDB Schema

**Table: DisasterEvents**
```
PK: eventId        (String) — e.g., "eq_us2024abc123"
SK: timestamp      (String) — ISO 8601
type:              "EARTHQUAKE" | "STORM" | "FLOOD"
magnitude:         Number
location:          { lat, lng, name }
severity:          "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
description:       String
source:            "USGS" | "OPENWEATHER" | "GDACS"
alertSent:         Boolean
TTL:               Unix timestamp (30 days auto-delete)
```

**Table: Subscribers**
```
PK: subscriberId   (String) — UUID
email:             String
phone:             String (E.164 format)
location:          { lat, lng, radiusKm }
minSeverity:       "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
active:            Boolean
```

---

## ☁️ AWS Services Used (All Free Tier Eligible)

| Service        | Purpose                          | Free Tier Limit          |
|---------------|----------------------------------|--------------------------|
| Lambda        | All backend logic                | 1M requests/month        |
| DynamoDB      | Store events & subscribers       | 25 GB storage            |
| SNS           | Notifications + fan-out          | 1M publishes/month       |
| SES           | Email alerts                     | 62,000 emails/month      |
| API Gateway   | REST API for frontend            | 1M calls/month           |
| EventBridge   | Cron scheduler                   | 14M events/month         |
| S3            | Frontend hosting                 | 5 GB storage             |
| CloudFront    | CDN for frontend                 | 1 TB transfer/month      |

---

## 🔐 Security Notes

- API Gateway uses API keys for frontend calls
- Lambda roles use least-privilege IAM policies
- DynamoDB access restricted to Lambda execution roles
- CORS configured for specific frontend domain only
