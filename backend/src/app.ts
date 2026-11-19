import express from 'express'
import router from './routes/healthRoutes.js'
import routerArena from './routes/arenaRoutes.js'
import routerMe from './routes/meRoutes.js'
import routerManager from './routes/managerRoutes.js'
import routerReservations from './routes/reservationRoutes.js'
import routerAdmin from './routes/adminRoutes.js'
import { routerAdminArenaRequests, routerArenaRequests } from './routes/arenaRequestRoutes.js'

// Origens do frontend autorizadas (separadas por vírgula), ex.: http://localhost:8443
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean)

// Fora de produção, o mesmo app também pode ser aberto por 127.0.0.1 ou pelo endereço de rede
// que o Vite mostra (ex.: http://192.168.1.23:8443). Sem isso o navegador bloqueia /api/me e a
// interface fica sem papéis. A API usa token Bearer (sem cookies), então isso não expõe sessão.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d{1,5})?$/

export function isAllowedOrigin(origin: string, production = process.env.NODE_ENV === 'production') {
    return allowedOrigins.includes(origin) || (!production && LOCAL_ORIGIN.test(origin))
}

export const app = express()

app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && isAllowedOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
})
app.use(express.json())

app.use('/api', router)
app.use('/api/arenas', routerArena)
app.use('/api/me', routerMe)
app.use('/api/manager', routerManager)
app.use('/api/reservations', routerReservations)
app.use('/api/arena-requests', routerArenaRequests)
app.use('/api/admin/arena-requests', routerAdminArenaRequests)
app.use('/api/admin', routerAdmin)
