import { describe, expect, it, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '@/index'
import { prismaMock } from './vitest.setup'
import bcrypt from 'bcryptjs'

// Mock simple de bcrypt
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}))

// Mock simple de jwt
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mock-jwt-token'),
  },
}))

describe('POST /api/auth/sign-up', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a new user and return 201 with token', async () => {
    const newUser = {
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      password: 'hashedpassword',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // On simule un email et un pseudo libres
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    vi.mocked(bcrypt.hash).mockResolvedValueOnce('hashedpassword' as never)
    // On simule la création d'utilisateur sans mot de passe dans la réponse
    prismaMock.user.create.mockResolvedValueOnce({
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
    })

    const response = await request(app).post('/api/auth/sign-up').send({
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    })

    expect(response.status).toBe(201)
    expect(response.body).toHaveProperty('token')
    expect(response.body).toHaveProperty('user')
    expect(response.body.user).toHaveProperty('email', 'test@example.com')
    expect(response.body.user).toHaveProperty('username', 'testuser')
    expect(response.body.user).not.toHaveProperty('password')
  })

  it('should return 400 when email is missing', async () => {
    const response = await request(app).post('/api/auth/sign-up').send({
      username: 'testuser',
      password: 'password123',
    })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
    expect(response.body.message).toContain('Données manquantes')
  })

  it('should return 400 when username is missing', async () => {
    const response = await request(app).post('/api/auth/sign-up').send({
      email: 'test@example.com',
      password: 'password123',
    })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
  })

  it('should return 400 when password is missing', async () => {
    const response = await request(app).post('/api/auth/sign-up').send({
      email: 'test@example.com',
      username: 'testuser',
    })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
  })

  it('should return 400 when email format is invalid', async () => {
    const response = await request(app).post('/api/auth/sign-up').send({
      email: 'invalid-email',
      username: 'testuser',
      password: 'password123',
    })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
    expect(response.body.message).toContain("Format d'email invalide")
  })

  it('should return 400 when password is too short', async () => {
    const response = await request(app).post('/api/auth/sign-up').send({
      email: 'test@example.com',
      username: 'testuser',
      password: '12345',
    })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
    expect(response.body.message).toContain('au moins 6 caractères')
  })

  it('should return 409 when email already exists', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 1,
      email: 'existing@example.com',
      username: 'existing',
      password: 'hashed',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const response = await request(app).post('/api/auth/sign-up').send({
      email: 'existing@example.com',
      username: 'newuser',
      password: 'password123',
    })

    expect(response.status).toBe(409)
    expect(response.body).toHaveProperty('error', 'Conflict')
    expect(response.body.message).toContain('email est déjà utilisé')
  })

  it('should return 409 when username already exists', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null) // Email n'existe pas
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 1,
      email: 'other@example.com',
      username: 'existinguser',
      password: 'hashed',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const response = await request(app).post('/api/auth/sign-up').send({
      email: 'new@example.com',
      username: 'existinguser',
      password: 'password123',
    })

    expect(response.status).toBe(409)
    expect(response.body).toHaveProperty('error', 'Conflict')
    expect(response.body.message).toContain(
      "nom d'utilisateur est déjà utilisé",
    )
  })

  it('should return 500 when database error occurs', async () => {
    prismaMock.user.findUnique.mockRejectedValueOnce(
      new Error('Database error'),
    )

    const response = await request(app).post('/api/auth/sign-up').send({
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    })

    expect(response.status).toBe(500)
    expect(response.body).toHaveProperty('error', 'Internal Server Error')
  })
})

describe('POST /api/auth/sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should sign in successfully and return 200 with token', async () => {
    const user = {
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      password: 'hashedpassword',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    prismaMock.user.findUnique.mockResolvedValueOnce(user)
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never)

    const response = await request(app).post('/api/auth/sign-in').send({
      email: 'test@example.com',
      password: 'password123',
    })

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('token')
    expect(response.body).toHaveProperty('user')
    expect(response.body.user).toHaveProperty('email', 'test@example.com')
    expect(response.body.user).toHaveProperty('username', 'testuser')
    expect(response.body.user).not.toHaveProperty('password')
  })

  it('should return 400 when email is missing', async () => {
    const response = await request(app).post('/api/auth/sign-in').send({
      password: 'password123',
    })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
    expect(response.body.message).toContain('Email et password sont requis')
  })

  it('should return 400 when password is missing', async () => {
    const response = await request(app).post('/api/auth/sign-in').send({
      email: 'test@example.com',
    })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error', 'Bad Request')
  })

  it('should return 401 when user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)

    const response = await request(app).post('/api/auth/sign-in').send({
      email: 'nonexistent@example.com',
      password: 'password123',
    })

    expect(response.status).toBe(401)
    expect(response.body).toHaveProperty('error', 'Unauthorized')
    expect(response.body.message).toContain('Email ou mot de passe incorrect')
  })

  it('should return 401 when password is incorrect', async () => {
    const user = {
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      password: 'hashedpassword',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    prismaMock.user.findUnique.mockResolvedValueOnce(user)
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never)

    const response = await request(app).post('/api/auth/sign-in').send({
      email: 'test@example.com',
      password: 'wrongpassword',
    })

    expect(response.status).toBe(401)
    expect(response.body).toHaveProperty('error', 'Unauthorized')
    expect(response.body.message).toContain('Email ou mot de passe incorrect')
  })

  it('should return 500 when database error occurs', async () => {
    prismaMock.user.findUnique.mockRejectedValueOnce(
      new Error('Database error'),
    )

    const response = await request(app).post('/api/auth/sign-in').send({
      email: 'test@example.com',
      password: 'password123',
    })

    expect(response.status).toBe(500)
    expect(response.body).toHaveProperty('error', 'Internal Server Error')
  })
})
