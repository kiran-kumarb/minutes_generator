// frontend/src/pages/Auth.js
import React, { useState } from 'react';
import AuthForm from '../components/Authform';

const AuthPage = ({ handleAuth }) => {
  const [isLogin, setIsLogin] = useState(true);
  const formType = isLogin ? 'login' : 'register';

  return (
    <div style={styles.container}>
      <h1>Automated Minutes Generator</h1>
      
      <AuthForm formType={formType} handleAuth={handleAuth} />

      <div style={styles.switchContainer}>
        <p>
          {isLogin ? "Don't have an account?" : "Already have an account?"}
        </p>
        <button 
          style={styles.switchButton}
          onClick={() => setIsLogin(!isLogin)}
        >
          {isLogin ? 'Register Here' : 'Sign In Here'}
        </button>
      </div>
    </div>
  );
};

const styles = {
    container: {
        textAlign: 'center',
        padding: '20px',
        fontFamily: 'Arial, sans-serif'
    },
    switchContainer: {
        marginTop: '20px',
    },
    switchButton: {
        background: 'none',
        border: 'none',
        color: '#1e73be',
        cursor: 'pointer',
        textDecoration: 'underline',
        fontSize: '16px',
        marginTop: '5px',
    }
};

export default AuthPage;