import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../database";

/**
 * Retourne toutes les cartes Pokémon triées par numéro Pokédex
 * @route GET /api/cards
 * @param {Request} _req - Requête Express (non utilisée)
 * @param {Response} res - Réponse Express
 * @returns {Promise<void>} Retourne un tableau avec toutes les cartes
 * @throws {500} Erreur serveur
 */
export const getAllCards = async (
    _req: Request,
    res: Response
): Promise<void> => {
    try {
        const cards = await prisma.card.findMany({
            orderBy: { pokedexNumber: "asc" },
        });
        res.status(StatusCodes.OK).json(cards);
    } catch (error) {
        console.error("Erreur lors de la récupération des cartes:", error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            error: "Internal Server Error",
            message: "Erreur lors de la récupération des cartes",
        });
    }
};
