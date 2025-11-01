import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

const MeetingReview = () => {
  const { meetingId } = useParams(); 
  const navigate = useNavigate();

  const [meeting, setMeeting] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const token = localStorage.getItem('token');

  // --- Fetch meeting details ---
  const fetchMeetingData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/meetings/${meetingId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = response.data;
      console.log("📘 Current meeting status:", data.status); // ✅ Debug log
      setMeeting(data);
      setTranscript(data.transcript || 'No transcript found yet. Please check status.');
    } catch (err) {
      console.error(err);
      setError('Failed to load meeting details or access denied.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (meetingId) fetchMeetingData();
  }, [meetingId]);

  // --- Save Transcript Changes ---
  const handleSaveTranscript = async () => {
    setLoading(true);
    setSaveMessage('Saving...');
    try {
      await axios.put(
        `${API_BASE_URL}/meetings/${meetingId}/transcript`,
        { transcript: transcript },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      setSaveMessage('Transcript saved successfully!');
      await handleStartExtraction(); // Automatically start extraction
    } catch (err) {
      console.error(err);
      setSaveMessage('Error saving transcript. Please try again.');
    } finally {
      setLoading(false);
      setTimeout(() => setSaveMessage(''), 4000);
    }
  };

  // --- Initiate Extraction (Generate Minutes) ---
  const handleStartExtraction = async () => {
    setLoading(true);
    setSaveMessage("Generating Minutes...");
    try {
      const response = await axios.post(
        `${API_BASE_URL}/meetings/${meetingId}/generate-minutes`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );

      setSaveMessage(response.data.message || "Minutes generated successfully!");

      // 🕒 Wait a moment for backend to update DB, then refetch updated meeting
      setTimeout(async () => {
        await fetchMeetingData();
      }, 1500);

    } catch (err) {
      console.error(err);
      setSaveMessage(err.response?.data?.msg || "Failed to generate minutes.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Download minutes as text file
  const handleDownloadMinutes = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("You must log in first.");
        return;
      }

      if (!meeting || meeting.status !== "Minutes Generated") {
        alert("Minutes are not yet generated. Please save and generate them first.");
        return;
      }

      const response = await axios.get(
        `${API_BASE_URL}/meetings/${meetingId}/download-minutes`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        }
      );

      const blob = new Blob([response.data], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `meeting_${meetingId}_minutes.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading minutes:", error);
      alert("Failed to download minutes. Please ensure you're logged in and the file is ready.");
    }
  };

  if (loading && !meeting) {
    return <div style={styles.container}>Loading meeting details...</div>;
  }

  if (error) {
    return (
      <div style={styles.container}>
        <p style={{ color: "red" }}>{error}</p>
      </div>
    );
  }

  // ✅ Updated allowed statuses list (fixes your frontend condition)
  const ALLOWED_STATUSES = [
    "Ready",
    "Transcript Saved",
    "Action Items Extracted",
    "Minutes Generated",
    "Processing",
  ];

  if (!ALLOWED_STATUSES.includes(meeting.status)) {
    return (
      <div style={styles.container}>
        <h2 style={styles.title}>Meeting ID: {meetingId}</h2>
        <p>
          Status: <strong style={{ color: "#f39c12" }}>{meeting.status}</strong>
        </p>
        <p>
          The transcription is not yet complete or is currently running. Please
          wait and refresh the dashboard.
        </p>
        <button
          onClick={() => navigate("/dashboard")}
          style={styles.buttonSecondary}
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Review Transcript for Meeting ID: {meetingId}</h1>
      <p>
        Status: <strong style={{ color: "#27ae60" }}>{meeting.status}</strong>
      </p>
      <p style={styles.metadata}>
        Title: {meeting.title || "Untitled Meeting"}
      </p>
      <p style={styles.metadata}>
        Uploaded on: {new Date(meeting.created_at).toLocaleString()}
      </p>

      <div style={{ ...styles.controlGroup, marginBottom: "20px" }}>
        <button
          onClick={() => navigate("/dashboard")}
          style={styles.buttonSecondary}
        >
          ← Back to Dashboard
        </button>
        <button
          onClick={handleSaveTranscript}
          disabled={loading}
          style={styles.buttonPrimary}
        >
          {loading && saveMessage.startsWith("Saving")
            ? "Saving..."
            : "Save & Generate Minutes"}
        </button>
      </div>

      {saveMessage && <p style={styles.saveMessage}>{saveMessage}</p>}

      <h2 style={styles.subtitle}>Editable Transcript</h2>
      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        style={styles.textarea}
        rows="20"
        placeholder="The meeting transcript will appear here once ready..."
      />

      {/* ✅ Display generated minutes only when available */}
      {meeting.status === "Minutes Generated" && (
        <div style={{ marginTop: "40px" }}>
          <h2 style={styles.subtitle}>Generated Minutes</h2>
          <pre
            style={{
              background: "#f9f9f9",
              border: "1px solid #ccc",
              padding: "15px",
              borderRadius: "8px",
              whiteSpace: "pre-wrap",
              fontFamily: "monospace",
              maxHeight: "400px",
              overflowY: "auto",
            }}
          >
            {meeting.minutes_document || "Minutes not found yet."}
          </pre>

          <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
            <button
              onClick={handleDownloadMinutes}
              style={styles.buttonPrimary}
            >
              ⬇️ Download Minutes (.txt)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Inline Styles ---
const styles = {
  container: {
    maxWidth: '1000px',
    margin: '40px auto',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    backgroundColor: '#fff',
    fontFamily: 'Arial, sans-serif'
  },
  title: {
    borderBottom: '2px solid #3498db',
    paddingBottom: '10px',
    marginBottom: '20px',
    color: '#2c3e50'
  },
  subtitle: {
    marginTop: '30px',
    marginBottom: '10px',
    color: '#34495e'
  },
  metadata: {
    fontSize: '0.9em',
    color: '#7f8c8d'
  },
  textarea: {
    width: '100%',
    padding: '15px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    resize: 'vertical',
    fontSize: '1em',
    lineHeight: '1.6',
    boxSizing: 'border-box'
  },
  controlGroup: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '15px'
  },
  buttonPrimary: {
    padding: '12px 25px',
    backgroundColor: '#27ae60',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'background-color 0.3s'
  },
  buttonSecondary: {
    padding: '12px 25px',
    backgroundColor: '#95a5a6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.3s'
  },
  saveMessage: {
    textAlign: 'center',
    fontWeight: 'bold',
    color: '#27ae60',
    marginBottom: '15px'
  }
};

export default MeetingReview;
