import { defineAgent, voice, JobContext, cli, WorkerOptions, JobProcess } from '@livekit/agents';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import * as google from '@livekit/agents-plugin-google';
import * as deepgram from '@livekit/agents-plugin-deepgram';
// import * as silero from '@livekit/agents-plugin-silero';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';

export default defineAgent({
  // The VAD is used to detect when a user has finished speaking.
  // It was commented out to simplify debugging, as it was causing race conditions.
  // prewarm: async (proc: JobProcess) => {
  //   proc.userData.vad = await silero.VAD.load();
  // },
  entry: async (ctx: JobContext) => {
    const agent = new voice.Agent({
      instructions: "You are Kai, a personal AI assistant for Yose. Be friendly, helpful, and a little playful. Answer questions about Yose's work, skills, and projects based on the context of his portfolio website. Keep your answers concise and engaging.",
    });

    const session = new voice.AgentSession({
      stt: new deepgram.STT({ language: 'multi' }),
      llm: new google.LLM({
        model: 'gemini-2.5-flash',
        apiKey: process.env.GOOGLE_API_KEY!,
      }),
      tts: new elevenlabs.TTS({
        apiKey: process.env.ELEVENLABS_API_KEY,
        voice: 'iWydkXKoiVtvdn4vLKp9',
      }),
      // vad: ctx.proc.userData.vad,
    });

    session.on('error', (e) => {
      console.error('Session error:', e);
    });

    await session.start({ agent, room: ctx.room });

    try {
      await session.say({ text: "Halo, saya Kai, AI pribadi Yose. Apa yang kamu mau tau soal Yose?" });
    } catch (e) {
      console.error('Error generating initial reply:', e);
    }

    return agent;
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));