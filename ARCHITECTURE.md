# Architecture Guide

## System Overview

This system follows an Event-Driven Serverless Architecture on AWS. Every disaster event flows through a pipeline:
**Fetch -> Evaluate -> Alert -> Store -> Display**

---

## Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│                         EXTERNAL APIs                           │
│  USGS Earthquake API  │  OpenWeatherMap API  │  GDACS (Floods)  │
└──────────────┬──────────────────────────────────────────────────┘
               │ HTTP Polling (every 5 min via EventBridge)
               ▼
┌─────────────────────────────┐
│  AWS EventBridge (Scheduler)│  <- Cron trigger: rate(5 minutes)
│  Triggers Lambda Fetcher    │
└──────────────┬──────────────┘
               │ Invokes
               ▼
┌─────────────────────────────┐
│  Lambda: fetchDisasterData  │  <- Fetches & normalizes API data
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

## Event-Driven Flow (Step by Step)

1. **EventBridge** fires every 5 minutes.
2. **fetchDisasterData** Lambda executes:
   - Calls USGS API for earthquake data.
   - Calls OpenWeatherMap for severe storm data.
   - Normalizes data into a standard schema.
   - Checks thresholds (e.g., magnitude > 5.0, wind > 100 km/h).
3. If a threshold is exceeded:
   - Publishes a message to the **SNS Topic**.
   - Stores the event in **DynamoDB**.
4. SNS fans out to subscriber Lambda functions:
   - **sendEmailAlert**: Sends email via SES.
   - **sendSMSAlert**: Sends SMS via SNS SMS.
5. **React Dashboard** polls API Gateway every 30s to show live updates.

---

## DynamoDB Schema

### Table: DisasterEvents
```text
PK: eventId        (String) - e.g., "eq_us2024abc123"
SK: timestamp      (String) - ISO 8601
type:              "EARTHQUAKE" | "STORM" | "FLOOD"
magnitude:         Number
location:          { lat, lng, name }
severity:          "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
description:       String
source:            "USGS" | "OPENWEATHER" | "GDACS"
alertSent:         Boolean
TTL:               Unix timestamp (30 days auto-delete)
```

### Table: Subscribers
```text
PK: subscriberId   (String) - UUID
email:             String
phone:             String (E.164 format)
location:          { lat, lng, radiusKm }
minSeverity:       "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
active:            Boolean
```

---

## AWS Services Used

| Service | Purpose | Free Tier Limit |
| :--- | :--- | :--- |
| AWS Lambda | Core backend business logic | 1M requests/month |
| Amazon DynamoDB | Storage for events and subscribers | 25 GB storage |
| Amazon SNS | Push notifications and fan-out architecture | 1M publishes/month |
| Amazon SES | Email alert delivery | 62,000 emails/month |
| Amazon API Gateway | RESTful endpoints for frontend | 1M calls/month |
| Amazon EventBridge | Cron scheduler for polling | 14M events/month |
| Amazon S3 | Frontend asset hosting | 5 GB storage |
| Amazon CloudFront | Content Delivery Network (CDN) | 1 TB transfer/month |

---

## Security Notes

- API Gateway utilizes API keys for frontend requests.
- Lambda execution roles strictly adhere to least-privilege IAM policies.
- DynamoDB access is securely restricted to authorized Lambda roles.
- Cross-Origin Resource Sharing (CORS) is configured exclusively for the permitted frontend domain.
