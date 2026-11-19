import { Router } from 'express'
import * as court from '../controllers/courtController.js'
import * as reservations from '../controllers/reservationController.js'
import * as manager from '../controllers/managerController.js'
import { requireArenaManager, requireAuth } from '../middleware/auth.js'

/** Montado em /api/manager: dados do painel do gestor, filtrados pelos vínculos do token. */
const routerManager = Router()

routerManager.get('/arenas', requireAuth, court.listManagedArenas)
// Reservas da arena (com nome e telefone do responsável): admin ou gestor vinculado.
routerManager.get('/arenas/:id/reservations', requireAuth, requireArenaManager, reservations.listArenaReservations)
routerManager.post('/arenas/:id/reservations/:reservationId/cancel', requireAuth, requireArenaManager, reservations.cancelArenaReservation)

// Indicadores, produtos, vendas, campeonatos e publicações: admin ou gestor vinculado à arena.
const arena = Router({ mergeParams: true })
arena.use(requireAuth, requireArenaManager)
arena.get('/dashboard', manager.getDashboard)
arena.get('/products', manager.listProducts)
arena.post('/products', manager.createProduct)
arena.put('/products/:productId', manager.updateProduct)
arena.delete('/products/:productId', manager.deleteProduct)
arena.get('/sales', manager.listSales)
arena.post('/sales', manager.createSale)
arena.delete('/sales/:saleId', manager.deleteSale)
arena.get('/championships', manager.listChampionships)
arena.post('/championships', manager.createChampionship)
arena.put('/championships/:championshipId', manager.updateChampionship)
arena.delete('/championships/:championshipId', manager.deleteChampionship)
arena.post('/championships/:championshipId/teams', manager.addTeam)
arena.delete('/championships/:championshipId/teams/:teamId', manager.removeTeam)
arena.get('/posts', manager.listPosts)
arena.post('/posts', manager.createPost)
arena.delete('/posts/:postId', manager.deletePost)
routerManager.use('/arenas/:id', arena)

export default routerManager
