# Gemini Task Summary

This document is our shared brain. It tracks the work we've done, the problems we're currently facing, and the plans we've made. It's designed to be a comprehensive context for any of our sessions.

---

## Project Overview

This project is a personal portfolio website built with Astro. The goal is to create a visually appealing and performant website that showcases the user's work and skills. The website features a 3D model, a blog, and an experimental AI voice agent.

---

## LiveKit Agent: The Great Debugging Journey

**Goal:** Implement a conversational AI agent on the portfolio homepage using LiveKit, with STT, LLM, and TTS capabilities.

**Final Status:** After a lengthy and complex debugging process, the agent is still not functional. The final state is a silent failure on the client-side, where the agent's audio is not audible despite the absence of any errors in the server or client logs. This strongly points to a platform or environment-specific issue rather than a bug in the application logic itself.

### The Narrative
Our goal was simple: make a voice agent speak. The path, however, was fraught with peril. We began with a basic setup and immediately faced a silent agent. Our journey involved methodically identifying and fixing over a dozen distinct, cascading bugs:

1.  **Plugin Hell:** We discovered the JavaScript/TypeScript plugins for LiveKit Agents have an inconsistent and sparsely documented API. We cycled through `TypeError: ... is not a constructor` for multiple plugins (Google TTS, Cartesia STT), realizing that some require string identifiers while others need class instances with specific property names (e.g., `apiKey` vs `api_key`).
2.  **Rate Limits:** Our first success at generating audio with Google TTS was immediately met with a `429` rate limit error, as the free tier is capped at a mere 15 requests. This forced a pivot to a more generous service.
3.  **The Frontend Battle:** When the server started working, the client refused to play audio. We fixed a `TrackRef` error by passing props correctly to LiveKit's `<AudioTrack>` component. We then fixed a subtle race condition by refactoring the React component to derive state directly from hooks instead of using `useEffect`.
4.  **The Race Condition:** We encountered a race condition where the VAD would detect the user's microphone connecting and trigger an empty STT event before the agent could deliver its initial greeting. We fixed this by restructuring the agent to use the `session.on('started', ...)` event.
5.  **The Wall:** Our final state is the most perplexing. The server logs are perfect. The client logs are perfect. The code is, to our best knowledge, correct and robust. Yet, there is no sound. This indicates the problem is no longer in our code, but in the environment (Browser, OS, Astro hydration, etc.).

### Key Insights for Future Agents

*   **The LiveKit JS SDK is Tricky:** The documentation seems to lag behind the Python SDK, and many patterns do not translate directly. Be wary of constructor signatures and expect to debug plugin configurations. The Python SDK appears more mature for agent-related tasks.
*   **Client-Side Audio is Fragile:** Even when the code is logically correct, browser autoplay policies and component rendering lifecycles can prevent audio from playing. Bypassing UI components (like `<AudioTrack>`) to manually attach a `MediaStream` to an `<audio>` element is a powerful debugging technique.
*   **Isolate to Prove:** The "Echo Agent" test was invaluable. By stripping away all AI services, we proved the core LiveKit audio pipeline was the source of the issue, not the TTS/STT providers.

---

## Completed: Internationalization (i18n) Overhaul

**Status:** ✅ Complete (Session 3)

We successfully resolved all identified i18n issues and standardized the site's structure.

**Key Achievements:**

1.  **Standardized URL Structure:**
    - Implemented a consistent `/{locale}/{collection}/{slug}` pattern (e.g., `/id/blog/solarpunk`).
    - Created new route handlers (`src/pages/id/blog/[...id].astro`, `src/pages/id/mind-garden/[...id].astro`) to enforce this.
    - Updated `PostPreview` and `DocsContents` components to generate locale-aware links.

2.  **Full Localization:**
    - Created Indonesian versions of all core pages: About, Projects, Media, Links, Search.
    - Implemented a translation map in `Header.astro` to localize navbar links (e.g., "Kebun Pikiran", "Proyek").
    - Ensured the "Language Toggle" persists the user's current content (e.g., switching language on a blog post takes you to the translated post, not the homepage).

3.  **Bug Fixes:**
    - **Mind Garden Visibility:** Fixed the issue where Mind Garden content was hidden or empty in the Indonesian locale.
    - **Media Thumbnails:** Resolved missing thumbnails by ensuring fallback images and correct API key usage.
    - **Homepage Filtering:** The homepage now correctly filters blog posts by the current locale.
    - **Trailing Slashes:** Implemented `normalizeTrailingSlash` to ensure consistent routing behavior.

---

## The Path Forward

### Plan A: Switching the Agent to Python

Given the difficulties with the Node.js library (see "LiveKit Agent" section above), the next major feature work is to rewrite the conversational agent in Python.

1.  **Setup:** Create a `src/agent-python/` directory.
2.  **Dependencies:** Create a `requirements.txt` file and add `livekit-agents`, `livekit-plugins-deepgram`, and `livekit-plugins-elevenlabs`.
3.  **Translate:** Create a `main.py` file and translate the logic from `src/agent/index.ts`. The Python SDK seems to have more direct support for the features we need, so this should be more straightforward.
4.  **Execute:** Update the `package.json` start script to execute the Python agent.