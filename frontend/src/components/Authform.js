// frontend/src/components/AuthForm.js
import React, { useState } from 'react';
import axios from 'axios';

// The base URL for your backend API
const API_BASE_URL = 'http://localhost:5000/api'; 

const AuthForm = ({ formType, handleAuth }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const isLogin = formType === 'login';
  const title = isLogin ? 'Sign In' : 'Register';
  const apiEndpoint = isLogin ? '/login' : '/register';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      const response = await axios.post(`${API_BASE_URL}${apiEndpoint}`, {
        email,
        password,
        // Optional: Include role in registration for initial setup
        role: 'Meeting Organizer' // Default role
      });

      if (isLogin) {
        // On successful login
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        handleAuth(true); // Tell App.js to update state and navigate
      } else {
        // On successful registration
        setMessage('Registration successful! Please sign in.');
        setEmail('');
        setPassword('');
      }
    } catch (err) {
      console.error('Auth error:', err);
      // Display specific error from backend or a generic message
      const errorMessage = err.response?.data?.error || `Failed to ${title.toLowerCase()}`;
      setError(errorMessage);
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>{title}</h2>
      <form onSubmit={handleSubmit}>
        <input 
          style={styles.input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={styles.error}>{error}</p>}
        {message && <p style={styles.success}>{message}</p>}
        <button style={styles.button} type="submit">
          {title}
        </button>
      </form>
    </div>
  );
};

// Simple inline styling for a clean look
const styles = {
    card: {
        maxWidth: '400px',
        margin: '50px auto',
        padding: '30px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
        borderRadius: '8px',
        backgroundColor: '#fff',
    },
    title: {
        textAlign: 'center',
        color: '#333',
        marginBottom: '20px',
    },
    input: {
        width: '100%',
        padding: '10px',
        margin: '8px 0',
        boxSizing: 'border-box',
        border: '1px solid #ccc',
        borderRadius: '4px',
    },
    button: {
        width: '100%',
        backgroundColor: '#4CAF50',
        color: 'white',
        padding: '14px 20px',
        margin: '8px 0',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '16px',
    },
    error: {
        color: 'red',
        textAlign: 'center',
    },
    success: {
        color: 'green',
        textAlign: 'center',
    }
};

export default AuthForm;