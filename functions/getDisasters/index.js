/**
 * Lambda Function: getDisasters
 * Triggered by: API Gateway GET /disasters
 * Purpose: Return recent disaster events from DynamoDB for the frontend
 */

const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const TABLE  = process.env.DYNAMO_TABLE || "DisasterEvents";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Content-Type":                 "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const params       = event.queryStringParameters || {};
    const limitParam   = parseInt(params.limit  || "50");
    const typeFilter   = params.type;
    const sevFilter    = params.severity;
    const hoursBack    = parseInt(params.hours || "24");

    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    let filterExp   = "#ts >= :since";
    let expAttrNames  = { "#ts": "timestamp" };
    let expAttrValues = { ":since": { S: since } };

    if (typeFilter) {
      filterExp += " AND #type = :type";
      expAttrNames["#type"] = "type";
      expAttrValues[":type"] = { S: typeFilter.toUpperCase() };
    }

    if (sevFilter) {
      filterExp += " AND severity = :sev";
      expAttrValues[":sev"] = { S: sevFilter.toUpperCase() };
    }

    const result = await dynamo.send(new ScanCommand({
      TableName:                 TABLE,
      FilterExpression:          filterExp,
      ExpressionAttributeNames:  expAttrNames,
      ExpressionAttributeValues: expAttrValues,
      Limit:                     500,
    }));

    let events = (result.Items || [])
      .map(unmarshall)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limitParam);

    events = events.map(ev => ({
      ...ev,
      severityScore: { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[ev.severity] || 0,
      ageMinutes:    Math.round((Date.now() - new Date(ev.timestamp)) / 60000),
    }));

    const stats = {
      total:    events.length,
      critical: events.filter(e => e.severity === "CRITICAL").length,
      high:     events.filter(e => e.severity === "HIGH").length,
      medium:   events.filter(e => e.severity === "MEDIUM").length,
      low:      events.filter(e => e.severity === "LOW").length,
      byType: events.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {}),
    };

    return {
      statusCode: 200,
      headers:    CORS_HEADERS,
      body:       JSON.stringify({ events, stats, fetchedAt: new Date().toISOString() }),
    };

  } catch (err) {
    console.error("getDisasters error:", err);
    return {
      statusCode: 500,
      headers:    CORS_HEADERS,
      body:       JSON.stringify({ error: "Failed to fetch disaster data", details: err.message }),
    };
  }
};
