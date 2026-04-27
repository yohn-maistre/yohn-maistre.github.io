/**
 * LiveKit token-mint endpoint.
 *
 * IMPORTANT: this file is intentionally prefixed with `_` so Astro skips it
 * during routing. The site is hosted on GitHub Pages (static output) and
 * cannot run server endpoints — calling /api/connection-details there would
 * 404. The frontend (`LiveKitAgent.tsx`) handles that 404 gracefully with an
 * "agent offline" notice.
 *
 * To re-enable the voice agent in production, choose one of:
 *   - Move the site to Vercel/Cloudflare Pages and rename this file to
 *     `connection-details.ts` (drop the underscore).
 *   - Stand up a tiny Cloudflare Worker / Fly.io service that signs tokens,
 *     then point the frontend `fetch()` URL at that worker (and add CORS).
 *
 * Either way, the env vars below MUST be set before deploying:
 *   - LIVEKIT_API_KEY      — server API key from livekit.cloud
 *   - LIVEKIT_API_SECRET   — server API secret
 *   - LIVEKIT_URL          — wss:// URL of your LiveKit room server
 */

import type { APIRoute } from 'astro'
import { AccessToken } from 'livekit-server-sdk'

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.LIVEKIT_API_KEY
  const apiSecret = import.meta.env.LIVEKIT_API_SECRET
  const serverUrl = import.meta.env.LIVEKIT_URL

  if (!apiKey || !apiSecret || !serverUrl) {
    return new Response(
      JSON.stringify({
        error:
          'LiveKit env vars missing. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL on the host.'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const body = await request.text()
  const { room_config: _roomConfig } = body ? JSON.parse(body) : { room_config: {} }
  const roomName = 'livekit-room'
  const participantName = 'user-' + Math.random().toString(36).substring(7)

  const at = new AccessToken(apiKey, apiSecret, { identity: participantName })
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true })

  const token = await at.toJwt()

  return new Response(
    JSON.stringify({
      serverUrl,
      roomName,
      participantName,
      participantToken: token
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
