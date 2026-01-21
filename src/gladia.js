import { stt } from '@livekit/agents';
import WebSocket from 'ws';

class GladiaSpeechStream extends stt.SpeechStream {
    label = 'gladia';

    constructor(sttInstance, apiKey, language) {
        super(sttInstance, 16000);
        this.apiKey = apiKey;
        this.language = language;
        this.ws = null;
        this.sessionId = null;
    }

    async run() {
        console.log('[Gladia] Starting STT stream...');

        // Step 1: Initialize session via REST API to get WebSocket URL
        const initResponse = await fetch('https://api.gladia.io/v2/live', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-gladia-key': this.apiKey,
            },
            body: JSON.stringify({
                encoding: 'wav/pcm',
                bit_depth: 16,
                sample_rate: 16000,
                channels: 1,
                model: 'solaria-1',
                language_config: {
                    languages: this.language ? [this.language] : [],
                    code_switching: false,
                },
                messages_config: {
                    receive_partial_transcripts: true,
                    receive_final_transcripts: true,
                    receive_speech_events: true,
                    receive_acknowledgments: false,
                    receive_errors: true,
                    receive_lifecycle_events: true,
                },
            }),
        });

        if (!initResponse.ok) {
            const errorText = await initResponse.text();
            console.error('[Gladia] Init failed:', initResponse.status, errorText);
            throw new Error(`Gladia init failed: ${initResponse.status} ${errorText}`);
        }

        const initData = await initResponse.json();
        this.sessionId = initData.id;
        const wsUrl = initData.url;
        console.log('[Gladia] Session created:', this.sessionId);
        console.log('[Gladia] WebSocket URL:', wsUrl);

        // Step 2: Connect to WebSocket
        this.ws = new WebSocket(wsUrl);

        await new Promise((resolve, reject) => {
            this.ws.onopen = () => {
                console.log('[Gladia] WebSocket CONNECTED');
                resolve();
            };
            this.ws.onerror = (err) => {
                console.error('[Gladia] WebSocket connection ERROR:', err.message);
                reject(err);
            };
        });

        // Set up message handler
        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this._handleMessage(msg);
            } catch (e) {
                console.error('[Gladia] Failed to parse message:', e);
            }
        };

        this.ws.onclose = (event) => {
            console.log('[Gladia] WebSocket CLOSED, code:', event.code, 'reason:', event.reason);
        };

        this.ws.onerror = (err) => {
            console.error('[Gladia] WebSocket error:', err.message);
        };

        // Process audio frames from this.input
        let frameCount = 0;
        for await (const frame of this.input) {
            // Handle flush sentinel
            if (frame === stt.SpeechStream.FLUSH_SENTINEL) {
                continue;
            }

            // Convert audio data to base64
            const audioData = Buffer.isBuffer(frame.data)
                ? frame.data
                : Buffer.from(frame.data.buffer || frame.data);

            // Send audio as base64 JSON (Gladia format)
            if (this.ws.readyState === WebSocket.OPEN) {
                const base64Audio = audioData.toString('base64');
                this.ws.send(JSON.stringify({
                    type: 'audio_chunk',
                    data: {
                        chunk: base64Audio
                    }
                }));
                frameCount++;
                if (frameCount % 50 === 0) {
                    console.log('[Gladia] Sent', frameCount, 'audio frames');
                }
            }
        }

        // End of input - send stop recording
        console.log('[Gladia] Input stream ended, sending stop_recording');
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'stop_recording' }));

            this.queue.put({
                type: stt.SpeechEventType.END_OF_SPEECH,
                alternatives: [{
                    text: '',
                    language: this.language || 'unknown',
                    startTime: 0,
                    endTime: 0,
                    confidence: 1.0
                }],
            });
        }

        // Wait for final messages
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
    }

    _handleMessage(msg) {
        console.log('[Gladia] Message type:', msg.type);

        switch (msg.type) {
            case 'speech_start':
                console.log('[Gladia] Speech started');
                this.queue.put({
                    type: stt.SpeechEventType.START_OF_SPEECH,
                    alternatives: [{
                        text: '',
                        language: this.language || 'unknown',
                        startTime: msg.data?.time || 0,
                        endTime: msg.data?.time || 0,
                        confidence: 1.0
                    }],
                });
                break;

            case 'speech_end':
                console.log('[Gladia] Speech ended');
                break;

            case 'transcript':
                const utterance = msg.data?.utterance;
                if (utterance) {
                    const text = utterance.text || '';
                    const isFinal = msg.data?.is_final === true;
                    const eventType = isFinal
                        ? stt.SpeechEventType.FINAL_TRANSCRIPT
                        : stt.SpeechEventType.INTERIM_TRANSCRIPT;

                    console.log(`[Gladia] ${isFinal ? 'FINAL' : 'INTERIM'} transcript:`, text);

                    this.queue.put({
                        type: eventType,
                        alternatives: [{
                            text: text,
                            language: utterance.language || this.language || 'unknown',
                            startTime: utterance.start || 0,
                            endTime: utterance.end || 0,
                            confidence: utterance.confidence || 0.9
                        }],
                    });
                }
                break;

            case 'error':
                console.error('[Gladia] Error:', msg.data || msg.error);
                break;

            case 'start_session':
            case 'start_recording':
            case 'end_recording':
            case 'end_session':
                console.log('[Gladia] Lifecycle event:', msg.type);
                break;

            default:
                console.log('[Gladia] Unhandled message:', JSON.stringify(msg).substring(0, 200));
        }
    }
}

export class GladiaSTT extends stt.STT {
    label = 'gladia';

    constructor(options) {
        super({
            streaming: true,
            interimResults: true
        });
        if (!options.apiKey) throw new Error('Gladia API key is required');
        this.apiKey = options.apiKey;
        this.language = options.language || null; // null = auto-detect
    }

    async _recognize(frame, abortSignal) {
        throw new Error('Non-streaming recognition not supported');
    }

    stream(options) {
        return new GladiaSpeechStream(this, this.apiKey, this.language);
    }
}
