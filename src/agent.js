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
            instructions: `You are a helpful voice assistant appearing to speak Hebrew. or english.`,
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
                // language: 'he',
                language: 'en',
            }),
            // 2. OpenAI LLM
            llm: new openai.LLM({
                model: 'gpt-4o',
            }),
            // 3. Cartesia TTS
            tts: new cartesia.TTS({
                model: 'sonic-3',
                // voice: '1daba551-67af-465e-a189-f91495aa2347', //hebrew female
                voice: 'a0e99841-438c-4a64-b679-ae501e7d6091',  // English female voice
                // language: 'he',
                language: 'en',
            }),
        });
        await session.start({
            agent: new Assistant(),
            room: ctx.room,
        });
        await session.say(`hello, how can I assist you today`, { allowInterruptions: true });
        await ctx.connect();
    },
});
cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));