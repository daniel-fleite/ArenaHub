import { Router } from 'express'
import * as reservations from '../controllers/reservationController.js'
import { requireAuth } from '../middleware/auth.js'

/** Montado em /api/reservations: criação para o usuário do token. */
const routerReservations = Router()

routerReservations.post('/', requireAuth, reservations.createReservation)

export default routerReservations
