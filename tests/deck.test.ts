import { describe, expect, it, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '@/index'
import { prismaMock } from './vitest.setup'
import { Request, Response, NextFunction } from 'express'

// Mock jwt pour avoir un token valide simple
vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn((token: string) => {
      if (token === 'valid-token') {
        return { userId: 1, email: 'test@example.com' }
      }
      throw new Error('Invalid token')
    }),
  },
}))

// Mock du middleware d'auth pour les tests
vi.mock('@/middlewares/auth.middleware', () => ({
  authenticateToken: vi.fn(
    (req: Request, _res: Response, next: NextFunction) => {
      req.user = { userId: 1, email: 'test@example.com' }
      next()
    },
  ),
}))

describe('POST /api/decks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a deck with 10 cards and return 201', async () => {
    const mockCards = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Card ${i + 1}`,
      pokedexNumber: i + 1,
      image: `card${i + 1}.png`,
      rarity: 'Common',
      type: 'Fire',
      hp: 50,
      attack: 50,
      defense: 50,
      speed: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))

    const mockDeck = {
      id: 1,
      name: 'My Deck',
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deckCards: mockCards.map((card, index) => ({
        id: index + 1,
        deckId: 1,
        cardId: card.id,
        createdAt: new Date(),
        card: card,
      })),
    }

    prismaMock.card.findMany.mockResolvedValueOnce(mockCards)
    prismaMock.deck.create.mockResolvedValueOnce(mockDeck)

    const response = await request(app)
      .post('/api/decks')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'My Deck',
        cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      })

    expect(response.status).toBe(201)
    expect(response.body).toHaveProperty('id')
    expect(response.body).toHaveProperty('name', 'My Deck')
    expect(response.body).toHaveProperty('deckCards')
    expect(response.body.deckCards).toHaveLength(10)
  })

  it('should return 400 when name is missing', async () => {
    const response = await request(app)
      .post('/api/decks')
      .set('Authorization', 'Bearer valid-token')
      .send({
        cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
    expect(response.body.message).toContain('nom du deck est requis')
  })

  it('should return 400 when cards array is missing', async () => {
    const response = await request(app)
      .post('/api/decks')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'My Deck',
      })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
    expect(response.body.message).toContain('exactement 10 cartes')
  })

  it('should return 400 when deck does not have exactly 10 cards', async () => {
    const response = await request(app)
      .post('/api/decks')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'My Deck',
        cards: [1, 2, 3, 4, 5],
      })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
    expect(response.body.message).toContain('exactement 10 cartes')
  })

  it('should return 400 when some cards do not exist', async () => {
    const mockCards = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      name: `Card ${i + 1}`,
      pokedexNumber: i + 1,
      image: `card${i + 1}.png`,
      rarity: 'Common',
      type: 'Fire',
      hp: 50,
      attack: 50,
      defense: 50,
      speed: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))

    prismaMock.card.findMany.mockResolvedValueOnce(mockCards)

    const response = await request(app)
      .post('/api/decks')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'My Deck',
        cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
    expect(response.body.message).toContain("Certaines cartes n'existent pas")
  })

  it('should return 401 when userId is missing', async () => {
    // On teste le cas où le user n'est pas présent sur la requête
    const { authenticateToken } = await import('@/middlewares/auth.middleware')
    vi.mocked(authenticateToken).mockImplementationOnce(
      (req: Request, _res: Response, next: NextFunction) => {
        // pas de req.user ici
        next()
      },
    )

    const response = await request(app)
      .post('/api/decks')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'My Deck',
        cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      })

    expect(response.status).toBe(401)
    expect(response.body).toHaveProperty('error', 'Unauthorized')
    expect(response.body.message).toContain('Token manquant')
  })

  it('should return 500 when database error occurs', async () => {
    const mockCards = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Card ${i + 1}`,
      pokedexNumber: i + 1,
      image: `card${i + 1}.png`,
      rarity: 'Common',
      type: 'Fire',
      hp: 50,
      attack: 50,
      defense: 50,
      speed: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))

    prismaMock.card.findMany.mockResolvedValueOnce(mockCards)
    prismaMock.deck.create.mockRejectedValueOnce(new Error('Database error'))

    const response = await request(app)
      .post('/api/decks')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'My Deck',
        cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      })

    expect(response.status).toBe(500)
    expect(response.body).toHaveProperty('error', 'Internal Server Error')
  })
})

describe('GET /api/decks/mine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 when userId is missing', async () => {
    // On teste le cas où req.user n'est pas rempli
    const { authenticateToken } = await import('@/middlewares/auth.middleware')
    vi.mocked(authenticateToken).mockImplementationOnce(
      (req: Request, res: Response, next: NextFunction) => {
        // Ne pas définir req.user pour simuler le cas où userId est manquant
        next()
      },
    )

    const response = await request(app)
      .get('/api/decks/mine')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(401)
    expect(response.body).toHaveProperty('error', 'Unauthorized')
    expect(response.body.message).toContain('Token manquant')
  })

  it('should return all decks for authenticated user', async () => {
    const mockDecks = [
      {
        id: 1,
        name: 'Deck 1',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deckCards: [],
      },
      {
        id: 2,
        name: 'Deck 2',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deckCards: [],
      },
    ]

    prismaMock.deck.findMany.mockResolvedValueOnce(mockDecks)

    const response = await request(app)
      .get('/api/decks/mine')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body).toHaveLength(2)
  })

  it('should return empty array when user has no decks', async () => {
    prismaMock.deck.findMany.mockResolvedValueOnce([])

    const response = await request(app)
      .get('/api/decks/mine')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('should return 500 when database error occurs', async () => {
    prismaMock.deck.findMany.mockRejectedValueOnce(new Error('Database error'))

    const response = await request(app)
      .get('/api/decks/mine')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(500)
    expect(response.body).toHaveProperty('error', 'Internal Server Error')
  })
})

describe('GET /api/decks/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 when userId is missing', async () => {
    // On teste le cas où req.user est vide
    const { authenticateToken } = await import('@/middlewares/auth.middleware')
    vi.mocked(authenticateToken).mockImplementationOnce(
      (req: Request, res: Response, next: NextFunction) => {
        // Ne pas définir req.user pour simuler le cas où userId est manquant
        next()
      },
    )

    const response = await request(app)
      .get('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(401)
    expect(response.body).toHaveProperty('error', 'Unauthorized')
    expect(response.body.message).toContain('Token manquant')
  })

  it('should return deck by id when user owns it', async () => {
    const mockDeck = {
      id: 1,
      name: 'My Deck',
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deckCards: [],
    }

    prismaMock.deck.findUnique.mockResolvedValueOnce(mockDeck)

    const response = await request(app)
      .get('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('id', 1)
    expect(response.body).toHaveProperty('name', 'My Deck')
  })

  it('should return 400 when id is invalid', async () => {
    const response = await request(app)
      .get('/api/decks/invalid')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
    expect(response.body.message).toContain('ID de deck invalide')
  })

  it('should return 404 when deck does not exist', async () => {
    prismaMock.deck.findUnique.mockResolvedValueOnce(null)

    const response = await request(app)
      .get('/api/decks/999')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(404)
    expect(response.body).toHaveProperty('error', 'Not Found')
    expect(response.body.message).toContain('Deck introuvable')
  })

  it('should return 403 when user does not own the deck', async () => {
    const mockDeck = {
      id: 1,
      name: 'Other User Deck',
      userId: 2, // Different user
      createdAt: new Date(),
      updatedAt: new Date(),
      deckCards: [],
    }

    prismaMock.deck.findUnique.mockResolvedValueOnce(mockDeck)

    const response = await request(app)
      .get('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(403)
    expect(response.body).toHaveProperty('error', 'Forbidden')
    expect(response.body.message).toContain("n'avez pas accès")
  })

  it('should return 500 when database error occurs', async () => {
    prismaMock.deck.findUnique.mockRejectedValueOnce(
      new Error('Database error'),
    )

    const response = await request(app)
      .get('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(500)
    expect(response.body).toHaveProperty('error', 'Internal Server Error')
  })
})

describe('PATCH /api/decks/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 400 when id is invalid in PATCH', async () => {
    const response = await request(app)
      .patch('/api/decks/invalid')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'New Name',
      })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
    expect(response.body.message).toContain('ID de deck invalide')
  })

  it('should update deck name and return 200', async () => {
    const existingDeck = {
      id: 1,
      name: 'Old Name',
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const updatedDeck = {
      id: 1,
      name: 'New Name',
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deckCards: [],
    }

    prismaMock.deck.findUnique.mockResolvedValueOnce(existingDeck)
    prismaMock.deck.update.mockResolvedValueOnce(updatedDeck)

    const response = await request(app)
      .patch('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'New Name',
      })

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('name', 'New Name')
  })

  it('should update deck cards and return 200', async () => {
    const existingDeck = {
      id: 1,
      name: 'My Deck',
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockCards = Array.from({ length: 10 }, (_, i) => ({
      id: i + 11,
      name: `Card ${i + 11}`,
      pokedexNumber: i + 11,
      image: `card${i + 11}.png`,
      rarity: 'Common',
      type: 'Fire',
      hp: 50,
      attack: 50,
      defense: 50,
      speed: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))

    const updatedDeck = {
      id: 1,
      name: 'My Deck',
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deckCards: mockCards.map((card, index) => ({
        id: index + 1,
        deckId: 1,
        cardId: card.id,
        createdAt: new Date(),
        card: card,
      })),
    }

    prismaMock.deck.findUnique.mockResolvedValueOnce(existingDeck)
    prismaMock.card.findMany.mockResolvedValueOnce(mockCards)
    prismaMock.deckCard.deleteMany.mockResolvedValueOnce({ count: 10 })
    prismaMock.deck.update.mockResolvedValueOnce(updatedDeck)

    const response = await request(app)
      .patch('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')
      .send({
        cards: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      })

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('deckCards')
    expect(response.body.deckCards).toHaveLength(10)
  })

  it('should return 400 when cards array does not have exactly 10 cards', async () => {
    const existingDeck = {
      id: 1,
      name: 'My Deck',
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    prismaMock.deck.findUnique.mockResolvedValueOnce(existingDeck)

    const response = await request(app)
      .patch('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')
      .send({
        cards: [1, 2, 3, 4, 5],
      })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
    expect(response.body.message).toContain('exactement 10 cartes')
  })

  it('should return 400 when some cards do not exist', async () => {
    const existingDeck = {
      id: 1,
      name: 'My Deck',
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockCards = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      name: `Card ${i + 1}`,
      pokedexNumber: i + 1,
      image: `card${i + 1}.png`,
      rarity: 'Common',
      type: 'Fire',
      hp: 50,
      attack: 50,
      defense: 50,
      speed: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))

    prismaMock.deck.findUnique.mockResolvedValueOnce(existingDeck)
    prismaMock.card.findMany.mockResolvedValueOnce(mockCards)

    const response = await request(app)
      .patch('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')
      .send({
        cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
    expect(response.body.message).toContain("Certaines cartes n'existent pas")
  })

  it('should return 404 when deck does not exist', async () => {
    prismaMock.deck.findUnique.mockResolvedValueOnce(null)

    const response = await request(app)
      .patch('/api/decks/999')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'New Name',
      })

    expect(response.status).toBe(404)
    expect(response.body).toHaveProperty('error', 'Not Found')
  })

  it('should return 403 when user does not own the deck', async () => {
    const existingDeck = {
      id: 1,
      name: 'Other User Deck',
      userId: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    prismaMock.deck.findUnique.mockResolvedValueOnce(existingDeck)

    const response = await request(app)
      .patch('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'New Name',
      })

    expect(response.status).toBe(403)
    expect(response.body).toHaveProperty('error', 'Forbidden')
  })

  it('should return 401 when userId is missing', async () => {
    // On teste le cas où le user n'est pas injecté
    const { authenticateToken } = await import('@/middlewares/auth.middleware')
    vi.mocked(authenticateToken).mockImplementationOnce(
      (req: Request, res: Response, next: NextFunction) => {
        // Ne pas définir req.user pour simuler le cas où userId est manquant
        next()
      },
    )

    const response = await request(app)
      .patch('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'New Name',
      })

    expect(response.status).toBe(401)
    expect(response.body).toHaveProperty('error', 'Unauthorized')
    expect(response.body.message).toContain('Token manquant')
  })

  it('should return 500 when database error occurs', async () => {
    const existingDeck = {
      id: 1,
      name: 'My Deck',
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    prismaMock.deck.findUnique.mockResolvedValueOnce(existingDeck)
    prismaMock.deck.update.mockRejectedValueOnce(new Error('Database error'))

    const response = await request(app)
      .patch('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'New Name',
      })

    expect(response.status).toBe(500)
    expect(response.body).toHaveProperty('error', 'Internal Server Error')
  })
})

describe('DELETE /api/decks/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delete deck and return 200', async () => {
    const existingDeck = {
      id: 1,
      name: 'My Deck',
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    prismaMock.deck.findUnique.mockResolvedValueOnce(existingDeck)
    prismaMock.deck.delete.mockResolvedValueOnce(existingDeck)

    const response = await request(app)
      .delete('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('message')
    expect(response.body.message).toContain('supprimé')
  })

  it('should return 400 when id is invalid', async () => {
    const response = await request(app)
      .delete('/api/decks/invalid')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
  })

  it('should return 404 when deck does not exist', async () => {
    prismaMock.deck.findUnique.mockResolvedValueOnce(null)

    const response = await request(app)
      .delete('/api/decks/999')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(404)
    expect(response.body).toHaveProperty('error', 'Not Found')
  })

  it('should return 403 when user does not own the deck', async () => {
    const existingDeck = {
      id: 1,
      name: 'Other User Deck',
      userId: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    prismaMock.deck.findUnique.mockResolvedValueOnce(existingDeck)

    const response = await request(app)
      .delete('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(403)
    expect(response.body).toHaveProperty('error', 'Forbidden')
  })

  it('should return 401 when userId is missing', async () => {
    // On teste le cas sans user dans la requête
    const { authenticateToken } = await import('@/middlewares/auth.middleware')
    vi.mocked(authenticateToken).mockImplementationOnce(
      (req: Request, res: Response, next: NextFunction) => {
        // Ne pas définir req.user pour simuler le cas où userId est manquant
        next()
      },
    )

    const response = await request(app)
      .delete('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(401)
    expect(response.body).toHaveProperty('error', 'Unauthorized')
    expect(response.body.message).toContain('Token manquant')
  })

  it('should return 500 when database error occurs', async () => {
    const existingDeck = {
      id: 1,
      name: 'My Deck',
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    prismaMock.deck.findUnique.mockResolvedValueOnce(existingDeck)
    prismaMock.deck.delete.mockRejectedValueOnce(new Error('Database error'))

    const response = await request(app)
      .delete('/api/decks/1')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(500)
    expect(response.body).toHaveProperty('error', 'Internal Server Error')
  })
})
