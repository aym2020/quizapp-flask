from flask import Flask, render_template, request, jsonify, redirect, url_for
from azure.cosmos import CosmosClient
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential
from app import app
from flask_bcrypt import Bcrypt
from flask import session
from werkzeug.utils import secure_filename
from openai import OpenAI
from io import BytesIO
import json  # <--- Add this line!
import random
import os
import re
from PIL import Image
import pytesseract
import io
import base64

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
container = db.get_container_client("questions")
users_container = db.get_container_client("users")  # Ensure this is defined!

# ------------------------------------------------------------
# Home page
# ------------------------------------------------------------
def fetch_certification_counts():
    """
    Fetch certifications and compute the number of questions for each certifcode.
    """
    items = list(container.query_items(
        query="SELECT c.certifcode, c.id FROM c",
        enable_cross_partition_query=True
    ))
    counts_map = {}
    for doc in items:
        code = doc.get("certifcode")
        if code:
            counts_map[code] = counts_map.get(code, 0) + 1

    return [{"certifcode": code, "questionCount": count} for code, count in counts_map.items()]


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

@app.route("/", methods=["GET"])
def home():
    """
    Home page route that displays certifications with question counts and the current user (if logged in).
    """
    certif_results = fetch_certification_counts()
    current_user = fetch_current_user()
    return render_template("home.html", certifs=certif_results, current_user=current_user)


# ------------------------------------------------------------
# Get questions for a specific certification
# ------------------------------------------------------------
def fetch_questions(certif, limit=None):
    """
    Fetch questions for a given certification.
    If limit is provided, return up to that many questions.
    """
    if limit is not None:
        query = f"SELECT TOP {limit} * FROM c WHERE c.certifcode=@certif"
        parameters = [{"name": "@certif", "value": certif}]
    else:
        query = "SELECT * FROM c WHERE c.certifcode=@certif"
        parameters = [{"name": "@certif", "value": certif}]

    return list(container.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True
    ))

@app.route("/questions/<certif>", methods=["GET"])
def get_questions(certif):
    """
    API endpoint to return questions for a given certification.
    Optional query parameter 'limit' sets the maximum number of questions to return (default is 10).
    """
    try:
        limit = int(request.args.get('limit', 10))
    except ValueError:
        limit = 10

    questions = fetch_questions(certif, limit=limit)
    return jsonify(questions)


# -------------------------------
# Processing the Quiz
# -------------------------------
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
    for line in lines:
        if re.match(r'^[A-Z]\.\s', line):
            parts = line.split('. ', 1)
            choices.append({
                'letter': parts[0],
                'text': parts[1] if len(parts) > 1 else ''
            })
        elif not choices:
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

# Map question types to processing functions
QUESTION_PROCESSORS = {
    'hotspot': process_hotspot_question,
    'multiplechoice': process_multiple_choice,
    'draganddrop': process_drag_and_drop,
    'yesno': process_yesno,
}

@app.route("/quiz/<certif>", methods=["GET"])
def quiz(certif):
    try:
        # Use parameterized query to avoid injection issues
        query = "SELECT * FROM c WHERE c.certifcode = @certif"
        parameters = [dict(name="@certif", value=certif)]
        questions = list(container.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))

        if not questions:
            print("No questions found - redirecting to home")
            return redirect(url_for('home'))

        processed_questions = []
        for q in questions:
            # Split the question text into lines
            lines = q.get('question', '').split('\n')
            question_type = q.get('questiontype', '').lower()

            # Get the appropriate processor, if available
            processor = QUESTION_PROCESSORS.get(question_type)
            if processor:
                processed_q = processor(q, lines)
                # Ensure the question type is maintained in the processed question
                processed_q['questiontype'] = question_type
            else:
                # Fallback: treat entire text as main question if type is unknown
                processed_q = q.copy()
                processed_q['main_question'] = q.get('question', '')
            processed_questions.append(processed_q)

        # Randomize the order of questions
        random.shuffle(processed_questions)

        if not processed_questions:
            return redirect(url_for('home'))

        return render_template("quiz.html", questions=processed_questions, certif=certif)

    except Exception as e:
        print(f"ERROR in quiz route: {str(e)}")
        return redirect(url_for('home'))
    
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
        existing_questions = list(container.query_items(
            query="SELECT c.id FROM c WHERE c.certifcode = @certif",
            parameters=[{"name": "@certif", "value": certif_code}],
            enable_cross_partition_query=True
        ))

        for question in existing_questions:
            container.delete_item(
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
            container.create_item(body=question)
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
    data = request.json
    pseudo = data.get("pseudo")
    password = data.get("password")

    if not pseudo or not password:
        return jsonify({"error": "Pseudo and password are required"}), 400

    # Check if user already exists using a parameterized query
    if query_user_by_pseudo(pseudo):
        return jsonify({"error": "User already exists"}), 400

    create_new_user(pseudo, password)
    return jsonify({"message": "User registered successfully!"})

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

    if not pseudo or not password:
        return jsonify({"error": "Pseudo and password are required"}), 400

    users = query_user_by_pseudo(pseudo)
    if not users:
        return jsonify({"error": "User not found"}), 404

    user = users[0]
    if not bcrypt.check_password_hash(user["password"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    # Store user ID in session
    session["user_id"] = user["id"]
    return jsonify({"message": "Login successful!", "user_id": user["id"]})

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


# ------------------------------
# Adding a Question
# ------------------------------
@app.route("/confirm_question", methods=["GET"])
def confirm_question():
    if 'pending_question' not in session:
        return redirect(url_for('add_manual_question'))
    return render_template("confirm_question.html", question_data=session['pending_question'])

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
    "id": "question number (e.g. '187')",
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
   - Do not add "Note: The question is included in a number of questions that depicts the identical set-up. However, every question has a distinctive result. Establish if the solution satisfies the requirements."
   - If a statement is repeated, unify or remove duplicates only if certain they are exact duplicates.
   - "certifcode" must match the user input exactly as `{certifcode}` (will be overridden in the code).
   - **id**: a question number (e.g., "187", "99", etc.). Use the one provided or extracted from the question, if present.

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
#### **4.1 Multiple Choice (`"questiontype": "multiplechoice"`)**
```json
{
    "id": "19",
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

#### **4.2 Yes/No (`"questiontype": "yesno"`)**
```json
{
    "id": "3",
    "certifcode": "Extracted or inferred certification code",
    "questiontype": "yesno",
    "question": "Extract the full question text.",
    "answer": "Correct answer (e.g. 'Yes')",
    "explanation": "Extracted or inferred explanation."
}
```

#### **4.3 Drag & Drop (`"questiontype": "draganddrop"`)**
```json
{
    "id": "42",
    "certifcode": "Extracted or inferred certification code",
    "questiontype": "draganddrop",
    "question": "Extract the full question text.",
    "choices": [
        { "letter": "Label from the left column", "text": "Analytics type name" }
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
    "id": "49",
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
            "id": "question number (e.g. '48')",
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
        certifcode = request.form['certifcode'].lower()
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
            raw_json["answer"] = "Y" if answer == "yes" else "N"
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
        session['pending_question'] = raw_json
        return jsonify(raw_json)

    except Exception as e:
        app.logger.error(f"Error processing image: {str(e)}")
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500

@app.route("/submit_question", methods=["POST"])
def submit_question():
    try:
        if 'pending_question' not in session:
            return jsonify({"error": "No question to submit"}), 400  

        # Create a copy to avoid modifying the session data directly
        question = session['pending_question'].copy()
               
        # Assuming the question text is in a key named 'text'; adjust if different
        if 'text' in question:
            text = question['text']
            # Add a newline before each A., B., 1., etc., not already after a newline
            processed_text = re.sub(r'(?<!\n)(?=([A-Z]|\d+)\.)', '\n', text)
            question['text'] = processed_text
        
        print(f"✅ Inserting question: {json.dumps(question, indent=4)}")  # Debugging

        container.create_item(body=question)
        session.pop('pending_question', None)

        return jsonify({"message": "Question added successfully!"})  

    except Exception as e:
        print(f"❌ Error submitting question: {str(e)}")  # Debugging
        return jsonify({"error": str(e)}), 500  
    

@app.route("/clear-pending-question", methods=["POST"])
def clear_pending_question():
    session.pop('pending_question', None)
    return jsonify({"status": "cleared"})


@app.route("/manual_question", methods=["GET"])
def manual_question():
    if 'pending_question' not in session:
        session['pending_question'] = {
            "id": "",
            "certifcode": "",
            "questiontype": "multiplechoice",
            "question": "",
            "choices": [],
            "answer": "",
            "explanation": ""
        }
    return render_template("manual_question.html", 
                         question_data=session['pending_question'],
                         question_types=["multiplechoice", "yesno", "draganddrop", "hotspot"])

# ------------------------------------------------------------
# Run app
# ------------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True)