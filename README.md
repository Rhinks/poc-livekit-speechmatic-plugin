# livekit-poc

A proof-of-concept project integrating LiveKit Agents with custom Speech-to-Text (STT) and Text-to-Speech (TTS) plugins, focusing on Hebrew language support.

## Overview

This project demonstrates how to build a voice assistant using [LiveKit Agents](https://github.com/livekit/agents) and custom plugins for STT and TTS. It includes:

- Integration with Speechmatics and Gladia for STT
- Use of Cartesia for TTS
- OpenAI for LLM (Language Model)
- Silero for Voice Activity Detection (VAD)

## Project Structure

- `src/agent.js`: Main agent definition, wiring together VAD, STT, LLM, and TTS components.
- `src/speechmatics.js`: Custom Speechmatics STT integration via WebSocket.
- `src/gladia.js`: Custom Gladia STT integration via WebSocket.

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- [pnpm](https://pnpm.io/) package manager

### Setup

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Download required models/files:**

   ```bash
   pnpm download
   ```

3. **Set up environment variables:**
   - Copy `.env.example` to `.env.local`:
     ```bash
     cp .env.example .env.local
     ```
   - Fill in all required API keys in `.env.local` (see example file for variables).

4. **Run the agent:**

   ```bash
   node src/agent.js dev
   ```

5. **Test your agent:**
   - Go to [LiveKit Agents Playground](https://agents-playground.livekit.io/).
   - Log in with your LiveKit account.
   - Make sure your project API keys are set up correctly in `.env.local`.
   - You should now be able to connect and interact with your running agent from the web interface.

### Scripts

- `pnpm download`: Downloads required files for Silero VAD plugin.

## Dependencies

- `@livekit/agents`
- `@livekit/agents-plugin-cartesia`
- `@livekit/agents-plugin-openai`
- `@livekit/agents-plugin-silero`
- `dotenv`
- `ws`

## License

ISC
