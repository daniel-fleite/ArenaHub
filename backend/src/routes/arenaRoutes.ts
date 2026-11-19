import { Router } from 'express'
import * as arena from '../controllers/arenaController.js'
import * as court from '../controllers/courtController.js'
import * as reservations from '../controllers/reservationController.js'
import { requireAdmin, requireArenaManager, requireAuth } from '../middleware/auth.js'

const routerArena = Router()

routerArena.get('/', arena.getAllArenas)
routerArena.get('/:id', arena.getArenaById)
// Escrita: criar e remover só admin; editar admin ou gestor vinculado à arena.
routerArena.post('/', requireAuth, requireAdmin, arena.createArena)
routerArena.put('/:id', requireAuth, requireArenaManager, arena.updateArena)
routerArena.delete('/:id', requireAuth, requireAdmin, arena.deleteArena)

// Quadras: leitura pública só das ativas; escrita por admin ou gestor vinculado à arena.
routerArena.get('/:id/courts', court.listActiveCourts)
// Disponibilidade pública: só horários ocupados, sem dados pessoais.
routerArena.get('/:id/availability', reservations.getAvailability)
routerArena.post('/:id/courts', requireAuth, requireArenaManager, court.createCourt)
routerArena.put('/:id/courts/:courtId', requireAuth, requireArenaManager, court.updateCourt)
routerArena.delete('/:id/courts/:courtId', requireAuth, requireArenaManager, court.deleteCourt)

export default routerArena
