

// frontend/src/App.js (Correction)

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// ------------------------------------------------------------------
// OLD (Incorrect): import AuthPage from './pages/Auth';
import AuthPage from './pages/Auth'; 
import Dashboard from './pages/Dashboard';
import ReviewPage from './pages/Review';
// ------------------------------------------------------------------
import MeetingReview from './components/MeetingReview';










// Helper to check for token on load
const checkAuth = () => {
  const token = localStorage.getItem('token');
  return !!token; // Returns true if token exists, false otherwise
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(checkAuth());

  // Function to handle successful login/logout
  const handleAuth = (authStatus) => {
    setIsAuthenticated(authStatus);
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Authentication Route: Accessible if NOT logged in */}
          <Route path="/meeting/:meetingId" element={<MeetingReview />} />
          <Route path="/dashboard" element ={<Dashboard />}></Route>
          <Route 
            path="/auth" 
            element={
              isAuthenticated ? (
                <Navigate to="/" replace /> // Redirect to dashboard if already logged in
              ) : (
                <AuthPage handleAuth={handleAuth} />
              )
            } 
          />
          
          {/* Protected Dashboard Route: Only accessible if logged in */}
          <Route 
            path="/" 
            element={
              isAuthenticated ? (
                <Dashboard handleAuth={handleAuth} /> // Passes handleAuth to logout
              ) : (
                <Navigate to="/auth" replace /> // Redirect to login if not logged in
              )
            }
           /> 
          {/* NEW: Protected Review Page Route with ID parameter */}
          <Route 
            path="/meeting/:id" 
            element={
              isAuthenticated ? (
                <ReviewPage /> 
              ) : (
                <Navigate to="/auth" replace /> 
              )
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;