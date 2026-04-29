/**
 * Lambda Function: subscribe
 * Triggered by: API Gateway POST /subscribe
 * Purpose: Register user email/phone for disaster alerts with location preference
 */

const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { SNSClient, SubscribeCommand }    = require("@aws-sdk/client-sns");
const { marshall }                        = require("@aws-sdk/util-dynamodb");
const { randomUUID }                      = require("crypto");

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const sns    = new SNSClient({ region: process.env.AWS_REGION || "us-east-1" });

const SUBSCRIBERS_TABLE = process.env.SUBSCRIBERS_TABLE || "DisasterSubscribers";
const SNS_TOPIC_ARN     = process.env.SNS_TOPIC_ARN     || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type":                 "application/json",
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { email, phone, location, minSeverity } = body;

    const errors = [];
    if (!email && !phone)     errors.push("At least one of email or phone is required");
    if (email && !isValidEmail(email)) errors.push("Invalid email format");
    if (phone && !isValidPhone(phone)) errors.push("Invalid phone format (use E.164: +1234567890)");

    const validSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    const severity = (minSeverity || "MEDIUM").toUpperCase();
    if (!validSeverities.includes(severity)) errors.push("minSeverity must be LOW/MEDIUM/HIGH/CRITICAL");

    if (errors.length > 0) {
      return {
        statusCode: 400,
        headers:    CORS_HEADERS,
        body:       JSON.stringify({ error: "Validation failed", details: errors }),
      };
    }

    const subscriberId = randomUUID();
    const now = new Date().toISOString();

    const subscriber = {
      subscriberId,
      email:       email || null,
      phone:       phone || null,
      location:    location ? {
        lat:      parseFloat(location.lat),
        lng:      parseFloat(location.lng),
        radiusKm: parseFloat(location.radiusKm || 500),
      } : null,
      minSeverity: severity,
      active:      true,
      createdAt:   now,
    };

    await dynamo.send(new PutItemCommand({
      TableName: SUBSCRIBERS_TABLE,
      Item:      marshall(subscriber),
    }));

    if (email && SNS_TOPIC_ARN) {
      try {
        await sns.send(new SubscribeCommand({
          TopicArn: SNS_TOPIC_ARN,
          Protocol: "email",
          Endpoint: email,
          Attributes: {
            FilterPolicy: JSON.stringify({
              severity: validSeverities.slice(validSeverities.indexOf(severity)),
            }),
          },
        }));
        console.log(`📬 SNS email subscription created for: ${email}`);
      } catch (snsErr) {
        console.warn("SNS subscribe failed:", snsErr.message);
      }
    }

    if (phone && SNS_TOPIC_ARN) {
      try {
        await sns.send(new SubscribeCommand({
          TopicArn: SNS_TOPIC_ARN,
          Protocol: "sms",
          Endpoint: phone,
        }));
        console.log(`📱 SNS SMS subscription created for: ${phone}`);
      } catch (snsErr) {
        console.warn("SNS SMS subscribe failed:", snsErr.message);
      }
    }

    return {
      statusCode: 201,
      headers:    CORS_HEADERS,
      body:       JSON.stringify({
        message:      "Successfully subscribed to disaster alerts!",
        subscriberId,
        note:         email ? "Check your email to confirm SNS subscription." : undefined,
      }),
    };

  } catch (err) {
    console.error("subscribe error:", err);
    return {
      statusCode: 500,
      headers:    CORS_HEADERS,
      body:       JSON.stringify({ error: "Subscription failed", details: err.message }),
    };
  }
};
