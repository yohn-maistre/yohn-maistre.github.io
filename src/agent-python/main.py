import logging
import os

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    cli,
)
from livekit.plugins import deepgram, elevenlabs, openai, silero

# Local dev only — LiveKit Cloud injects secrets via the agent secrets manifest.
load_dotenv("../../.env")

logger = logging.getLogger("voice-agent")
logger.setLevel(logging.INFO)


class KaiAssistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are Kai, a personal AI assistant for Yose. "
                "Be friendly, helpful, and a little playful. "
                "Answer questions about Yose's work, skills, and projects based on the context of his portfolio website. "
                "Keep your answers concise and engaging."
            ),
        )


server = AgentServer()


@server.rtc_session()
async def agent_entrypoint(ctx: JobContext):
    logger.info(f"Agent connecting to room: {ctx.room.name}")

    # NVIDIA NIM is OpenAI-compatible; the openai plugin works against it
    # by overriding base_url. Swap to Groq by changing base_url + api key
    # to https://api.groq.com/openai/v1 and GROQ_API_KEY.
    session = AgentSession(
        stt="deepgram/nova-3",
        llm=openai.LLM(
            model="meta/llama-3.3-70b-instruct",
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=os.getenv("NVIDIA_NIM_API_KEY"),
        ),
        tts=elevenlabs.TTS(
            voice_id="iWydkXKoiVtvdn4vLKp9",
            api_key=os.getenv("ELEVENLABS_API_KEY"),
        ),
        vad=silero.VAD.load(),
    )

    await session.start(room=ctx.room, agent=KaiAssistant())

    await session.generate_reply(
        instructions=(
            "Greet the user in Indonesian with your introduction: "
            "'Halo, saya Kai, AI pribadi Yose. Apa yang kamu mau tau soal Yose?'"
        )
    )


if __name__ == "__main__":
    cli.run_app(server)
