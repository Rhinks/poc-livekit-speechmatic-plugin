import { stt } from '@livekit/agents';
import WebSocket from 'ws';

class SpeechmaticsSpeechStream extends stt.SpeechStream {
    label = 'speechmatics';

    constructor(sttInstance, apiKey, language) {
        super(sttInstance, 16000);
        this.apiKey = apiKey;
        this.language = language || 'he'; // Default to Hebrew
        this.ws = null;
        this.recognitionStarted = false;
    }

    async run() {
        console.log('[Speechmatics] Starting STT stream...');

        // Connect to Speechmatics WebSocket
        // EU endpoint: wss://eu2.rt.speechmatics.com/v2
        // US endpoint: wss://usa.rt.speechmatics.com/v2
        const wsUrl = `wss://eu2.rt.speechmatics.com/v2`;

        this.ws = new WebSocket(wsUrl, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
            }
        });

        await new Promise((resolve, reject) => {
            this.ws.onopen = () => {
                console.log('[Speechmatics] WebSocket CONNECTED');
                resolve();
            };
            this.ws.onerror = (err) => {
                console.error('[Speechmatics] WebSocket connection ERROR:', err.message);
                reject(err);
            };
        });

        // Set up message handler
        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this._handleMessage(msg);
            } catch (e) {
                console.error('[Speechmatics] Failed to parse message:', e);
            }
        };

        this.ws.onclose = (event) => {
            console.log('[Speechmatics] WebSocket CLOSED, code:', event.code, 'reason:', event.reason);
        };

        this.ws.onerror = (err) => {
            console.error('[Speechmatics] WebSocket error:', err.message);
        };

        // Send StartRecognition message
        const startRecognition = {
            message: 'StartRecognition',
            audio_format: {
                type: 'raw',
                encoding: 'pcm_s16le',
                sample_rate: 16000
            },
            transcription_config: {
                language: this.language,
                enable_partials: true,
                max_delay: 1.0,  // Lower latency
            }
        };

        console.log('[Speechmatics] Sending StartRecognition:', JSON.stringify(startRecognition));
        this.ws.send(JSON.stringify(startRecognition));

        // Wait for RecognitionStarted
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for RecognitionStarted'));
            }, 10000);

            const checkStarted = setInterval(() => {
                if (this.recognitionStarted) {
                    clearTimeout(timeout);
                    clearInterval(checkStarted);
                    resolve();
                }
            }, 100);
        });

        console.log('[Speechmatics] Recognition started, processing audio...');

        // Process audio frames from this.input
        let frameCount = 0;
        for await (const frame of this.input) {
            // Handle flush sentinel
            if (frame === stt.SpeechStream.FLUSH_SENTINEL) {
                continue;
            }

            // Convert audio data to Buffer
            const audioData = Buffer.isBuffer(frame.data)
                ? frame.data
                : Buffer.from(frame.data.buffer || frame.data);

            // Send audio as binary WebSocket frame
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(audioData);
                frameCount++;
                if (frameCount % 100 === 0) {
                    console.log('[Speechmatics] Sent', frameCount, 'audio frames');
                }
            }
        }

        // End of input - send EndOfStream
        console.log('[Speechmatics] Input stream ended, sending EndOfStream');
        if (this.ws.readyState === WebSocket.OPEN) {
            // this.ws.send(JSON.stringify({ message: 'EndOfStream' }));

            this.queue.put({
                type: stt.SpeechEventType.END_OF_SPEECH,
                alternatives: [{
                    text: '',
                    language: this.language,
                    startTime: 0,
                    endTime: 0,
                    confidence: 1.0
                }],
            });
        }

        // Wait for EndOfTranscript
        await new Promise(resolve => setTimeout(resolve, 2000));

        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
    }

    _handleMessage(msg) {
        const messageType = msg.message;
        console.log('[Speechmatics] Message type:', messageType);

        switch (messageType) {
            case 'RecognitionStarted':
                console.log('[Speechmatics] Recognition started, session_id:', msg.id);
                this.recognitionStarted = true;
                this.queue.put({
                    type: stt.SpeechEventType.START_OF_SPEECH,
                    alternatives: [{
                        text: '',
                        language: this.language,
                        startTime: 0,
                        endTime: 0,
                        confidence: 1.0
                    }],
                });
                break;

            case 'AudioAdded':
                // Audio acknowledged - no action needed
                break;

            case 'AddPartialTranscript':
                const partialText = msg.metadata?.transcript || '';
                if (partialText.trim().length > 0) {
                    console.log('[Speechmatics] INTERIM transcript:', partialText);
                    this.queue.put({
                        type: stt.SpeechEventType.INTERIM_TRANSCRIPT,
                        alternatives: [{
                            text: partialText,
                            language: this.language,
                            startTime: msg.metadata?.start_time || 0,
                            endTime: msg.metadata?.end_time || 0,
                            confidence: 0.8
                        }],
                    });
                }
                break;

            case 'AddTranscript':
                const finalText = msg.metadata?.transcript || '';
                if (finalText.trim().length > 0) {
                    console.log('[Speechmatics] FINAL transcript:', finalText);
                    this.queue.put({
                        type: stt.SpeechEventType.FINAL_TRANSCRIPT,
                        alternatives: [{
                            text: finalText,
                            language: this.language,
                            startTime: msg.metadata?.start_time || 0,
                            endTime: msg.metadata?.end_time || 0,
                            confidence: 0.95
                        }],
                    });
                }
                break;

            case 'EndOfTranscript':
                console.log('[Speechmatics] End of transcript received');
                break;

            case 'Warning':
                console.warn('[Speechmatics] Warning:', msg.reason, msg.message);
                break;

            case 'Error':
                console.error('[Speechmatics] Error:', msg.reason, msg.message);
                break;

            case 'Info':
                console.log('[Speechmatics] Info:', msg.type, msg.message);
                break;

            default:
                console.log('[Speechmatics] Unhandled message:', JSON.stringify(msg).substring(0, 200));
        }
    }
}

export class SpeechmaticsSTT extends stt.STT {
    label = 'speechmatics';

    constructor(options) {
        super({
            streaming: true,
            interimResults: true
        });
        if (!options.apiKey) throw new Error('Speechmatics API key is required');
        this.apiKey = options.apiKey;
        this.language = options.language || 'he'; // Default Hebrew
    }

    async _recognize(frame, abortSignal) {
        throw new Error('Non-streaming recognition not supported');
    }

    stream(options) {
        return new SpeechmaticsSpeechStream(this, this.apiKey, this.language);
    }
}
