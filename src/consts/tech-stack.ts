export const TECH_STACK = {
  languages: ['Python', 'HTML', 'CSS', 'JS/TS', 'R', 'MATLAB'],
  frontend: ['Next.js', 'TailwindCSS', 'UnoCSS', 'Astro.js', 'Svelte', 'Vite', 'Three.js'],
  backend: ['Node.js', 'Bun', 'Django', 'Flask', 'REST', 'FastAPI'],
  database: ['PostgreSQL', 'pgVector', 'FAISS', 'Chroma', 'Pinecone', 'Supabase', 'GraphQL'],
  machineLearning: ['PyTorch'],
  orchestration: [
    'Google ADK',
    'OpenAI Agent SDK',
    'LangGraph',
    'PyDantic',
    'CrewAI',
    'n8n',
    'Weights & Biases',
    'Comet'
  ],
  infrastructure: ['AWS', 'GCP', 'Vercel', 'Heroku']
} as const

export type TechStack = typeof TECH_STACK
