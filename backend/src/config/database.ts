import 'dotenv/config' //importa as variaveis do arquivo .env
import pg from 'pg' //importa o cliente PostgreeSQL

const { Pool } = pg //

// Colunas DATE (ex.: reservations.reservation_date) chegam como texto 'AAAA-MM-DD',
// sem conversão para Date no fuso do servidor, que poderia deslocar o dia.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value)

export const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL, //obtem a connection string no .env
    ssl: {
        rejectUnauthorized: false
    }
})
/**
 * Executa a consulta nova; se o banco ainda não tiver a coluna usada por ela (erro 42703,
 * migração ainda não aplicada), executa a versão anterior. Evita derrubar o sistema entre o
 * deploy do código e a aplicação da migração.
 */
export async function queryWithLegacyFallback(sql: string, legacySql: string, params: unknown[] = []) {
    try {
        return await pool.query(sql, params)
    } catch (error) {
        if ((error as { code?: string })?.code === '42703') return pool.query(legacySql, params)
        throw error
    }
}
