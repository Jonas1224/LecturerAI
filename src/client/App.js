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
        socket.on('transcription', (data) => {
            setTranscription(data.transcript);
        });

        socket.on('connectionStatus', (status) => {
            setConnectionStatus(status);
        });

        socket.on('error', (errorMessage) => {
            setError(errorMessage);
            setIsRecording(false);
        });

        return () => {
            socket.off('transcription');
            socket.off('connectionStatus');
            socket.off('error');
        };
    }, []);

    const toggleRecording = () => {
        if (!isRecording) {
            socket.emit('startTranscription');
            setTranscription('');
            setError('');
        } else {
            socket.emit('stopTranscription');
        }
        setIsRecording(!isRecording);
    };

    return (
        <div className="App">
            <h1>Real-time Audio Transcription</h1>
            
            {error && <div className="error-message">{error}</div>}
            
            <button 
                onClick={toggleRecording}
                className={isRecording ? 'recording' : ''}
            >
                {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>

            <AudioRecorder 
                socket={socket} 
                isRecording={isRecording}
                onError={setError}
            />
            
            <TranscriptionDisplay 
                transcription={transcription}
                connectionStatus={connectionStatus}
            />
        </div>
    );
}

export default App; 