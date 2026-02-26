// controllers/theatreController.js
import { PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand,QueryCommand } from "@aws-sdk/lib-dynamodb";
import ddb from "../config/dynamoClient.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
dotenv.config();

const THEATRES_TABLE = process.env.THEATERS_TABLE;
export const getMyTheatres = async (req, res) => {
  try {
    const ownerId = req.user.userId;

    const result = await ddb.send(new QueryCommand({
      TableName: THEATRES_TABLE,
      IndexName: "owner-theatre-index",
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
      theatres: result.Items || []
    });

  } catch (err) {
    console.error("Get my theatres error:", err);
    res.status(500).json({ message: "Failed to fetch your theatres" });
  }
};

// ================= CREATE THEATRE (ADMIN ONLY) =================
export const createTheatre = async (req, res) => {
  try {
    const { name, location } = req.body;
    const ownerId = req.user.userId; // from auth middleware

    if (!name || !location) {
      return res.status(400).json({ message: "name and location required" });
    }

    const theatreId = `theatre_${uuidv4()}`;

    const theatreItem = {
      theatreId,
      name,
      location,
      ownerId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ddb.send(new PutCommand({
      TableName: THEATRES_TABLE,
      Item: theatreItem
    }));

    res.status(201).json({
      success: true,
      message: "Theatre created successfully",
      theatre: theatreItem
    });

  } catch (err) {
    console.error("Create theatre error:", err);
    res.status(500).json({ message: "Failed to create theatre" });
  }
};

// ================= GET ALL THEATRES =================
export const getTheatres = async (req, res) => {
  try {
    const result = await ddb.send(new ScanCommand({
      TableName: THEATRES_TABLE
    }));

    res.json({
      success: true,
      theatres: result.Items || []
    });

  } catch (err) {
    console.error("Get theatres error:", err);
    res.status(500).json({ message: "Failed to fetch theatres" });
  }
};

// ================= GET SINGLE THEATRE =================
export const getTheatreById = async (req, res) => {
  try {
    const { theatreId } = req.params;

    const result = await ddb.send(new GetCommand({
      TableName: THEATRES_TABLE,
      Key: { theatreId }
    }));

    if (!result.Item) {
      return res.status(404).json({ message: "Theatre not found" });
    }

    res.json({ success: true, theatre: result.Item });

  } catch (err) {
    console.error("Get theatre error:", err);
    res.status(500).json({ message: "Failed to fetch theatre" });
  }
};

// ================= UPDATE THEATRE (ADMIN ONLY) =================
export const updateTheatre = async (req, res) => {
  try {
    const { theatreId } = req.params;
    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No update fields provided" });
    }

    const allowedFields = ["name", "location"];
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
      TableName: THEATRES_TABLE,
      Key: { theatreId },
      UpdateExpression: updateExp,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW"
    }));

    res.json({
      success: true,
      message: "Theatre updated successfully",
      theatre: result.Attributes
    });

  } catch (err) {
    console.error("Update theatre error:", err);
    res.status(500).json({ message: "Failed to update theatre" });
  }
};

// ================= DELETE THEATRE (ADMIN ONLY) =================
export const deleteTheatre = async (req, res) => {
  try {
    const { theatreId } = req.params;

    await ddb.send(new DeleteCommand({
      TableName: THEATRES_TABLE,
      Key: { theatreId }
    }));

    res.json({
      success: true,
      message: "Theatre deleted successfully"
    });

  } catch (err) {
    console.error("Delete theatre error:", err);
    res.status(500).json({ message: "Failed to delete theatre" });
  }
};