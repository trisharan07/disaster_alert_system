# 🚀 Deployment Guide — Real-Time Disaster Alert System

## Prerequisites
- AWS Account (free tier works)
- Node.js 18+ installed
- AWS CLI installed and configured
- AWS SAM CLI installed

---

## Phase 1: Local Setup & Testing

### 1. Clone / Create Project
```bash
mkdir disaster-alert-system && cd disaster-alert-system
# Copy all files from this project structure
```

### 2. Install Backend Dependencies
```bash
cd backend/functions/fetchDisasterData && npm init -y && npm install @aws-sdk/client-dynamodb @aws-sdk/client-sns @aws-sdk/util-dynamodb
cd ../getDisasters    && npm init -y && npm install @aws-sdk/client-dynamodb @aws-sdk/util-dynamodb
cd ../subscribe       && npm init -y && npm install @aws-sdk/client-dynamodb @aws-sdk/client-sns @aws-sdk/util-dynamodb
cd ../sendEmailAlert  && npm init -y && npm install @aws-sdk/client-dynamodb @aws-sdk/client-ses @aws-sdk/util-dynamodb
```

### 3. Run Frontend Locally
```bash
cd frontend
npm create vite@latest . -- --template react
# Copy your App.jsx and hooks into src/
npm install
npm run dev
# → Open http://localhost:5173
# Dashboard shows LIVE earthquake data immediately (no backend needed!)
```

---

## Phase 2: AWS Backend Deployment

### Step 1: Configure AWS CLI
```bash
aws configure
# Enter: AWS Access Key ID, Secret Key, Region (us-east-1), output (json)
```

### Step 2: Get Free API Keys
1. **OpenWeatherMap**: https://openweathermap.org/api → Sign up free → Get API key
2. **USGS**: No key needed! (free public API)

### Step 3: Verify SES Email (Required for alerts)
```bash
aws ses verify-email-identity --email-address your-email@gmail.com --region us-east-1
# Check your inbox and click the verification link!
```

### Step 4: Deploy with SAM
```bash
cd backend

# Build all Lambda functions
sam build

# Deploy (guided — answers questions step by step)
sam deploy --guided
# Stack name:    disaster-alert-system
# Region:        us-east-1
# Parameters:
#   OpenWeatherApiKey: [your key or leave blank]
#   SesFromEmail:      your-verified@email.com

# After deploy, copy the API URL from outputs!
```

### Step 5: Note Your API URL
After deploy you'll see:
```
Outputs:
  ApiUrl: https://abc123.execute-api.us-east-1.amazonaws.com/prod
```
Save this URL!

---

## Phase 3: Connect Frontend to Backend

### Set API URL
```bash
cd frontend
echo "REACT_APP_API_URL=https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod" > .env
```

### Build for production
```bash
npm run build
```

---

## Phase 4: Deploy Frontend to S3 + CloudFront

### Create S3 Bucket
```bash
# Create bucket (use unique name)
aws s3 mb s3://disaster-alert-dashboard-yourname --region us-east-1

# Enable static website hosting
aws s3 website s3://disaster-alert-dashboard-yourname \
  --index-document index.html \
  --error-document index.html

# Upload build files
aws s3 sync frontend/dist/ s3://disaster-alert-dashboard-yourname --acl public-read

# Your site is live at:
# http://disaster-alert-dashboard-yourname.s3-website-us-east-1.amazonaws.com
```

### (Optional) Add CloudFront CDN
```bash
aws cloudfront create-distribution \
  --origin-domain-name disaster-alert-dashboard-yourname.s3.amazonaws.com \
  --default-root-object index.html
```

---

## Phase 5: Test the Full System

### 1. Test the API directly
```bash
# Get all disasters (last 24 hours)
curl https://YOUR-API.execute-api.us-east-1.amazonaws.com/prod/disasters

# Filter by type
curl "https://YOUR-API.../prod/disasters?type=EARTHQUAKE&severity=HIGH"

# Subscribe to alerts
curl -X POST https://YOUR-API.../prod/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"you@gmail.com","minSeverity":"HIGH"}'
```

### 2. Manually trigger the fetcher Lambda
```bash
aws lambda invoke \
  --function-name fetchDisasterData \
  --payload '{}' \
  response.json

cat response.json
# {"totalFetched":42,"totalNew":5,"totalAlertsOut":2}
```

### 3. Check DynamoDB
```bash
aws dynamodb scan \
  --table-name DisasterEvents \
  --max-items 5 \
  --query 'Items[*].{ID:eventId.S,Sev:severity.S,Loc:location.M.name.S}'
```

### 4. Check CloudWatch Logs
```bash
aws logs tail /aws/lambda/fetchDisasterData --follow
```

---

## 🎤 How to Demo This in College

### Talking Points:
1. **"This is event-driven"** — Show EventBridge triggering Lambda automatically
2. **"This is serverless"** — No servers to manage, auto-scales to 1M+ requests
3. **"This is real data"** — Click any earthquake card to open the USGS report
4. **"This has notifications"** — Subscribe your professor's email, wait for an earthquake!
5. **"Free tier"** — Cost is essentially $0 for this scale

### Live Demo Steps:
1. Open the dashboard → Show live earthquake dots on the map
2. Point to the severity colors (CRITICAL=red, HIGH=orange)
3. Click an alert card → Opens USGS official page
4. Show the subscribe form → Enter email
5. Open AWS Console → Show CloudWatch logs updating in real time
6. Show DynamoDB table with stored events

---

## 🏷️ Architecture Tags for Your Report
- **Pattern**: Event-Driven Architecture
- **Compute**: FaaS (Function as a Service)
- **Storage**: NoSQL (Key-Value + Document)
- **Messaging**: Pub/Sub (SNS Topic)
- **Scheduling**: Cron-based event trigger
- **Frontend**: SPA (Single Page Application)
- **Deployment**: Infrastructure as Code (AWS SAM / CloudFormation)
- **Data Source**: REST APIs (USGS GeoJSON, OpenWeatherMap)
- **Scalability**: Horizontal auto-scaling (Lambda concurrency)
- **Cost Model**: Pay-per-use (no idle costs)
