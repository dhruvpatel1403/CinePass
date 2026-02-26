import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import moviesRoutes from "./routes/movieRoutes.js";
import showRoutes from "./routes/showRoutes.js";
import theatreRoutes from "./routes/theatreRoutes.js";
import screenRoutes from "./routes/screenRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/movies", moviesRoutes);
app.use("/api/shows", showRoutes);
app.use("/api/theatres", theatreRoutes);
app.use("/api/screens", screenRoutes);
app.use("/api/bookings", bookingRoutes);
const port = process.env.PORT;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});