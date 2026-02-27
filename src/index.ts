import express from 'express'
import http from 'http'
import { Server, Socket } from 'socket.io'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import path from 'path'
import { env } from './env'
import authRoutes from './routes/auth.routes'
import cardRoutes from './routes/card.routes'
import deckRoutes from './routes/deck.routes'
import { prisma } from './database'
import { calculateDamage } from './utils/rules.util'
import { PokemonType } from './generated/prisma/client'

interface JwtPayload {
  userId: number
  email: string
  iat?: number
  exp?: number
}

interface AuthedSocket extends Socket {
  user?: {
    userId: number
    email: string
  }
}

type RoomStatus = 'waiting' | 'in-game'

interface MatchmakingRoom {
  id: number
  status: RoomStatus
  hostSocketId: string
  hostUserId: number
  hostUsername: string
  hostDeckId: number
  guestSocketId?: string
  guestUserId?: number
  guestUsername?: string
  guestDeckId?: number
  createdAt: Date
}

interface PublicRoom {
  id: number
  hostUsername: string
  hostUserId: number
  createdAt: string
}

/** Carte en jeu (données nécessaires pour le combat et l'affichage) */
interface GameCard {
  id: number
  name: string
  hp: number
  attack: number
  type: PokemonType
}

/** État complet d'une partie (côté serveur uniquement) */
interface GameState {
  hostDeck: GameCard[]
  hostHand: GameCard[]
  hostActive: GameCard | null
  hostScore: number
  guestDeck: GameCard[]
  guestHand: GameCard[]
  guestActive: GameCard | null
  guestScore: number
  currentPlayerSocketId: string
}

/** Vue d'état de jeu envoyée à un joueur (main/deck adverse jamais exposés) */
interface GameStateView {
  roomId: number
  myHand: GameCard[]
  myActive: GameCard | null
  myDeckCount: number
  myScore: number
  opponentActive: GameCard | null
  opponentDeckCount: number
  opponentScore: number
  currentPlayerSocketId: string
}

const rooms = new Map<number, MatchmakingRoom>()
const gameStates = new Map<number, GameState>()
let nextRoomId = 1

function shuffle<T>(array: T[]): T[] {
  const out = [...array]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function buildGameStateView(
  roomId: number,
  state: GameState,
  role: 'host' | 'guest',
): GameStateView {
  if (role === 'host') {
    return {
      roomId,
      myHand: state.hostHand,
      myActive: state.hostActive,
      myDeckCount: state.hostDeck.length,
      myScore: state.hostScore,
      opponentActive: state.guestActive,
      opponentDeckCount: state.guestDeck.length,
      opponentScore: state.guestScore,
      currentPlayerSocketId: state.currentPlayerSocketId,
    }
  }
  return {
    roomId,
    myHand: state.guestHand,
    myActive: state.guestActive,
    myDeckCount: state.guestDeck.length,
    myScore: state.guestScore,
    opponentActive: state.hostActive,
    opponentDeckCount: state.hostDeck.length,
    opponentScore: state.hostScore,
    currentPlayerSocketId: state.currentPlayerSocketId,
  }
}

function emitGameStateUpdated(roomId: number): void {
  const room = rooms.get(roomId)
  const state = gameStates.get(roomId)
  if (!room || !state || !room.guestSocketId) return
  const hostSocket = io.sockets.sockets.get(room.hostSocketId)
  const guestSocket = io.sockets.sockets.get(room.guestSocketId)
  if (!hostSocket || !guestSocket) return
  hostSocket.emit('gameStateUpdated', buildGameStateView(roomId, state, 'host'))
  guestSocket.emit(
    'gameStateUpdated',
    buildGameStateView(roomId, state, 'guest'),
  )
}

const app = express()

app.use(cors())
app.use(express.json())

app.use(express.static(path.join(__dirname, '../public')))

app.use('/api/auth', authRoutes)
app.use('/api/cards', cardRoutes)
app.use('/api/decks', deckRoutes)

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'TCG Backend Server is running',
  })
})

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: '*',
  },
})

io.use((socket: AuthedSocket, next) => {
  const token = socket.handshake.auth?.token as string | undefined

  if (!token) {
    const error = new Error('Authentication error: Token manquant')
    return next(error)
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload

    socket.user = {
      userId: decoded.userId,
      email: decoded.email,
    }

    return next()
  } catch {
    const error = new Error('Authentication error: Token invalide')
    return next(error)
  }
})

const serializeRoom = (room: MatchmakingRoom): PublicRoom => ({
  id: room.id,
  hostUsername: room.hostUsername,
  hostUserId: room.hostUserId,
  createdAt: room.createdAt.toISOString(),
})

const getWaitingRooms = (): PublicRoom[] =>
  Array.from(rooms.values())
    .filter((room) => room.status === 'waiting')
    .map(serializeRoom)

io.on('connection', (socket: AuthedSocket) => {
  console.log(
    `Client connected: userId=${socket.user?.userId}, email=${socket.user?.email}`,
  )

  socket.on('getRooms', () => {
    socket.emit('roomsList', getWaitingRooms())
  })

  socket.on('createRoom', async (payload: { deckId?: number | string }) => {
    try {
      if (!socket.user) {
        socket.emit('error', {
          event: 'createRoom',
          message: 'Utilisateur non authentifié',
        })
        return
      }

      const deckIdNumber = Number(payload?.deckId)

      if (!payload?.deckId || Number.isNaN(deckIdNumber)) {
        socket.emit('error', {
          event: 'createRoom',
          message: 'Deck ID invalide',
        })
        return
      }

      const deck = await prisma.deck.findUnique({
        where: { id: deckIdNumber },
        include: {
          deckCards: true,
          user: true,
        },
      })

      if (!deck) {
        socket.emit('error', {
          event: 'createRoom',
          message: 'Deck introuvable',
        })
        return
      }

      if (deck.userId !== socket.user.userId) {
        socket.emit('error', {
          event: 'createRoom',
          message: "Ce deck n'appartient pas à l'utilisateur connecté",
        })
        return
      }

      if (deck.deckCards.length !== 10) {
        socket.emit('error', {
          event: 'createRoom',
          message: 'Le deck doit contenir exactement 10 cartes',
        })
        return
      }

      const roomId = nextRoomId++
      const room: MatchmakingRoom = {
        id: roomId,
        status: 'waiting',
        hostSocketId: socket.id,
        hostUserId: socket.user.userId,
        hostUsername: deck.user.username,
        hostDeckId: deck.id,
        createdAt: new Date(),
      }

      rooms.set(roomId, room)

      const roomName = `room-${roomId}`
      socket.join(roomName)

      const publicRoom = serializeRoom(room)

      socket.emit('roomCreated', publicRoom)
      io.emit('roomsListUpdated', getWaitingRooms())
    } catch (error) {
      console.error('Erreur lors de createRoom:', error)
      socket.emit('error', {
        event: 'createRoom',
        message: 'Erreur lors de la création de la room',
      })
    }
  })

  socket.on(
    'joinRoom',
    async (payload: { roomId?: number | string; deckId?: number | string }) => {
      try {
        if (!socket.user) {
          socket.emit('error', {
            event: 'joinRoom',
            message: 'Utilisateur non authentifié',
          })
          return
        }

        const roomIdNumber = Number(payload?.roomId)
        const deckIdNumber = Number(payload?.deckId)

        if (!payload?.roomId || Number.isNaN(roomIdNumber)) {
          socket.emit('error', {
            event: 'joinRoom',
            message: 'Room ID invalide',
          })
          return
        }

        if (!payload?.deckId || Number.isNaN(deckIdNumber)) {
          socket.emit('error', {
            event: 'joinRoom',
            message: 'Deck ID invalide',
          })
          return
        }

        const room = rooms.get(roomIdNumber)

        if (!room) {
          socket.emit('error', {
            event: 'joinRoom',
            message: "La room n'existe pas",
          })
          return
        }

        if (room.status !== 'waiting' || room.guestSocketId) {
          socket.emit('error', {
            event: 'joinRoom',
            message: 'La room est déjà complète',
          })
          return
        }

        const deck = await prisma.deck.findUnique({
          where: { id: deckIdNumber },
          include: {
            deckCards: { include: { card: true } },
            user: true,
          },
        })

        if (!deck) {
          socket.emit('error', {
            event: 'joinRoom',
            message: 'Deck introuvable',
          })
          return
        }

        if (deck.userId !== socket.user.userId) {
          socket.emit('error', {
            event: 'joinRoom',
            message: "Ce deck n'appartient pas à l'utilisateur connecté",
          })
          return
        }

        if (deck.deckCards.length !== 10) {
          socket.emit('error', {
            event: 'joinRoom',
            message: 'Le deck doit contenir exactement 10 cartes',
          })
          return
        }

        const roomName = `room-${room.id}`

        const hostSocket = io.sockets.sockets.get(room.hostSocketId)
        if (!hostSocket) {
          socket.emit('error', {
            event: 'joinRoom',
            message: 'Le joueur hôte est déconnecté',
          })
          rooms.delete(room.id)
          io.emit('roomsListUpdated', getWaitingRooms())
          return
        }

        hostSocket.join(roomName)
        socket.join(roomName)

        room.status = 'in-game'
        room.guestSocketId = socket.id
        room.guestUserId = socket.user.userId
        room.guestUsername = deck.user.username
        room.guestDeckId = deck.id

        const hostDeckData = await prisma.deck.findUnique({
          where: { id: room.hostDeckId },
          include: { deckCards: { include: { card: true } } },
        })
        if (!hostDeckData || hostDeckData.deckCards.length !== 10) {
          socket.emit('error', {
            event: 'joinRoom',
            message: 'Deck du host invalide',
          })
          return
        }

        const toGameCards = (
          deckCards: {
            card: {
              id: number
              name: string
              hp: number
              attack: number
              type: PokemonType
            }
          }[],
        ): GameCard[] =>
          deckCards.map((dc) => ({
            id: dc.card.id,
            name: dc.card.name,
            hp: dc.card.hp,
            attack: dc.card.attack,
            type: dc.card.type,
          }))

        const hostDeck = shuffle(toGameCards(hostDeckData.deckCards))
        const guestDeck = shuffle(toGameCards(deck.deckCards))

        const gameState: GameState = {
          hostDeck,
          hostHand: [],
          hostActive: null,
          hostScore: 0,
          guestDeck,
          guestHand: [],
          guestActive: null,
          guestScore: 0,
          currentPlayerSocketId: room.hostSocketId,
        }
        gameStates.set(room.id, gameState)

        const hostState = {
          roomId: room.id,
          you: {
            role: 'host' as const,
            userId: room.hostUserId,
            deckId: room.hostDeckId,
          },
          opponent: {
            role: 'guest' as const,
            userId: room.guestUserId,
            deckId: room.guestDeckId,
          },
        }

        const guestState = {
          roomId: room.id,
          you: {
            role: 'guest' as const,
            userId: room.guestUserId,
            deckId: room.guestDeckId,
          },
          opponent: {
            role: 'host' as const,
            userId: room.hostUserId,
            deckId: room.hostDeckId,
          },
        }

        hostSocket.emit('gameStarted', hostState)
        socket.emit('gameStarted', guestState)

        io.emit('roomsListUpdated', getWaitingRooms())
      } catch (error) {
        console.error('Erreur lors de joinRoom:', error)
        socket.emit('error', {
          event: 'joinRoom',
          message: 'Erreur lors de la jonction de la room',
        })
      }
    },
  )

  socket.on('drawCards', (payload: { roomId?: number | string }) => {
    const roomId = Number(payload?.roomId)
    if (!payload?.roomId || Number.isNaN(roomId)) {
      socket.emit('error', {
        event: 'drawCards',
        message: 'Room ID invalide',
      })
      return
    }
    const room = rooms.get(roomId)
    const state = gameStates.get(roomId)
    if (!room || !state || !room.guestSocketId) {
      socket.emit('error', {
        event: 'drawCards',
        message: 'Room introuvable ou partie non démarrée',
      })
      return
    }
    if (state.currentPlayerSocketId !== socket.id) {
      socket.emit('error', {
        event: 'drawCards',
        message: "Ce n'est pas votre tour",
      })
      return
    }
    const isHost = socket.id === room.hostSocketId
    const deck = isHost ? state.hostDeck : state.guestDeck
    const hand = isHost ? state.hostHand : state.guestHand
    while (hand.length < 5 && deck.length > 0) {
      hand.push(deck.pop()!)
    }
    if (isHost) {
      state.hostDeck = deck
      state.hostHand = hand
    } else {
      state.guestDeck = deck
      state.guestHand = hand
    }
    emitGameStateUpdated(roomId)
  })

  socket.on(
    'playCard',
    (payload: { roomId?: number | string; cardIndex?: number }) => {
      const roomId = Number(payload?.roomId)
      const cardIndex = payload?.cardIndex
      if (!payload?.roomId || Number.isNaN(roomId)) {
        socket.emit('error', {
          event: 'playCard',
          message: 'Room ID invalide',
        })
        return
      }
      if (cardIndex === undefined || cardIndex < 0) {
        socket.emit('error', {
          event: 'playCard',
          message: 'Index de carte invalide',
        })
        return
      }
      const room = rooms.get(roomId)
      const state = gameStates.get(roomId)
      if (!room || !state || !room.guestSocketId) {
        socket.emit('error', {
          event: 'playCard',
          message: 'Room introuvable ou partie non démarrée',
        })
        return
      }
      if (state.currentPlayerSocketId !== socket.id) {
        socket.emit('error', {
          event: 'playCard',
          message: "Ce n'est pas votre tour",
        })
        return
      }
      const isHost = socket.id === room.hostSocketId
      const hand = isHost ? state.hostHand : state.guestHand
      const active = isHost ? state.hostActive : state.guestActive
      if (active !== null) {
        socket.emit('error', {
          event: 'playCard',
          message: 'Vous avez déjà une carte active sur le terrain',
        })
        return
      }
      if (cardIndex >= hand.length) {
        socket.emit('error', {
          event: 'playCard',
          message: 'Index de carte invalide',
        })
        return
      }
      const [card] = hand.splice(cardIndex, 1)
      if (isHost) {
        state.hostHand = hand
        state.hostActive = card
      } else {
        state.guestHand = hand
        state.guestActive = card
      }
      emitGameStateUpdated(roomId)
    },
  )

  socket.on('attack', (payload: { roomId?: number | string }) => {
    const roomId = Number(payload?.roomId)
    if (!payload?.roomId || Number.isNaN(roomId)) {
      socket.emit('error', {
        event: 'attack',
        message: 'Room ID invalide',
      })
      return
    }
    const room = rooms.get(roomId)
    const state = gameStates.get(roomId)
    if (!room || !state || !room.guestSocketId) {
      socket.emit('error', {
        event: 'attack',
        message: 'Room introuvable ou partie non démarrée',
      })
      return
    }
    if (state.currentPlayerSocketId !== socket.id) {
      socket.emit('error', {
        event: 'attack',
        message: "Ce n'est pas votre tour",
      })
      return
    }
    const isHost = socket.id === room.hostSocketId
    const attackerActive = isHost ? state.hostActive : state.guestActive
    const defenderActive = isHost ? state.guestActive : state.hostActive
    if (!attackerActive) {
      socket.emit('error', {
        event: 'attack',
        message: "Vous n'avez pas de carte active",
      })
      return
    }
    if (!defenderActive) {
      socket.emit('error', {
        event: 'attack',
        message: "L'adversaire n'a pas de carte active",
      })
      return
    }
    const damage = calculateDamage(
      attackerActive.attack,
      attackerActive.type,
      defenderActive.type,
    )
    defenderActive.hp -= damage
    if (defenderActive.hp <= 0) {
      if (isHost) {
        state.guestActive = null
        state.hostScore += 1
      } else {
        state.hostActive = null
        state.guestScore += 1
      }
    }
    state.currentPlayerSocketId =
      state.currentPlayerSocketId === room.hostSocketId
        ? room.guestSocketId
        : room.hostSocketId

    const hostSocket = io.sockets.sockets.get(room.hostSocketId)
    const guestSocket = io.sockets.sockets.get(room.guestSocketId)
    if (hostSocket && guestSocket) {
      const winner =
        state.hostScore >= 3
          ? room.hostSocketId
          : state.guestScore >= 3
            ? room.guestSocketId
            : null
      if (winner) {
        hostSocket.emit('gameEnded', {
          roomId,
          winnerSocketId: winner,
          hostScore: state.hostScore,
          guestScore: state.guestScore,
        })
        guestSocket.emit('gameEnded', {
          roomId,
          winnerSocketId: winner,
          hostScore: state.hostScore,
          guestScore: state.guestScore,
        })
        gameStates.delete(roomId)
      } else {
        emitGameStateUpdated(roomId)
      }
    }
  })

  socket.on('endTurn', (payload: { roomId?: number | string }) => {
    const roomId = Number(payload?.roomId)
    if (!payload?.roomId || Number.isNaN(roomId)) {
      socket.emit('error', {
        event: 'endTurn',
        message: 'Room ID invalide',
      })
      return
    }
    const room = rooms.get(roomId)
    const state = gameStates.get(roomId)
    if (!room || !state || !room.guestSocketId) {
      socket.emit('error', {
        event: 'endTurn',
        message: 'Room introuvable ou partie non démarrée',
      })
      return
    }
    if (state.currentPlayerSocketId !== socket.id) {
      socket.emit('error', {
        event: 'endTurn',
        message: "Ce n'est pas votre tour",
      })
      return
    }
    state.currentPlayerSocketId =
      state.currentPlayerSocketId === room.hostSocketId
        ? room.guestSocketId
        : room.hostSocketId
    emitGameStateUpdated(roomId)
  })

  socket.on('disconnect', () => {
    console.log(`Client disconnected: userId=${socket.user?.userId}`)

    let updated = false

    rooms.forEach((room, roomId) => {
      if (room.hostSocketId === socket.id || room.guestSocketId === socket.id) {
        rooms.delete(roomId)
        gameStates.delete(roomId)
        updated = true
      }
    })

    if (updated) {
      io.emit('roomsListUpdated', getWaitingRooms())
    }
  })
})

if (env.NODE_ENV !== 'test') {
  server.listen(env.PORT, () => {
    console.log(` Server is running on http://localhost:${env.PORT}`)
    console.log(' Socket.io Test Client available at http://localhost:3001')
  })
}

export { app, io }
