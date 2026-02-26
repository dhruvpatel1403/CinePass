import express from "express";
import {
  // User Endpoints
  getShowSeats,
  bookTicket,
  updateBooking,
  cancelBooking,
  myBookings,
  getBookingById,
  
  // Admin Endpoints
  adminBookingsByTheatre,
  adminBookingsByShow,
  adminBookingsByMovie
} from "../controllers/bookingController.js";

import { isUser, verifyAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ================= USER ENDPOINTS =================
router.get("/shows/:showId/seats", isUser, getShowSeats);

router.post("/", isUser, bookTicket);
router.put("/:bookingId", isUser, updateBooking);
router.delete("/:bookingId", isUser, cancelBooking);

router.get("/my", isUser, myBookings);
router.get("/:bookingId", isUser, getBookingById);

// ================= ADMIN ENDPOINTS =================
router.get("/admin/theatre/:theatreId",  verifyAdmin, adminBookingsByTheatre);
router.get("/admin/show/:showId", verifyAdmin, adminBookingsByShow);
router.get("/admin/movie/:movieId",  verifyAdmin, adminBookingsByMovie);

export default router;
