from flask import Flask, render_template, request, jsonify, redirect, url_for, make_response, abort, session
from azure.cosmos import CosmosClient, exceptions
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential
from app import app
from flask_bcrypt import Bcrypt
from werkzeug.utils import secure_filename
from openai import OpenAI
from io import BytesIO
from datetime import datetime
import json 
import random
import os
import re
from PIL import Image
import pytesseract
import io
import base64
import logging
import uuid

"""
TO DO:
- UUID en plus des ID examtopics

"""

MAIN_HOME_PAGE = "home.html"
MAIN_QUIZ_PAGE = "quiz.html"

# Azure Key Vault details
KEY_VAULT_URL = "https://quizapp-keyvault.vault.azure.net/" 
COSMOS_SECRET_NAME = "CosmosDBConnectionString"
FLASK_SECRET_NAME = "FlaskSecretKey"
OPEN_API_NAME = "OpenApiKey"

# Authenticate to Azure Key Vault
credential = DefaultAzureCredential()
secret_client = SecretClient(vault_url=KEY_VAULT_URL, credential=credential)

# Flask key
app.secret_key = secret_client.get_secret(FLASK_SECRET_NAME).value
OPEN_API_KEY = secret_client.get_secret(OPEN_API_NAME).value

# OpenAI Api
openai_client = OpenAI(api_key=OPEN_API_KEY)

# Retrieve the Cosmos DB connection string from Key Vault
try:
    COSMOS_DB_CONN = secret_client.get_secret(COSMOS_SECRET_NAME).value
    print("Cosmos DB connection string retrieved from Azure Key Vault.")
except Exception as e:
    raise ValueError(f"Failed to retrieve secret from Azure Key Vault: {e}")

# Initialize the Cosmos DB client
cosmos_client = CosmosClient.from_connection_string(COSMOS_DB_CONN)

# Get the database and container
db = cosmos_client.get_database_client("quizdb")
questions_container = db.get_container_client("questions")
users_container = db.get_container_client("users")
certif_container = db.get_container_client("certifications")

# ------------------------------------------------------------
# Home page
# ------------------------------------------------------------
def fetch_certification_counts(current_user=None):
    """
    Fetch certification question counts.
    If the user is logged in, also fetch their progress from their quiz_history.
    If not, return only the total question counts.
    """
    # Query for total questions per certification
    items = list(questions_container.query_items(
        query="SELECT c.certifcode FROM c",
        enable_cross_partition_query=True
    ))
    
    # Build a dictionary with total question counts per certification
    counts_map = {}
    for doc in items:
        code = doc.get("certifcode")
        if code:
            counts_map[code] = counts_map.get(code, 0) + 1

    # If user is not logged in, return only the question counts
    if not current_user:
        return [{"certifcode": code, "questionCount": total} for code, total in counts_map.items()]

    # If user is logged in, merge with their quiz history
    user_progress = current_user.get("quiz_history", {})
    certif_results = []
    for code, total in counts_map.items():
        stats = user_progress.get(code, {})

        # Get total answered questions
        answered = stats.get("answered", 0)

        # Get count of correctly answered questions from details
        correct_count = sum(1 for q in stats.get("details", {}).values() if q.get("correct", False))

        # Calculate the percentage based on correctly answered questions
        percentage = (correct_count / total * 100) if total > 0 else 0

        certif_results.append({
            "certifcode": code,
            "questionCount": total,
            "answered": correct_count,  # Now correctly represents number of well-answered questions
            "percentage": round(percentage, 1)
        })

    return certif_results


def fetch_current_user():
    """
    Fetch the current user details from session if logged in.
    Returns None if not logged in or if the user fetch fails.
    """
    current_user = None
    if "user_id" in session:
        user_id = session["user_id"]
        try:
            current_user = users_container.read_item(item=user_id, partition_key=user_id)
        except Exception as e:
            logging.error(f"Error fetching user: {e}")
            session.pop("user_id", None)  # Clear invalid session
    return current_user


@app.route("/")
def root_redirect():
    return redirect("/home")

@app.route("/home")
def home():  # Changed function name from 'leaderboard' to 'home'
    current_user = fetch_current_user()
    certif_results = fetch_certification_counts(current_user)
    
    response = make_response(render_template(
        MAIN_HOME_PAGE,
        certifs=certif_results,
        current_user=current_user,
        current_page='home'  # Changed from 'leaderboard' to 'home'
    ))
    
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    
    return response


# ------------------------------------------------------------
# Uploads page
# ------------------------------------------------------------

@app.route("/uploads")
def uploads():
    current_user = fetch_current_user()
    return render_template(
        "uploads.html",
        current_user=current_user,
        current_page='uploads'  # This matches the navigation check
    )
    

# ------------------------------------------------------------
# Training page
# ------------------------------------------------------------
 
@app.route("/training")
def training():
    current_user = fetch_current_user()
    return render_template(
        "training.html",
        current_user=current_user,
        current_page='training'  # This matches the navigation check
    )
    

# ------------------------------------------------------------
# Questions page
# ------------------------------------------------------------
 
@app.route("/questions")
def questions():
    current_user = fetch_current_user()
    return render_template(
        "questions.html",
        current_user=current_user,
        current_page='questions'  # This matches the navigation check
    )



# ------------------------------------------------------------
# Get questions for a specific certification
# ------------------------------------------------------------
def fetch_questions(certif, limit=10, current_user=None):
    # Get all questions for certification
    questions = list(questions_container.query_items(
        query="SELECT * FROM c WHERE c.certifcode=@certif",
        parameters=[{"name": "@certif", "value": certif}],
        enable_cross_partition_query=True
    ))
    
    if not current_user:
        for q in questions:
            q['weight'] = 100  # Add default weight
        random.shuffle(questions)
        return questions[:limit]

    # For logged-in users - ensure fresh user data
    try:
        # Re-fetch user to get latest quiz history
        current_user = users_container.read_item(current_user['id'], current_user['id'])
    except Exception as e:
        logging.error(f"Error refreshing user data: {str(e)}")
    
    quiz_history = current_user.get("quiz_history", {}).get(certif, {})
    details = quiz_history.get("details", {})
    
    # Create weighted pool with latest weights
    weighted_pool = []
    for q in questions:
        qid = q['id']
        weight = details.get(qid, {}).get("weight", 100)
        q['weight'] = weight  # Update question weight
        weighted_pool.extend([q] * weight)
    
    random.shuffle(weighted_pool)
    return weighted_pool[:limit]

@app.route("/questions/<certif>", methods=["GET"])
def get_questions(certif):
    """API endpoint to return processed questions for a given certification."""
    try:
        limit = int(request.args.get('limit', 10))
    except ValueError:
        limit = 10

    # Get current user if logged in
    current_user = fetch_current_user()

    # Fetch and process questions using current user progress
    raw_questions = fetch_questions(certif, limit=limit, current_user=current_user)
    processed_questions = [process_question(q) for q in raw_questions]
    
    return jsonify(processed_questions)

@app.route("/get_question/<certif>/<question_id>", methods=["GET"])
def get_question(certif, question_id):
    current_user = fetch_current_user()
    try:
        # Fetch question with proper error handling
        question = questions_container.read_item(item=question_id, partition_key=certif)
        
        # Merge updated quiz history if available
        if "updated_quiz_history" in session:
            current_user["quiz_history"] = session["updated_quiz_history"]
        
        # Process with current user's data
        if current_user:
            certif_history = current_user.get("quiz_history", {}).get(certif, {})
            details = certif_history.get("details", {})
            question_data = details.get(question_id, {})
            question['weight'] = question_data.get("weight", 100)
        else:
            question['weight'] = 100
            
        return jsonify(process_question(question))
        
    except Exception as e:
        logging.error(f"Error fetching question {question_id}: {str(e)}")
        return jsonify({"error": "Question not found"}), 404


# ------------------------------------------------------------
# Processing the Quiz
# ------------------------------------------------------------
def process_hotspot_question(q, lines):
    main_lines = []
    statements = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('- '):
            # Remove leading '- ' and trailing '(Y/N)' if present
            statement = re.sub(r'^-\s*', '', stripped)
            statement = re.sub(r'\s*\(Y/N\)$', '', statement)
            statements.append(statement)
        elif not statements:  # Only add to main_lines if we haven't seen any statements yet
            main_lines.append(line)
    
    processed_q = q.copy()
    processed_q['main_question'] = '\n'.join(main_lines).strip()
    processed_q['parsed_statements'] = statements
    return processed_q

def process_multiple_choice(q, lines):
    main_lines = []
    choices = []
    in_choices = False
    
    for line in lines:
        if re.match(r'^[A-Z]\.\s', line):
            in_choices = True
            parts = line.split('. ', 1)
            choices.append({
                'letter': parts[0],
                'text': parts[1] if len(parts) > 1 else ''
            })
        elif not in_choices:
            main_lines.append(line)

    processed_q = q.copy()
    processed_q['main_question'] = '\n'.join(main_lines).strip()
    processed_q['parsed_choices'] = choices
    return processed_q

def process_drag_and_drop(q, lines):
    main_lines = []
    choices = []
    dropzones = []
    for line in lines:
        if re.match(r'^[A-Z]\.\s', line):
            parts = line.split('. ', 1)
            choices.append({
                'letter': parts[0],
                'text': parts[0]
            })
        elif re.match(r'^[0-9]+\.\s', line):
            parts = line.split('. ', 1)
            dropzones.append({
                'number': parts[0],
                'text': parts[1] if len(parts) > 1 else ''
            })
        else:
            if not choices and not dropzones:
                main_lines.append(line)
    
    processed_q = q.copy()
    processed_q['main_question'] = '\n'.join(main_lines).strip()
    processed_q['parsed_choices'] = choices
    processed_q['parsed_dropzones'] = dropzones
    return processed_q

def process_yesno(q, lines):
    # Similar to multiple choice processing
    return process_multiple_choice(q, lines)

def process_question(q):
    """Process a question using the appropriate processor based on its type"""
    lines = q.get('question', '').split('\n')
    question_type = q.get('questiontype', '').lower()
    
    processor = QUESTION_PROCESSORS.get(question_type)
    if processor:
        processed_q = processor(q, lines)
    else:
        # Fallback for unknown types
        processed_q = q.copy()
        processed_q['main_question'] = '\n'.join(lines).strip()

    # Ensure weight exists in processed question
    processed_q['weight'] = q.get('weight', 100)
    processed_q['main_question'] = q.get('question', '').replace('\n', '<br>')
    return processed_q

# Map question types to processing functions
QUESTION_PROCESSORS = {
    'hotspot': process_hotspot_question,
    'multiplechoice': process_multiple_choice,
    'draganddrop': process_drag_and_drop,
    'yesno': process_yesno,
}

@app.route("/quiz/<certif>", methods=["GET"])
def quiz(certif):
    print(f"Rendering template: {MAIN_QUIZ_PAGE}")
    current_user = fetch_current_user()
    # Fetch just one question initially (or adjust as needed)
    raw_questions = fetch_questions(certif, limit=1, current_user=current_user)
    
    if not raw_questions:
        return redirect(url_for('home'))

    processed_questions = [process_question(q) for q in raw_questions]
    return render_template(MAIN_QUIZ_PAGE, 
                         questions=processed_questions,
                         certif=certif)

# ------------------------------------------------------------
# Upload questions from JSON file
# ------------------------------------------------------------
@app.route("/", methods=["POST"])
def upload_questions():
    try:
        # Validate input parameters
        certif_code = validate_certification_code(request)
        questions_data = validate_payload(request)

        # Atomic operation: Delete old questions before inserting new ones
        delete_existing_questions(certif_code)
        inserted_count = insert_new_questions(certif_code, questions_data)

        return jsonify({
            "message": f"Successfully updated {certif_code} certification",
            "deleted_count": len(questions_data),
            "inserted_count": inserted_count
        }), 200

    except InvalidRequestError as e:
        return jsonify({"error": str(e)}), e.status_code
    except Exception as e:
        app.logger.error(f"Critical upload error: {str(e)}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

# Validation Helpers
def validate_certification_code(request):
    certif_code = request.args.get("certifcode")
    if not certif_code or not validate_certif_code(certif_code):
        raise InvalidRequestError("Invalid or missing certification code", 400)
    return certif_code

def validate_payload(request):
    if not request.is_json:
        raise InvalidRequestError("Request must be JSON", 400)

    data = request.get_json()
    if not isinstance(data, list) or len(data) == 0:
        raise InvalidRequestError("Payload must be a non-empty array of questions", 400)

    for idx, question in enumerate(data):
        if not isinstance(question, dict):
            raise InvalidRequestError(f"Question at index {idx} is not an object", 400)
        if question.get("certifcode") != request.args.get("certifcode"):
            raise InvalidRequestError(
                f"Question at index {idx} has mismatched certifcode", 400
            )
        if not question.get("id"):
            raise InvalidRequestError(f"Question at index {idx} missing ID", 400)

    return data

# Database Operations
def delete_existing_questions(certif_code):
    try:
        questions = list(questions_container.query_items(
        query="SELECT * FROM c WHERE c.certifcode = @certif",
        parameters=[{"name": "@certif", "value": certif_code}],
        enable_cross_partition_query=True
    ))
    
        for question in questions:
            questions_container.delete_item(
                item=question['id'],
                partition_key=certif_code
            )

    except cosmos_exceptions.CosmosHttpResponseError as e:
        app.logger.error(f"Deletion failed: {str(e)}")
        raise InvalidRequestError("Failed to clear existing questions", 500)

def insert_new_questions(certif_code, questions):
    inserted = 0
    try:
        for question in questions:
            questions_container.create_item(body={
                **question,
                "exam_topic_id_num": int(question["exam_topic_id"])
            })
            inserted += 1
        return inserted
    except cosmos_exceptions.CosmosResourceExistsError:
        app.logger.error(f"Duplicate question ID: {question.get('id')}")
        raise InvalidRequestError(f"Duplicate question ID: {question.get('id')}", 409)
    except cosmos_exceptions.CosmosHttpResponseError as e:
        app.logger.error(f"Insertion failed at question {inserted + 1}: {str(e)}")
        raise InvalidRequestError(
            f"Partially inserted {inserted} questions. Failed at question {inserted + 1}", 
            500
        )

# Custom Exception
class InvalidRequestError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code
    

# ------------------------------------------------------------
# User authentication
# ------------------------------------------------------------
bcrypt = Bcrypt()

def query_user_by_pseudo(pseudo):
    """
    Query the users container for a user with the given pseudo.
    Uses a parameterized query to prevent injection.
    """
    query = "SELECT * FROM c WHERE c.pseudo=@pseudo"
    parameters = [{"name": "@pseudo", "value": pseudo}]
    return list(users_container.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True
    ))

def create_new_user(pseudo, password):
    """
    Create a new user with a hashed password.
    """
    hashed_password = bcrypt.generate_password_hash(password).decode("utf-8")
    new_user = {
        "id": f"user_{pseudo}",
        "pseudo": pseudo,
        "password": hashed_password,
        "quiz_history": {}
    }
    users_container.create_item(new_user)
    return new_user

# Register new user
@app.route("/register", methods=["POST"])
def register():
    try:
        data = request.json
        
        if not data:
                app.logger.error("No JSON data received")
                return jsonify({"error": "No data provided"}), 400
            
        pseudo = data.get("pseudo")
        password = data.get("password")
        
        app.logger.info(f"Registration attempt for: {pseudo}")

        if not pseudo or not password:
            return jsonify({"error": "Pseudo and password are required"}), 400

        # Check if user already exists using a parameterized query
        if query_user_by_pseudo(pseudo):
            return jsonify({"error": "User already exists"}), 400

        create_new_user(pseudo, password)
        return jsonify({"message": "User registered successfully!"})

    except Exception as e:
        app.logger.error(f"Registration error: {str(e)}", exc_info=True)
        return jsonify({"error": "Server error"}), 500

# ------------------------------------------------------------
# Session management
# ------------------------------------------------------------
def get_user_by_id(user_id):
    """
    Retrieve a user by their ID from the users container.
    """
    try:
        return users_container.read_item(item=user_id, partition_key=user_id)
    except Exception as e:
        logging.error(f"Error fetching user by id: {e}")
        return None
    
# Login user
@app.route("/login", methods=["POST"])
def login():
    data = request.json
    pseudo = data.get("pseudo")
    password = data.get("password")
    remember = data.get("remember", False)

    if not pseudo or not password:
        return jsonify({"error": "Pseudo and password are required"}), 400

    users = query_user_by_pseudo(pseudo)
    if not users:
        return jsonify({"error": "User not found"}), 404  # Ensure this is handled properly

    user = users[0]
    if not bcrypt.check_password_hash(user["password"], password):
        return jsonify({"error": "Incorrect password"}), 401  
    session["user_id"] = user["id"]
    session.permanent = remember  # Make session permanent if "remember me" is checked

    return jsonify({"message": "Login successful!", "pseudo": user["pseudo"]})

# Logout user
@app.route("/logout", methods=["GET"])
def logout():
    session.pop("user_id", None)
    return jsonify({"message": "Logged out successfully"})

# Retrieve current user
@app.route("/current_user", methods=["GET"])
def current_user():
    user_id = session.get("user_id")
    if user_id:
        user = get_user_by_id(user_id)
        if user:
            return jsonify({"pseudo": user.get("pseudo")})
        # If user retrieval fails, clear the session
        session.pop("user_id", None)
        return jsonify({"error": "User not found"}), 404
    return jsonify({"pseudo": None})


# ------------------------------------------------------------
# Adding a Question
# ------------------------------------------------------------
@app.route("/confirm_question", methods=["GET"])
def confirm_question():
    if 'pending_question' not in session:
        return redirect(url_for('uploads'))  # Redirect to uploads if no pending question
    
    return render_template(
        "confirm_question.html",
        question_data=session['pending_question'],
        current_page='confirm_question'  # Add this line
    )

# GPT Configuration
GPT_ENDPOINT = "https://api.openai.com/v1/chat/completions"
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

def get_gpt_key():
    return OPEN_API_KEY

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

PROMPT_TEMPLATE = """
Analyze exam question images and output **valid JSON** that conforms strictly to this structure:

{
    "exam_topic_id": "question number (e.g. '187')",
    "question": "Original formatted text",
    "choices": "Type-specific format" (e.g. A. choice1 B. choice 2),
    "answer": "Validated answers",
    "explanation": "Detailed rationale",
    "certifcode": "{certifcode}",
    "questiontype": "multiplechoice/draganddrop/hotspot/yesno"
}

***** IMPORTANT GUIDELINES *****

1. **General Rules**
   - **Output must be valid JSON** with no extra keys, no missing keys, and no top-level comments.
   - Maintain all original punctuation from the source text.
   - Keep any important markup, special characters, or warnings (e.g., "WARNING", "NOTE").
   - Do not add references to "Answer Area" or "NOTE: Each correct selection is worth one point."
   - Do not add "HOTSPOT -" prefix in the question or any wording like "Hot Area."
   - Do not add : Each correct answer presents a complete solution.
   - Do not add : Select the answer that correctly completes the sentence. 
   - Do not add : To answer, drag the appropriate term from the column on the left to its level on the right. Each term may be used once, more than once, or not at all.
   - Do not add "Note: The question is included in a number of questions that depicts the identical set-up. However, every question has a distinctive result. Establish if the solution satisfies the requirements."
   - If a statement is repeated, unify or remove duplicates only if certain they are exact duplicates.
   - "certifcode" must match the user input exactly as `{certifcode}` (will be overridden in the code).
   - **exam_topic_id**: a question number (e.g., "187", "99", etc.). Use the one provided or extracted from the question, if present.
   - **Low Temperature**

### **2. Answer Selection Rules**
- **Look for Explicit Answer Indicators:** Search for keywords such as **"Correct Answer:"**, green highlights, checkmarks, or bold text indicating the correct selection.
- **Identify Answers in Selection Boxes or Dropdowns:** If a dropdown is present, extract the final selection from the answer area.
- **Use Explanations to Validate Answers:** If an explanation states "Box 1: Correct Answer...", extract that as the answer.
- **Checkboxes and Yes/No Answers:** Extract green-checked options as the correct ones.
- **Prioritize the Answer Area Over the Question Area:** Some questions repeat choices; focus on the bottom answer section.

### **3. Explanation Extraction Rules**
- **First, attempt to extract the explanation from the image text.**
  - Look for phrases like "Explanation:", "Why this answer is correct:", or "When to use...".
  - The explanation is typically found below the correct answer.
  - If references exist, extract the reasoning but **exclude URLs**.
  
- **If no explanation is found, generate one** using cloud computing principles:
  - Ensure it is **detailed, structured, and pedagogically sound**.
  - Avoid generic statements—focus on technical clarity.

- **Final Explanation must:**
  - Reinforce **why the correct answer is valid**.
  - Provide an **educational insight** for learners.
  - Be **technically accurate** and **concise**.

### **4. Question Types & JSON Structure**

#### **4.1 Yes/No (`"questiontype": "yesno"`)**
```json
{
    "exam_topic_id": "3",
    "certifcode": "Extracted or inferred certification code",
    "questiontype": "yesno",
    "question": "Extract the full question text.",
    "answer": "Correct answer (e.g. 'Y', 'N')",
    "explanation": "Extracted or inferred explanation."
}
```
    ***ULTRA IMPORTANT - Critical Note on "Yes/No"***:
    - If the question contains only 2 choices **"Yes"** and **"No"** choices, it is not a multiple-choice question, but a Yes/No question.
    - Answer must be "Y" or "N".

#### **4.2 Multiple Choice (`"questiontype": "multiplechoice"`)**
```json
{
    "exam_topic_id": "19",
    "certifcode": "Extracted or inferred certification code (if available, else leave empty)",
    "questiontype": "multiplechoice",
    "question": "Extract the full question text, preserving formatting and meaning.",
    "choices": [
        { "letter": "A", "text": "Choice A text" },
        { "letter": "B", "text": "Choice B text" },
        { "letter": "C", "text": "Choice C text" },
        { "letter": "D", "text": "Choice D text" }
    ],
    "answer": "Correct answer letter (e.g. 'B')",
    "explanation": "Extracted or inferred explanation if available."
}
```
***ULTRA IMPORTANT - Critical Note on "multiplechoice"***:
    - If the question contains only 2 choices **"Yes"** and **"No"** choices, it is not a multiple-choice question, but a Yes/No question.

#### **4.3 Drag & Drop (`"questiontype": "draganddrop"`)**
```json
{
    "exam_topic_id": "42",
    "certifcode": "Extracted or inferred certification code",
    "questiontype": "draganddrop",
    "question": "Extract the full question text.",
    "choices": [
        { "letter": "Analytics type name (e.g. Cognitive, Data Analyst, Fact tables, etc.)" }
    ],
    "answer_area": [
        { "question": "Extracted text from the right-side question", "correct_answer": "Matching analytics type" }
    ],
    "explanation": "Extracted or inferred explanation."
}
```

#### **4.4 Hotspot (`"questiontype": "hotspot"`)**
```json
{
    "exam_topic_id": "49",
    "certifcode": "Extracted or inferred certification code",
    "questiontype": "hotspot",
    "question": "Extract the full question text.",
    "answer_area": [
        { "statement": "Extracted statement text", "correct_answer": "Yes/No" }
    ],
    "explanation": "Extracted or inferred explanation."
}
```
    ***ULTRA IMPORTANT - Critical Note on "Hotspot"***:
    - If the question consists of a **single sentence** with a **dropdown or missing word**, it is **NOT** a Hotspot question. It should be labeled as `"multiplechoice"` with `[...]` representing the blank.
    - Only use `"hotspot"` if there are **multiple distinct statements**, each requiring an independent Yes/No.
    - If a **dropdown is used to complete a single sentence**, classify it as `"multiplechoice"`, NOT `"hotspot"`.
    Extract structured information from the given image of a multiple-choice question. Your output should be in JSON format with the following structure:

        {
            "exam_topic_id": "question number (e.g. '48')",
            "certifcode": "Extracted or inferred certification code (if available, else leave empty)",
            "questiontype": "multiplechoice",
            "question": "Extract the full question text, replacing missing words with '[...]' where necessary.",
            "choices": [
                { "letter": "A", "text": "Choice A text" },
                { "letter": "B", "text": "Choice B text" },
                { "letter": "C", "text": "Choice C text" },
                { "letter": "D", "text": "Choice D text" }
            ],
            "answer": "Correct answer letter (e.g. 'D')",
            "explanation": "Extracted or inferred explanation if available. If not explicitly present, generate a concise rationale."
        }
         
### **5. JSON Formatting & Validation**
- Ensure output matches the JSON structure exactly.
- Remove extra white spaces, invalid characters, and incorrect formatting.
- The final JSON must be **valid and properly structured**.
- If multiple separate **statements**, use `"questiontype": "hotspot"` and append (Y/N).
- If **a single statement with a blank**, use `"questiontype": "multiplechoice"`.
- If the question asks for selecting **one correct option**, classify it as multiple choice.
- If **drop-down menus or blanks are present**, treat it as multiple choice with `[...]` placeholders.

### **6. Final Extraction Logic**
1. Extract the full question text while maintaining structure.
2. Identify the correct answer using:
   - Marked highlights
   - Green checkboxes
   - Answer area validation
   - Explanations
3. Generate or extract a valid explanation.
4. Ensure output is a valid, well-structured JSON file.
5. **Ensure correct classification**

OUTPUT : ***ONLY THE JSON***
"""

@app.route("/add_question", methods=["GET"])
def add_question_page():
    return render_template("add_question.html")

# Update the process_question_image function
# Updated process_question_image route
@app.route("/process_question_image", methods=["POST"])
def process_question_image():
    try:
        # Get certification code
        certifcode = request.form['certifcode']
        if not re.match(r"^[a-z0-9-]+$", certifcode):
            return jsonify({"error": "Invalid certification code format"}), 400

        # Validate image
        if 'image' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
            
        file = request.files['image']
        if not allowed_file(file.filename):
            return jsonify({"error": "Invalid file type"}), 400

        # Convert image to base64
        image_bytes = file.read()
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Prepare GPT payload using OpenAI client
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROMPT_TEMPLATE},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=2000
        )

        # Clean and parse JSON response
        raw_content = response.choices[0].message.content
        if raw_content.startswith("```"):
            raw_content = "\n".join(raw_content.split("\n")[1:-1]).strip()
        
        try:
            raw_json = json.loads(raw_content)
        except json.JSONDecodeError as e:
            app.logger.error(f"JSON parse error: {str(e)}")
            return jsonify({"error": "Invalid JSON from GPT"}), 500

        # Process question type-specific data
        question_type = raw_json.get("questiontype", "multiplechoice")

        # 1. Handle Drag & Drop questions
        if question_type == "draganddrop":
            raw_json["parsed_dropzones"] = [
                {"number": idx+1, "text": item["question"]}
                for idx, item in enumerate(raw_json.get("answer_area", []))
            ]
            # Process drag source choices
            raw_json["parsed_choices"] = [
                {
                    "letter": choice.get("letter", ""),
                    "text": choice.get("text", "").strip()
                }
                for choice in raw_json.get("choices", [])
            ]

        # 2. Handle Hotspot questions
        elif question_type == "hotspot":
            raw_json["parsed_statements"] = [
                f"{item['statement']} (Y/N)"  # Add Y/N indicator
                for item in raw_json.get("answer_area", [])
            ]

        # 3. Handle Yes/No questions
        elif question_type == "yesno":
            # Convert answer to Y/N format
            answer = raw_json.get("answer", "").strip().lower()
            raw_json["answer"] = "Y" if answer.startswith("y") else "N"
            # Create standardized choices
            raw_json["parsed_choices"] = [
                {"letter": "Y", "text": "Yes"},
                {"letter": "N", "text": "No"}
            ]

        # 4. Handle Multiple Choice questions (updated)
        else:
            parsed = []
            choices = raw_json.get("choices", [])
            
            # Handle both string and list formats
            if isinstance(choices, str):
                # Split "A. Text B. Text" format
                parts = re.findall(r'([A-Za-z])[\.\)]\s*(.*?)(?=\s*[A-Za-z][\.\)]|$)', choices)
                for letter, text in parts:
                    parsed.append({
                        "letter": letter.upper(),
                        "text": text.strip()
                    })
            else:
                for choice in choices:
                    # Handle both object and string entries
                    if isinstance(choice, dict):
                        parsed.append({
                            "letter": str(choice.get("letter", "")).strip().upper(),
                            "text": choice.get("text", "").strip()
                        })
                    elif isinstance(choice, str):
                        # Split "A. Text" format from string entries
                        match = re.match(r'([A-Za-z])[\.\)]\s*(.*)', choice)
                        if match:
                            parsed.append({
                                "letter": match.group(1).upper(),
                                "text": match.group(2).strip()
                            })
            
            raw_json["parsed_choices"] = parsed

        # Add certification code
        raw_json["certifcode"] = certifcode
        
        # Store in session for final confirmation
        raw_json["exam_topic_id"] = raw_json.get("exam_topic_id", "unknown")
        session['pending_question'] = raw_json
        return jsonify(raw_json)

    except Exception as e:
        app.logger.error(f"Error processing image: {str(e)}")
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500


@app.route("/submit_question", methods=["POST"])
def submit_question():
    question_data = request.get_json()
    if not question_data:
        return jsonify({"error": "No question data provided"}), 400

    # Validate required fields
    certifcode = question_data.get("certifcode")
    exam_topic_id = question_data.get("exam_topic_id")
    question_type = question_data.get("questiontype")
    
    if not certifcode:
        return jsonify({"error": "Missing certification code"}), 400
    if not exam_topic_id:
        return jsonify({"error": "Missing exam_topic_id"}), 400
    if not question_type:
        return jsonify({"error": "Missing question type"}), 400

    try:
        exam_topic_id_num = int(exam_topic_id)
    except ValueError:
        return jsonify({"error": "exam_topic_id must be a numeric value"}), 400

    # Base question structure
    final_question = {
        "id": str(uuid.uuid4()),
        "exam_topic_id": exam_topic_id,
        "exam_topic_id_num": exam_topic_id_num,
        "certifcode": certifcode,
        "questiontype": question_type,
        "question": question_data.get("question"),
        "explanation": question_data.get("explanation")
    }

    # Handle type-specific fields
    if question_type == "multiplechoice":
        final_question.update({
            "choices": question_data.get("choices", []),
            "answer": question_data.get("answer")
        })
    elif question_type == "draganddrop":
        # Process the choices so that each becomes an object with a simple "letter" property.
        choices_data = question_data.get("choices", [])
        processed_choices = []
        for c in choices_data:
            # If the choice is a dict and has a nested structure, extract it.
            if isinstance(c, dict) and "letter" in c:
                if isinstance(c["letter"], dict) and "letter" in c["letter"]:
                    processed_choices.append({"letter": c["letter"]["letter"]})
                else:
                    processed_choices.append({"letter": c["letter"]})
            else:
                # Otherwise, assume it's already a string
                processed_choices.append({"letter": c})
        final_question.update({
            "choices": processed_choices,
            "answer_area": question_data.get("answer_area", [])
        })
    elif question_type == "hotspot":
        final_question["answer_area"] = question_data.get("answer_area", [])
    elif question_type == "yesno":
        # Validate Yes/No answer
        answer = question_data.get("answer", "").strip().upper()
        if answer not in ["Y", "N", "YES", "NO"]:
            return jsonify({"error": "Invalid answer for Yes/No question. Use Y/N"}), 400
        final_question["answer"] = "Y" if answer in ["Y", "YES"] else "N"

    # Remove fields that don't apply for certain types
    if question_type == "hotspot":
        final_question.pop("answer", None)
        final_question.pop("choices", None)
    if question_type == "yesno":
        final_question.pop("choices", None)

    # Create the document in Cosmos DB
    questions_container.create_item(body=final_question)
    return jsonify({"message": "Question added successfully!", "id": final_question["id"]})
    
    
@app.route("/clear-pending-question", methods=["POST"])
def clear_pending_question():
    session.pop('pending_question', None)
    return jsonify({"status": "cleared"})


@app.route("/manual_question", methods=["GET"])
def manual_question():
    # Get certification codes from Cosmos DB
    certif_codes = list(certif_container.query_items(
        query="SELECT DISTINCT c.certifcode FROM c",
        enable_cross_partition_query=True
    ))
    
    session['pending_question'] = {
        "id": "",
        "certifcode": "",
        "questiontype": "multiplechoice",
        "question": "",
        "choices": [],
        "answer": "",
        "explanation": ""
    }
    
    return render_template(
        "manual_question.html", 
        question_data=session['pending_question'],
        question_types=["multiplechoice", "yesno", "draganddrop", "hotspot"],
        certif_codes=[c['certifcode'] for c in certif_codes if 'certifcode' in c],
        current_page='uploads'
    )


@app.route("/submit_quiz", methods=["POST"])
def submit_quiz():
    """Update user's quiz history with question weights and performance"""
    if "user_id" not in session:
        return jsonify({"message": "User not logged in"}), 200

    try:
        user = users_container.read_item(session["user_id"], session["user_id"])
        data = request.get_json()
        certif = data.get("certif")
        answers = data.get("answers", [])

        if not certif or not isinstance(answers, list):
            return jsonify({"error": "Invalid data format"}), 400

        # Initialize quiz history structure
        quiz_history = user.setdefault("quiz_history", {})
        certif_history = quiz_history.setdefault(certif, {
            "total_questions": get_total_questions(certif),
            "answered": 0,
            "correct": 0,
            "details": {}
        })

        # Process each answer
        for ans in answers:
            qid = str(ans.get("question_id"))
            is_correct = ans.get("is_correct", False)
            
            # Get existing question data or initialize new entry
            question_data = certif_history["details"].get(qid, {
                "attempts": 0,
                "correct": False,
                "weight": 100,  # Default starting weight
                "last_attempt": datetime.utcnow().isoformat() + "Z"
            })

            # Update weight based on performance
            current_weight = question_data["weight"]
            if is_correct:
                new_weight = max(current_weight - 10, 10)  # Minimum weight 10
            else:
                new_weight = min(current_weight + 20, 200)  # Maximum weight 200

            # Update question statistics
            question_data.update({
                "attempts": question_data["attempts"] + 1,
                "correct": is_correct,
                "weight": new_weight,
                "last_attempt": datetime.utcnow().isoformat() + "Z"
            })

            # Store updated data
            certif_history["details"][qid] = question_data

        # Update summary statistics
        certif_history["answered"] = len(certif_history["details"])
        certif_history["correct"] = sum(1 for q in certif_history["details"].values() if q["correct"])

        # Save and update session
        users_container.replace_item(user["id"], user)
        
        # Re-read the updated user object and update the session
        updated_user = users_container.read_item(item=user["id"], partition_key=user["id"])

        session["updated_quiz_history"] = user.get("quiz_history", {})

        return jsonify({
            "message": "Quiz history updated with weights",
            "new_weight": new_weight  # Return the updated weight for verification
        }), 200

    except Exception as e:
        app.logger.error(f"Quiz submission error: {str(e)}")
        return jsonify({"error": "Update failed"}), 500


def get_total_questions(certifcode):
    """Get total questions count for a certification"""
    query = "SELECT VALUE COUNT(1) FROM c WHERE c.certifcode = @certif"
    params = [{"name": "@certif", "value": certifcode}]
    result = list(questions_container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
    return result[0] if result else 0

# ------------------------------------------------------------
# Fetch question
# ------------------------------------------------------------

# Get by exam_topic_id (display ID)
@app.route("/get_question_by_exam_id/<certif>/<exam_topic_id>", methods=["GET"])
def get_question_by_exam_id(certif, exam_topic_id):
    try:
        items = list(questions_container.query_items(
            query="SELECT * FROM c WHERE c.certifcode = @certif AND c.exam_topic_id = @exam_id",
            parameters=[
                {"name": "@certif", "value": certif},
                {"name": "@exam_id", "value": exam_topic_id}
            ],
            enable_cross_partition_query=True
        ))
        
        if not items:
            return jsonify({"error": "Question not found"}), 404
            
        return jsonify(process_question(items[0]))
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ------------------------------------------------------------
# FETCH CERTIF CODES
# ------------------------------------------------------------
def get_all_certifications():
    try:
        items = list(certif_container.query_items(
            query="SELECT c.certifcode, c.title, c.name, c.logo, c.logo_complete FROM c",
            enable_cross_partition_query=True
        ))
        return {
            item['certifcode']: {
                'code': item.get('certifcode', 'unknown'),
                'title': item.get('title', 'Unknown Title'),
                'name': item.get('name', 'Unknown Name'),
                'logo': item.get('logo', 'default.svg'),
                'logo_complete': item.get('logo_complete', 'default_complete.svg'),
                'progress': 0,
                'total_questions': 0
            }
            for item in items
        }
    except Exception as e:
        logging.error(f"Error fetching certifications: {str(e)}")
        return {}
    

@app.route("/get_certif", methods=["GET"])
def fetch_certif():
    # Query certifications container directly
    items = list(certif_container.query_items(
        query="SELECT c.certifcode FROM c",
        enable_cross_partition_query=True
    ))
    certifs = list(set([item["certifcode"] for item in items if "certifcode" in item]))
    return jsonify(sorted(certifs))


@app.route('/get_certif_details')
def get_certif_details():
    try:
        certifications = get_all_certifications()
        
        # Always calculate total questions per certification
        for certif_code, certif_data in certifications.items():
            try:
                count = list(questions_container.query_items(
                    query="SELECT VALUE COUNT(1) FROM c WHERE c.certifcode = @certif",
                    parameters=[{"name": "@certif", "value": certif_code}],
                    enable_cross_partition_query=True
                ))[0]
            except Exception as e:
                logging.error(f"Error counting questions for {certif_code}: {str(e)}")
                count = 0

            certif_data['total_questions'] = count

            # If user is logged in, update progress accordingly
            if 'user_id' in session:
                user_id = session['user_id']
                user = users_container.read_item(user_id, user_id)
                quiz_history = user.get('quiz_history', {})
                history = quiz_history.get(certif_code, {})
                correct_answers = sum(1 for q in history.get('details', {}).values() if q.get('correct', False))
                certif_data['progress'] = (correct_answers / count * 100) if count > 0 else 0
            else:
                certif_data['progress'] = 0
                
        return jsonify(certifications)
    
    except Exception as e:
        logging.error(f"Error in get_certif_details: {str(e)}")
        return jsonify({"error": "Server error"}), 500


@app.route("/get_certif_details/<certif>", methods=["GET"])
def get_single_certif_details(certif):
    try:
        # Get certification metadata
        certif_item = list(certif_container.query_items(
            query="SELECT * FROM c WHERE c.certifcode = @certif",
            parameters=[{"name": "@certif", "value": certif}],
            enable_cross_partition_query=True
        ))[0]

        # Get total questions count
        total_questions = list(questions_container.query_items(
            query="SELECT VALUE COUNT(1) FROM c WHERE c.certifcode = @certif",
            parameters=[{"name": "@certif", "value": certif}],
            enable_cross_partition_query=True
        ))[0]

        # Calculate progress
        progress = 0
        if 'user_id' in session:
            user = users_container.read_item(session["user_id"], session["user_id"])
            history = user.get('quiz_history', {}).get(certif, {})
            correct = sum(1 for q in history.get('details', {}).values() if q.get('correct', False))
            progress = (correct / total_questions * 100) if total_questions > 0 else 0

        return jsonify({
            "progress": progress,
            "total_questions": total_questions,
            "title": certif_item.get('title', ''),
            "name": certif_item.get('name', ''),
            "logo": certif_item.get('logo', ''),
            "logo_complete": certif_item.get('logo_complete', '')
        })

    except IndexError:
        return jsonify({"error": "Certification not found"}), 404
    except Exception as e:
        logging.error(f"Error fetching certif details: {str(e)}")
        return jsonify({"error": "Server error"}), 500


# ------------------------------------------------------------
# FETCH QUESTIONS TABLE
# ------------------------------------------------------------
@app.route("/api/questions")
def api_questions():
    try:
        certif = request.args.get("certif", "")
        page = int(request.args.get("page", 1))
        search = request.args.get("search", "").strip()
        status_filter = request.args.get("status", "").strip()
        type_filter = request.args.get("type", "").strip()
        per_page = 10

        # Base query (without pagination)
        base_query = "SELECT * FROM c WHERE c.certifcode = @certif"
        parameters = [{"name": "@certif", "value": certif}]

        if search:
            base_query += " AND c.exam_topic_id = @search"
            parameters.append({"name": "@search", "value": search})

        if type_filter:
            base_query += " AND c.questiontype = @type"
            parameters.append({"name": "@type", "value": type_filter})

        # Get ALL matching questions (without pagination)
        questions = list(questions_container.query_items(
            query=base_query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))

        # Process results and apply status filter
        current_user = fetch_current_user()
        processed = []
        for q in questions:
            status = "unanswered"
            if current_user:
                history = current_user.get("quiz_history", {}).get(certif, {})
                details = history.get("details", {}).get(q['id'], {})
                # Ensure boolean conversion
                is_correct = details.get('correct', False)
                status = "correct" if is_correct else "incorrect" if details else "unanswered"
            
            processed.append({
                "id": q['id'],
                "exam_topic_id": q.get('exam_topic_id', 'N/A'),
                "exam_topic_id_num": q.get('exam_topic_id_num', 0),  # Add for sorting
                "question": q.get('question', ''),
                "type": q.get('questiontype', 'unknown'),
                "status": status
            })

        # Apply status filter
        if status_filter:
            processed = [q for q in processed if q['status'] == status_filter]

        # Sort by exam_topic_id_num (mimic original DB ordering)
        processed.sort(key=lambda x: x['exam_topic_id_num'])

        # Paginate results
        total_count = len(processed)
        start = (page - 1) * per_page
        end = start + per_page
        paginated = processed[start:end]

        return jsonify({
            "questions": paginated,
            "total_count": total_count
        })

    except Exception as e:
        logging.error(f"API Error: {str(e)}", exc_info=True)
        return jsonify({
            "error": "Internal server error",
            "message": str(e)
        }), 500


@app.route("/question/<question_id>")
def question_detail(question_id):
    # Get question from CosmosDB
    query = "SELECT * FROM c WHERE c.id = @id"
    parameters = [dict(name="@id", value=question_id)]
    items = list(questions_container.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True
    ))
    
    if not items:
        abort(404)
    
    return render_template(
        "question_admin.html",
        question_data=items[0],
        current_page='question_admin'
    )


@app.route("/question/<question_id>", methods=["PUT"])
def update_question(question_id):
    try:
        updated_data = request.get_json()
        if not updated_data:
            return jsonify({"error": "No update data provided"}), 400

        # Get existing question first to preserve questiontype
        existing_question = questions_container.read_item(
            item=question_id,
            partition_key=updated_data.get("certifcode", "")
        )

        # Merge updates with priority to existing type-specific fields
        final_question = {
            **existing_question,
            "exam_topic_id": updated_data.get("exam_topic_id", existing_question.get("exam_topic_id")),
            "exam_topic_id_num": int(updated_data.get("exam_topic_id", existing_question.get("exam_topic_id"))),
            "question": updated_data.get("question", existing_question.get("question")),
            "explanation": updated_data.get("explanation", existing_question.get("explanation"))
        }

        # Preserve original type-specific structure
        question_type = existing_question.get("questiontype")
        if question_type == "multiplechoice":
            final_question.update({
                "choices": updated_data.get("choices", existing_question.get("choices", [])),
                "answer": updated_data.get("answer", existing_question.get("answer", "")).upper()
            })
        elif question_type == "draganddrop":
            final_question.update({
                "choices": updated_data.get("choices", existing_question.get("choices", [])),
                "answer_area": updated_data.get("answer_area", existing_question.get("answer_area", []))
            })
        elif question_type == "hotspot":
            final_question["answer_area"] = updated_data.get("answer_area", existing_question.get("answer_area", []))
        elif question_type == "yesno":
            answer = updated_data.get("answer", existing_question.get("answer", "N")).upper()
            final_question["answer"] = "Y" if answer in ["Y", "YES"] else "N"

        # Update in CosmosDB
        replaced_item = questions_container.replace_item(
            item=question_id,
            body=final_question
        )
        
        return jsonify(replaced_item)
    
    except exceptions.CosmosResourceNotFoundError:
        abort(404)
    except Exception as e:
        return jsonify({"error": f"Update failed: {str(e)}"}), 500
    
# ------------------------------------------------------------
# Run app
# ------------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True)