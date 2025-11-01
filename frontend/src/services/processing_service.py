import time
import uuid
from datetime import datetime
import threading

# Import the new AI extraction logic
from backend.src.services.ai_extraction_service import extract_structured_data 

# --- ASR Placeholder Function (from previous step) ---
def transcribe_audio_file(file_path: str, meeting_id: uuid.UUID) -> str:
    """
    Simulates the process of calling an ASR API.
    (This is the placeholder logic, kept for flow)
    """
    # Simulate network latency and processing time
    time.sleep(1) 
    
    # Placeholder Transcript with clear Action Items and Decisions
    transcript = (
        "Hello everyone, thanks for joining. The main agenda today is the Q4 budget review. "
        "I need **Alex** to **finalize the marketing spend report by next Tuesday**. "
        "We also **decided** that we are moving forward with the cloud migration starting **next month**. "
        "Jane, please **draft the announcement memo** for the team. We must **prioritize** hiring for the two open engineering roles immediately. "
        "**Decision**: all new hires must clear a background check. The next meeting will be next week. "
        "The team also suggested a follow-up on the **client proposal**."
    )
    
    print(f"--- ASR SIMULATION COMPLETE for Meeting ID: {meeting_id} ---")
    
    return transcript

# --- Background Transcription Task Handler ---

def background_transcribe_task(app_context, db, meeting_id: uuid.UUID):
    """
    Handles the background worker for ASR transcription.
    """
    from backend.src.utils.logger import create_audit_log
    from backend.src.services.db import get_meeting_by_id, update_meeting
    
    with app_context: # Use Flask context for database access
        try:
            print(f"[{datetime.now().isoformat()}] Starting transcription for {meeting_id}")
            
            meeting_data = get_meeting_by_id(db, meeting_id)
            if not meeting_data:
                raise Exception(f"Meeting not found: {meeting_id}")
                
            file_path = meeting_data.get('file_path') 
            transcript = transcribe_audio_file(file_path, meeting_id)
            
            # Update the database with the transcript and 'Ready' status
            update_data = {
                "transcript": transcript,
                "status": "Ready", 
                "updated_at": datetime.now().isoformat()
            }
            update_meeting(db, meeting_id, update_data)
            
            create_audit_log(db, None, 'TRANSCRIPTION_SUCCESS', meeting_id, 
                             "Transcription completed for meeting.")
            
            print(f"[{datetime.now().isoformat()}] SUCCESS: Meeting {meeting_id} is Ready for Review.")

        except Exception as e:
            print(f"[{datetime.now().isoformat()}] ERROR during transcription for {meeting_id}: {e}")
            update_meeting(db, meeting_id, {
                "status": f"Failed: {str(e)[:50]}...",
                "updated_at": datetime.now().isoformat()
            })
            create_audit_log(db, None, 'TRANSCRIPTION_FAILURE', meeting_id, 
                             f"Transcription failed: {str(e)}")


# --- Background AI Extraction Task Handler (NEW) ---

def background_extraction_task(app_context, db, meeting_id: uuid.UUID):
    """
    Handles the background worker for AI-driven action item and decision extraction.
    """
    from backend.src.utils.logger import create_audit_log
    from backend.src.services.db import get_meeting_by_id, update_meeting
    
    with app_context: # Use Flask context for database access
        try:
            print(f"[{datetime.now().isoformat()}] Starting extraction for {meeting_id}")
            
            meeting_data = get_meeting_by_id(db, meeting_id)
            if not meeting_data:
                raise Exception(f"Meeting not found: {meeting_id}")
            
            transcript = meeting_data.get('transcript')
            if not transcript:
                raise Exception("Cannot run extraction: Transcript is missing or empty.")
            
            # Call the AI service to get structured data
            extracted_data = extract_structured_data(transcript)
            
            # Prepare data for Firestore storage
            # NOTE: Firestore can store Python dicts/lists directly
            update_data = {
                "summary": extracted_data.get('summary', 'No summary generated.'),
                "action_items": extracted_data.get('action_items', []),
                "decisions": extracted_data.get('decisions', []),
                "status": "Action Items Extracted", # Final ready status
                "updated_at": datetime.now().isoformat()
            }
            update_meeting(db, meeting_id, update_data)
            
            create_audit_log(db, None, 'EXTRACTION_SUCCESS', meeting_id, 
                             "AI extraction of action items and decisions completed.")
            
            print(f"[{datetime.now().isoformat()}] SUCCESS: Meeting {meeting_id} has extracted data.")

        except Exception as e:
            print(f"[{datetime.now().isoformat()}] ERROR during extraction for {meeting_id}: {e}")
            update_meeting(db, meeting_id, {
                "status": f"Failed: Extraction failed - {str(e)[:50]}...",
                "updated_at": datetime.now().isoformat()
            })
            create_audit_log(db, None, 'EXTRACTION_FAILURE', meeting_id, 
                             f"AI extraction failed: {str(e)}")
