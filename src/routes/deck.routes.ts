import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.middleware";
import {
    createDeck,
    getMyDecks,
    getDeckById,
    updateDeck,
    deleteDeck,
} from "../controllers/deck.controller";

const router = Router();

/**
 * Toutes les routes nécessitent un token JWT valide
 */
router.use(authenticateToken);

/**
 * Route POST /api/decks
 * Crée un nouveau deck
 */
router.post("/", createDeck);

/**
 * Route GET /api/decks/mine
 * Liste tous les decks de l'utilisateur
 */
router.get("/mine", getMyDecks);

/**
 * Route GET /api/decks/:id
 * Récupère un deck par son ID
 */
router.get("/:id", getDeckById);

/**
 * Route PATCH /api/decks/:id
 * Modifie un deck
 */
router.patch("/:id", updateDeck);

/**
 * Route DELETE /api/decks/:id
 * Supprime un deck
 */
router.delete("/:id", deleteDeck);

export default router;

