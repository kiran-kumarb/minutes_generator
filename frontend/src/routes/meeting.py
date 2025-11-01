from flask import Blueprint, request, jsonify, current_app
from backend.src.services.db import get_meeting_by_id, update_meeting, delete_meeting, get_all_meetings
from backend.src.utils.auth import token_required
from backend.src.utils.logger import create_audit_log
from backend.src.services.transcription_service import background_transcribe_task # NEW IMPORT
import uuid
import os
import threading # NEW IMPORT

meetings_bp = Blueprint('meetings', __name__)

# --- NEW ROUTE: START ASR TRANSCRIPTION ---
@meetings_bp.route('/transcribe/<uuid:meeting_id>', methods=['GET'])
@token_required
def start_transcribe(current_user, meeting_id):
    """
    Initiates the audio transcription process as a background task.
    """
    db = current_app.db
    
    # 1. Security Check: Only the owner can start the transcription
    meeting = get_meeting_by_id(db, meeting_id)
    if not meeting:
        return jsonify({"msg": "Meeting not found"}), 404
    
    if str(meeting.get('user_id')) != str(current_user.get('user_id')):
        create_audit_log(db, current_user.get('user_id'), 'ACCESS_DENIED', meeting_id, "Attempted to start transcription on another user's meeting.")
        return jsonify({"msg": "Forbidden: You do not own this resource"}), 403

    # 2. Check if transcription is already done or running
    if meeting.get('status') not in ['Uploaded', 'Failed']:
        return jsonify({"msg": f"Transcription is already in status: {meeting.get('status')}"}), 400

    try:
        # 3. Update status to 'Transcribing' immediately
        update_meeting(db, meeting_id, {"status": "Transcribing"})
        
        # 4. Log the action
        create_audit_log(db, current_user.get('user_id'), 'TRANSCRIPTION_INITIATED', meeting_id, 
                         f"Transcription started for audio: {meeting.get('file_path')}")
        
        # 5. Start the heavy work in a background thread to keep the API responsive
        # In a production environment, this would be a message queue (Celery/RQ) job.
        
        # NOTE: We must pass the Flask application context (current_app.app_context) and
        # the database connection (db) to the background thread.
        
        thread = threading.Thread(
            target=background_transcribe_task, 
            args=(current_app.app_context(), db, meeting_id)
        )
        thread.start()
        
        return jsonify({
            "msg": "Transcription process initiated in the background.",
            "status": "Transcribing"
        }), 200

    except Exception as e:
        # If the thread failed to start or initial update failed
        create_audit_log(db, current_user.get('user_id'), 'TRANSCRIPTION_FAILURE', meeting_id, 
                         f"Failed to initiate transcription: {str(e)}")
        return jsonify({"msg": f"Failed to start transcription process: {str(e)}"}), 500


# --- EXISTING ROUTES (KEEPING FOR CONTEXT) ---

@meetings_bp.route('/', methods=['GET'])
@token_required
def get_meetings_list(current_user):
    """
    Retrieves all meeting records for the current user, optionally filtered by search term.
    """
    db = current_app.db
    user_id = current_user.get('user_id')
    search_term = request.args.get('search', '')

    try:
        meetings_data = get_all_meetings(db, user_id, search_term)
        return jsonify(meetings_data), 200
    except Exception as e:
        create_audit_log(db, user_id, 'READ_FAILURE', None, f"Failed to retrieve meetings: {str(e)}")
        return jsonify({"msg": "Failed to retrieve meetings list"}), 500

@meetings_bp.route('/<uuid:meeting_id>', methods=['GET'])
@token_required
def get_meeting(current_user, meeting_id):
    """
    Retrieves a single meeting record by ID.
    """
    db = current_app.db
    user_id = current_user.get('user_id')
    
    meeting = get_meeting_by_id(db, meeting_id)
    
    if not meeting:
        return jsonify({"msg": "Meeting not found"}), 404

    # Security Check: Only the owner can view
    if str(meeting.get('user_id')) != str(user_id):
        create_audit_log(db, user_id, 'ACCESS_DENIED', meeting_id, "Attempted to view another user's meeting.")
        return jsonify({"msg": "Forbidden: You do not own this resource"}), 403

    create_audit_log(db, user_id, 'READ', meeting_id, "Viewed meeting details.")
    return jsonify(meeting), 200

@meetings_bp.route('/<uuid:meeting_id>', methods=['DELETE'])
@token_required
def delete_meeting_route(current_user, meeting_id):
    """
    Deletes a meeting record and its associated audio file.
    """
    db = current_app.db
    user_id = current_user.get('user_id')
    
    meeting = get_meeting_by_id(db, meeting_id)
    
    if not meeting:
        return jsonify({"msg": "Meeting not found"}), 404

    # Security Check: Only the owner can delete
    if str(meeting.get('user_id')) != str(user_id):
        create_audit_log(db, user_id, 'ACCESS_DENIED', meeting_id, "Attempted to delete another user's meeting.")
        return jsonify({"msg": "Forbidden: You do not own this resource"}), 403
    
    try:
        # Delete the physical file first
        file_path = meeting.get('file_path')
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            
        # Delete the record from the database
        delete_meeting(db, meeting_id)

        create_audit_log(db, user_id, 'DELETE', meeting_id, "Successfully deleted meeting and file.")
        return jsonify({"msg": "Meeting and associated audio file deleted successfully"}), 200
    
    except Exception as e:
        create_audit_log(db, user_id, 'DELETE_FAILURE', meeting_id, f"Failed to delete meeting: {str(e)}")
        return jsonify({"msg": "Failed to delete meeting"}), 500


# PUT /api/meetings/<uuid:meeting_id>/transcript
@meetings_bp.route('/<int:meeting_id>/transcript', methods=['PUT'])

@token_required
def update_transcript_with_extraction(current_user, meeting_id):
    """
    Save edited transcript and respond with helpful debug info on failure.
    """
    db = current_app.db
    try:
        data = request.get_json(force=True, silent=True)
        transcript = (data or {}).get('transcript')
    except Exception as e:
        create_audit_log(db, current_user.get('user_id'), 'TRANSCRIPT_SAVE_FAILURE', meeting_id,
                         f"Invalid JSON: {str(e)}")
        return jsonify({"msg": "Invalid JSON body", "detail": str(e)}), 400

    if not transcript or not isinstance(transcript, str) or transcript.strip() == '':
        return jsonify({"msg": "Transcript content is required."}), 400

    try:
        meeting = get_meeting_by_id(db, meeting_id)
        if not meeting:
            return jsonify({"msg": "Meeting not found"}), 404

        # Ownership check
        if str(meeting.get('user_id')) != str(current_user.get('user_id')):
            create_audit_log(db, current_user.get('user_id'), 'ACCESS_DENIED', meeting_id,
                             "Attempted to edit another user's transcript.")
            return jsonify({"msg": "Forbidden: You do not own this resource"}), 403

        # Update - use your existing helper if it expects dict of columns
        update_result = update_meeting(db, meeting_id, {"transcript": transcript, "status": "Ready"})
        # If update_meeting returns something or None, check it. If it uses SQL RETURNING, inspect result.
        # Fallback check: re-fetch meeting to confirm update
        updated = get_meeting_by_id(db, meeting_id)
        if not updated or updated.get('transcript') is None:
            # Log and respond with details for debugging
            create_audit_log(db, current_user.get('user_id'), 'TRANSCRIPT_SAVE_FAILURE', meeting_id,
                             "DB update did not persist transcript.")
            return jsonify({
                "msg": "Failed to save transcript (DB update did not persist).",
                "detail": "Update executed but transcript column is still NULL or missing."
            }), 500

        # Optionally extract action items here OR let client call /extract
        create_audit_log(db, current_user.get('user_id'), 'TRANSCRIPT_UPDATED', meeting_id,
                         "Transcript updated manually by user.")
        return jsonify({"message": "Transcript saved successfully!", "status": "Ready"}), 200

    except Exception as err:
        # Log full stack trace to server logs and audit logs
        current_app.logger.exception("Error saving transcript")
        create_audit_log(db, current_user.get('user_id'), 'TRANSCRIPT_SAVE_EXCEPTION', meeting_id, str(err))
        # Return the error message (remove detail in production)
        return jsonify({"msg": "Error saving transcript. Please try again.", "detail": str(err)}), 500


import re

# --- NEW: ACTION ITEM EXTRACTION ---
@meetings_bp.route('/<uuid:meeting_id>/extract', methods=['POST'])
@token_required
def extract_action_items(current_user, meeting_id):
    """
    Extracts action items from transcript using regex-based rules.
    """
    db = current_app.db
    try:
        meeting = get_meeting_by_id(db, meeting_id)
        if not meeting:
            return jsonify({"msg": "Meeting not found"}), 404

        transcript = meeting.get('transcript', '')
        if not transcript.strip():
            return jsonify({"msg": "Transcript is empty"}), 400

        # ✅ Regex pattern for action-like sentences
        pattern = r"\b(we\s+need\s+to|we\s+should|we\s+will|let's|ensure\s+that|must\s+be|to\s+be\s+prepared|council\s+to|prepare\s+for|focus\s+on|prioritize|recommend\s+that|make\s+sure|requested\s+to|decided\s+to|agreed\s+to|resolved\s+that|be\s+approved|be\s+reviewed|follow\s+up|plan\s+to|be\s+conducted|engage\s+with|support\s+that)\b.*?[.?!]"

        # ✅ Extract all action sentences
        matches = re.findall(pattern, transcript, re.IGNORECASE)
        action_items = []

        for sentence in matches:
            action_items.append({
                "owner": current_user.get('name', 'User'),
                "task": sentence.strip(),
                "dueDate": "TBD",
                "status": "Pending"
            })

        update_meeting(db, meeting_id, {
            "action_items": action_items,
            "status": "Action Items Extracted"
        })

        create_audit_log(db, current_user.get('user_id'), 'ACTION_ITEMS_EXTRACTED', meeting_id,
                         f"Extracted {len(action_items)} action items.")

        return jsonify({
            "message": f"{len(action_items)} action items extracted successfully!",
            "actionItems": action_items,
            "status": "Action Items Extracted"
        }), 200

    except Exception as e:
        create_audit_log(db, current_user.get('user_id'), 'ACTION_EXTRACTION_FAILURE', meeting_id, str(e))
        return jsonify({"msg": "Action item extraction failed."}), 500


# --- NEW: GENERATE MINUTES OF MEETING ---
@meetings_bp.route('/<uuid:meeting_id>/generate_minutes', methods=['GET'])
@token_required
def generate_minutes(current_user, meeting_id):
    """
    Generate final Minutes of Meeting (MoM) using transcript and action items.
    """
    db = current_app.db
    try:
        meeting = get_meeting_by_id(db, meeting_id)
        if not meeting:
            return jsonify({"msg": "Meeting not found"}), 404

        if str(meeting.get('user_id')) != str(current_user.get('user_id')):
            create_audit_log(db, current_user.get('user_id'), 'ACCESS_DENIED', meeting_id,
                             "Attempted to generate minutes for another user's meeting.")
            return jsonify({"msg": "Forbidden: You do not own this resource"}), 403

        transcript = meeting.get('transcript', '').strip()
        action_items = meeting.get('action_items', [])

        if not transcript:
            return jsonify({"msg": "Transcript not available"}), 400

        # ✅ Simple minutes template generation
        minutes_content = f"""📋 MINUTES OF MEETING
===========================================
🆔 Meeting ID: {meeting_id}
📅 Date: {meeting.get('created_at')}
👤 Created by: {current_user.get('name', 'User')}
-------------------------------------------
📝 TRANSCRIPT SUMMARY
-------------------------------------------
{transcript[:1500]}{'...' if len(transcript) > 1500 else ''}

-------------------------------------------
✅ ACTION ITEMS
-------------------------------------------
"""

        if action_items:
            for i, item in enumerate(action_items, 1):
                minutes_content += f"{i}. {item.get('task')}  —  Owner: {item.get('owner', 'N/A')} | Due: {item.get('dueDate', 'TBD')}\n"
        else:
            minutes_content += "No specific action items identified.\n"

        minutes_content += "\n-------------------------------------------\nStatus: Completed\n"

        # ✅ Save to DB
        update_meeting(db, meeting_id, {"minutes": minutes_content, "status": "Minutes Generated"})

        create_audit_log(db, current_user.get('user_id'), 'MINUTES_GENERATED', meeting_id,
                         "Minutes of Meeting generated successfully.")

        return jsonify({
            "msg": "Minutes generated successfully!",
            "minutes": minutes_content,
            "status": "Minutes Generated"
        }), 200

    except Exception as e:
        current_app.logger.exception("Minutes generation failed")
        create_audit_log(db, current_user.get('user_id'), 'MINUTES_GENERATION_FAILED', meeting_id, str(e))
        return jsonify({"msg": "Error generating minutes", "detail": str(e)}), 500
