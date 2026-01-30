import { Router } from "express";
import { getAllCards } from "../controllers/card.controller";

const router = Router();

/**
 * GET /api/cards
 * Retourne la liste complète des cartes Pokemon triées par numéro de Pokédex
 */
router.get("/", getAllCards);

export default router;
