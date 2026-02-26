import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
  ScanCommand
} from "@aws-sdk/lib-dynamodb";

import ddb from "../config/dynamoClient.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
dotenv.config();

const SHOWTIMES_TABLE = process.env.SHOW_TIMES_TABLE;
const SCREENS_TABLE = process.env.SCREENS_TABLE;
const SHOWSEATS_TABLE = process.env.SHOW_SEATS_TABLE;

/* =========================================================
   CREATE SHOWTIME
   Only theatre owner can create show in their screen
========================================================= */
export const createShowtime = async (req, res) => {
  try {
    const { movieId, theatreId, screenId, showDate, showTime, price } = req.body;

    if (!movieId || !theatreId || !screenId || !showDate || !showTime || !price) {
      return res.status(400).json({ message: "All fields required" });
    }

    /* 1️⃣ Verify Screen */
    const screenResult = await ddb.send(new GetCommand({
      TableName: SCREENS_TABLE,
      Key: { screenId }
    }));

    if (!screenResult.Item) {
      return res.status(404).json({ message: "Screen not found" });
    }

    const screen = screenResult.Item;

    /* 🚨 SECURITY — Ownership check */
    if (screen.ownerId !== req.user.userId) {
      return res.status(403).json({
        message: "You cannot create shows in another owner's theatre"
      });
    }

    const seatLayout = screen.seats;

    /* 2️⃣ Create show */
    const showId = `show_${uuidv4()}`;

    const showtimeItem = {
      showId,
      ownerId: req.user.userId,
      movieId,
      theatreId,
      screenId,
      showDate,
      showTime,
      price,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ddb.send(new PutCommand({
      TableName: SHOWTIMES_TABLE,
      Item: showtimeItem,
    }));

    /* 3️⃣ Generate seats */
    const BATCH_SIZE = 25;

    for (let i = 0; i < seatLayout.length; i += BATCH_SIZE) {
      const batch = seatLayout.slice(i, i + BATCH_SIZE).map(seatId => ({
        PutRequest: {
          Item: {
            showId,
            seatId,
            status: "AVAILABLE",
            price,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        }
      }));

      await ddb.send(new BatchWriteCommand({
        RequestItems: { [SHOWSEATS_TABLE]: batch }
      }));
    }

    res.status(201).json({
      success: true,
      message: "Showtime created & seats generated",
      showtime: showtimeItem
    });

  } catch (err) {
    console.error("Create showtime error:", err);
    res.status(500).json({ message: "Failed to create showtime" });
  }
};

/* =========================================================
   GET MY SHOWS (OWNER)
========================================================= */
export const getMyShows = async (req, res) => {
  try {
    const ownerId = req.user.userId;

    const result = await ddb.send(new QueryCommand({
      TableName: SHOWTIMES_TABLE,
      IndexName: "owner-show-index",
      KeyConditionExpression: "#ownerId = :ownerId",
      ExpressionAttributeNames: { "#ownerId": "ownerId" },
      ExpressionAttributeValues: { ":ownerId": ownerId },
    }));

    res.json({
      success: true,
      shows: result.Items || []
    });

  } catch (err) {
    console.error("Get my shows error:", err);
    res.status(500).json({ message: "Failed to fetch shows" });
  }
};

/* =========================================================
   GET SHOW BY ID
========================================================= */
export const getShowById = async (req, res) => {
  try {
    const { showId } = req.params;

    const result = await ddb.send(new GetCommand({
      TableName: SHOWTIMES_TABLE,
      Key: { showId }
    }));

    if (!result.Item) {
      return res.status(404).json({ message: "Show not found" });
    }

    res.json({ success: true, show: result.Item });

  } catch (err) {
    console.error("Get show error:", err);
    res.status(500).json({ message: "Failed to fetch show" });
  }
};

/* =========================================================
   UPDATE SHOW
========================================================= */
export const updateShow = async (req, res) => {
  try {
    const { showId } = req.params;

    const existing = await ddb.send(new GetCommand({
      TableName: SHOWTIMES_TABLE,
      Key: { showId }
    }));

    if (!existing.Item) {
      return res.status(404).json({ message: "Show not found" });
    }

    if (existing.Item.ownerId !== req.user.userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const updates = req.body;
    const allowedFields = ["showDate", "showTime", "price"];

    let updateExp = "SET ";
    const names = {};
    const values = {};
    let first = true;

    Object.entries(updates).forEach(([key, val]) => {
      if (!allowedFields.includes(key)) return;

      if (!first) updateExp += ", ";
      first = false;

      names[`#${key}`] = key;
      values[`:${key}`] = val;
      updateExp += `#${key} = :${key}`;
    });

    updateExp += ", #updatedAt = :updatedAt";
    names["#updatedAt"] = "updatedAt";
    values[":updatedAt"] = new Date().toISOString();

    const result = await ddb.send(new UpdateCommand({
      TableName: SHOWTIMES_TABLE,
      Key: { showId },
      UpdateExpression: updateExp,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW"
    }));

    res.json({
      success: true,
      show: result.Attributes
    });

  } catch (err) {
    console.error("Update show error:", err);
    res.status(500).json({ message: "Failed to update show" });
  }
};

/* =========================================================
   DELETE SHOW (also delete seats)
========================================================= */
export const deleteShow = async (req, res) => {
  try {
    const { showId } = req.params;

    const existing = await ddb.send(new GetCommand({
      TableName: SHOWTIMES_TABLE,
      Key: { showId }
    }));

    if (!existing.Item) {
      return res.status(404).json({ message: "Show not found" });
    }

    if (existing.Item.ownerId !== req.user.userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    /* Delete show */
    await ddb.send(new DeleteCommand({
      TableName: SHOWTIMES_TABLE,
      Key: { showId }
    }));

    /* Delete seats */
    const seats = await ddb.send(new QueryCommand({
      TableName: SHOWSEATS_TABLE,
      KeyConditionExpression: "showId = :showId",
      ExpressionAttributeValues: { ":showId": showId }
    }));

    if (seats.Items?.length) {
      const BATCH_SIZE = 25;

      for (let i = 0; i < seats.Items.length; i += BATCH_SIZE) {
        const batch = seats.Items.slice(i, i + BATCH_SIZE).map(seat => ({
          DeleteRequest: {
            Key: { showId: seat.showId, seatId: seat.seatId }
          }
        }));

        await ddb.send(new BatchWriteCommand({
          RequestItems: { [SHOWSEATS_TABLE]: batch }
        }));
      }
    }

    res.json({ success: true, message: "Show deleted successfully" });

  } catch (err) {
    console.error("Delete show error:", err);
    res.status(500).json({ message: "Failed to delete show" });
  }
};

/* =========================================================
   GET SEATS BY SHOW
========================================================= */
export const getSeatsByShow = async (req, res) => {
  try {
    const { showId } = req.params;

    const result = await ddb.send(new QueryCommand({
      TableName: SHOWSEATS_TABLE,
      KeyConditionExpression: "#showId = :showId",
      ExpressionAttributeNames: { "#showId": "showId" },
      ExpressionAttributeValues: { ":showId": showId }
    }));

    res.json({
      success: true,
      seats: result.Items || [],
    });

  } catch (err) {
    console.error("Get seats error:", err);
    res.status(500).json({ message: "Failed to fetch seats" });
  }
};
export const getShowtimesByMovie = async (req, res) => {
  try {
    const { movieId } = req.params;
    const { date, theatreId } = req.query;

    if (!movieId) {
      return res.status(400).json({
        success: false,
        message: "movieId is required"
      });
    }

    // ✅ Use Scan (since no GSI exists)
    const result = await ddb.send(new ScanCommand({
      TableName: SHOWTIMES_TABLE,
      FilterExpression: "#movieId = :movieId",
      ExpressionAttributeNames: {
        "#movieId": "movieId"
      },
      ExpressionAttributeValues: {
        ":movieId": movieId
      }
    }));

    let showtimes = result.Items || [];

    // Date filter
    if (date) {
      showtimes = showtimes.filter(show => show.showDate === date);
    }

    // Theatre filter
    if (theatreId) {
      showtimes = showtimes.filter(show => show.theatreId === theatreId);
    }

    res.json({
      success: true,
      count: showtimes.length,
      showtimes
    });

  } catch (error) {
    console.error("Get showtimes error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch showtimes"
    });
  }
};