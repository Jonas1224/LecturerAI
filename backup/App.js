import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import AudioRecorder from './components/AudioRecorder';
import './App.css';

const socket = io('http://localhost:3001');

const LANGUAGES = {
    'original': 'Original',
    'zh': 'Chinese (中文)',
    'ja': 'Japanese (日本語)'
};

function App() {
    const [isRecording, setIsRecording] = useState(false);
    const [transcription, setTranscription] = useState('');
    const [connectionStatus, setConnectionStatus] = useState('Disconnected');
    const [error, setError] = useState('');
    const [targetLanguage, setTargetLanguage] = useState('original');

    useEffect(() => {
        socket.on('transcription', (data) => {
            console.log('Received transcription:', data);
            setTranscription(prev => {
                const lines = prev.split('\n').filter(line => !line.startsWith('[interim]'));
                const finalText = lines.join(' ').trim();

                if (data.isFinal || data.speechFinal) {
                    let newText = data.transcript;
                    if (!/[.!?]$/.test(newText)) {
                        newText += '.';
                    }
                    return finalText ? `${finalText} ${newText}` : newText;
                }
                
                return finalText ? `${finalText}\n[interim] ${data.transcript}` : `[interim] ${data.transcript}`;
            });
        });

        socket.on('translation', (data) => {
            console.log('Received translation:', data);
            setTranscription(prev => {
                const lines = prev.split('\n').filter(line => !line.startsWith('[interim]'));
                const finalText = lines.join(' ').trim();

                if (data.isFinal) {
                    return finalText ? `${finalText} ${data.translation}` : data.translation;
                }
                
                return finalText ? `${finalText}\n[interim] ${data.translation}` : `[interim] ${data.translation}`;
            });
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
            socket.off('translation');
            socket.off('connectionStatus');
            socket.off('error');
        };
    }, []);

    const toggleRecording = () => {
        if (!isRecording) {
            setError('');
            console.log('Starting transcription with language:', targetLanguage);
            socket.emit('startTranscription', { targetLanguage });
        } else {
            socket.emit('stopTranscription');
        }
        setIsRecording(!isRecording);
    };

    const handleLanguageChange = (e) => {
        const newLanguage = e.target.value;
        console.log('Language changed to:', newLanguage);
        setTargetLanguage(newLanguage);
        if (isRecording) {
            console.log('Emitting changeLanguage event:', { targetLanguage: newLanguage });
            socket.emit('changeLanguage', { targetLanguage: newLanguage });
        }
    };

    return (
        <div className="App">
            <h1>Real-time Audio Transcription</h1>
            
            <div className="controls">
                <div className="control-group">
                    <label htmlFor="language-select">Translation Language:</label>
                    <select 
                        id="language-select"
                        value={targetLanguage} 
                        onChange={handleLanguageChange}
                        className="language-select"
                    >
                        {Object.entries(LANGUAGES).map(([code, name]) => (
                            <option key={code} value={code}>{name}</option>
                        ))}
                    </select>
                </div>

                <button 
                    onClick={toggleRecording}
                    className={isRecording ? 'recording' : ''}
                >
                    {isRecording ? 'Stop Recording' : 'Start Recording'}
                </button>
            </div>

            <div className="status">Connection: {connectionStatus}</div>
            {error && <div className="error">{error}</div>}

            <div className="transcription">
                <h2>Transcription{targetLanguage !== 'original' ? ' & Translation' : ''}:</h2>
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