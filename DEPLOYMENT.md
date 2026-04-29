# Deployment Guide

## Prerequisites

* AWS Account (Free tier is sufficient)
* Node.js 18+ installed
* AWS CLI installed and configured
* AWS SAM CLI installed

---

## Phase 1: Local Setup and Testing

### 1. Initialize Project

```bash
mkdir disaster-alert-system && cd disaster-alert-system
```

### 2. Install Backend Dependencies

```bash
cd functions/fetchDisasterData && npm install
cd ../getDisasters && npm install
cd ../subscribe && npm install
cd ../sendEmailAlert && npm install
```

### 3. Run Frontend Locally

```bash
cd frontend
npm install
npm run dev
```

The dashboard will be available at `http://localhost:5173`. It will fetch live earthquake data directly from public APIs.

---

## Phase 2: AWS Backend Deployment

### Step 1: Configure AWS CLI

```bash
aws configure
```
Provide your AWS Access Key ID, Secret Access Key, Default region name (e.g., `us-east-1`), and Default output format (`json`).

### Step 2: Obtain API Keys

1. **OpenWeatherMap**: Register at https://openweathermap.org/api for a free API key.
2. **USGS**: No API key is required.

### Step 3: Verify SES Email Identity

This is required to send email alerts.

```bash
aws ses verify-email-identity --email-address your-email@example.com --region us-east-1
```
Check your inbox and click the verification link provided by AWS.

### Step 4: Deploy with AWS SAM

```bash
sam build
sam deploy --guided
```

You will be prompted for configuration values:
* Stack Name: `disaster-alert-system`
* Region: `us-east-1`
* Parameter OpenWeatherApiKey: [Your OpenWeatherMap API Key]
* Parameter SesFromEmail: [Your verified SES email address]

### Step 5: Record API Endpoint

After successful deployment, note the `ApiUrl` in the CloudFormation outputs.

```text
Outputs
ApiUrl: https://[api-id].execute-api.us-east-1.amazonaws.com/prod
```

---

## Phase 3: Connect Frontend to Backend

### Set API URL Environment Variable

```bash
cd frontend
echo "VITE_API_URL=https://[api-id].execute-api.us-east-1.amazonaws.com/prod" > .env
```

### Build for Production

```bash
npm run build
```

---

## Phase 4: Deploy Frontend to S3 and CloudFront

### Create and Configure S3 Bucket

```bash
# Create bucket (ensure the name is globally unique)
aws s3 mb s3://disaster-alert-dashboard-[your-unique-id] --region us-east-1

# Enable static website hosting
aws s3 website s3://disaster-alert-dashboard-[your-unique-id] \
  --index-document index.html \
  --error-document index.html

# Upload compiled frontend assets
aws s3 sync frontend/dist/ s3://disaster-alert-dashboard-[your-unique-id] --acl public-read
```

Your site will be accessible via the S3 website endpoint provided in the AWS Management Console.

### Configure CloudFront (Optional but Recommended)

```bash
aws cloudfront create-distribution \
  --origin-domain-name disaster-alert-dashboard-[your-unique-id].s3.amazonaws.com \
  --default-root-object index.html
```

---

## Phase 5: System Verification

### 1. Test API Endpoints

```bash
# Fetch disaster events
curl https://[api-id].execute-api.us-east-1.amazonaws.com/prod/disasters

# Subscribe to alerts
curl -X POST https://[api-id].execute-api.us-east-1.amazonaws.com/prod/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com","minSeverity":"HIGH"}'
```

### 2. Trigger Fetcher Lambda Manually

```bash
aws lambda invoke \
  --function-name fetchDisasterData \
  --payload '{}' \
  response.json

cat response.json
```

### 3. Verify DynamoDB Records

```bash
aws dynamodb scan \
  --table-name DisasterEvents \
  --max-items 5 \
  --query 'Items[*].{ID:eventId.S,Severity:severity.S,Location:location.M.name.S}'
```

### 4. Monitor CloudWatch Logs

```bash
aws logs tail /aws/lambda/fetchDisasterData --follow
```
