import {
    ServerOptions,
    cli,
    defineAgent,
    voice,
} from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as silero from '@livekit/agents-plugin-silero';
// import { GladiaSTT } from './gladia.js';
import { SpeechmaticsSTT } from './speechmatics.js';


import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: '.env.local' });
class Assistant extends voice.Agent {
    constructor() {
        super({
            instructions: `You are a helpful voice assistant appearing to speak Hebrew.`,
        });
    }
}
export default defineAgent({
    entry: async (ctx) => {
        const vad = await silero.VAD.load();

        const session = new voice.AgentSession({
            vad: vad,
            // 1. Custom Soniox STT
            stt: new SpeechmaticsSTT({
                apiKey: process.env.SPEECHMATIC_API_KEY,
                language: 'he',
            }),
            // 2. OpenAI LLM
            llm: new openai.LLM({
                model: 'gpt-4o',
            }),
            // 3. Cartesia TTS
            tts: new cartesia.TTS({
                model: 'sonic-3',
                voice: '1daba551-67af-465e-a189-f91495aa2347',
                language: 'he',
            }),
        });
        await session.start({
            agent: new Assistant(),
            room: ctx.room,
        });
        await session.say("שלום! איך אני יכול לעזור לך היום?", { allowInterruptions: true });
        await ctx.connect();
    },
});
cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));