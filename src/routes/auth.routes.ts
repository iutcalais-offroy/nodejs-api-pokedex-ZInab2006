import { Router } from 'express'
import { signUp, signIn } from '../controllers/auth.controller'

const router = Router()

/**
 * Route POST /api/auth/sign-up
 * Crée un nouveau compte utilisateur
 */
router.post('/sign-up', signUp)

/**
 * Route POST /api/auth/sign-in
 * Connecte un utilisateur et retourne un token JWT
 */
router.post('/sign-in', signIn)

export default router
