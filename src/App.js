import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import AudioRecorder from './components/AudioRecorder';
import TranscriptionDisplay from './components/TranscriptionDisplay';
import './App.css';

const socket = io('http://localhost:3001');

function App() {
    const [isRecording, setIsRecording] = useState(false);
    const [transcription, setTranscription] = useState('');
    const [connectionStatus, setConnectionStatus] = useState('Disconnected');
    const [error, setError] = useState('');

    useEffect(() => {
        // Socket event listeners
        socket.on('transcription', (data) => {
            console.log('Received transcription:', data);
            setTranscription(prev => {
                const lines = prev.split('\n').filter(line => !line.startsWith('[interim]'));
                const finalText = lines.join(' ').trim();

                if (data.isFinal || data.speechFinal) {
                    // Add proper punctuation if missing
                    let newText = data.transcript;
                    if (!/[.!?]$/.test(newText)) {
                        newText += '.';
                    }
                    return finalText ? `${finalText} ${newText}` : newText;
                }
                
                // For interim results, show only the latest one
                return finalText ? `${finalText}\n[interim] ${data.transcript}` : `[interim] ${data.transcript}`;
            });
        });

        // Remove duplicate event listeners
        socket.on('speechStarted', (data) => {
            console.log('Speech started:', data);
        });

        socket.on('utteranceEnd', (data) => {
            console.log('Utterance ended:', data);
        });

        socket.on('connectionStatus', (status) => {
            console.log('Connection status:', status);
            setConnectionStatus(status);
        });

        socket.on('error', (errorMessage) => {
            console.error('Socket error:', errorMessage);
            setError(errorMessage);
        });

        return () => {
            socket.off('transcription');
            socket.off('connectionStatus');
            socket.off('error');
        };
    }, []);

    const toggleRecording = () => {
        if (!isRecording) {
            setError('');
            socket.emit('startTranscription');
        } else {
            socket.emit('stopTranscription');
        }
        setIsRecording(!isRecording);
    };

    return (
        <div className="App">
            <h1>Real-time Audio Transcription</h1>
            
            <div className="status">Connection: {connectionStatus}</div>
            {error && <div className="error">{error}</div>}
            
            <button 
                onClick={toggleRecording}
                className={isRecording ? 'recording' : ''}
            >
                {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>

            <div className="transcription">
                <h2>Transcription:</h2>
                <p>{transcription || 'No transcription yet...'}</p>
            </div>

            <AudioRecorder 
                socket={socket} 
                isRecording={isRecording}
                onError={setError}
            />
        </div>
    );
}

export default App; 