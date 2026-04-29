/**
 * Lambda Function: sendEmailAlert
 * Triggered by: SNS Topic subscription
 * Purpose: Parse disaster alert, fetch subscribers, send email via SES
 */

const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const ses    = new SESClient({ region: process.env.AWS_REGION || "us-east-1" });

const SUBSCRIBERS_TABLE = process.env.SUBSCRIBERS_TABLE || "DisasterSubscribers";
const FROM_EMAIL        = process.env.SES_FROM_EMAIL    || "alerts@yourdomain.com";

// Distance calculation (Haversine formula)
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Severity rank for filtering
const SEVERITY_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

// Build a beautiful HTML email template
function buildEmailHTML(alert) {
  const severityColors = {
    LOW:      "#22c55e",
    MEDIUM:   "#f59e0b",
    HIGH:     "#ef4444",
    CRITICAL: "#7c3aed",
  };
  const color = severityColors[alert.severity] || "#ef4444";
  const icons = { EARTHQUAKE: "🌍", STORM: "🌪️", FLOOD: "🌊", SEVERE_WIND: "💨" };
  const icon = icons[alert.type] || "⚠️";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 20px; }
    .card { background: #1e293b; border-radius: 12px; padding: 32px; max-width: 600px; margin: 0 auto; border-top: 4px solid ${color}; }
    .badge { display: inline-block; background: ${color}; color: white; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 1px; }
    h1 { font-size: 28px; margin: 16px 0 8px; color: #f1f5f9; }
    .meta { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
    .description { background: #0f172a; border-radius: 8px; padding: 16px; font-size: 15px; line-height: 1.6; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #334155; }
    .label { color: #94a3b8; font-size: 13px; }
    .value { font-weight: 600; color: #f1f5f9; }
    .footer { text-align: center; margin-top: 24px; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">${alert.severity} ALERT</span>
    <h1>${icon} ${alert.type.replace("_", " ")} DETECTED</h1>
    <p class="meta">📍 ${alert.location.name} &nbsp;|&nbsp; 🕐 ${new Date(alert.timestamp).toUTCString()}</p>
    <div class="description">${alert.description}</div>
    <br>
    <div class="detail-row">
      <span class="label">Event Type</span>
      <span class="value">${alert.type}</span>
    </div>
    ${alert.magnitude ? `<div class="detail-row"><span class="label">Magnitude / Intensity</span><span class="value">${alert.magnitude}</span></div>` : ""}
    <div class="detail-row">
      <span class="label">Coordinates</span>
      <span class="value">${alert.location.lat.toFixed(3)}°, ${alert.location.lng.toFixed(3)}°</span>
    </div>
    <div class="detail-row">
      <span class="label">Data Source</span>
      <span class="value">${alert.source}</span>
    </div>
    <div class="footer">
      <p>🛡️ Disaster Alert System — Automated Alert</p>
      <p>To unsubscribe, visit your dashboard settings.</p>
    </div>
  </div>
</body>
</html>`;
}

// Fetch all active subscribers from DynamoDB
async function getSubscribers() {
  const result = await dynamo.send(new ScanCommand({
    TableName:        SUBSCRIBERS_TABLE,
    FilterExpression: "active = :true",
    ExpressionAttributeValues: { ":true": { BOOL: true } },
  }));
  return (result.Items || []).map(unmarshall);
}

// Send email using AWS SES
async function sendEmail(toEmail, subject, htmlBody, textBody) {
  await ses.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: {
        Html: { Data: htmlBody, Charset: "UTF-8" },
        Text: { Data: textBody, Charset: "UTF-8" },
      },
    },
  }));
}

// Main Lambda handler
exports.handler = async (snsEvent) => {
  console.log("📧 sendEmailAlert Lambda triggered");

  // SNS delivers records as an array
  for (const record of snsEvent.Records) {
    try {
      const alert = JSON.parse(record.Sns.Message);
      console.log(`Processing alert: ${alert.eventId}, severity: ${alert.severity}`);

      // Get all subscribers
      const subscribers = await getSubscribers();
      console.log(`Found ${subscribers.length} active subscribers`);

      let emailsSent = 0;

      for (const sub of subscribers) {
        // Check severity preference
        if (SEVERITY_RANK[alert.severity] < SEVERITY_RANK[sub.minSeverity || "MEDIUM"]) {
          continue; // This alert is below subscriber's threshold
        }

        // Check location proximity (if subscriber set a location)
        if (sub.location && sub.location.lat && alert.location) {
          const dist = distanceKm(
            sub.location.lat, sub.location.lng,
            alert.location.lat, alert.location.lng
          );
          const radiusKm = sub.location.radiusKm || 500;
          if (dist > radiusKm) {
            console.log(`📍 Subscriber ${sub.email} is ${dist.toFixed(0)}km away — outside ${radiusKm}km radius`);
            continue;
          }
        }

        // Build and send email
        const subject = `🚨 ${alert.severity} Alert: ${alert.type} near ${alert.location.name}`;
        const html    = buildEmailHTML(alert);
        const text    = `DISASTER ALERT\n\n${alert.description}\n\nLocation: ${alert.location.name}\nSeverity: ${alert.severity}\nTime: ${alert.timestamp}\nSource: ${alert.source}`;

        try {
          await sendEmail(sub.email, subject, html, text);
          emailsSent++;
          console.log(`✅ Email sent to: ${sub.email}`);
        } catch (emailErr) {
          console.error(`Failed to send to ${sub.email}:`, emailErr.message);
        }
      }

      console.log(`📊 Alert ${alert.eventId}: sent ${emailsSent} emails`);

    } catch (err) {
      console.error("Error processing SNS record:", err);
    }
  }
};
