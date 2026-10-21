import express from "express";
import { login, register, logout } from "../../controllers/authController";
import { protect } from "../../middlewares/protect";

const router = express.Router();

router.post("/login", login);
// Only a logged-in user can create new users
router.post("/register", protect, register);
router.get("/logout", logout);

export default router;
