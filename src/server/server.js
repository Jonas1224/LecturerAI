require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const DeepgramService = require('./deepgram');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

app.use(cors());

// Verify API key exists
if (!process.env.DEEPGRAM_API_KEY) {
    console.error('DEEPGRAM_API_KEY is not set in environment variables');
    process.exit(1);
}

let deepgramService;
try {
    deepgramService = new DeepgramService(process.env.DEEPGRAM_API_KEY);
} catch (error) {
    console.error('Failed to initialize Deepgram service:', error);
    process.exit(1);
}

io.on('connection', (socket) => {
    console.log('Client connected');
    let deepgramLive;

    socket.on('startTranscription', async () => {
        try {
            if (deepgramLive) {
                deepgramLive.finish();
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait for connection to close
            }
            deepgramLive = await deepgramService.createLiveTranscription(socket);
        } catch (error) {
            console.error('Failed to start transcription:', error);
            socket.emit('error', 'Failed to start transcription. Please try again.');
        }
    });

    socket.on('audioData', async (data) => {
        if (!deepgramLive || deepgramLive.getReadyState() !== 1) {
            if (!deepgramLive) {
                try {
                    deepgramLive = await deepgramService.createLiveTranscription(socket);
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error('Connection timeout'));
                        }, 5000);

                        const checkConnection = setInterval(() => {
                            if (deepgramLive.getReadyState() === 1) {
                                clearInterval(checkConnection);
                                clearTimeout(timeout);
                                resolve();
                            }
                        }, 100);
                    });
                } catch (error) {
                    console.error('Failed to create connection:', error);
                    socket.emit('error', 'Failed to connect to transcription service');
                    return;
                }
            } else {
                socket.emit('connectionStatus', 'Connection not ready');
                return;
            }
        }

        try {
            deepgramLive.send(data);
        } catch (error) {
            console.error('Error sending data to Deepgram:', error);
            if (deepgramLive.getReadyState() === 3) {
                deepgramLive = null;
                socket.emit('connectionStatus', 'Reconnecting...');
                socket.emit('startTranscription');
            }
        }
    });

    socket.on('stopTranscription', () => {
        if (deepgramLive) {
            deepgramService.cleanup();
            deepgramLive.finish();
            deepgramLive = null;
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        if (deepgramLive) {
            deepgramService.cleanup();
            deepgramLive.finish();
            deepgramLive = null;
        }
    });
});

const PORT = process.env.SERVER_PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 