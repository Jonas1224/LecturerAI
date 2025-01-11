const { createClient } = require('@deepgram/sdk');

class DeepgramService {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('Deepgram API key is required');
        }
        this.deepgram = createClient(apiKey);
        this.lastTranscript = '';
        this.reconnectTimeout = null;
        this.currentUtterance = '';
        this.lastInterimTime = 0;
        this.processedTimestamps = new Set();
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
                endpointing: 500,
                vad_events: true,
                utterance_end_ms: 1000
            });

            connection.addListener('open', () => {
                console.log('Deepgram connection established');
                socket.emit('connectionStatus', 'Connected to Deepgram');
                clearTimeout(this.reconnectTimeout);
                this.currentUtterance = '';
                this.processedTimestamps.clear();
            });

            connection.addListener('Results', (data) => {
                if (!data?.channel?.alternatives?.[0]?.transcript) return;
                
                const transcript = data.channel.alternatives[0].transcript.trim();
                if (!transcript) return;

                const segmentId = `${data.start}-${data.end}-${transcript}`;
                if (this.processedTimestamps.has(segmentId)) {
                    return;
                }

                const now = Date.now();
                const isFinal = data.is_final || data.speech_final;
                
                if (!isFinal && now - this.lastInterimTime < 250) {
                    return;
                }

                if (this.isNewOrUpdatedTranscript(transcript, isFinal)) {
                    console.log(`Emitting ${isFinal ? 'final' : 'interim'} transcript:`, transcript);
                    
                    if (isFinal) {
                        this.lastTranscript = transcript;
                        this.currentUtterance = '';
                        this.processedTimestamps.add(segmentId);
                    } else {
                        this.currentUtterance = transcript;
                        this.lastInterimTime = now;
                    }

                    socket.emit('transcription', { 
                        transcript,
                        isFinal,
                        speechFinal: data.speech_final,
                        start: data.start,
                        end: data.end
                    });
                }
            });

            let lastSpeechStart = 0;
            connection.addListener('SpeechStarted', (data) => {
                const now = Date.now();
                if (now - lastSpeechStart > 1000) {
                    console.log('Speech started:', data);
                    socket.emit('speechStarted', data);
                    lastSpeechStart = now;
                }
            });

            connection.addListener('UtteranceEnd', (data) => {
                console.log('Utterance ended:', data);
                socket.emit('utteranceEnd', data);
                
                connection.send(JSON.stringify({ type: "Finalize" }));
            });

            connection.addListener('Close', () => {
                console.log('Deepgram connection closed');
                socket.emit('connectionStatus', 'Disconnected from Deepgram');
                this.handleReconnection(socket);
            });

            return connection;
        } catch (error) {
            console.error('Error creating Deepgram connection:', error);
            if (error.message.includes('API key')) {
                socket.emit('error', 'Invalid or missing API key');
            } else {
                this.handleReconnection(socket);
            }
            throw error;
        }
    }

    isNewOrUpdatedTranscript(newTranscript, isFinal) {
        if (isFinal) {
            return true;
        }

        if (newTranscript !== this.currentUtterance) {
            if (this.lastTranscript) {
                const similarity = this.calculateSimilarity(this.lastTranscript, newTranscript);
                return similarity < 0.9;
            }
            return true;
        }

        return false;
    }

    calculateSimilarity(str1, str2) {
        const words1 = str1.toLowerCase().split(' ');
        const words2 = str2.toLowerCase().split(' ');
        const intersection = words1.filter(word => words2.includes(word));
        return intersection.length / Math.max(words1.length, words2.length);
    }

    handleReconnection(socket) {
        clearTimeout(this.reconnectTimeout);
        
        this.reconnectTimeout = setTimeout(async () => {
            try {
                socket.emit('connectionStatus', 'Reconnecting...');
                await this.createLiveTranscription(socket);
            } catch (error) {
                console.error('Reconnection failed:', error);
                socket.emit('error', 'Failed to reconnect to transcription service');
            }
        }, 2000);
    }
}

module.exports = DeepgramService; 