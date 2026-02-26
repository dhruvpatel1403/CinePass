import express from "express";
import {
  registerUser,
  confirmRegistration,
  loginUser
} from "../controllers/authController.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/confirm", confirmRegistration);
router.post("/login", loginUser);

export default router;