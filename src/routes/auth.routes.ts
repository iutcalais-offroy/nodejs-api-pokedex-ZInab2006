import { Router } from "express";
import { signUp, signIn } from "../controllers/auth.controller";

const router = Router();

/**
 * POST /api/auth/sign-up
 * Créer un nouveau compte utilisateur
 */
router.post("/sign-up", signUp);

/**
 * POST /api/auth/sign-in
 * Se connecter avec un compte existant
 */
router.post("/sign-in", signIn);

export default router;

