import express from "express";
import {
  createScreen,
  getScreens,
  getScreenById,
  updateScreen,
  deleteScreen,getMyScreens
} from "../controllers/screenController.js";

import { verifyAdmin } from "../middlewares/auth.js";

const router = express.Router();

// ADMIN ONLY
router.post("/", verifyAdmin, createScreen);
router.put("/:screenId", verifyAdmin, updateScreen);
router.delete("/:screenId", verifyAdmin, deleteScreen);
router.get("/my", verifyAdmin, getMyScreens); // Get screens owned by admin
// PUBLIC OR AUTHED USERS
router.get("/", getScreens);
router.get("/:screenId", getScreenById);

export default router;