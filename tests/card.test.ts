import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '@/index'
import { prismaMock } from './vitest.setup'

describe('GET /api/cards', () => {
  it('should return all cards sorted by pokedexNumber ascending', async () => {
    const mockCards = [
      {
        id: 1,
        name: 'Pikachu',
        pokedexNumber: 25,
        image: 'pikachu.png',
        rarity: 'Common',
        type: 'Electric',
        hp: 60,
        attack: 55,
        defense: 40,
        speed: 90,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        name: 'Bulbasaur',
        pokedexNumber: 1,
        image: 'bulbasaur.png',
        rarity: 'Common',
        type: 'Grass',
        hp: 45,
        attack: 49,
        defense: 49,
        speed: 45,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 3,
        name: 'Charmander',
        pokedexNumber: 4,
        image: 'charmander.png',
        rarity: 'Common',
        type: 'Fire',
        hp: 39,
        attack: 52,
        defense: 43,
        speed: 65,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    prismaMock.card.findMany.mockResolvedValueOnce(mockCards)

    const response = await request(app).get('/api/cards')

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body).toHaveLength(3)
    expect(response.body[0]).toHaveProperty('name')
    expect(response.body[0]).toHaveProperty('pokedexNumber')
    expect(prismaMock.card.findMany).toHaveBeenCalledWith({
      orderBy: { pokedexNumber: 'asc' },
    })
  })

  it('should return empty array when no cards exist', async () => {
    prismaMock.card.findMany.mockResolvedValueOnce([])

    const response = await request(app).get('/api/cards')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
    expect(Array.isArray(response.body)).toBe(true)
  })

  it('should return 500 when database error occurs', async () => {
    prismaMock.card.findMany.mockRejectedValueOnce(new Error('Database error'))

    const response = await request(app).get('/api/cards')

    expect(response.status).toBe(500)
    expect(response.body).toHaveProperty('error', 'Internal Server Error')
    expect(response.body).toHaveProperty('message')
  })
})
