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

const rooms = new Map<number, MatchmakingRoom>()
let nextRoomId = 1

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
            deckCards: true,
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
          message: "Erreur lors de la jonction de la room",
        })
      }
    },
  )

  socket.on('disconnect', () => {
    console.log(`Client disconnected: userId=${socket.user?.userId}`)

    let updated = false

    rooms.forEach((room, roomId) => {
      if (
        room.hostSocketId === socket.id ||
        room.guestSocketId === socket.id
      ) {
        rooms.delete(roomId)
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

