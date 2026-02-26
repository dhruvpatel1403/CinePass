// routes/showRoutes.js
import express from "express";
import {
  createShowtime,
  getShowtimesByMovie,
  getSeatsByShow,
  getMyShows,
  updateShow,
  deleteShow,getShowById
  
} from "../controllers/showController.js";

import { verifyAdmin } from "../middlewares/auth.js"; // your JWT auth

const router = express.Router();

// ================= CREATE SHOWTIME (ADMIN ONLY) =================

router.post("/", verifyAdmin, createShowtime);
router.get("/my", verifyAdmin, getMyShows);
router.put("/:showId", verifyAdmin, updateShow);
router.delete("/:showId", verifyAdmin, deleteShow);
// ================= GET SHOWTIMES BY MOVIE =================
router.get("/movie/:movieId", getShowtimesByMovie);

// ================= GET SHOW BY ID =================
router.get("/:showId", getShowById);

// ================= GET SEATS FOR SHOW =================
router.get("/seats/:showId", getSeatsByShow);

export default router;