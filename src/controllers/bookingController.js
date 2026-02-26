import { v4 as uuidv4 } from "uuid";
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
    ScanCommand
} from "@aws-sdk/lib-dynamodb";
import ddb from "../config/dynamoClient.js";

import dotenv from "dotenv";
dotenv.config();    

const TABLES = {
  SHOWSEATS: process.env.SHOW_SEATS_TABLE,
  BOOKINGS: process.env.BOOKINGS_TABLE,
  SHOWS: process.env.SHOW_TIMES_TABLE,
  MOVIES: process.env.MOVIES_TABLE,
  THEATRES: process.env.THEATERS_TABLE,
  SCREENS: process.env.SCREENS_TABLE
};

// ================= SHARED UTILITIES =================
const updateSeatStatus = async (showId, seatId, status) => {
  await ddb.send(new UpdateCommand({
    TableName: TABLES.SHOWSEATS,
    Key: { showId, seatId },
    UpdateExpression: "SET #status = :status",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": status }
  }));
};

const validateSeatsAvailability = async (showId, seats) => {
  for (const seatId of seats) {
    const result = await ddb.send(new GetCommand({
      TableName: TABLES.SHOWSEATS,
      Key: { showId, seatId }
    }));
    
    if (!result.Item || result.Item.status !== "AVAILABLE") {
      throw new Error(`Seat ${seatId} is unavailable`);
    }
  }
};

// ================= USER CONTROLLERS =================
export const getShowSeats = async (req, res) => {
  try {
    const { showId } = req.params;
    
    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.SHOWSEATS,
      KeyConditionExpression: "showId = :showId",
      ExpressionAttributeValues: { ":showId": showId }
    }));

    res.json({
      success: true,
      seats: result.Items || [],
      count: result.Count || 0
    });
  } catch (error) {
    console.error("Get seats error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch seats" });
  }
};

export const bookTicket = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { showId, seats, totalAmount } = req.body;

    if (!showId || !seats?.length || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: "showId, seats, and totalAmount are required"
      });
    }

    // 1️⃣ Get show details
    const showResult = await ddb.send(new GetCommand({
      TableName: TABLES.SHOWS,
      Key: { showId }
    }));

    if (!showResult.Item) {
      return res.status(404).json({ success: false, message: "Show not found" });
    }

    const show = showResult.Item;

    // 2️⃣ Get movie details
    const movieResult = await ddb.send(new GetCommand({
      TableName: TABLES.MOVIES,
      Key: { movieId: show.movieId }
    }));

    if (!movieResult.Item) {
      return res.status(404).json({ success: false, message: "Movie not found" });
    }

    const movie = movieResult.Item;

    // 3️⃣ Get theatre details
    const theatreResult = await ddb.send(new GetCommand({
      TableName: TABLES.THEATRES,
      Key: { theatreId: show.theatreId }
    }));

    const theatre = theatreResult.Item;

    // 4️⃣ Validate seats
    await validateSeatsAvailability(showId, seats);

    for (const seatId of seats) {
      await updateSeatStatus(showId, seatId, "BOOKED");
    }

    const bookingId = `booking_${uuidv4()}`;

    const bookingData = {
      bookingId,
      userId,

      // 🔥 Denormalized movie data
      movieId: movie.movieId,
      movieTitle: movie.title,
      posterUrl: movie.posterUrl,
      duration: movie.duration,
      language: movie.language,

      // 🔥 Show data
      showId,
      showDate: show.showDate,
      showTime: show.showTime,

      // 🔥 Theatre data
      theatreId: show.theatreId,
      theatreName: theatre?.name || "",
      screenId: show.screenId,

      seats,
      totalAmount: Number(totalAmount),

      status: "CONFIRMED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await ddb.send(new PutCommand({
      TableName: TABLES.BOOKINGS,
      Item: bookingData
    }));

    res.status(201).json({
      success: true,
      message: "Booking confirmed successfully",
      booking: bookingData
    });

  } catch (error) {
    console.error("Book ticket error:", error);

    if (error.message.includes("unavailable")) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(500).json({ success: false, message: "Booking failed" });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const result = await ddb.send(new GetCommand({
      TableName: TABLES.BOOKINGS,
      Key: { bookingId }
    }));

    const booking = result.Item;

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    // Release seats first
    for (const seatId of booking.seats) {
      await updateSeatStatus(booking.showId, seatId, "AVAILABLE");
    }

    // ✅ Permanently delete booking
    await ddb.send(new DeleteCommand({
      TableName: TABLES.BOOKINGS,
      Key: { bookingId }
    }));

    res.json({ success: true, message: "Booking permanently deleted" });

  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(500).json({ success: false, message: "Failed to cancel booking" });
  }
};

export const updateBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { newSeats } = req.body;

    if (!newSeats?.length) {
      return res.status(400).json({ 
        success: false, 
        message: "newSeats array is required" 
      });
    }

    const result = await ddb.send(new GetCommand({
      TableName: TABLES.BOOKINGS,
      Key: { bookingId }
    }));

    const booking = result.Item;
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    // Release old seats
    for (const seatId of booking.seats) {
      await updateSeatStatus(booking.showId, seatId, "AVAILABLE");
    }

    // Validate and book new seats
    await validateSeatsAvailability(booking.showId, newSeats);
    for (const seatId of newSeats) {
      await updateSeatStatus(booking.showId, seatId, "BOOKED");
    }

    // Update booking
    await ddb.send(new UpdateCommand({
      TableName: TABLES.BOOKINGS,
      Key: { bookingId },
      UpdateExpression: "SET seats = :seats, #updatedAt = :now",
      ExpressionAttributeNames: { "#updatedAt": "updatedAt" },
      ExpressionAttributeValues: { 
        ":seats": newSeats,
        ":now": new Date().toISOString()
      }
    }));

    res.json({ success: true, message: "Booking updated successfully" });
  } catch (error) {
    console.error("Update booking error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const myBookings = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.BOOKINGS,
      IndexName: "UserBookingsIndex",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId }
    }));

    res.json({
      success: true,
      bookings: result.Items || [],
      count: result.Count || 0
    });
  } catch (error) {
    console.error("My bookings error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch bookings" });
  }
};

export const getBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const result = await ddb.send(new GetCommand({
      TableName: TABLES.BOOKINGS,
      Key: { bookingId }
    }));

    if (!result.Item) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    res.json({
      success: true,
      booking: result.Item
    });
  } catch (error) {
    console.error("Get booking error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch booking" });
  }
};

// ================= ADMIN CONTROLLERS =================
// ================= ADMIN CONTROLLERS =================
export const adminBookingsByTheatre = async (req, res) => {
  try {
    const { theatreId } = req.params;

    // Scan with filter (works with your schema)
    const result = await ddb.send(new ScanCommand({
      TableName: TABLES.BOOKINGS,
      FilterExpression: "#theatreId = :theatreId",
      ExpressionAttributeNames: { 
        "#theatreId": "theatreId" 
      },
      ExpressionAttributeValues: { 
        ":theatreId": theatreId 
      }
    }));

    res.json({
      success: true,
      bookings: result.Items || [],
      count: result.Count || 0,
      scannedCount: result.ScannedCount || 0
    });
  } catch (error) {
    console.error("Admin theatre bookings error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch theatre bookings" });
  }
};

export const adminBookingsByShow = async (req, res) => {
  try {
    const { showId } = req.params;

    // Scan with filter (works with your schema)
    const result = await ddb.send(new ScanCommand({
      TableName: TABLES.BOOKINGS,
      FilterExpression: "#showId = :showId",
      ExpressionAttributeNames: { 
        "#showId": "showId" 
      },
      ExpressionAttributeValues: { 
        ":showId": showId 
      }
    }));

    res.json({
      success: true,
      bookings: result.Items || [],
      count: result.Count || 0,
      scannedCount: result.ScannedCount || 0
    });
  } catch (error) {
    console.error("Admin show bookings error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch show bookings" });
  }
};

export const adminBookingsByMovie = async (req, res) => {
  try {
    const { movieId } = req.params;

    // ✅ Get shows for movie (your existing GSI works)
    const showsResult = await ddb.send(new QueryCommand({
      TableName: TABLES.SHOWS,
      IndexName: "MovieShowsIndex",
      KeyConditionExpression: "movieId = :movieId",
      ExpressionAttributeValues: { ":movieId": movieId }
    }));

    let totalCustomers = 0;
    const showBookings = [];

    // Aggregate bookings per show (using Scan - works with your schema)
    for (const show of showsResult.Items || []) {
      const bookingsResult = await ddb.send(new ScanCommand({
        TableName: TABLES.BOOKINGS,
        FilterExpression: "#showId = :showId",
        ExpressionAttributeNames: { "#showId": "showId" },
        ExpressionAttributeValues: { ":showId": show.showId }
      }));

      const showCustomerCount = bookingsResult.Items?.reduce((sum, b) => sum + (b.seats?.length || 0), 0) || 0;
      totalCustomers += showCustomerCount;
      showBookings.push({ 
        showId: show.showId, 
        customers: showCustomerCount,
        showDate: show.showDate,
        showTime: show.showTime 
      });
    }

    res.json({
      success: true,
      movieId,
      totalCustomers,
      totalShows: showsResult.Items?.length || 0,
      avgCustomersPerShow: showBookings.length ? Math.round(totalCustomers / showBookings.length) : 0,
      breakdown: showBookings
    });
  } catch (error) {
    console.error("Admin movie bookings error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch movie analytics" });
  }
};
