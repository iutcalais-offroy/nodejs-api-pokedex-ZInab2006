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

// Toutes les routes sont protégées par l'authentification
router.use(authenticateToken);

// Créer un nouveau deck
 
router.post("/", createDeck);

 // Lister tous les decks de l'utilisateur authentifié
 
router.get("/mine", getMyDecks);

// Consulter un deck spécifique par son ID
router.get("/:id", getDeckById);

// Modifier un deck par son ID
router.patch("/:id", updateDeck);

// Supprimer un deck par son ID                     
router.delete("/:id", deleteDeck);

export default router;

