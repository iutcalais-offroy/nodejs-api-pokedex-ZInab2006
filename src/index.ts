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

io.on('connection', (socket: AuthedSocket) => {
  console.log(
    `Client connected: userId=${socket.user?.userId}, email=${socket.user?.email}`,
  )

  socket.on('disconnect', () => {
    console.log(`Client disconnected: userId=${socket.user?.userId}`)
  })
})

if (env.NODE_ENV !== 'test') {
  server.listen(env.PORT, () => {
    console.log(` Server is running on http://localhost:${env.PORT}`)
    console.log(' Socket.io Test Client available at http://localhost:3001')
  })
}

export { app, io }

