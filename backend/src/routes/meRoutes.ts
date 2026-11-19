import { Router } from 'express'
import * as me from '../controllers/meController.js'
import { listMyArenaRequests } from '../controllers/arenaRequestController.js'
import * as reservations from '../controllers/reservationController.js'
import { requireAuth } from '../middleware/auth.js'

const routerMe = Router()

routerMe.get('/', requireAuth, me.getMe)
routerMe.patch('/', requireAuth, me.updateMe)
routerMe.get('/arena-requests', requireAuth, listMyArenaRequests)
routerMe.get('/reservations', requireAuth, reservations.listMyReservations)
routerMe.post('/reservations/:id/cancel', requireAuth, reservations.cancelMyReservation)

export default routerMe
