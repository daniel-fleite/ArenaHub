import { Router } from 'express'
import * as requests from '../controllers/arenaRequestController.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'

/** Montado em /api/arena-requests: envio autenticado. */
export const routerArenaRequests = Router()
routerArenaRequests.post('/', requireAuth, requests.createArenaRequest)

/** Montado em /api/admin/arena-requests: somente administradores da plataforma. */
export const routerAdminArenaRequests = Router()
routerAdminArenaRequests.use(requireAuth, requireAdmin)
routerAdminArenaRequests.get('/', requests.listArenaRequests)
routerAdminArenaRequests.get('/:id', requests.getArenaRequest)
routerAdminArenaRequests.post('/:id/approve', requests.approveArenaRequest)
routerAdminArenaRequests.post('/:id/reject', requests.rejectArenaRequest)
