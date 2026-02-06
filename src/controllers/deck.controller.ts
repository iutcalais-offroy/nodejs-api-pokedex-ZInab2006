import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { prisma } from '../database'

interface CreateDeckBody {
  name: string
  cards: number[]
}

interface UpdateDeckBody {
  name?: string
  cards?: number[]
}

const DECK_SIZE = 10

/**
 * Crée un nouveau deck avec 10 cartes
 * @route POST /api/decks
 * @param {Request<{}, {}, CreateDeckBody>} req - Requête avec name et cards dans le body, req.user.userId depuis le middleware
 * @param {Response} res - Réponse Express
 * @returns {Promise<void>} Retourne le deck créé avec ses cartes
 * @throws {401} Token manquant
 * @throws {400} Nom manquant ou deck pas exactement 10 cartes ou cartes inexistantes
 * @throws {500} Erreur serveur
 */
export const createDeck = async (
  req: Request<Record<string, never>, Record<string, never>, CreateDeckBody>,
  res: Response,
): Promise<void> => {
  try {
    const { name, cards } = req.body
    const userId = req.user?.userId

    if (!userId) {
      res.status(StatusCodes.UNAUTHORIZED).json({
        error: 'Unauthorized',
        message: 'Token manquant',
      })
      return
    }

    if (!name) {
      res.status(StatusCodes.BAD_REQUEST).json({
        error: 'Bad Request',
        message: 'Le nom du deck est requis',
      })
      return
    }

    if (!cards || cards.length !== DECK_SIZE) {
      res.status(StatusCodes.BAD_REQUEST).json({
        error: 'Bad Request',
        message: `Un deck doit contenir exactement ${DECK_SIZE} cartes`,
      })
      return
    }

    // Vérifier que toutes les cartes existent
    const existingCards = await prisma.card.findMany({
      where: { id: { in: cards } },
    })

    if (existingCards.length !== DECK_SIZE) {
      res.status(StatusCodes.BAD_REQUEST).json({
        error: 'Bad Request',
        message: "Certaines cartes n'existent pas",
      })
      return
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
    })

    res.status(StatusCodes.CREATED).json(deck)
  } catch (error) {
    console.error('Erreur lors de la création du deck:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Internal Server Error',
      message: 'Erreur lors de la création du deck',
    })
  }
}

/**
 * Liste tous les decks de l'utilisateur connecté
 * @route GET /api/decks/mine
 * @param {Request} req - Requête avec req.user.userId depuis le middleware
 * @param {Response} res - Réponse Express
 * @returns {Promise<void>} Retourne un tableau avec tous les decks de l'utilisateur
 * @throws {401} Token manquant
 * @throws {500} Erreur serveur
 */
export const getMyDecks = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId

    if (!userId) {
      res.status(StatusCodes.UNAUTHORIZED).json({
        error: 'Unauthorized',
        message: 'Token manquant',
      })
      return
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
      orderBy: { createdAt: 'desc' },
    })

    res.status(StatusCodes.OK).json(decks)
  } catch (error) {
    console.error('Erreur lors de la récupération des decks:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Internal Server Error',
      message: 'Erreur lors de la récupération des decks',
    })
  }
}

/**
 * Récupère un deck par son ID avec ses cartes
 * @route GET /api/decks/:id
 * @param {Request<{ id: string }>} req - Requête avec l'ID du deck dans req.params.id et req.user.userId depuis le middleware
 * @param {Response} res - Réponse Express
 * @returns {Promise<void>} Retourne le deck avec ses cartes
 * @throws {401} Token manquant
 * @throws {400} ID invalide
 * @throws {404} Deck introuvable
 * @throws {403} Deck n'appartient pas à l'utilisateur
 * @throws {500} Erreur serveur
 */
export const getDeckById = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const deckId = parseInt(req.params.id)

    if (!userId) {
      res.status(StatusCodes.UNAUTHORIZED).json({
        error: 'Unauthorized',
        message: 'Token manquant',
      })
      return
    }

    if (isNaN(deckId)) {
      res.status(StatusCodes.BAD_REQUEST).json({
        error: 'Bad Request',
        message: 'ID de deck invalide',
      })
      return
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
    })

    if (!deck) {
      res.status(StatusCodes.NOT_FOUND).json({
        error: 'Not Found',
        message: 'Deck introuvable',
      })
      return
    }

    if (deck.userId !== userId) {
      res.status(StatusCodes.FORBIDDEN).json({
        error: 'Forbidden',
        message: "Vous n'avez pas accès à ce deck",
      })
      return
    }

    res.status(StatusCodes.OK).json(deck)
  } catch (error) {
    console.error('Erreur lors de la récupération du deck:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Internal Server Error',
      message: 'Erreur lors de la récupération du deck',
    })
  }
}

/**
 * Modifie le nom et/ou les cartes d'un deck
 * @route PATCH /api/decks/:id
 * @param {Request<{ id: string }, {}, UpdateDeckBody>} req - Requête avec l'ID dans req.params.id, name et/ou cards dans le body, req.user.userId depuis le middleware
 * @param {Response} res - Réponse Express
 * @returns {Promise<void>} Retourne le deck mis à jour avec ses cartes
 * @throws {401} Token manquant
 * @throws {400} ID invalide ou deck pas exactement 10 cartes ou cartes inexistantes
 * @throws {404} Deck introuvable
 * @throws {403} Deck n'appartient pas à l'utilisateur
 * @throws {500} Erreur serveur
 */
export const updateDeck = async (
  req: Request<{ id: string }, Record<string, never>, UpdateDeckBody>,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const deckId = parseInt(req.params.id)
    const { name, cards } = req.body

    if (!userId) {
      res.status(StatusCodes.UNAUTHORIZED).json({
        error: 'Unauthorized',
        message: 'Token manquant',
      })
      return
    }

    if (isNaN(deckId)) {
      res.status(StatusCodes.BAD_REQUEST).json({
        error: 'Bad Request',
        message: 'ID de deck invalide',
      })
      return
    }

    // Vérifier que le deck existe et appartient à l'utilisateur
    const existingDeck = await prisma.deck.findUnique({
      where: { id: deckId },
    })

    if (!existingDeck) {
      res.status(StatusCodes.NOT_FOUND).json({
        error: 'Not Found',
        message: 'Deck introuvable',
      })
      return
    }

    if (existingDeck.userId !== userId) {
      res.status(StatusCodes.FORBIDDEN).json({
        error: 'Forbidden',
        message: "Vous n'avez pas accès à ce deck",
      })
      return
    }

    // Si les cartes sont modifiées, vérifier qu'il y en a 10
    if (cards !== undefined) {
      if (cards.length !== DECK_SIZE) {
        res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Bad Request',
          message: `Un deck doit contenir exactement ${DECK_SIZE} cartes`,
        })
        return
      }

      // Vérifier que toutes les cartes existent
      const existingCards = await prisma.card.findMany({
        where: { id: { in: cards } },
      })

      if (existingCards.length !== DECK_SIZE) {
        res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Bad Request',
          message: "Certaines cartes n'existent pas",
        })
        return
      }
    }

    // Supprimer les anciennes cartes si on modifie les cartes
    if (cards !== undefined) {
      await prisma.deckCard.deleteMany({
        where: { deckId },
      })
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
    })

    res.status(StatusCodes.OK).json(deck)
  } catch (error) {
    console.error('Erreur lors de la modification du deck:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Internal Server Error',
      message: 'Erreur lors de la modification du deck',
    })
  }
}

/**
 * Supprime un deck et ses cartes
 * @route DELETE /api/decks/:id
 * @param {Request<{ id: string }>} req - Requête avec l'ID dans req.params.id et req.user.userId depuis le middleware
 * @param {Response} res - Réponse Express
 * @returns {Promise<void>} Retourne un message de confirmation
 * @throws {401} Token manquant
 * @throws {400} ID invalide
 * @throws {404} Deck introuvable
 * @throws {403} Deck n'appartient pas à l'utilisateur
 * @throws {500} Erreur serveur
 */
export const deleteDeck = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const deckId = parseInt(req.params.id)

    if (!userId) {
      res.status(StatusCodes.UNAUTHORIZED).json({
        error: 'Unauthorized',
        message: 'Token manquant',
      })
      return
    }

    if (isNaN(deckId)) {
      res.status(StatusCodes.BAD_REQUEST).json({
        error: 'Bad Request',
        message: 'ID de deck invalide',
      })
      return
    }

    // Vérifier que le deck existe et appartient à l'utilisateur
    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
    })

    if (!deck) {
      res.status(StatusCodes.NOT_FOUND).json({
        error: 'Not Found',
        message: 'Deck introuvable',
      })
      return
    }

    if (deck.userId !== userId) {
      res.status(StatusCodes.FORBIDDEN).json({
        error: 'Forbidden',
        message: "Vous n'avez pas accès à ce deck",
      })
      return
    }

    // Supprimer le deck (les DeckCards seront supprimés automatiquement grâce à onDelete: Cascade)
    await prisma.deck.delete({
      where: { id: deckId },
    })

    res.status(StatusCodes.OK).json({
      message: 'Deck supprimé avec succès',
    })
  } catch (error) {
    console.error('Erreur lors de la suppression du deck:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Internal Server Error',
      message: 'Erreur lors de la suppression du deck',
    })
  }
}
