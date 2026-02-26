import express from 'express';
import { 
  createMovie, 
  getMovies, 
  getMovieById, 
  updateMovie, 
  deleteMovie,
  getMoviesByOwner
} from '../controllers/movieController.js';
import { isUser, verifyAdmin } from '../middlewares/auth.js';

const router = express.Router();

// ✅ ADMIN ONLY (Create/Update/Delete)
router.post('/', verifyAdmin, createMovie);
router.put('/:movieId', verifyAdmin, updateMovie);
router.delete('/:movieId', verifyAdmin, deleteMovie);
router.get('/owner', verifyAdmin, getMoviesByOwner);


// ✅ PUBLIC (Read/Search)
router.get('/', getMovies);              // /movies?status=now_showing&limit=20
router.get('/:movieId', getMovieById);   // /movies/movie_123

export default router;
