// frontend/src/pages/Review.js (Updated for Minutes Generation)
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

const API_BASE_URL = 'http://localhost:5000/api';

const ReviewPage = () => {
  const { id } = useParams(); 
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [actionItems, setActionItems] = useState([]); 
  const [minutesDocument, setMinutesDocument] = useState(''); // NEW STATE for minutes
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const token = localStorage.getItem('token');
  
  // ----------------------------------------------------
  // Fetch Meeting Data and Transcript
  // ----------------------------------------------------
  const fetchMeeting = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/meetings/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = response.data;
      setMeeting(data);
      setTranscript(data.transcript || 'No transcript found.');
      setActionItems(data.action_items || []); 
      setMinutesDocument(data.minutes_document || ''); // LOAD MINUTES DOCUMENT
    } catch (err) {
      console.error("Error fetching meeting:", err);
      alert('Could not load meeting details.');
      navigate('/'); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeeting();
  }, [id, token, navigate]);

  // ----------------------------------------------------
  // Save Edited Transcript (Same as before)
  // ----------------------------------------------------
  const handleSave = async () => {
    setSaveMessage('Saving...');
    try {
      await axios.put(`${API_BASE_URL}/meetings/${id}/transcript`, 
        { transcript },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setSaveMessage('Transcript saved successfully!');
      setEditing(false); 
      fetchMeeting(); 
    } catch (err) {
      setSaveMessage('Error saving transcript.');
      console.error('Error saving transcript:', err);
    }
    setTimeout(() => setSaveMessage(''), 3000);
  };
  
  // ----------------------------------------------------
  // Handle Action Item Extraction (Same as before)
  // ----------------------------------------------------
  const handleExtraction = async () => {
      setLoading(true);
      setSaveMessage('Extracting action items...');
      try {
          const response = await axios.post(`${API_BASE_URL}/meetings/${id}/extract`, 
              {}, 
              { headers: { 'Authorization': `Bearer ${token}` } }
          );

          setActionItems(response.data.actionItems);
          setSaveMessage(response.data.message);
          setMeeting(prev => ({...prev, status: response.data.status}))
          
      } catch (err) {
          const msg = err.response?.data?.msg || 'Extraction failed.';
          setSaveMessage(`Error: ${msg}`);
          console.error('Extraction error:', err);
      } finally {
          setLoading(false);
          setTimeout(() => setSaveMessage(''), 5000);
      }
  };

  // ----------------------------------------------------
  // Handle Minutes Generation (NEW FUNCTION)
  // ----------------------------------------------------
  const handleGenerateMinutes = async () => {
      setLoading(true);
      setSaveMessage('Generating final minutes document...');
      try {
          const response = await axios.post(`${API_BASE_URL}/meetings/${id}/generate-minutes`, 
              {}, 
              { headers: { 'Authorization': `Bearer ${token}` } }
          );

          setMinutesDocument(response.data.minutesDocument);
          setSaveMessage(response.data.message);
          setMeeting(prev => ({...prev, status: response.data.status}))
          
      } catch (err) {
          const msg = err.response?.data?.msg || 'Minutes generation failed.';
          setSaveMessage(`Error: ${msg}`);
          console.error('Generation error:', err);
      } finally {
          setLoading(false);
          setTimeout(() => setSaveMessage(''), 5000);
      }
  };

  // ----------------------------------------------------
  // Display Components
  // ----------------------------------------------------
  
  if (loading && !meeting) {
    return <div style={styles.container}>Loading meeting details...</div>;
  }
  
  if (!meeting) {
    return <div style={styles.container}>Meeting not found.</div>;
  }

  // Determine button status based on workflow stage
  const status = meeting.status;
  const showExtractButton = status === 'Ready' || status === 'Uploaded';
  const showGenerateButton = status === 'Action Items Extracted';
  const showFinalMinutes = status === 'Minutes Generated' && minutesDocument;


  return (
    <div style={styles.container}>
      <button onClick={() => navigate('/')} style={styles.backButton}>
        ← Back to Dashboard
      </button>
      
      <h1 style={styles.title}>Review: {meeting.title}</h1>
      <p style={styles.status}>Status: <strong>{status}</strong></p>
      <hr />
      
      {/* --------------------- ACTION BUTTONS --------------------- */}
      <div style={styles.actions}>
        <button 
          onClick={() => setEditing(!editing)} 
          style={editing ? styles.cancelButton : styles.editButton}
          disabled={loading}
        >
          {editing ? 'Cancel Editing' : 'Edit Transcript'}
        </button>
        {editing && (
          <button onClick={handleSave} style={styles.saveButton} disabled={loading}>
            {saveMessage || 'Save Changes'}
          </button>
        )}
        
        {/* Extraction Button Logic */}
        {showExtractButton && (
            <button onClick={handleExtraction} style={styles.extractButton} disabled={loading}>
                {loading && saveMessage.includes('Extracting') ? 'Extracting...' : 'Extract Action Items'}
            </button>
        )}
        
        {/* Generation Button Logic */}
        {showGenerateButton && (
            <button onClick={handleGenerateMinutes} style={styles.generateButton} disabled={loading}>
                {loading && saveMessage.includes('Generating') ? 'Generating...' : 'Generate Minutes'}
            </button>
        )}
        
        {/* Final Export Button (Next Step) */}
        {showFinalMinutes && (
            <button style={styles.exportButton} disabled={loading}>
                Export Minutes (NEXT STEP)
            </button>
        )}
      </div>
      {saveMessage && <p style={{color: saveMessage.includes('Error') ? 'red' : 'green'}}>{saveMessage}</p>}


      {/* --------------------- FINAL MINUTES DOCUMENT --------------------- */}
      {showFinalMinutes && (
          <div style={styles.minutesArea}>
              <h2>Final Minutes Document</h2>
              <div style={styles.documentText}>
                  {minutesDocument}
              </div>
          </div>
      )}


      {/* --------------------- ACTION ITEM DISPLAY --------------------- */}
      <div style={styles.actionItemsArea}>
          <h2>Extracted Action Items ({actionItems.length})</h2>
          {actionItems.length === 0 ? (
              <p>No action items found yet. Process the transcript first.</p>
          ) : (
              <table style={styles.table}>
                  <thead>
                      <tr>
                          <th style={styles.th}>Owner</th>
                          <th style={styles.th}>Task</th>
                          <th style={styles.th}>Due Date</th>
                          <th style={styles.th}>Status</th>
                      </tr>
                  </thead>
                  <tbody>
                      {actionItems.map(item => (
                          <tr key={item.id}>
                              <td style={styles.td}>{item.owner}</td>
                              <td style={styles.td}>{item.task}</td>
                              <td style={styles.td}>{item.dueDate}</td>
                              <td style={styles.td}>{item.status}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          )}
      </div>

      {/* --------------------- TRANSCRIPT AREA --------------------- */}
      <div style={styles.transcriptArea}>
        <h2 style={{fontSize: '1.2em'}}>Full Transcript:</h2>
        {editing ? (
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            style={styles.textArea}
          />
        ) : (
          <div style={styles.readOnlyText}>
             {transcript.split(' ').map((word, index) => {
                const isHighlight = word.includes('Kiran,') || word.includes('Rana,') || word.includes('Kavya,') || word.includes('schedule');
                return (
                    <span key={index} style={isHighlight ? styles.highlight : {}}>
                        {word}{' '}
                    </span>
                );
             })}
          </div>
        )}
      </div>

    </div>
  );
};

// Simple inline styling (Added table styles and highlight style)
const styles = {
    container: {
        padding: '30px',
        fontFamily: 'Arial, sans-serif',
        maxWidth: '900px',
        margin: '0 auto',
    },
    backButton: {
        background: 'none',
        border: 'none',
        color: '#3498db',
        cursor: 'pointer',
        marginBottom: '20px',
    },
    title: {
        color: '#2c3e50',
    },
    status: {
        fontSize: '1.1em',
    },
    actions: {
        marginBottom: '20px',
        display: 'flex',
        gap: '10px'
    },
    editButton: {
        backgroundColor: '#f39c12',
        color: 'white',
        padding: '10px 15px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
    },
    cancelButton: {
        backgroundColor: '#e74c3c',
        color: 'white',
        padding: '10px 15px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
    },
    saveButton: {
        backgroundColor: '#27ae60',
        color: 'white',
        padding: '10px 15px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
    },
    extractButton: {
        backgroundColor: '#3498db',
        color: 'white',
        padding: '10px 15px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
    },
    generateButton: {
        backgroundColor: '#8e44ad', // Purple for generation
        color: 'white',
        padding: '10px 15px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
    },
    exportButton: {
        backgroundColor: '#2c3e50',
        color: 'white',
        padding: '10px 15px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        marginLeft: 'auto',
    },
    transcriptArea: {
        marginTop: '40px',
        padding: '20px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: '#fff',
    },
    actionItemsArea: {
        marginTop: '20px',
        padding: '20px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: '#f9f9f9',
    },
    minutesArea: {
        marginTop: '20px',
        padding: '20px',
        border: '2px solid #8e44ad', // Highlight with purple border
        borderRadius: '8px',
        backgroundColor: '#fefefe',
    },
    documentText: {
        whiteSpace: 'pre-wrap', 
        minHeight: '200px',
        padding: '15px',
        backgroundColor: '#f4f6f6',
        border: '1px solid #ccc',
        borderRadius: '4px',
        lineHeight: '1.6',
        fontSize: '1.1em',
    },
    textArea: {
        width: '100%',
        minHeight: '300px',
        padding: '15px',
        fontSize: '1em',
        border: '1px solid #ccc',
        borderRadius: '4px',
        boxSizing: 'border-box',
    },
    readOnlyText: {
        whiteSpace: 'pre-wrap', 
        minHeight: '300px',
        padding: '15px',
        backgroundColor: '#ecf0f1',
        border: '1px solid #ccc',
        borderRadius: '4px',
        lineHeight: '1.6',
    },
    highlight: { 
        backgroundColor: '#ffeaa7',
        fontWeight: 'bold',
        padding: '2px 0'
    },
    table: {
        width: '100%', 
        borderCollapse: 'collapse', 
        marginTop: '15px'
    },
    th: {
        padding: '10px', 
        textAlign: 'left', 
        backgroundColor: '#eee', 
        borderBottom: '2px solid #ccc'
    },
    td: {
        padding: '10px', 
        borderBottom: '1px solid #eee'
    }
};

export default ReviewPage;