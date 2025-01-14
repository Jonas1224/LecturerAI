const { createClient: createDeepgramClient } = require('@deepgram/sdk');
const { OpenAI } = require('openai');

class DeepgramService {
    constructor(apiKey, deepseekApiKey) {
        if (!apiKey) {
            throw new Error('Deepgram API key is required');
        }
        if (!deepseekApiKey) {
            throw new Error('Deepseek API key is required');
        }
        this.deepgram = createDeepgramClient(apiKey);
        this.deepseek = new OpenAI({
            apiKey: deepseekApiKey,
            baseURL: 'https://api.deepseek.com/v1'
        });
        this.reconnectTimeout = null;
        this.keepAliveInterval = null;
        this.isClosing = false;
        this.targetLanguage = 'original';
        this.translationContext = new Map(); // Store context for each language
    }

    async translate(text, targetLanguage) {
        if (targetLanguage === 'original') return null;

        console.log(`Attempting to translate to ${targetLanguage}:`, text);

        const languageNames = {
            'zh': 'Chinese',
            'ja': 'Japanese'
        };

        const context = this.translationContext.get(targetLanguage) || [];
        
        try {
            const messages = [
                {
                    role: "system",
                    content: `You are a professional translator. Translate the given English text to ${languageNames[targetLanguage]}. 
                    Keep the translation natural and contextually accurate. Only respond with the translation, no explanations.`
                },
                ...context,
                { role: "user", content: text }
            ];

            console.log('Sending translation request to Deepseek:', {
                model: "deepseek-chat",
                messages: messages.length,
                temperature: 0.3
            });

            const response = await this.deepseek.chat.completions.create({
                model: "deepseek-chat",
                messages: messages,
                temperature: 0.3,
                max_tokens: 1000
            });

            const translation = response.choices[0].message.content.trim();
            console.log('Received translation:', translation);

            // Update context with the latest pair
            context.push(
                { role: "user", content: text },
                { role: "assistant", content: translation }
            );

            while (context.length > 8) {
                context.shift();
            }

            this.translationContext.set(targetLanguage, context);

            return translation;
        } catch (error) {
            console.error('Translation error:', error);
            return null;
        }
    }

    setTargetLanguage(language) {
        console.log('Setting target language to:', language);
        this.targetLanguage = language;
    }

    async createLiveTranscription(socket) {
        try {
            console.log('Creating Deepgram live transcription...');
            const connection = this.deepgram.listen.live({
                model: 'nova-2',
                language: 'en-US',
                encoding: 'linear16',
                sample_rate: 16000,
                channels: 1,
                smart_format: true,
                interim_results: true,
                punctuate: true,
                endpointing: 500
            });

            this.setupKeepAlive(connection);

            connection.addListener('open', () => {
                console.log('Deepgram connection established');
                socket.emit('connectionStatus', 'Connected to Deepgram');
                this.isClosing = false;
            });

            connection.addListener('Results', async (data) => {
                if (!data?.channel?.alternatives?.[0]?.transcript) return;
                
                const transcript = data.channel.alternatives[0].transcript.trim();
                if (!transcript) return;

                const isFinal = data.is_final || data.speech_final;
                console.log(`Received ${isFinal ? 'final' : 'interim'} transcript:`, transcript);
                console.log('Current target language:', this.targetLanguage);

                // Emit original transcription
                socket.emit('transcription', { 
                    transcript,
                    isFinal,
                    speechFinal: data.speech_final,
                    start: data.start,
                    end: data.end
                });

                // Handle translation if needed
                if (this.targetLanguage !== 'original' && isFinal) {
                    console.log('Starting translation process...');
                    const translation = await this.translate(transcript, this.targetLanguage);
                    console.log('Translation result:', translation);
                    if (translation) {
                        console.log('Emitting translation to client');
                        socket.emit('translation', {
                            translation,
                            isFinal: true
                        });
                    }
                }
            });

            connection.addListener('Error', (error) => {
                console.error('Deepgram error:', error);
                if (!this.isClosing) {
                    this.handleReconnection(socket);
                }
            });

            connection.addListener('Close', () => {
                console.log('Deepgram connection closed');
                if (!this.isClosing) {
                    socket.emit('connectionStatus', 'Disconnected from Deepgram');
                    this.handleReconnection(socket);
                }
            });

            return connection;
        } catch (error) {
            console.error('Error creating Deepgram connection:', error);
            throw error;
        }
    }

    setupKeepAlive(connection) {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
        }

        // Send keep-alive every 5 seconds (half of the 10-second timeout)
        this.keepAliveInterval = setInterval(() => {
            if (connection.getReadyState() === 1) {
                try {
                    // Send KeepAlive message as text
                    connection.send(JSON.stringify({ type: "KeepAlive" }));
                    console.log('Keep-alive sent');
                } catch (error) {
                    console.error('Error sending keep-alive:', error);
                    this.handleReconnection(socket);
                }
            }
        }, 5000);
    }

    handleReconnection(socket) {
        if (this.isClosing) return;

        clearTimeout(this.reconnectTimeout);
        clearInterval(this.keepAliveInterval);
        
        this.reconnectTimeout = setTimeout(async () => {
            try {
                socket.emit('connectionStatus', 'Reconnecting...');
                await this.createLiveTranscription(socket);
            } catch (error) {
                console.error('Reconnection failed:', error);
                socket.emit('error', 'Failed to reconnect to transcription service');
            }
        }, 1000);
    }

    cleanup() {
        this.isClosing = true;
        clearInterval(this.keepAliveInterval);
        clearTimeout(this.reconnectTimeout);
    }
}

module.exports = DeepgramService; 