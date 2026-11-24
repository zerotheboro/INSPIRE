import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createLocalService } from './functions/src/inspireLocalService'
import { ChatError, exactKeys, record } from './functions/src/inspireChatContract'
import {readChatJson} from './functions/src/inspireHttp'
import {requirePrivateTest} from './functions/src/inspirePrivateTest'
import {createKnowledgePreviewAdapter} from './functions/src/inspireLuna'
import {createPrivateLunaService, createPrivateChatgptService} from './functions/src/inspireLunaService'

// Local development only. This middleware is absent from production builds.
export function inspirePrototype(serviceFactory = createLocalService, lunaFactory = createPrivateLunaService) {
  return {
    name: 'inspire-offline-prototype',
    configureServer(vite: import('vite').ViteDevServer) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
      const privateEnabled = process.env.INSPIRE_PRIVATE_TEST === '1'
      const knowledge = privateEnabled ? createKnowledgePreviewAdapter() : undefined
      const server = knowledge ? serviceFactory(knowledge) : serviceFactory()
      const luna = privateEnabled && process.env.INSPIRE_LUNA_API_PREVIEW === '1' && process.env.INSPIRE_BILLING_ROUTE === 'api-key' ? lunaFactory() : undefined
      const chatgpt = privateEnabled ? createPrivateChatgptService() : undefined
      vite.httpServer?.once('close', () => server.close())
      vite.httpServer?.once('close', () => luna?.close())
      vite.httpServer?.once('close', () => chatgpt?.close())
      vite.middlewares.use('/api/inspire-private-status', (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        try {
          requirePrivateTest(privateEnabled, req.socket.remoteAddress || '', req.headers.host || '', req.headers.origin)
          if (req.method !== 'GET') throw new ChatError('METHOD', 'Chỉ hỗ trợ GET.', 'none', 405)
          res.end(JSON.stringify({mode: 'simulation', modelAvailable: false, chatgptPreview: !!chatgpt, ...(luna ? {lunaApiPreview: true} : {})}))
        } catch (error) {
          const safe = error instanceof ChatError ? error : new ChatError('PRIVATE_CLOSED', 'Phòng thử riêng chưa sẵn sàng.', 'none', 503)
          res.statusCode = safe.status
          res.end(JSON.stringify({error: {message: safe.message}}))
        }
      })
      vite.middlewares.use('/api/inspire-chatgpt', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        try {
          requirePrivateTest(privateEnabled, req.socket.remoteAddress || '', req.headers.host || '', req.headers.origin)
          if (!chatgpt) throw new ChatError('PRIVATE_CLOSED', 'Phòng thử riêng chưa mở.', 'none', 403)
          if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) throw new ChatError('METHOD', 'Chỉ nhận JSON qua POST.')
          const data = await readChatJson(req)
          const authorization = req.headers.authorization
          if (!authorization?.startsWith('Bearer ')) throw new ChatError('UNAUTHENTICATED', 'Cần kết nối tài khoản thử.', 'none', 401)
          const identity = await chatgpt.verify(authorization.slice(7))
          res.end(JSON.stringify(await chatgpt.handlePrivate(data, identity)))
        } catch (error) {
          const safe = error instanceof ChatError ? error : new ChatError('CHATGPT_HOLD', 'Chưa xác minh được lượt gửi hoặc kho lưu cục bộ. Không gửi tới ChatGPT.', 'none', 503)
          res.statusCode = safe.status
          res.end(JSON.stringify({error: {code: safe.code, message: safe.message, retry: safe.retry}}))
        }
      })
      vite.middlewares.use('/api/inspire-luna', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        try {
          requirePrivateTest(privateEnabled, req.socket.remoteAddress || '', req.headers.host || '', req.headers.origin)
          if (!luna) throw new ChatError('LUNA_CLOSED', 'Chưa mở chuẩn bị Luna API.', 'none', 503)
          if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) throw new ChatError('METHOD', 'Chỉ nhận JSON qua POST.')
          const data = await readChatJson(req)
          const authorization = req.headers.authorization
          if (!authorization?.startsWith('Bearer ')) throw new ChatError('UNAUTHENTICATED', 'Cần kết nối tài khoản thử.', 'none', 401)
          const identity = await luna.verify(authorization.slice(7))
          res.end(JSON.stringify(await luna.handlePrivate(data, identity, req.socket.remoteAddress || '')))
        } catch (error) {
          const safe = error instanceof ChatError ? error : new ChatError('LUNA_UNAVAILABLE', 'Không xác minh được kết quả. Không tự gửi lại tới mô hình.', 'none', 503)
          res.statusCode = safe.status
          res.end(JSON.stringify({error: {code: safe.code, message: safe.message, retry: safe.retry}}))
        }
      })
      vite.middlewares.use('/api/inspire-prototype', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        try {
          if (privateEnabled) requirePrivateTest(true, req.socket.remoteAddress || '', req.headers.host || '', req.headers.origin)
          if (req.method !== 'POST') throw new ChatError('METHOD', 'Chỉ hỗ trợ POST.', 'none', 405)
          if (!req.headers['content-type']?.startsWith('application/json')) throw new ChatError('CONTENT_TYPE', 'Yêu cầu phải là JSON.')
          const origin = req.headers.origin
          if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
            throw new ChatError('ORIGIN', 'Nguồn yêu cầu không hợp lệ.', 'none', 403)
          }
          const data = await readChatJson(req)
          const authorization = req.headers.authorization
          if (!authorization?.startsWith('Bearer ')) throw new ChatError('UNAUTHENTICATED', 'Vui lòng kết nối danh tính khách hoặc đăng nhập.', 'none', 401)
          const identity = await server.verify(authorization.slice(7))
          if (record(data) && data.kind === 'session') {
            exactKeys(data, ['kind'])
            await server.accounts.account(identity)
            res.end(JSON.stringify(server.session(identity)))
          } else if (record(data) && data.kind === 'account') {
            exactKeys(data, ['kind'])
            res.end(JSON.stringify(await server.accounts.account(identity)))
          } else if (record(data) && data.kind === 'preferences') {
            exactKeys(data, ['kind', 'value'])
            res.end(JSON.stringify(await server.accounts.savePreferences(identity, data.value)))
          } else if (record(data) && data.kind === 'link-guest') {
            exactKeys(data, ['kind', 'previousToken'])
            if (typeof data.previousToken !== 'string') throw new ChatError('LINK', 'Thiếu thông tin liên kết.')
            await server.accounts.linkGuest(identity, data.previousToken)
            res.end(JSON.stringify({ linked: true }))
          } else {
            await new Promise((resolve) => setTimeout(resolve, 650))
            const response = await server.handle(data, identity, req.socket.remoteAddress || 'local-unknown')
            res.end(JSON.stringify(knowledge ? {response, knowledge: await knowledge.trace(response.operationId, response.sessionId)} : response))
          }
        } catch (error) {
          const safe = error instanceof ChatError ? error : new ChatError('UNAVAILABLE', 'Máy chủ thử nghiệm chưa sẵn sàng.', 'replay', 503)
          res.statusCode = safe.status
          res.end(JSON.stringify({ error: { code: safe.code, message: safe.message, retry: safe.retry } }))
        }
      })
    },
  }
}

export default defineConfig(({command, mode, isPreview}) => ({
  plugins: [react(), ...(command === 'serve' && mode === 'development' && !isPreview ? [inspirePrototype()] : [])],
  base: "/",
  server: {fs: {deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.private.local/**', '**/.tools.local/**']}},
}))
