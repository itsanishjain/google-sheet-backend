import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";
import axios from "axios";
import fs from "fs";

// Initialize Express App
const app = express();
app.use(bodyParser.json());

// Verify environment variables
if (
  !process.env.GOOGLE_SHEET_ID ||
  !process.env.GOOGLE_API_CREDENTIALS ||
  !process.env.ENRICHMENT_API_URL
) {
  console.error(
    "Missing required environment variables. Check your .env file."
  );
  process.exit(1); // Exit the process if critical variables are missing
}

// Google Sheets Setup
const sheetId = process.env.GOOGLE_SHEET_ID;
const credentialsPath = process.env.GOOGLE_API_CREDENTIALS;

if (!fs.existsSync(credentialsPath)) {
  console.error(`Google API credentials file not found: ${credentialsPath}`);
  process.exit(1); // Exit if credentials file is missing
}

const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// Helper to Append to Google Sheets
async function appendToSpreadsheet(row) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "tweet-safwaan!A1",
      valueInputOption: "USER_ENTERED",
      resource: { values: [row] },
    });
  } catch (error) {
    console.error("Error appending to Google Sheet:", error);
  }
}

// Enrichment API Integration
async function enrichLink(link) {
  try {
    const response = await axios.get(`${process.env.ENRICHMENT_API_URL}`, {
      params: { url: link },
      headers: { Authorization: `Bearer ${process.env.ENRICHMENT_API_KEY}` },
    });
    return response.data;
  } catch (error) {
    console.error("Error enriching link:", error);
    return null;
  }
}

// Route: Submit Link
app.post("/submit", async (req, res) => {
  const { link } = req.body;

  if (!link) {
    return res.status(400).json({ error: "Link is required" });
  }

  const enrichedData = await enrichLink(link);

  const row = [
    new Date().toISOString(), // Timestamp
    link, // Original Link
    enrichedData?.title || "", // Enriched Title
    enrichedData?.description || "", // Enriched Description
    "Pending", // Status
  ];

  await appendToSpreadsheet(row);

  res.status(200).json({ message: "Link submitted successfully!", data: row });
});

// Route: Get Directory
app.get("/directory", async (req, res) => {
  try {
    const range = "'tweet-safwaan'!A:E"; // Update to match your sheet name and desired range
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });

    const rows = response.data.values || [];

    console.log(rows);

    if (rows.length === 0) {
      return res.status(200).json({
        directory: [],
        message: "No data available in the directory.",
      });
    }

    const directory = rows
      .filter((row) => row[4] === "Approved") // Ensure 'Status' column contains "Approved"
      .map((row) => ({
        timestamp: row[0],
        link: row[1],
        title: row[2],
        description: row[3],
      }));

    res.status(200).json({ directory });
  } catch (error) {
    console.error("Error fetching directory:", error);
    res.status(500).json({ error: "Failed to fetch directory." });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
