import { Router } from 'express'
import * as admin from '../controllers/adminController.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'

/** Montado em /api/admin: somente administradores da plataforma. */
const routerAdmin = Router()
routerAdmin.use(requireAuth, requireAdmin)

routerAdmin.get('/stats', admin.getStats)
routerAdmin.get('/arenas', admin.listArenas)
routerAdmin.patch('/arenas/:id', admin.updateArena)
routerAdmin.get('/users', admin.listUsers)
routerAdmin.patch('/users/:id/status', admin.setUserStatus)
routerAdmin.post('/users/:id/arenas', admin.grantArena)
routerAdmin.delete('/users/:id/arenas/:arenaId', admin.revokeArena)

export default routerAdmin
