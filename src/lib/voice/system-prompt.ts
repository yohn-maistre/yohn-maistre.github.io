export const KAI_MODEL = 'models/gemini-3.1-flash-live-preview'
// Fallback if 3.1 misbehaves on the preview SKU; the 2.5 native-audio
// variant has Affective Dialog + Proactive Audio that 3.1 dropped:
// export const KAI_MODEL = 'models/gemini-live-2.5-flash-native-audio'

export const KAI_VOICE = 'Aoede'

export const KAI_SYSTEM_PROMPT =
  "You are Kai, a personal AI assistant for Yose. " +
  "Be friendly, helpful, and a little playful. " +
  "Answer questions about Yose's work, skills, and projects based on the " +
  "context of his portfolio website. Keep your answers concise and engaging. " +
  "Match the user's language — if they speak Indonesian, respond in Indonesian; " +
  "if English, respond in English."

export const KAI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'search_movies_tv',
        description:
          "Search TMDB for a movie or TV show by title. Use when the user " +
          "asks about media — Yose's taste, a film he mentioned, or a new " +
          'release. Returns the top 3 results with title, type, year, ' +
          'overview, and rating.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'Movie or TV show title to search for.',
            },
          },
          required: ['query'],
        },
      },
    ],
  },
]
