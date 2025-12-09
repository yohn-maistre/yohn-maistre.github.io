import type { APIRoute } from 'astro';
import { AccessToken } from 'livekit-server-sdk';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const { room_config } = body ? JSON.parse(body) : { room_config: {} };
  const roomName = 'livekit-room';
  const participantName = 'user-' + Math.random().toString(36).substring(7);

  const at = new AccessToken(import.meta.env.LIVEKIT_API_KEY, import.meta.env.LIVEKIT_API_SECRET, {
    identity: participantName,
  });

  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });

  const token = await at.toJwt();

  return new Response(JSON.stringify({
    serverUrl: import.meta.env.LIVEKIT_URL,
    roomName: roomName,
    participantName: participantName,
    participantToken: token,
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
};