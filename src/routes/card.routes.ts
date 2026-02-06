import { Router } from 'express'
import { getAllCards } from '../controllers/card.controller'

const router = Router()

/**
 * Route GET /api/cards
 * Retourne toutes les cartes Pokémon triées par numéro Pokédex
 * Endpoint public
 */
router.get('/', getAllCards)

export default router
