import logging
import os
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    cli,
    room_io,
)
from livekit.plugins import deepgram, elevenlabs, google, silero

# Load environment variables from .env file (two levels up from agent-python)
load_dotenv("../../.env")

logger = logging.getLogger("voice-agent")
logger.setLevel(logging.INFO)

class KaiAssistant(Agent):
    """Kai - Personal AI assistant for Yose's portfolio"""
    
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are Kai, a personal AI assistant for Yose. "
                "Be friendly, helpful, and a little playful. "
                "Answer questions about Yose's work, skills, and projects based on the context of his portfolio website. "
                "Keep your answers concise and engaging."
            ),
        )

# Create the agent server instance
server = AgentServer()

@server.rtc_session()
async def agent_entrypoint(ctx: JobContext):
    """Main entrypoint for the voice agent session"""
    
    logger.info(f"Agent connecting to room: {ctx.room.name}")
    
    # Create the agent session with STT, LLM, TTS, and VAD
    session = AgentSession(
        stt="deepgram/nova-2",  # Deepgram Nova-2 for speech-to-text
        llm=google.LLM(model="gemini-2.0-flash-exp"),  # Google Gemini 2.0 Flash Experimental
        tts=elevenlabs.TTS(
            voice_id="iWydkXKoiVtvdn4vLKp9",
            api_key=os.getenv("ELEVENLABS_API_KEY"),
        ),  # ElevenLabs for text-to-speech
        vad=silero.VAD.load(),  # Silero VAD for voice activity detection
    )
    
    # Start the session
    await session.start(
        room=ctx.room,
        agent=KaiAssistant(),
    )
    
    # Generate initial greeting
    logger.info("Generating initial greeting")
    await session.generate_reply(
        instructions="Greet the user in Indonesian with your introduction: 'Halo, saya Kai, AI pribadi Yose. Apa yang kamu mau tau soal Yose?'"
    )

if __name__ == "__main__":
    # Run the agent server
    cli.run_app(server)
