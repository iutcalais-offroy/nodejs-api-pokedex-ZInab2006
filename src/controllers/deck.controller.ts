import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../database";

interface CreateDeckBody {
    name: string;
    cards: number[];
}

interface UpdateDeckBody {
    name?: string;
    cards?: number[];
}

const DECK_SIZE = 10;

// Créer un nouveau deck pour l'utilisateur authentifié
 
export const createDeck = async (
    req: Request<{}, {}, CreateDeckBody>,
    res: Response
): Promise<void> => {
    try {
        const { name, cards } = req.body;
        const userId = req.user?.userId;

        if (!userId) {
            res.status(StatusCodes.UNAUTHORIZED).json({
                error: "Unauthorized",
                message: "Token manquant",
            });
            return;
        }

        if (!name) {
            res.status(StatusCodes.BAD_REQUEST).json({
                error: "Bad Request",
                message: "Le nom du deck est requis",
            });
            return;
        }

        if (!cards || cards.length !== DECK_SIZE) {
            res.status(StatusCodes.BAD_REQUEST).json({
                error: "Bad Request",
                message: `Un deck doit contenir exactement ${DECK_SIZE} cartes`,
            });
            return;
        }

        // Vérifier que toutes les cartes existent
        const existingCards = await prisma.card.findMany({
            where: { id: { in: cards } },
        });

        if (existingCards.length !== DECK_SIZE) {
            res.status(StatusCodes.BAD_REQUEST).json({
                error: "Bad Request",
                message: "Certaines cartes n'existent pas",
            });
            return;
        }

        // Créer le deck avec ses cartes
        const deck = await prisma.deck.create({
            data: {
                name,
                userId,
                deckCards: {
                    create: cards.map((cardId) => ({ cardId })),
                },
            },
            include: {
                deckCards: {
                    include: {
                        card: true,
                    },
                },
            },
        });

        res.status(StatusCodes.CREATED).json(deck);
    } catch (error) {
        console.error("Erreur lors de la création du deck:", error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            error: "Internal Server Error",
            message: "Erreur lors de la création du deck",
        });
    }
};

//Lister tous les decks de l'utilisateur authentifié
 
export const getMyDecks = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            res.status(StatusCodes.UNAUTHORIZED).json({
                error: "Unauthorized",
                message: "Token manquant",
            });
            return;
        }

        const decks = await prisma.deck.findMany({
            where: { userId },
            include: {
                deckCards: {
                    include: {
                        card: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        res.status(StatusCodes.OK).json(decks);
    } catch (error) {
        console.error("Erreur lors de la récupération des decks:", error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            error: "Internal Server Error",
            message: "Erreur lors de la récupération des decks",
        });
    }
};

/**
 * GET /api/decks/:id
 * Consulter un deck spécifique avec ses cartes
 */
export const getDeckById = async (
    req: Request<{ id: string }>,
    res: Response
): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const deckId = parseInt(req.params.id);

        if (!userId) {
            res.status(StatusCodes.UNAUTHORIZED).json({
                error: "Unauthorized",
                message: "Token manquant",
            });
            return;
        }

        if (isNaN(deckId)) {
            res.status(StatusCodes.BAD_REQUEST).json({
                error: "Bad Request",
                message: "ID de deck invalide",
            });
            return;
        }

        const deck = await prisma.deck.findUnique({
            where: { id: deckId },
            include: {
                deckCards: {
                    include: {
                        card: true,
                    },
                },
            },
        });

        if (!deck) {
            res.status(StatusCodes.NOT_FOUND).json({
                error: "Not Found",
                message: "Deck introuvable",
            });
            return;
        }

        if (deck.userId !== userId) {
            res.status(StatusCodes.FORBIDDEN).json({
                error: "Forbidden",
                message: "Vous n'avez pas accès à ce deck",
            });
            return;
        }

        res.status(StatusCodes.OK).json(deck);
    } catch (error) {
        console.error("Erreur lors de la récupération du deck:", error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            error: "Internal Server Error",
            message: "Erreur lors de la récupération du deck",
        });
    }
};

/**
 * PATCH /api/decks/:id
 * Modifier le nom et/ou les cartes du deck
 */
export const updateDeck = async (
    req: Request<{ id: string }, {}, UpdateDeckBody>,
    res: Response
): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const deckId = parseInt(req.params.id);
        const { name, cards } = req.body;

        if (!userId) {
            res.status(StatusCodes.UNAUTHORIZED).json({
                error: "Unauthorized",
                message: "Token manquant",
            });
            return;
        }

        if (isNaN(deckId)) {
            res.status(StatusCodes.BAD_REQUEST).json({
                error: "Bad Request",
                message: "ID de deck invalide",
            });
            return;
        }

        // Vérifier que le deck existe et appartient à l'utilisateur
        const existingDeck = await prisma.deck.findUnique({
            where: { id: deckId },
        });

        if (!existingDeck) {
            res.status(StatusCodes.NOT_FOUND).json({
                error: "Not Found",
                message: "Deck introuvable",
            });
            return;
        }

        if (existingDeck.userId !== userId) {
            res.status(StatusCodes.FORBIDDEN).json({
                error: "Forbidden",
                message: "Vous n'avez pas accès à ce deck",
            });
            return;
        }

        // Si les cartes sont modifiées, vérifier qu'il y en a 10
        if (cards !== undefined) {
            if (cards.length !== DECK_SIZE) {
                res.status(StatusCodes.BAD_REQUEST).json({
                    error: "Bad Request",
                    message: `Un deck doit contenir exactement ${DECK_SIZE} cartes`,
                });
                return;
            }

            // Vérifier que toutes les cartes existent
            const existingCards = await prisma.card.findMany({
                where: { id: { in: cards } },
            });

            if (existingCards.length !== DECK_SIZE) {
                res.status(StatusCodes.BAD_REQUEST).json({
                    error: "Bad Request",
                    message: "Certaines cartes n'existent pas",
                });
                return;
            }
        }

        // Supprimer les anciennes cartes si on modifie les cartes
        if (cards !== undefined) {
            await prisma.deckCard.deleteMany({
                where: { deckId },
            });
        }

        // Mettre à jour le deck
        const deck = await prisma.deck.update({
            where: { id: deckId },
            data: {
                ...(name && { name }),
                ...(cards && {
                    deckCards: {
                        create: cards.map((cardId) => ({ cardId })),
                    },
                }),
            },
            include: {
                deckCards: {
                    include: {
                        card: true,
                    },
                },
            },
        });

        res.status(StatusCodes.OK).json(deck);
    } catch (error) {
        console.error("Erreur lors de la modification du deck:", error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            error: "Internal Server Error",
            message: "Erreur lors de la modification du deck",
        });
    }
};

/**
 * DELETE /api/decks/:id
 * Supprimer définitivement un deck
 */
export const deleteDeck = async (
    req: Request<{ id: string }>,
    res: Response
): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const deckId = parseInt(req.params.id);

        if (!userId) {
            res.status(StatusCodes.UNAUTHORIZED).json({
                error: "Unauthorized",
                message: "Token manquant",
            });
            return;
        }

        if (isNaN(deckId)) {
            res.status(StatusCodes.BAD_REQUEST).json({
                error: "Bad Request",
                message: "ID de deck invalide",
            });
            return;
        }

        // Vérifier que le deck existe et appartient à l'utilisateur
        const deck = await prisma.deck.findUnique({
            where: { id: deckId },
        });

        if (!deck) {
            res.status(StatusCodes.NOT_FOUND).json({
                error: "Not Found",
                message: "Deck introuvable",
            });
            return;
        }

        if (deck.userId !== userId) {
            res.status(StatusCodes.FORBIDDEN).json({
                error: "Forbidden",
                message: "Vous n'avez pas accès à ce deck",
            });
            return;
        }

        // Supprimer le deck (les DeckCards seront supprimés automatiquement grâce à onDelete: Cascade)
        await prisma.deck.delete({
            where: { id: deckId },
        });

        res.status(StatusCodes.OK).json({
            message: "Deck supprimé avec succès",
        });
    } catch (error) {
        console.error("Erreur lors de la suppression du deck:", error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            error: "Internal Server Error",
            message: "Erreur lors de la suppression du deck",
        });
    }
};

