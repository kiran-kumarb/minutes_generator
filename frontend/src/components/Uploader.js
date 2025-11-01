// frontend/src/components/Uploader.js
import React, { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

const Uploader = ({ onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Basic client-side validation for user feedback
      if (selectedFile.type === 'audio/mpeg' || selectedFile.type === 'audio/wav' || selectedFile.type === 'audio/x-wav') {
        setFile(selectedFile);
        setError('');
      } else {
        setFile(null);
        setError('Invalid file format. Only MP3 and WAV files are allowed.');
      }
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select an audio file.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    // FormData is required for sending file data via POST request
    const formData = new FormData();
    // 'meetingAudio' must match the fieldname in backend's upload.single('meetingAudio')
    formData.append('meetingAudio', file); 

    try {
      const token = localStorage.getItem('token');
      
      const response = await axios.post(`${API_BASE_URL}/meetings/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          // Pass the JWT token for authentication (Auth story)
          'Authorization': `Bearer ${token}` 
        },
        // Optional: Show upload progress
        onUploadProgress: (progressEvent) => {
          // You could display a progress bar here
        }
      });

      setMessage(response.data.message + ` File: ${response.data.fileName}`);
      onUploadSuccess(response.data.fileName); // Notify parent component

    } catch (err) {
      const errorMessage = err.response?.data?.msg || err.response?.data?.error || 'Upload failed due to a server error.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Upload Meeting Audio 🎙️</h3>
      <p>Supports: MP3 or WAV (Max 50MB)</p>
      
      <form onSubmit={handleUpload}>
        <input 
          style={styles.input}
          type="file" 
          accept="audio/mp3,audio/wav" 
          onChange={handleFileChange} 
          required
        />
        
        {file && !error && <p style={styles.fileInfo}>Selected: {file.name} ({Math.round(file.size / 1024 / 1024 * 10) / 10} MB)</p>}
        
        {error && <p style={styles.error}>{error}</p>}
        {message && <p style={styles.success}>{message}</p>}
        
        <button 
          style={styles.button} 
          type="submit" 
          disabled={loading || !file}
        >
          {loading ? 'Uploading...' : 'Start Upload'}
        </button>
      </form>
    </div>
  );
};

// Simple inline styling
const styles = {
    card: {
        maxWidth: '600px',
        margin: '20px 0',
        padding: '20px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: '#f9f9f9',
    },
    title: {
        color: '#2c3e50',
    },
    input: {
        width: '100%',
        padding: '10px 0',
        margin: '10px 0',
        boxSizing: 'border-box',
    },
    button: {
        backgroundColor: '#3498db',
        color: 'white',
        padding: '12px 20px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '16px',
        marginTop: '10px',
        width: '100%',
    },
    error: {
        color: '#e74c3c',
        textAlign: 'center',
    },
    success: {
        color: '#27ae60',
        textAlign: 'center',
    },
    fileInfo: {
        color: '#7f8c8d',
        fontSize: '0.9em'
    }
};

export default Uploader;