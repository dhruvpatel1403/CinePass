import express from "express";
import {
  createTheatre,
  getTheatres,
  getTheatreById,
  updateTheatre,
  deleteTheatre,
  getMyTheatres
} from "../controllers/theatreController.js";
import { verifyAdmin } from "../middlewares/auth.js"; // your JWT auth


const router = express.Router();

// ADMIN ONLY
router.post("/", verifyAdmin, createTheatre);
router.put("/:theatreId", verifyAdmin, updateTheatre);
router.delete("/:theatreId", verifyAdmin, deleteTheatre);
router.get("/my", verifyAdmin, getMyTheatres);


// PUBLIC OR AUTHED USERS
router.get("/", getTheatres);
router.get("/:theatreId", getTheatreById);

export default router;