import { app } from './app.js'
import { pool } from './config/database.js'

const port = Number(process.env.PORT) || 3000

pool.query('SELECT NOW()') 
    .then(result => {
        console.log('Conexão com PostgreSQL estabelecida!')
        console.log('Horário do banco:', result.rows[0].now)
    })
    .catch(error => {
        console.error('Erro ao conectar ao PostgreSQL:', error.message)
    })

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`)
})
