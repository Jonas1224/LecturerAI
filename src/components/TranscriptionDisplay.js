import React from 'react';

const TranscriptionDisplay = ({ transcription, connectionStatus }) => {
    return (
        <div className="transcription-container">
            <div className="status-bar">
                Connection Status: {connectionStatus}
            </div>
            <div className="transcription-text">
                {transcription || 'Waiting for speech...'}
            </div>
        </div>
    );
};

export default TranscriptionDisplay; 