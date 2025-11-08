// backend/index.js

// 1. Core setup and configuration
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer'); // Required for file uploads
const path = require('path');     // Required for file paths/storage
const fs = require('fs');         // Required for creating the uploads folder
// Removed: const axios = require('axios');
// Removed: const OpenAI = require("openai"); 
const { spawn } = require('child_process'); // NEW: For running the Python script


const app = express();
const PORT = process.env.PORT || 5000;

// Initialize the DB pool
const pool = new Pool({
    user: 'postgres', // Your DB_USER
    host: 'localhost', // Your DB_HOST
    database: 'minutes_generator', // Your DB_DATABASE
    password:  // <--- YOUR SPECIFIC PASSWORD HERE (NO QUOTES)
    port: 5432, // Your DB_PORT
});

// 2. Middleware
app.use(cors()); 
app.use(express.json()); 

// =========================================================
// 3. FILE STORAGE CONFIGURATION (Multer Setup)
// =========================================================

// Define where multer should store the files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Create an 'uploads' folder if it doesn't exist
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir); 
    },
    filename: function (req, file, cb) {
        // Use the current timestamp to ensure unique file names
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Configure multer with file validation
const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Only MP3 and WAV files allowed
        if (file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/wav' || file.mimetype === 'audio/x-wav') {
            cb(null, true); 
        } else {
            cb(null, false); 
            // Pass an error object to Multer's callback for custom error handling
            return cb(new Error('Only MP3 and WAV format allowed!'));
        }
    },
    limits: { fileSize: 1024 * 1024 * 50 } // Limit file size to 50MB
});

// =========================================================
// 4. HELPER MIDDLEWARE (Authentication/Protection) & Audit Log
// =========================================================

// Middleware to verify JWT token and protect routes
const auth = (req, res, next) => {
    // Look for token in 'x-auth-token' or 'Authorization: Bearer <token>'
    const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    // Verify token
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user; // Attach user info (id, role) to the request
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

// Middleware to verify the user is an admin
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ msg: 'Access denied. Administrator role required.' });
    }
};

// Helper function to write an entry to the audit_logs table
const logAuditAction = async (user_id, action_type, resource_id, details) => {
    try {
        await pool.query(
            `INSERT INTO audit_logs (user_id, action_type, resource_id, details) 
             VALUES ($1, $2, $3, $4::jsonb)`,
            [user_id, action_type, resource_id, JSON.stringify(details)]
        );
    } catch (error) {
        // Log the error but don't stop the main request
        console.error('Failed to write to audit log:', error);
    }
};

// =========================================================
// 5. PYTHON-BASED TRANSCRIPTION LOGIC (SpeechRecognition/pydub)
// =========================================================

/**
 * Executes the Python script (transcribe.py) to process and transcribe the audio file.
 * @param {string} filePath - Local path to the audio file.
 * @returns {Promise<string>} - The generated transcript text.
 */
const transcribeAudio = (filePath) => {
    return new Promise((resolve, reject) => {
        console.log(`🎧 Starting Python transcription for: ${filePath}`);
        
        // Execute the python script with the audio file path as an argument
        const pythonProcess = spawn('python', [path.join(__dirname, 'transcribe.py'), filePath]);

        let transcript = '';
        let errorData = '';

        // Capture output from Python script (the transcript, printed to stdout)
        pythonProcess.stdout.on('data', (data) => {
            transcript += data.toString();
        });

        // Capture errors from Python (e.g., script errors, pydub errors, printed to stderr)
        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
        });

        // Handle process exit
        pythonProcess.on('close', (code) => {
            if (code === 0) {
                console.log("✅ Python transcription completed successfully.");
                resolve(transcript.trim());
            } else {
                console.error(`❌ Python script exited with code ${code}.`);
                console.error('Python Stderr:', errorData);
                // The Python script handles its own temp file cleanup on error
                reject(new Error(`Transcription failed. Python Error: ${errorData || 'Unknown process error.'}`));
            }
        });

        // Handle process launch errors (e.g., 'python' command not found)
        pythonProcess.on('error', (err) => {
            console.error('Failed to start Python process:', err);
            reject(new Error(`Failed to execute Python transcription process: ${err.message}. Is Python/FFmpeg installed and in PATH?`));
        });
    });
};


// =========================================================
// 6. API ROUTES FOR AUTHENTICATION
// =========================================================

// POST /api/register - Allows a new user to sign up
app.post('/api/register', async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const result = await pool.query(
            'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING user_id, email, role',
            [email, password_hash, role || 'Meeting Organizer']
        );

        res.status(201).json({ 
            message: 'User registered successfully!',
            user: result.rows[0] 
        });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'User with that email already exists.' });
        }
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});


// POST /api/login - Allows an existing user to sign in
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(400).json({ error: 'Invalid Credentials.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid Credentials.' });
        }

        const payload = {
            user: {
                id: user.user_id,
                role: user.role
            }
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' } 
        );

        res.json({ token, user: { id: user.user_id, email: user.email, role: user.role } });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// =========================================================
// 7. API ROUTES FOR MEETINGS (Protected)
// =========================================================

// POST /api/meetings/upload - Protected route to upload audio
app.post('/api/meetings/upload', auth, upload.single('meetingAudio'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ msg: 'No file uploaded or file format is invalid (must be MP3/WAV, max 50MB).' });
    }

    const user_id = req.user.id;
    const { path: audio_file_path, filename } = req.file;

    // Use filename as a placeholder title for now
    const title = filename.split('-')[0].replace('meetingAudio', 'Meeting'); 

    try {
        // Insert meeting record into the database
        const result = await pool.query(
            'INSERT INTO meetings (user_id, title, audio_file_path, status) VALUES ($1, $2, $3, $4) RETURNING meeting_id, title, status',
            [user_id, title, audio_file_path, 'Uploaded']
        );

        const newMeeting = result.rows[0];

        res.status(200).json({
            message: `File uploaded successfully! Transcription started (via Python script) for meeting ID ${newMeeting.meeting_id}.`,
            meeting: newMeeting,
            filePath: audio_file_path
        });
    } catch (error) {
        // This catch handles database insertion errors
        console.error('Upload process error:', error);
        res.status(500).json({ msg: 'Server error during file processing or database insert.' });
    }
});


// GET /api/meetings/transcribe/:id - Execute ASR transcription via Python
app.get('/api/meetings/transcribe/:id', auth, async (req, res) => {
    const meeting_id = req.params.id;
    const user_id = req.user.id;
    let audio_file_path;

    try {
        // 1. Verify meeting ownership and get the file path
        const meetingResult = await pool.query(
            'SELECT audio_file_path, status FROM meetings WHERE meeting_id = $1 AND user_id = $2',
            [meeting_id, user_id]
        );

        if (meetingResult.rows.length === 0) {
            return res.status(404).json({ msg: 'Meeting not found or you do not have access.' });
        }

        audio_file_path = meetingResult.rows[0].audio_file_path;

        // 2. Transcribe the audio file using the new Python-based function
        const actualTranscript = await transcribeAudio(audio_file_path);

        // 3. Update DB with transcript and status
        const updateResult = await pool.query(
            'UPDATE meetings SET status = $1, transcript = $2, updated_at = NOW() WHERE meeting_id = $3 RETURNING *',
            ['Ready', actualTranscript, meeting_id]
        );
        
        // 4. Clean up the uploaded file (optional but recommended)
        fs.unlink(audio_file_path, (err) => {
            if (err) console.error(`Failed to delete local audio file: ${audio_file_path}`, err);
            else console.log(`Successfully deleted local audio file: ${audio_file_path}`);
        });

        const updatedMeeting = updateResult.rows[0];

        res.status(200).json({
            msg: 'Transcription completed successfully!',
            meeting: updatedMeeting,
            transcript: actualTranscript
        });
    } catch (error) {
        console.error('Transcription error:', error);
        logAuditAction(user_id, 'TRANSCRIPTION_ERROR', meeting_id, { 
            message: error.message, 
            filePath: audio_file_path 
        });
        // Note: The error message will contain the Python stderr output if available
        res.status(500).json({ msg: 'Transcription failed.', error: error.message });
    }
});


// GET /api/meetings - Fetch all meetings for the user (Dashboard view)
app.get('/api/meetings', auth, async (req, res) => {
    const user_id = req.user.id;
    // Extract the search query from URL parameters (e.g., ?search=keyword)
    const searchQuery = req.query.search || ''; 

    try {
        let queryText = 'SELECT * FROM meetings WHERE user_id = $1';
        let queryParams = [user_id];
        
        // If a search query is provided, add filtering conditions
        if (searchQuery) {
            // Convert the search query to a case-insensitive pattern for PostgreSQL
            const searchPattern = `%${searchQuery}%`;
            
            // Add a WHERE clause to filter by title, transcript, or action_items (converted to text)
            // The || operator is used to concatenate strings in PostgreSQL
            queryText += `
                AND (
                    title ILIKE $2 
                    OR transcript ILIKE $2 
                    OR CAST(action_items AS TEXT) ILIKE $2
                )
            `;
            queryParams.push(searchPattern);
        }

        // Always order by the most recently updated meeting first
        queryText += ' ORDER BY updated_at DESC';

        const result = await pool.query(queryText, queryParams);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Fetch meetings error:', error);
        res.status(500).json({ msg: 'Server error fetching meeting list.' });
    }
});

// GET /api/meetings/:id - Fetch a single meeting detail (for review page)
app.get('/api/meetings/:id', auth, async (req, res) => {
    const meeting_id = req.params.id;
    const user_id = req.user.id;
    try {
        const result = await pool.query(
            'SELECT * FROM meetings WHERE meeting_id = $1 AND user_id = $2',
            [meeting_id, user_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Meeting not found or unauthorized.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Fetch meeting error:', error);
        res.status(500).json({ msg: 'Server error fetching meeting details.' });
    }
});
// ✅ GET /api/meetings/:id/download-minutes - Securely view or download minutes
app.get('/api/meetings/:id/download-minutes', auth, async (req, res) => {
  const meeting_id = req.params.id;
  const user_id = req.user.id;
  const isPreview = req.query.preview === 'true';

  try {
    const result = await pool.query(
      'SELECT minutes_document FROM meetings WHERE meeting_id = $1 AND user_id = $2',
      [meeting_id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'Minutes not found or unauthorized.' });
    }

    const minutes = result.rows[0].minutes_document;

    // ✅ Preview mode: just display in browser
    if (isPreview) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(minutes);
    }

    // ✅ Download mode: force download
    res.setHeader('Content-Disposition', `attachment; filename="meeting_${meeting_id}_minutes.txt"`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(minutes);

  } catch (err) {
    console.error('Error fetching minutes:', err);
    res.status(500).json({ msg: 'Error fetching minutes.' });
  }
});



// DELETE /api/meetings/:id - Delete a meeting record
app.delete('/api/meetings/:id', auth, async (req, res) => {
    const meeting_id = req.params.id;
    const user_id = req.user.id; // User who initiated the delete

    try {
        // 1. Check if the meeting exists and belongs to the user
        const checkResult = await pool.query(
            'SELECT title, audio_file_path FROM meetings WHERE meeting_id = $1 AND user_id = $2',
            [meeting_id, user_id]
        );

        if (checkResult.rows.length === 0) {
            // Log failed attempt
            await logAuditAction(user_id, 'DELETE_MEETING_FAILED', meeting_id, { message: 'Attempted to delete non-existent or unauthorized meeting.' });
            return res.status(404).json({ msg: 'Meeting not found or you do not have permission to delete it.' });
        }
        
        const meetingTitle = checkResult.rows[0].title || `Meeting ${meeting_id}`;
        const audioPath = checkResult.rows[0].audio_file_path;


        // 2. Perform the deletion (DB record)
        const deleteResult = await pool.query(
            'DELETE FROM meetings WHERE meeting_id = $1 AND user_id = $2 RETURNING meeting_id',
            [meeting_id, user_id]
        );

        if (deleteResult.rows.length === 0) {
             return res.status(500).json({ msg: 'Deletion failed. No rows affected.' });
        }
        
        // 3. Delete the physical audio file from the uploads folder
        if (audioPath) {
            fs.unlink(audioPath, (err) => {
                if (err) console.error(`Failed to delete local audio file during cleanup: ${audioPath}`, err);
                else console.log(`Successfully deleted local audio file during cleanup: ${audioPath}`);
            });
        }

        // 4. --- AUDIT LOGGING ---
        await logAuditAction(user_id, 'DELETE_MEETING_SUCCESS', meeting_id, { title: meetingTitle, message: 'Meeting record and associated file successfully deleted.' });
        // --- END AUDIT LOGGING ---

        res.status(200).json({ msg: `Meeting "${meetingTitle}" (ID: ${meeting_id}) successfully deleted.` });

    } catch (error) {
        console.error('Delete meeting error:', error);
        await logAuditAction(user_id, 'DELETE_MEETING_ERROR', meeting_id, { error: error.message });
        res.status(500).json({ msg: 'Server error deleting meeting.' });
    }
});
// PUT /api/meetings/:id/transcript - Save manually edited transcript + extract action items
app.put('/api/meetings/:id/transcript', auth, async (req, res) => {
    const meeting_id = req.params.id;
    const user_id = req.user?.id;
    const { transcript } = req.body;

    console.log("---- SAVE TRANSCRIPT DEBUG ----");
    console.log("Meeting ID:", meeting_id);
    console.log("User ID:", user_id);
    console.log("Transcript Length:", transcript ? transcript.length : 0);
    console.log("--------------------------------");

    if (!transcript || typeof transcript !== 'string' || transcript.trim() === '') {
        return res.status(400).json({ msg: 'Transcript content is required.' });
    }

    try {
        // ✅ Test connection first
        await pool.query('SELECT 1');
        console.log("✅ Database connection OK");

        // ✅ Save transcript
        const updateQuery = `
            UPDATE meetings 
            SET transcript = $1, updated_at = NOW()
            WHERE meeting_id = $2 AND user_id = $3
            RETURNING meeting_id, transcript
        `;
        console.log("Running UPDATE query...");
        const updateResult = await pool.query(updateQuery, [transcript, meeting_id, user_id]);
        console.log("Update result:", updateResult.rowCount);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ msg: 'Meeting not found or unauthorized.' });
        }

        // ✅ Extract action items
        const actionItems = extractActionItems(transcript);
        console.log(`Extracted ${actionItems.length} action items.`);

        // ✅ Save action items
        for (const item of actionItems) {
            console.log("Saving action item:", item.task);
            await pool.query(
                `INSERT INTO action_items (meeting_id, owner, task, status, due_date)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (meeting_id, task) DO UPDATE 
                 SET owner = EXCLUDED.owner, status = EXCLUDED.status, due_date = EXCLUDED.due_date`,
                [meeting_id, item.owner, item.task, item.status, item.dueDate]
            );
        }

        console.log("✅ Transcript and action items saved successfully.");

        res.status(200).json({
            msg: 'Transcript updated and action items extracted successfully.',
            meeting_id,
            action_items: actionItems
        });

    } catch (error) {
        console.error('❌ Save transcript error details:');
        console.error(error);  // this will show the full error object
        res.status(500).json({
            msg: 'Server error saving transcript.',
            error: error.message,
            stack: error.stack
        });
    }
});


function extractActionItems(transcript) {
    // Improved regex — picks more natural commands & to-do patterns
    const actionRegex = /\b(?:let's|we should|we need to|i will|can you|please|follow up|investigate|draft|schedule|check on|look into|ensure|remind|update|send)\b[\w\s,]+?(?:\.|\b)/gi;
    
    const matches = [...transcript.matchAll(actionRegex)];
    const structuredItems = matches.map((match, index) => {
        const text = match[0].trim().replace(/\.$/, '');
        return {
            id: index + 1,
            owner: text.split(' ')[0],
            task: text,
            status: 'To Do',
            dueDate: text.toLowerCase().includes('next friday') ? 'Next Friday' : 'TBD'
        };
    });

    if (structuredItems.length === 0) {
        structuredItems.push({
            id: 1,
            owner: 'Team',
            task: 'No explicit action items detected — please review transcript manually.',
            status: 'To Do',
            dueDate: 'ASAP'
        });
    }

    return structuredItems;
}


// POST /api/meetings/:id/extract - Protected route to extract action items
app.post('/api/meetings/:id/extract', auth, async (req, res) => {
    const meeting_id = req.params.id;
    const user_id = req.user.id;

    try {
        // 1. Fetch the meeting transcript
        const meetingResult = await pool.query(
            'SELECT transcript FROM meetings WHERE meeting_id = $1 AND user_id = $2 AND status = $3',
            [meeting_id, user_id, 'Ready']
        );

        if (meetingResult.rows.length === 0) {
            return res.status(404).json({ msg: 'Meeting not found, unauthorized, or transcript is not Ready.' });
        }
        
        const transcriptText = meetingResult.rows[0].transcript;

        // 2. Perform Extraction
        const extractedItems = extractActionItems(transcriptText);

        // 3. Save the extracted action items and update status
        const updateResult = await pool.query(
            'UPDATE meetings SET action_items = $1::jsonb, status = $2, updated_at = NOW() WHERE meeting_id = $3 RETURNING action_items, status',
            [JSON.stringify(extractedItems), 'Action Items Extracted', meeting_id]
        );

        res.status(200).json({
            message: `Successfully extracted ${extractedItems.length} action items.`,
            actionItems: updateResult.rows[0].action_items,
            status: updateResult.rows[0].status
        });

    } catch (error) {
        console.error('Action Item Extraction error:', error);
        res.status(500).json({ msg: 'Server error during action item extraction.' });
    }
});

// Function to generate the final minutes document (Simulates formatting)
const generateMinutesDocument = (meeting) => {
    // Determine the meeting date for the metadata
    const meetingDate = new Date(meeting.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // 1. Minutes Header/Metadata
    let minutes = `# Meeting Minutes: ${meeting.title || 'Untitled Meeting'}\n\n`;
    minutes += `--- \n`;
    minutes += `**Date:** ${meetingDate}\n`;
    minutes += `**Status:** Finalized (Awaiting Approval)\n`;
    minutes += `**Attendees:** [Participants List Placeholder]\n`;
    minutes += `--- \n\n`;

    // 2. Action Items Section
    minutes += `## 💡 Key Decisions and Action Items\n`;
    if (meeting.action_items && meeting.action_items.length > 0) {
        minutes += meeting.action_items.map(item => 
            `- [${item.status === 'To Do' ? ' ' : 'x'}] **${item.owner}**: ${item.task} (Due: ${item.dueDate})`
        ).join('\n');
    } else {
        minutes += `No explicit action items were extracted in this version.\n`;
    }

    minutes += `\n\n---\n\n`;
    
    // 3. Discussion Summary / Full Transcript
    minutes += `## 📜 Full Discussion Transcript (For Reference)\n`;
    // Clean up the mock transcript for better viewing in the final document
    const cleanedTranscript = meeting.transcript
        .replace(/\*\*/g, '') // Remove bold markdown for a cleaner document look
        .replace(/\n\n/g, '\n')
        .trim();
        
    minutes += `\n${cleanedTranscript}\n`;

    return minutes;
};
// ✅ POST /api/meetings/:id/generate-minutes - Protected route to compile final minutes
app.post('/api/meetings/:id/generate-minutes', auth, async (req, res) => {
    const meeting_id = req.params.id;
    const user_id = req.user.id;

    try {
        console.log("🟢 [GENERATE MINUTES] Request received for meeting:", meeting_id, "by user:", user_id);

        // Allow generation if status is 'Action Items Extracted' OR 'Transcript Saved' OR 'Ready'
        const meetingResult = await pool.query(
            `SELECT title, created_at, transcript, action_items, status
             FROM meetings 
             WHERE meeting_id = $1 AND user_id = $2`,
            [meeting_id, user_id]
        );

        if (meetingResult.rows.length === 0) {
            return res.status(404).json({ msg: 'Meeting not found or not authorized.' });
        }

        const meetingData = meetingResult.rows[0];

        // ✅ Validate status (allow 3 possible ready states)
        const validStatuses = ['Action Items Extracted', 'Transcript Saved', 'Ready'];
        if (!validStatuses.includes(meetingData.status)) {
            return res.status(400).json({
                msg: `Meeting not ready for minutes generation. Current status: ${meetingData.status}`
            });
        }

        // ✅ Call your custom document generator
        const finalMinutes = generateMinutesDocument(meetingData);

        // ✅ Update database
        const updateResult = await pool.query(
            `UPDATE meetings 
             SET minutes_document = $1, status = $2, updated_at = NOW() 
             WHERE meeting_id = $3 
             RETURNING minutes_document, status`,
            [finalMinutes, 'Minutes Generated', meeting_id]
        );

        console.log("✅ Minutes generated successfully for meeting:", meeting_id);

        res.status(200).json({
            message: `Minutes document successfully generated.`,
            minutesDocument: updateResult.rows[0].minutes_document,
            status: updateResult.rows[0].status
        });

    } catch (error) {
        console.error('❌ Minutes Generation error:', error);
        res.status(500).json({ msg: 'Server error during minutes document generation.' });
    }
});

// ✅ NEW: Download Minutes as TXT or DOCX
app.get('/api/meetings/:id/download-minutes', auth, async (req, res) => {
    const meeting_id = req.params.id;
    const user_id = req.user.id;

    try {
        const result = await pool.query(
            'SELECT title, minutes_document FROM meetings WHERE meeting_id = $1 AND user_id = $2',
            [meeting_id, user_id]
        );

        if (result.rows.length === 0 || !result.rows[0].minutes_document) {
            return res.status(404).json({ msg: 'Minutes not found.' });
        }

        const { title, minutes_document } = result.rows[0];
        const filename = `${title || 'meeting_minutes'}.txt`;

        // Set headers for file download
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'text/plain');
        res.send(minutes_document);

    } catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ msg: 'Error while downloading minutes.' });
    }
});


// GET /api/admin/patterns - Get all patterns (Admin Only)
app.get('/api/admin/patterns', auth, isAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM extraction_patterns ORDER BY pattern_id DESC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Fetch patterns error:', error);
        res.status(500).json({ msg: 'Server error fetching patterns.' });
    }
});

// POST /api/admin/patterns - Add a new pattern (Admin Only)
app.post('/api/admin/patterns', auth, isAdmin, async (req, res) => {
    const { pattern_type, pattern_value } = req.body;
    if (!pattern_type || !pattern_value) {
        return res.status(400).json({ msg: 'Pattern type and value are required.' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO extraction_patterns (pattern_type, pattern_value) VALUES ($1, $2) RETURNING *',
            [pattern_type, pattern_value]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Add pattern error:', error);
        res.status(500).json({ msg: 'Server error adding pattern.' });
    }
});

// DELETE /api/admin/patterns/:id - Delete a pattern (Admin Only)
app.delete('/api/admin/patterns/:id', auth, isAdmin, async (req, res) => {
    const pattern_id = req.params.id;
    try {
        const result = await pool.query(
            'DELETE FROM extraction_patterns WHERE pattern_id = $1 RETURNING pattern_id',
            [pattern_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Pattern not found.' });
        }
        res.status(200).json({ msg: 'Pattern deleted successfully.' });
    } catch (error) {
        console.error('Delete pattern error:', error);
        res.status(500).json({ msg: 'Server error deleting pattern.' });
    }
});

// GET /api/admin/logs - Get the latest audit logs (Admin Only)
app.get('/api/admin/logs', auth, isAdmin, async (req, res) => {
    try {
        // Fetch the last 20 logs
        const result = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Fetch audit logs error:', error);
        res.status(500).json({ msg: 'Server error fetching audit logs.' });
    }
});


// 8. Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser (not needed for API)`);
});
