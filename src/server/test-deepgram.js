const { createClient } = require('@deepgram/sdk');
const path = require('path');
const dotenv = require('dotenv');
const { Readable } = require('stream');

// Load .env file from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testDeepgram() {
    // Log to verify the API key is loaded
    console.log('API Key loaded:', process.env.DEEPGRAM_API_KEY ? 'Yes' : 'No');
    
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    
    try {
        console.log('Creating connection...');
        const connection = deepgram.listen.live({
            model: 'nova-2',
            language: 'en',
            smart_format: true,
            encoding: 'linear16',
            sample_rate: 16000,
            channels: 1,
            interim_results: true,
            punctuate: true,
        });

        // Add listeners for all possible events
        connection.on('open', () => {
            console.log('Connection opened');
            console.log('Ready to receive transcripts. Speaking into the microphone in the browser should now work.');
        });

        connection.on('close', () => console.log('Connection closed'));
        
        connection.on('transcript', (data) => {
            console.log('Transcript event received:', JSON.stringify(data, null, 2));
        });
        
        connection.on('metadata', (metadata) => {
            console.log('Metadata received:', metadata);
        });
        
        connection.on('warning', (warning) => {
            console.log('Warning received:', warning);
        });
        
        connection.on('error', (err) => {
            console.error('Error received:', err);
        });

        // Keep the connection open
        process.on('SIGINT', () => {
            console.log('Closing connection...');
            connection.finish();
            process.exit();
        });

    } catch (error) {
        console.error('Error creating connection:', error);
    }
}

console.log('Starting Deepgram test...');
testDeepgram(); 