// frontend/src/pages/Dashboard.js (FINAL VERSION - FIXING IMPORT TYPO)
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Uploader from '../components/Uploader'; 

const API_BASE_URL = 'http://localhost:5000/api';

const Dashboard = ({ handleAuth }) => {
    const user = JSON.parse(localStorage.getItem('user'));
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState(''); 

    // Fetch the list of meetings when the component mounts or when a new meeting is added
    const fetchMeetings = async (search = '') => { 
        setLoading(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            
            // Construct the URL, adding ?search= if a term exists
            const url = search 
                ? `${API_BASE_URL}/meetings?search=${encodeURIComponent(search)}`
                : `${API_BASE_URL}/meetings`;

            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setMeetings(response.data);
        } catch (err) {
            setError('Failed to load meeting list.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Debounce the search to prevent spamming the server on every keystroke
        const delaySearch = setTimeout(() => {
            fetchMeetings(searchTerm);
        }, 500); 

        return () => clearTimeout(delaySearch); // Cleanup function
    }, [searchTerm]); 

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        handleAuth(false); 
    };
    
    const handleUploadSuccess = () => {
        // Re-fetch the list to show the newly added meeting record
        fetchMeetings(searchTerm); 
    };
    
    const handleTranscribe = async (meetingId) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_BASE_URL}/meetings/transcribe/${meetingId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            alert(response.data.message);
            fetchMeetings(searchTerm); // Refresh list to update status
        } catch (err) {
            alert(err.response?.data?.msg || 'Transcription failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMeeting = async (meetingId, meetingTitle) => {
        const confirmed = window.confirm(
            `⚠️ WARNING: Are you sure you want to delete the meeting "${meetingTitle}" (ID: ${meetingId})? This action is permanent and will delete the minutes and associated audio file.`
        );
        
        if (!confirmed) {
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.delete(`${API_BASE_URL}/meetings/${meetingId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            alert(response.data.msg);
            fetchMeetings(searchTerm); // Refresh list
        } catch (err) {
            alert(err.response?.data?.msg || 'Deletion failed.');
        } finally {
            setLoading(false);
        }
    };


    // --- Pattern Manager Component ---
    const PatternManager = ({ user }) => {
        // HOOKS ARE CALLED UNCONDITIONALLY FIRST
        const [patterns, setPatterns] = useState([]);
        const [newPatternValue, setNewPatternValue] = useState('');
        const [newPatternType, setNewPatternType] = useState('action_item_keyword'); 
        const [pmMessage, setPmMessage] = useState('');
        const [pmLoading, setPmLoading] = useState(false);

        const token = localStorage.getItem('token');

        const fetchPatterns = async () => {
            setPmLoading(true);
            try {
                const response = await axios.get(`${API_BASE_URL}/admin/patterns`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setPatterns(response.data);
            } catch (err) {
                setPmMessage('Failed to load patterns. Check backend logs.');
            } finally {
                setPmLoading(false);
            }
        };

        // DEFINED HERE: handleAddPattern
        const handleAddPattern = async () => {
            if (!newPatternValue) return;
            setPmLoading(true);
            try {
                await axios.post(`${API_BASE_URL}/admin/patterns`, {
                    pattern_type: newPatternType,
                    pattern_value: newPatternValue
                }, { headers: { 'Authorization': `Bearer ${token}` } });
                setNewPatternValue('');
                setPmMessage('Pattern added!');
                fetchPatterns();
            } catch (err) {
                setPmMessage('Error adding pattern.');
            } finally {
                setPmLoading(false);
                setTimeout(() => setPmMessage(''), 3000);
            }
        };

        // DEFINED HERE: handleDeletePattern
        const handleDeletePattern = async (patternId) => {
            setPmLoading(true);
            try {
                await axios.delete(`${API_BASE_URL}/admin/patterns/${patternId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setPmMessage('Pattern deleted!');
                fetchPatterns();
            } catch (err) {
                setPmMessage('Error deleting pattern.');
            } finally {
                setPmLoading(false);
                setTimeout(() => setPmMessage(''), 3000);
            }
        };

        useEffect(() => {
            if (user && user.role === 'admin') {
                 fetchPatterns();
            }
        }, [user]); 

        // CONDITIONAL RETURN IS SAFE HERE
        if (user.role !== 'admin') return null; 

        return (
            <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '30px', backgroundColor: '#f9f9f9' }}>
                <h3>🔑 Admin: Keyword Extraction Patterns</h3>
                {pmMessage && <p style={{ color: pmMessage.includes('Error') ? 'red' : 'green' }}>{pmMessage}</p>}
                
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center' }}>
                    <select 
                        value={newPatternType}
                        onChange={(e) => setNewPatternType(e.target.value)}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    >
                        <option value="action_item_keyword">Action Item Keyword</option>
                        <option value="decision_keyword">Decision Keyword</option>
                    </select>
                    <input
                        type="text"
                        placeholder="New Pattern Value (e.g., must deliver by)"
                        value={newPatternValue}
                        onChange={(e) => setNewPatternValue(e.target.value)}
                        style={{ flexGrow: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                    <button onClick={handleAddPattern} disabled={pmLoading || !newPatternValue}
                        style={{ padding: '8px 15px', backgroundColor: '#8e44ad', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        {pmLoading ? 'Adding...' : 'Add Pattern'}
                    </button>
                </div>

                <h4>Current Patterns:</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#eee' }}>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Type</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Pattern Value</th>
                            <th style={{ padding: '8px' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {patterns.map(p => (
                            <tr key={p.pattern_id} style={{ borderBottom: '1px solid #ddd' }}>
                                <td style={{ padding: '8px' }}>{p.pattern_type}</td>
                                <td style={{ padding: '8px' }}>{p.pattern_value}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                    <button onClick={() => handleDeletePattern(p.pattern_id)} disabled={pmLoading}
                                        style={{ padding: '5px 10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // --- Audit Log Viewer Component (FIXED HOOK VIOLATION) ---
    const AuditLogViewer = ({ user }) => {
        // HOOKS ARE CALLED UNCONDITIONALLY FIRST
        const [logs, setLogs] = useState([]);
        const [logLoading, setLogLoading] = useState(false);
        const [logError, setLogError] = useState('');
        const token = localStorage.getItem('token');

        const fetchLogs = async () => {
            setLogLoading(true);
            setLogError('');
            try {
                const response = await axios.get(`${API_BASE_URL}/admin/logs`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setLogs(response.data);
            } catch (err) {
                setLogError('Failed to load audit logs. Check backend logs.');
            } finally {
                setLogLoading(false);
            }
        };

        // EFFECT IS CALLED UNCONDITIONALLY
        useEffect(() => {
            if (user && user.role === 'admin') {
                fetchLogs();
            }
        }, [user]);
        
        // CONDITIONAL RETURN IS SAFE HERE
        if (user.role !== 'admin') return null; 
        
        const formatDetails = (details) => {
            try {
                const parsed = typeof details === 'string' ? JSON.parse(details) : details;
                return JSON.stringify(parsed, null, 2).replace(/{|}|"/g, '').trim();
            } catch (e) {
                return details;
            }
        };

        return (
            <div style={{ padding: '20px', border: '1px solid #c0392b', borderRadius: '8px', marginTop: '30px', backgroundColor: '#fdf3f2' }}>
                <h3>🕵️ Admin: Recent Audit Logs</h3>
                {logError && <p style={{ color: 'red' }}>{logError}</p>}
                {logLoading ? <p>Loading logs...</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px', fontSize: '0.9em' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#e74c3c', color: 'white' }}>
                                <th style={{ padding: '8px', textAlign: 'left' }}>Time</th>
                                <th style={{ padding: '8px', textAlign: 'left' }}>User ID</th>
                                <th style={{ padding: '8px', textAlign: 'left' }}>Action</th>
                                <th style={{ padding: '8px', textAlign: 'left' }}>Resource</th>
                                <th style={{ padding: '8px', textAlign: 'left' }}>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => (
                                <tr key={log.log_id} style={{ borderBottom: '1px solid #ddd' }}>
                                    <td style={{ padding: '8px' }}>{new Date(log.created_at).toLocaleTimeString()}</td>
                                    <td style={{ padding: '8px' }}>{log.user_id || 'System'}</td>
                                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{log.action_type}</td>
                                    <td style={{ padding: '8px' }}>{log.resource_id || 'N/A'}</td>
                                    <td style={{ padding: '8px', fontSize: '0.9em', whiteSpace: 'pre-wrap' }}>
                                        {formatDetails(log.details)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <button onClick={fetchLogs} style={{ marginTop: '10px', backgroundColor: '#2c3e50', color: 'white', padding: '8px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Refresh Logs
                </button>
            </div>
        );
    };


    const MeetingRow = ({ meeting }) => {
        const date = new Date(meeting.created_at).toLocaleDateString();
        
        let statusStyle = { color: '#333' };
        if (meeting.status === 'Ready') statusStyle.color = '#27ae60';
        if (meeting.status === 'Transcribing') statusStyle.color = '#f39c12';
        if (meeting.status === 'Action Items Extracted') statusStyle.color = '#3498db';
        if (meeting.status === 'Minutes Generated' || meeting.status === 'Finalized') statusStyle.color = '#8e44ad';


        return (
            <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px' }}>{meeting.meeting_id}</td>
                <td style={{ padding: '10px' }}>{meeting.title || `Meeting - ${date}`}</td>
                <td style={{ padding: '10px' }}>{date}</td>
                <td style={{ padding: '10px', ...statusStyle }}>{meeting.status}</td>
                <td style={{ padding: '10px', display: 'flex', gap: '5px' }}>
                    {meeting.status === 'Uploaded' && (
                        <button 
                            onClick={() => handleTranscribe(meeting.meeting_id)}
                            disabled={loading}
                            style={{ padding: '8px 15px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                            {loading ? 'Processing...' : 'Start ASR'}
                        </button>
                    )}
                    {/* Link to Review Page for any status beyond Uploaded */}
                    {meeting.status !== 'Uploaded' && meeting.status !== 'Transcribing' && (
                        <Link to={`/meeting/${meeting.meeting_id}`}>
                            <button 
                                style={{ padding: '8px 15px', backgroundColor: '#2c3e50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Review Progress
                            </button>
                        </Link>
                    )}
                    
                    {/* Delete Button */}
                    <button 
                        onClick={() => handleDeleteMeeting(meeting.meeting_id, meeting.title || `Meeting - ${date}`)}
                        disabled={loading}
                        style={{ padding: '8px 15px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '10px' }}
                    >
                        Delete
                    </button>
                </td>
            </tr>
        );
    };


    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Automated Minutes Generator</h1>
                <button 
                    onClick={handleLogout} 
                    style={{ padding: '10px 20px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                    Logout
                </button>
            </div>
            <p>Logged in as: <strong>{user ? user.email : 'N/A'}</strong> | Role: <strong>{user ? user.role : 'N/A'}</strong></p>
            <hr />

            <Uploader onUploadSuccess={handleUploadSuccess} />

            {/* Admin and System Features */}
            {user && <PatternManager user={user} />}
            {user && <AuditLogViewer user={user} />}

            <div style={{ marginTop: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h2>Meeting History</h2>
                    {/* Search Input */}
                    <input
                        type="text"
                        placeholder="Search by keyword, title, or action item..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ padding: '10px', width: '300px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                </div>
                
                {error && <p style={{ color: 'red' }}>{error}</p>}
                {loading && meetings.length === 0 && <p>Loading meetings...</p>}
                
                {meetings.length === 0 && !loading ? (
                    <p>No meetings found matching your search term. Please upload an audio file or clear the search.</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f2f2f2' }}>
                                <th style={{ padding: '10px', textAlign: 'left' }}>ID</th>
                                <th style={{ padding: '10px', textAlign: 'left' }}>Title (Placeholder)</th>
                                <th style={{ padding: '10px', textAlign: 'left' }}>Date</th>
                                <th style={{ padding: '10px', textAlign: 'left' }}>Status</th>
                                <th style={{ padding: '10px', textAlign: 'left' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {meetings.map(m => <MeetingRow key={m.meeting_id} meeting={m} />)}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
