// controllers/screenController.js
import { PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand,QueryCommand } from "@aws-sdk/lib-dynamodb";
import ddb from "../config/dynamoClient.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
dotenv.config();

const SCREENS_TABLE = process.env.SCREENS_TABLE;

// ================= CREATE SCREEN (ADMIN ONLY) =================
export const createScreen = async (req, res) => {
  try {
    const { theatreId, name, seats } = req.body;
    const ownerId = req.user.userId; // from auth middleware
    console.log("Create screen data:", req.body.theatreId);
    if (!theatreId || !name || !seats || !Array.isArray(seats) || seats.length === 0) {
      return res.status(400).json({ message: "theatreId, name, seats (array) are required" });
    }

    const screenId = `screen_${uuidv4()}`;

    const screenItem = {
      screenId,
      theatreId,
      name,
      ownerId,
      seats, // array of seat IDs ["A1","A2","B1",...]
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ddb.send(new PutCommand({
      TableName: SCREENS_TABLE,
      Item: screenItem
    }));

    res.status(201).json({
      success: true,
      message: "Screen created successfully",
      screen: screenItem
    });

  } catch (err) {
    console.error("Create screen error:", err);
    res.status(500).json({ message: "Failed to create screen" });
  }
};

// ================= GET ALL SCREENS =================
export const getScreens = async (req, res) => {
  try {
    const result = await ddb.send(new ScanCommand({
      TableName: SCREENS_TABLE
    }));

    res.json({
      success: true,
      screens: result.Items || []
    });

  } catch (err) {
    console.error("Get screens error:", err);
    res.status(500).json({ message: "Failed to fetch screens" });
  }
};

// ================= GET SINGLE SCREEN =================
export const getScreenById = async (req, res) => {
  try {
    const { screenId } = req.params;

    const result = await ddb.send(new GetCommand({
      TableName: SCREENS_TABLE,
      Key: { screenId }
    }));

    if (!result.Item) {
      return res.status(404).json({ message: "Screen not found" });
    }

    res.json({ success: true, screen: result.Item });

  } catch (err) {
    console.error("Get screen error:", err);
    res.status(500).json({ message: "Failed to fetch screen" });
  }
};

// ================= UPDATE SCREEN (ADMIN ONLY) =================
export const updateScreen = async (req, res) => {
  try {
    const { screenId } = req.params;
    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No update fields provided" });
    }

    const allowedFields = ["name", "seats", "theatreId"];

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

    if (first) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    updateExp += ", #updatedAt = :updatedAt";
    names["#updatedAt"] = "updatedAt";
    values[":updatedAt"] = new Date().toISOString();

    const result = await ddb.send(new UpdateCommand({
      TableName: SCREENS_TABLE,
      Key: { screenId },
      UpdateExpression: updateExp,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW"
    }));

    res.json({
      success: true,
      message: "Screen updated successfully",
      screen: result.Attributes
    });

  } catch (err) {
    console.error("Update screen error:", err);
    res.status(500).json({ message: "Failed to update screen" });
  }
};

// ================= DELETE SCREEN (ADMIN ONLY) =================
export const deleteScreen = async (req, res) => {
  try {
    const { screenId } = req.params;

    await ddb.send(new DeleteCommand({
      TableName: SCREENS_TABLE,
      Key: { screenId }
    }));

    res.json({
      success: true,
      message: "Screen deleted successfully"
    });

  } catch (err) {
    console.error("Delete screen error:", err);
    res.status(500).json({ message: "Failed to delete screen" });
  }
};

export const getMyScreens = async (req, res) => {
  try {
    const ownerId = req.user.userId;

    const result = await ddb.send(new QueryCommand({
      TableName: SCREENS_TABLE,
      IndexName: "owner-screen-index",  // GSI
      KeyConditionExpression: "#ownerId = :ownerId",
      ExpressionAttributeNames: {
        "#ownerId": "ownerId"
      },
      ExpressionAttributeValues: {
        ":ownerId": ownerId
      }
    }));

    res.json({
      success: true,
      screens: result.Items || []
    });

  } catch (err) {
    console.error("Get my screens error:", err);
    res.status(500).json({ message: "Failed to fetch screens" });
  }
};