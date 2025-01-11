import React, { useEffect, useRef } from 'react';

const AudioRecorder = ({ socket, isRecording, onError }) => {
    const mediaRecorder = useRef(null);
    const audioStream = useRef(null);
    const audioContext = useRef(null);
    const analyser = useRef(null);
    const dataArray = useRef(null);
    const silenceStart = useRef(null);
    const SILENCE_THRESHOLD = 0.015;
    const SILENCE_DURATION = 1000; // 1 second

    useEffect(() => {
        if (isRecording) {
            startRecording();
        } else {
            stopRecording();
        }

        return () => {
            stopRecording();
        };
    }, [isRecording]);

    const detectSpeech = () => {
        if (!analyser.current || !dataArray.current) return false;
        
        analyser.current.getFloatTimeDomainData(dataArray.current);
        const rms = Math.sqrt(
            dataArray.current.reduce((sum, val) => sum + val * val, 0) / dataArray.current.length
        );
        
        return rms > SILENCE_THRESHOLD;
    };

    const startRecording = async () => {
        try {
            console.log('Starting audio recording...');
            audioStream.current = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    channelCount: 1,
                    sampleRate: 16000
                }
            });

            // Set up audio analysis
            audioContext.current = new AudioContext({ sampleRate: 16000 });
            const source = audioContext.current.createMediaStreamSource(audioStream.current);
            const processor = audioContext.current.createScriptProcessor(4096, 1, 1);
            
            analyser.current = audioContext.current.createAnalyser();
            analyser.current.fftSize = 2048;
            
            source.connect(analyser.current);
            analyser.current.connect(processor);
            processor.connect(audioContext.current.destination);
            
            dataArray.current = new Float32Array(analyser.current.fftSize);

            processor.onaudioprocess = (e) => {
                if (!isRecording) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const isSpeaking = detectSpeech(inputData);
                
                if (isSpeaking) {
                    silenceStart.current = null;
                    const audioData = convertFloat32ToInt16(inputData);
                    console.log('Speech detected, sending audio data:', audioData.byteLength, 'bytes');
                    socket.emit('audioData', audioData);
                } else {
                    if (!silenceStart.current) {
                        silenceStart.current = Date.now();
                    } else if (Date.now() - silenceStart.current > SILENCE_DURATION) {
                        console.log('Silence detected');
                    }
                }
            };

        } catch (error) {
            console.error('Error accessing microphone:', error);
            onError('Error accessing microphone. Please check permissions.');
        }
    };

    const convertFloat32ToInt16 = (float32Array) => {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array.buffer;
    };

    const stopRecording = () => {
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
        }
        if (audioStream.current) {
            audioStream.current.getTracks().forEach(track => track.stop());
            audioStream.current = null;
        }
        if (audioContext.current) {
            audioContext.current.close();
            audioContext.current = null;
        }
        analyser.current = null;
        dataArray.current = null;
        silenceStart.current = null;
    };

    return null;
};

export default AudioRecorder; 