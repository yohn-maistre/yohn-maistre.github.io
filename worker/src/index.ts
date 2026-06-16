import { SignJWT } from 'jose'

interface Env {
  LIVEKIT_API_KEY: string
  LIVEKIT_API_SECRET: string
  LIVEKIT_URL: string
  ALLOWED_ORIGIN: string
}

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
})

const randomId = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://yose.is-a.dev'

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders(allowedOrigin),
      })
    }

    const identity = randomId('user')
    const roomName = randomId('room')
    const now = Math.floor(Date.now() / 1000)
    const ttl = 60 * 60

    const token = await new SignJWT({
      video: {
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      },
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(env.LIVEKIT_API_KEY)
      .setSubject(identity)
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + ttl)
      .setJti(identity)
      .sign(new TextEncoder().encode(env.LIVEKIT_API_SECRET))

    return new Response(
      JSON.stringify({
        serverUrl: env.LIVEKIT_URL,
        roomName,
        participantName: identity,
        participantToken: token,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(allowedOrigin),
        },
      }
    )
  },
}
