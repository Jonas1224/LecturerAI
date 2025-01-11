import React, { useEffect, useRef, useState } from 'react';

const AudioRecorder = ({ socket, isRecording, onError }) => {
    const mediaRecorder = useRef(null);
    const audioContext = useRef(null);
    const audioStream = useRef(null);

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

    const startRecording = async () => {
        try {
            audioStream.current = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    channelCount: 1,
                    sampleRate: 16000
                }
            });

            audioContext.current = new AudioContext();
            const source = audioContext.current.createMediaStreamSource(audioStream.current);
            const processor = audioContext.current.createScriptProcessor(1024, 1, 1);

            source.connect(processor);
            processor.connect(audioContext.current.destination);

            processor.onaudioprocess = (e) => {
                if (!isRecording) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const audioData = convertFloat32ToInt16(inputData);
                socket.emit('audioData', audioData);
            };

        } catch (error) {
            console.error('Error accessing microphone:', error);
            onError('Error accessing microphone. Please check permissions.');
        }
    };

    const stopRecording = () => {
        if (audioStream.current) {
            audioStream.current.getTracks().forEach(track => track.stop());
            audioStream.current = null;
        }
        if (audioContext.current) {
            audioContext.current.close();
            audioContext.current = null;
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

    return null;
};

export default AudioRecorder; 