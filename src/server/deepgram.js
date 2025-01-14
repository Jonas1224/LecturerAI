const { createClient } = require('@deepgram/sdk');

class DeepgramService {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('Deepgram API key is required');
        }
        this.deepgram = createClient(apiKey);
        this.reconnectTimeout = null;
        this.keepAliveInterval = null;
        this.isClosing = false;
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

            // Setup keep-alive as soon as connection is created
            this.setupKeepAlive(connection);

            connection.addListener('open', () => {
                console.log('Deepgram connection established');
                socket.emit('connectionStatus', 'Connected to Deepgram');
                this.isClosing = false;
            });

            connection.addListener('Results', (data) => {
                if (!data?.channel?.alternatives?.[0]?.transcript) return;
                
                const transcript = data.channel.alternatives[0].transcript.trim();
                if (!transcript) return;

                const isFinal = data.is_final || data.speech_final;
                console.log(`Received ${isFinal ? 'final' : 'interim'} transcript:`, transcript);

                socket.emit('transcription', { 
                    transcript,
                    isFinal,
                    speechFinal: data.speech_final,
                    start: data.start,
                    end: data.end
                });
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