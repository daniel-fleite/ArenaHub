// CORS: o frontend aberto por localhost, 127.0.0.1 ou endereço de rede local precisa chamar a API.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

process.env.FRONTEND_ORIGIN = 'https://app.arenahub.example'
process.env.DATABASE_URL = 'postgres://unused@localhost/unused'

const { isAllowedOrigin } = await import('../app.js')

describe('origens permitidas', () => {
    test('FRONTEND_ORIGIN sempre permitida', () => {
        assert.equal(isAllowedOrigin('https://app.arenahub.example', true), true)
        assert.equal(isAllowedOrigin('https://app.arenahub.example', false), true)
    })

    for (const origin of ['http://localhost:8443', 'http://127.0.0.1:8443', 'http://[::1]:8443',
        'http://192.168.1.23:8443', 'http://10.0.0.5:5173', 'http://172.20.1.2:8443']) {
        test(`fora de produção: ${origin}`, () => assert.equal(isAllowedOrigin(origin, false), true))
    }

    test('em produção, endereços locais não são liberados automaticamente', () => {
        assert.equal(isAllowedOrigin('http://192.168.1.23:8443', true), false)
        assert.equal(isAllowedOrigin('http://localhost:8443', true), false)
    })

    for (const origin of ['https://evil.example', 'http://localhost.evil.example', 'http://192.168.1.23.evil.example',
        'http://172.32.0.1:8443', 'http://8.8.8.8', 'null']) {
        test(`nunca permitida: ${origin}`, () => assert.equal(isAllowedOrigin(origin, false), false))
    }
})
