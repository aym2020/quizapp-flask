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
                'text': parts[1] if len(parts) > 1 else ''
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
    # If no pending question in the session, redirect back to the add question page (or home)
    if 'pending_question' not in session:
        return redirect(url_for('add_question_page'))
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
    "choices": "Type-specific format",
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
   - Do not add "HOTSPOT -" prefix in the question or any wording like "Hot Area:".
   - If a statement is repeated, unify or remove duplicates only if certain they are exact duplicates.
   - "certifcode" must match the user input exactly as `{certifcode}` (will be overridden in the code).
   - **id**: a question number (e.g., "187", "99", etc.). Use the one provided or extracted from the question, if present.

2. **Question Types & Field Requirements**

   2.1 **Multiple Choice** (`"questiontype": "multiplechoice"`)
       - **question**: The full text with any lettered choices in the format:
         A. Option1 B. Option2 ...
       - **choices**: The single string "ABCDE" (or however many letters), if the question has 5 lettered choices (A-E).
       - **answer**: Uppercase letters (e.g., "ACD") indicating correct answers in ascending order.
       - **explanation**: Must justify the selected letters. You can find it after "Correct Answer" part in the image.

   2.2 **Drag & Drop** (`"questiontype": "draganddrop"`)
       - **question**: Possibly includes "A. Term1 B. Term2 1. Definition1 2. Definition2".
       - **choices**: The letter-number sets, e.g., "A. Term1 B. Term2 1. Definition1 2. Definition2"
       - **answer**: Pairs in uppercase-lowercase or uppercase-number, e.g. "A1B2C4".
       - **explanation**: Must clarify each pairing. You can find it after "Correct Answer" part in the image.

   2.3 **Hotspot** (`"questiontype": "hotspot"`)
       - This applies **only** if the question has multiple statements each requiring a Yes/No. Format each statement as:
         - Some statement (Y/N) - Another statement (Y/N)
       - **choices**: Always "YN"
       - **answer**: A Y/N sequence matching the number of statements (e.g., "NYY").
       - **explanation**: Must confirm or deny each statement. You can find it after "Correct Answer" part in the image.

       ***Critical Note on "Hotspot":***
       If the question consists of one or more **partial sentences** with **fill-in-the-blank** or **drop-down placeholders**, and not multiple distinct statements each requiring a Yes/No (Y/N), it is **NOT** a Hotspot question. Instead, it should be labeled as **multiplechoice**.
       - How to Handle Fill-in-the-Blank Questions:

        a. **If the missing text is in the middle of the sentence**:
        - Replace the missing section with `[...]`.
        - Example:  
            **Original**: "When implementing a SaaS solution, you are responsible for [ ] scalability."  
            **Formatted**: `"question": "When implementing a SaaS solution, you are responsible for [...] scalability. A. Using Availability Zones B. Using Load Balancers C. Using a single VM"`

        b. **If the missing text is at the beginning of the sentence**:
        - Assume the first words are omitted.
        - Example:  
            **Original**: "[ ] allows you to create and manage virtual machines."  
            **Formatted**: `"question": "[...] allows you to create and manage virtual machines. A. Using Availability Zones B. Using Load Balancers C. Using a single VM"`

        c. **If the missing text is at the end of the sentence**:
        - Keep the sentence complete and append a colon (`:`).
        - Skip a line, then list the available choices.
        - Example:
            ```
            "question": "Azure provides high availability by:  A. Using Availability Zones B. Using Load Balancers C. Using a single VM"
            ```

        d. **If the question provides lettered or bullet choices for each blank**:
        - Treat it as a multiple-choice question.
        - Example:
            ```
            "question": "Azure provides identity and access management with: A. Azure Active Directory B. Azure Security Center C. Azure Key Vault"
            ```
            `"choices": "ABC"`
            `"answer": "A"`

        e. **Ensure correct classification**:
        - If multiple separate **statements**, use `"questiontype": "hotspot"` and append (Y/N).
        - If **a single statement with a blank**, use `"questiontype": "multiplechoice"`.
        - If the question asks for selecting **one correct option**, classify it as multiple choice.
        - If **drop-down menus or blanks are present**, treat it as multiple choice with `[...]` placeholders.

        f. **How to Find the Right Answer**
        - The correct answer is highlighted in **green** in the image.
        - If multiple answers are possible, ensure all correct choices are included.
        - Answers should be formatted properly based on the question type (e.g., "ABC" for multiple choice, "A1B2" for drag & drop).

   2.4 **Yes/No** (`"questiontype": "yesno"`)
       - Single Y/N answer if the question specifically asks a yes/no prompt.
       - **choices** must be "YN".
       - **answer** is either "Y" or "N".
       - **explanation**: Must confirm or deny each statement. You can find it after "Correct Answer" part in the image.

3. **How to Find the Explanation**
   - The explanation is usually found in the **"Correct Answer"** section of the image.
   - It may be written below the correct answer or in a reference paragraph at the bottom.
   - Extract **only** the relevant explanation and exclude unnecessary text such as links or unrelated details.

4. **Validation Checks**
   - If "select X answers" is indicated, ensure the **answer** has exactly X letters.
   - For drag & drop, match pairs to the listed lettered and numbered items.
   - Ensure the **certifcode** exactly matches the user input.
   - The choices must be written in the question. In the field **choices** only the corresponding letter.
   - Ensure to have choices in the question (e.g. A. blabla B. blabla etc. or Yes, No but choices **must be* present)
   - Ensure your answer is extracted from the image
   - Ensure the answer you gave is correct.
   - Ensure **choices** is only capital letters and/or number (e.g. ABCD or A1B2 etc.)

5. **Output Format**
- Return **only** the JSON object with no extra commentary or text.
- The final JSON must pass strict JSON validation (no trailing commas, no newlines `\n`, no code fences).
"""

@app.route("/add_question", methods=["GET"])
def add_question_page():
    return render_template("add_question.html")

# Update the process_question_image function
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
            model="chatgpt-4o-latest",
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

        # Debug: Log the raw response content
        raw_content = response.choices[0].message.content
        app.logger.debug(f"JSON generated before cleaning: {raw_content}")

        # Clean the raw response to remove markdown code fences, if present
        if raw_content.startswith("```"):
            lines = raw_content.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            raw_content = "\n".join(lines).strip()

        app.logger.debug(f"JSON generated after cleaning: {raw_content}")

        
        app.logger.debug(f"Fixed JSON content: {raw_content}")

        # Attempt to parse the fixed JSON content
        try:
            raw_json = json.loads(raw_content)
        except json.JSONDecodeError:
            app.logger.error(f"Failed to parse GPT response as JSON even after fixing. Fixed content: {raw_content}")
            return jsonify({"error": "Failed to parse GPT response as JSON"}), 500

        # Add server-side validation
        required_fields = ['question', 'answer', 'questiontype', 'choices']
        for field in required_fields:
            if field not in raw_json:
                return jsonify({"error": f"Missing {field} in GPT response"}), 500

        # Add certification code and generate ID
        raw_json['certifcode'] = certifcode
            
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
    


# ------------------------------------------------------------
# Run app
# ------------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True)