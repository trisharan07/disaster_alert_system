/**
 * Lambda Function: fetchDisasterData
 * Triggered by: EventBridge (every 5 minutes)
 * Purpose: Fetch earthquake + storm data, evaluate severity, publish alerts
 */

const { DynamoDBClient, PutItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { marshall } = require("@aws-sdk/util-dynamodb");
const https = require("https");

// ─── AWS Clients ───────────────────────────────────────────────────────────
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const sns    = new SNSClient({ region: process.env.AWS_REGION || "us-east-1" });

// ─── Config from Environment Variables ────────────────────────────────────
const CONFIG = {
  TABLE_NAME:             process.env.DYNAMO_TABLE      || "DisasterEvents",
  SNS_TOPIC_ARN:          process.env.SNS_TOPIC_ARN     || "",
  OPENWEATHER_API_KEY:    process.env.OPENWEATHER_KEY   || "",
  EARTHQUAKE_MIN_MAG:     parseFloat(process.env.EQ_MIN_MAGNITUDE || "4.5"),
  WIND_SPEED_THRESHOLD_KMH: parseFloat(process.env.WIND_THRESHOLD || "80"),
};

// ─── Severity Calculator ───────────────────────────────────────────────────
function calcEarthquakeSeverity(magnitude) {
  if (magnitude >= 7.0) return "CRITICAL";
  if (magnitude >= 6.0) return "HIGH";
  if (magnitude >= 5.0) return "MEDIUM";
  return "LOW";
}

function calcStormSeverity(windSpeedKmh) {
  if (windSpeedKmh >= 180) return "CRITICAL";  // Category 5+
  if (windSpeedKmh >= 120) return "HIGH";       // Category 3+
  if (windSpeedKmh >= 80)  return "MEDIUM";
  return "LOW";
}

// ─── HTTP Helper ───────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse failed: " + e.message)); }
      });
    }).on("error", reject);
  });
}

// ─── Fetch Earthquakes (USGS API — Free, No Key Required) ─────────────────
async function fetchEarthquakes() {
  const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson`;
  const data = await fetchJSON(url);

  return data.features.map(feature => {
    const props = feature.properties;
    const [lng, lat, depth] = feature.geometry.coordinates;
    const mag = props.mag;

    return {
      eventId:     `eq_${feature.id}`,
      type:        "EARTHQUAKE",
      magnitude:   mag,
      depth:       depth,
      location:    { lat, lng, name: props.place || "Unknown Location" },
      severity:    calcEarthquakeSeverity(mag),
      description: `M${mag} earthquake — ${props.place}. Depth: ${depth}km.`,
      source:      "USGS",
      url:         props.url,
      timestamp:   new Date(props.time).toISOString(),
      alertSent:   false,
    };
  });
}

// ─── Fetch Severe Weather (OpenWeatherMap API) ─────────────────────────────
async function fetchSevereWeather() {
  if (!CONFIG.OPENWEATHER_API_KEY) {
    console.warn("No OpenWeather API key — skipping weather fetch");
    return [];
  }

  const cities = [
    { name: "Mumbai",   lat: 19.076, lon: 72.877 },
    { name: "New York", lat: 40.712, lon: -74.006 },
    { name: "Tokyo",    lat: 35.689, lon: 139.691 },
    { name: "Jakarta",  lat: -6.200, lon: 106.816 },
    { name: "Manila",   lat: 14.599, lon: 120.984 },
  ];

  const events = [];

  for (const city of cities) {
    try {
      const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${city.lat}&lon=${city.lon}&exclude=minutely,hourly,daily&appid=${CONFIG.OPENWEATHER_API_KEY}&units=metric`;
      const data = await fetchJSON(url);

      if (data.alerts && data.alerts.length > 0) {
        for (const alert of data.alerts) {
          events.push({
            eventId:     `storm_${city.name.toLowerCase()}_${Date.now()}`,
            type:        "STORM",
            magnitude:   null,
            location:    { lat: city.lat, lng: city.lon, name: city.name },
            severity:    "HIGH",
            description: `⚠️ Weather Alert in ${city.name}: ${alert.event}. ${alert.description?.slice(0, 200)}`,
            source:      "OPENWEATHER",
            timestamp:   new Date().toISOString(),
            alertSent:   false,
          });
        }
      }

      if (data.current) {
        const windKmh = (data.current.wind_speed || 0) * 3.6;
        if (windKmh >= CONFIG.WIND_SPEED_THRESHOLD_KMH) {
          events.push({
            eventId:     `wind_${city.name.toLowerCase()}_${Date.now()}`,
            type:        "SEVERE_WIND",
            magnitude:   Math.round(windKmh),
            location:    { lat: city.lat, lng: city.lon, name: city.name },
            severity:    calcStormSeverity(windKmh),
            description: `💨 Severe winds at ${Math.round(windKmh)} km/h near ${city.name}.`,
            source:      "OPENWEATHER",
            timestamp:   new Date().toISOString(),
            alertSent:   false,
          });
        }
      }
    } catch (err) {
      console.error(`Weather fetch failed for ${city.name}:`, err.message);
    }
  }

  return events;
}

// ─── Check if Event Already Stored ────────────────────────────────────────
async function eventExists(eventId) {
  const result = await dynamo.send(new QueryCommand({
    TableName:                CONFIG.TABLE_NAME,
    KeyConditionExpression:   "eventId = :id",
    ExpressionAttributeValues: { ":id": { S: eventId } },
    Limit: 1,
  }));
  return result.Count > 0;
}

// ─── Store Event in DynamoDB ───────────────────────────────────────────────
async function storeEvent(event) {
  const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days
  await dynamo.send(new PutItemCommand({
    TableName: CONFIG.TABLE_NAME,
    Item: marshall({ ...event, ttl }),
  }));
  console.log(`✅ Stored event: ${event.eventId}`);
}

// ─── Publish Alert to SNS ──────────────────────────────────────────────────
async function publishAlert(event) {
  const message = {
    eventId:     event.eventId,
    type:        event.type,
    severity:    event.severity,
    location:    event.location,
    description: event.description,
    magnitude:   event.magnitude,
    timestamp:   event.timestamp,
    source:      event.source,
  };

  await sns.send(new PublishCommand({
    TopicArn: CONFIG.SNS_TOPIC_ARN,
    Subject:  `🚨 Disaster Alert: ${event.severity} ${event.type} — ${event.location.name}`,
    Message:  JSON.stringify(message),
    MessageAttributes: {
      severity: { DataType: "String", StringValue: event.severity },
      type:     { DataType: "String", StringValue: event.type },
    },
  }));

  console.log(`📡 Published SNS alert for: ${event.eventId}`);
}

// ─── Main Handler ──────────────────────────────────────────────────────────
exports.handler = async (event) => {
  console.log("🌍 Disaster Fetcher Lambda started at:", new Date().toISOString());

  let totalFetched   = 0;
  let totalNew       = 0;
  let totalAlertsOut = 0;

  try {
    const [earthquakes, weatherEvents] = await Promise.all([
      fetchEarthquakes(),
      fetchSevereWeather(),
    ]);

    const allEvents = [...earthquakes, ...weatherEvents];
    totalFetched = allEvents.length;
    console.log(`📥 Fetched ${totalFetched} total events`);

    for (const disasterEvent of allEvents) {
      try {
        const exists = await eventExists(disasterEvent.eventId);
        if (exists) {
          console.log(`⏭️  Skipping known event: ${disasterEvent.eventId}`);
          continue;
        }

        totalNew++;
        await storeEvent(disasterEvent);

        const severityRank = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
        const minRank = severityRank["MEDIUM"];

        if (severityRank[disasterEvent.severity] >= minRank && CONFIG.SNS_TOPIC_ARN) {
          await publishAlert(disasterEvent);
          totalAlertsOut++;
        }

      } catch (eventErr) {
        console.error(`Error processing event ${disasterEvent.eventId}:`, eventErr);
      }
    }

    console.log(`📊 Summary: Fetched=${totalFetched}, New=${totalNew}, Alerts=${totalAlertsOut}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ totalFetched, totalNew, totalAlertsOut }),
    };

  } catch (err) {
    console.error("Fatal error in fetchDisasterData:", err);
    throw err;
  }
};
