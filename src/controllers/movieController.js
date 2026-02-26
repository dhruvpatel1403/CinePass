// controllers/movieController.js
import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  GetCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import ddb from "../config/dynamoClient.js";
import { v4 as uuidv4 } from "uuid";

const MOVIES_TABLE = process.env.MOVIES_TABLE;

// ================= AUTH CHECK =================
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// ================= 1️⃣ CREATE MOVIE (Owner/Admin Only) =================
export const createMovie = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const {
      title,
      description,
      duration,
      language,
      genre,
      posterUrl,
      trailerUrl,
      releaseDate,
      certificate,
      status = "upcoming",
    } = req.body;

    if (!title || !duration || !releaseDate) {
      return res.status(400).json({
        message: "title, duration, releaseDate required",
      });
    }

    const movieId = `movie_${uuidv4()}`;

    const movie = {
      movieId,
      title,
      description: description || "",
      duration: Number(duration),
      language: language || "English",
      genre: genre || [],
      posterUrl,
      trailerUrl,
      releaseDate,
      certificate: certificate || "UA",
      status,
      rating: 0,
      totalRatings: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ddb.send(
      new PutCommand({
        TableName: MOVIES_TABLE,
        Item: movie,
      })
    );

    res.status(201).json({
      success: true,
      movie,
    });
  } catch (err) {
    console.error("Create movie error:", err);
    res.status(500).json({ message: "Failed to create movie" });
  }
};


// ================= 2️⃣ GET ALL MOVIES (Public - by status) =================
export const getMovies = async (req, res) => {
  try {
    const { status = "now_showing", limit = 20 } = req.query;

    const result = await ddb.send(
      new QueryCommand({
        TableName: MOVIES_TABLE,
        IndexName: "status-index",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": status },
        Limit: Number(limit),
      })
    );

    res.json({
      success: true,
      movies: result.Items || [],
      count: result.Count || 0,
      lastEvaluatedKey: result.LastEvaluatedKey || null,
    });
  } catch (err) {
    console.error("Get movies error:", err);
    res.status(500).json({ message: "Failed to fetch movies" });
  }
};
// ================= 3️⃣ GET SINGLE MOVIE =================
export const getMovieById = async (req, res) => {
  try {
    const { movieId } = req.params;

    const result = await ddb.send(new GetCommand({
      TableName: MOVIES_TABLE,
      Key: { movieId },
    }));

    if (!result.Item) {
      return res.status(404).json({ message: "Movie not found" });
    }

    res.json({ success: true, movie: result.Item });
  } catch (err) {
    console.error("Get movie error:", err);
    res.status(500).json({ message: "Failed to fetch movie" });
  }
};

// ================= 4️⃣ UPDATE MOVIE (Owner/Admin Only) =================
export const updateMovie = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { movieId } = req.params;
    const updates = req.body;

    const allowedFields = [
      "title",
      "description",
      "duration",
      "language",
      "genre",
      "posterUrl",
      "trailerUrl",
      "releaseDate",
      "certificate",
      "status",
    ];

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

    const result = await ddb.send(
      new UpdateCommand({
        TableName: MOVIES_TABLE,
        Key: { movieId },
        UpdateExpression: updateExp,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      })
    );

    res.json({
      success: true,
      movie: result.Attributes,
    });
  } catch (err) {
    console.error("Update movie error:", err);
    res.status(500).json({ message: "Failed to update movie" });
  }
};

// ================= 5️⃣ DELETE MOVIE (Owner/Admin Only) =================
export const deleteMovie = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { movieId } = req.params;

    await ddb.send(
      new DeleteCommand({
        TableName: MOVIES_TABLE,
        Key: { movieId },
        ConditionExpression: "attribute_exists(movieId)",
      })
    );

    res.json({
      success: true,
      message: "Movie permanently deleted",
    });
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return res.status(404).json({ message: "Movie not found" });
    }

    console.error("Delete movie error:", err);
    res.status(500).json({ message: "Failed to delete movie" });
  }
};

// ================= 6️⃣ GET MOVIES BY OWNER =================
export const getMoviesByOwner = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { limit = 20, startKey } = req.query;

    const params = {
      TableName: MOVIES_TABLE,
      IndexName: "owner-movie-index",  // GSI you must create
      KeyConditionExpression: "#ownerId = :ownerId",
      ExpressionAttributeNames: { "#ownerId": "ownerId" },
      ExpressionAttributeValues: { ":ownerId": ownerId },
      Limit: Number(limit),
    };

    if (startKey) params.ExclusiveStartKey = { ownerId, movieId: startKey };

    const result = await ddb.send(new QueryCommand(params));

    res.json({
      success: true,
      movies: result.Items || [],
      count: result.Count || 0,
      lastEvaluatedKey: result.LastEvaluatedKey,
      nextStartKey: result.LastEvaluatedKey?.movieId,
    });
  } catch (err) {
    console.error("Get movies by owner error:", err);
    res.status(500).json({ message: "Failed to fetch movies" });
  }
};