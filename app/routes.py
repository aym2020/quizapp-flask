from flask import Flask, render_template, request, jsonify, redirect, url_for
from azure.cosmos import CosmosClient
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential
from app import app
from flask_bcrypt import Bcrypt
from flask import session

import random
import os
import re

# Azure Key Vault details
KEY_VAULT_URL = "https://quizapp-keyvault.vault.azure.net/" 
COSMOS_SECRET_NAME = "CosmosDBConnectionString"
FLASK_SECRET_NAME = "FlaskSecretKey"

# Authenticate to Azure Key Vault
credential = DefaultAzureCredential()
secret_client = SecretClient(vault_url=KEY_VAULT_URL, credential=credential)

# Retrieve the Cosmos DB connection string from Key Vault
try:
    COSMOS_DB_CONN = secret_client.get_secret(COSMOS_SECRET_NAME).value
    print("Cosmos DB connection string retrieved from Azure Key Vault.")
except Exception as e:
    raise ValueError(f"Failed to retrieve secret from Azure Key Vault: {e}")

# Initialize the Cosmos DB client
client = CosmosClient.from_connection_string(COSMOS_DB_CONN)

# Get the database and container
db = client.get_database_client("quizdb")
container = db.get_container_client("questions")
users_container = db.get_container_client("users")  # Ensure this is defined!


@app.route("/test")
def test():
    return "Flask is working!"


# ------------------------------------------------------------
# Home page
# ------------------------------------------------------------
@app.route("/", methods=["GET"])
def home():
    # Gather certifications + question counts
    items = list(container.query_items(
        query="SELECT c.certifcode, c.id FROM c",
        enable_cross_partition_query=True
    ))

    # Group by certifcode
    counts_map = {}
    for doc in items:
        code = doc["certifcode"]
        counts_map[code] = counts_map.get(code, 0) + 1

    results = [{"certifcode": code, "questionCount": count} for code, count in counts_map.items()]

    # Check if user is logged in
    current_user = None
    if "user_id" in session:
        user_id = session["user_id"]
        try:
            current_user = users_container.read_item(item=user_id, partition_key=user_id)
        except Exception as e:
            print(f"Error fetching user: {e}")
            session.pop("user_id", None)  # Clear invalid session

    return render_template("home.html", certifs=results, current_user=current_user)


# ------------------------------------------------------------
# Get questions for a specific certification
# ------------------------------------------------------------
@app.route("/questions/<certif>", methods=["GET"])
def get_questions(certif):
    limit = int(request.args.get('limit', 10))
    questions = list(container.query_items(
        query=f"SELECT TOP {limit} * FROM c WHERE c.certifcode='{certif}'",
        enable_cross_partition_query=True
    ))
    return jsonify(questions)


# ------------------------------------------------------------
# Fetch multiple-choice and hotspot questions
# ------------------------------------------------------------
@app.route("/quiz/<certif>", methods=["GET"])
def quiz(certif):
    try:      
        # Use parameterized query to avoid issues
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
        
        # Process questions
        processed_questions = []
        for q in questions:
            question_text = q.get('question', '')
            lines = question_text.split('\n')
            main_lines = []
            
            if q['questiontype'] == 'hotspot':
                # Process hotspot questions
                statements = []
                for line in lines:
                    if line.strip().startswith('- '):
                        statement = re.sub(r'^-\s*', '', line.strip())  # Remove leading '- '
                        statement = re.sub(r'\s*\(Y/N\)$', '', statement)  # Remove '(Y/N)'
                        statements.append(statement)
                    elif not statements:  # Collect main question lines
                        main_lines.append(line)
                
                processed_q = q.copy()
                processed_q['main_question'] = '\n'.join(main_lines).strip()
                processed_q['parsed_statements'] = statements
                processed_q['questiontype'] = 'hotspot'

            elif q['questiontype'] == 'multiplechoice':
                # Process multiple-choice questions
                choices = []
                for line in lines:
                    if re.match(r'^[A-Z]\.\s', line):
                        parts = line.split('. ', 1)
                        choices.append({
                            'letter': parts[0],
                            'text': parts[1] if len(parts) > 1 else ''
                        })
                    else:
                        if not choices:
                            main_lines.append(line)
                
                processed_q = q.copy()
                processed_q['main_question'] = '\n'.join(main_lines).strip()
                processed_q['parsed_choices'] = choices
                processed_q['questiontype'] = 'multiplechoice'
            
            elif q['questiontype'] == 'draganddrop':
                choices = []
                dropzones = []
                main_lines = []
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
                        # Assume the first line(s) before any choices/dropzones is the main question
                        if not choices and not dropzones:
                            main_lines.append(line)
                processed_q = q.copy()
                processed_q['main_question'] = '\n'.join(main_lines).strip()
                processed_q['parsed_choices'] = choices
                processed_q['parsed_dropzones'] = dropzones
                processed_q['questiontype'] = 'draganddrop'

            elif q['questiontype'] == 'yesno':
                # Process yes/no questions (similar to multiple choice)
                choices = []
                for line in lines:
                    if re.match(r'^[A-Z]\.\s', line):
                        parts = line.split('. ', 1)
                        choices.append({
                            'letter': parts[0],
                            'text': parts[1] if len(parts) > 1 else ''
                        })
                    else:
                        if not choices:
                            main_lines.append(line)
                
                processed_q = q.copy()
                processed_q['main_question'] = '\n'.join(main_lines).strip()
                processed_q['parsed_choices'] = choices
                processed_q['questiontype'] = 'yesno'
            
            processed_questions.append(processed_q)
        
        # Shuffle questions to randomize order
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
        certif_code = request.args.get("certifcode")
        if not certif_code:
            return jsonify({"error": "Certification code is required"}), 400

        data = request.get_json()
        if not data or not isinstance(data, list):
            return jsonify({"error": "Invalid JSON data"}), 400

        # Validate each question's certifcode matches the target certification
        for question in data:
            if question.get("certifcode") != certif_code:
                return jsonify({
                    "error": f"Question with ID {question.get('id')} has mismatched certifcode. Expected {certif_code}, found {question.get('certifcode')}."
                }), 400

        # Delete existing questions for certif_code
        existing_questions = list(container.query_items(
            query=f"SELECT c.id FROM c WHERE c.certifcode='{certif_code}'",
            enable_cross_partition_query=True
        ))

        for q in existing_questions:
            container.delete_item(item=q["id"], partition_key=certif_code)

        # Insert new questions
        for question in data:
            # Ensure certifcode is correct (already validated)
            try:
                container.create_item(question)
            except Exception as e:
                print(f"Error inserting question ID {question['id']}: {str(e)}")
                return jsonify({"error": f"Failed to insert question ID {question['id']}"}), 500

        return jsonify({"message": f"All existing questions for {certif_code} deleted. {len(data)} new questions uploaded!"}), 200

    # In the upload_questions route:
    except Exception as e:
        # Add proper error logging
        app.logger.error(f"Upload error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500  # Don't expose details
    

# ------------------------------------------------------------
# User authentication
# ------------------------------------------------------------
bcrypt = Bcrypt()

# Register new user
@app.route("/register", methods=["POST"])
def register():
    data = request.json
    pseudo = data.get("pseudo")
    password = data.get("password")

    if not pseudo or not password:
        return jsonify({"error": "Pseudo and password are required"}), 400

    # Check if user already exists
    existing_user = list(users_container.query_items(
        query=f"SELECT * FROM c WHERE c.pseudo='{pseudo}'",
        enable_cross_partition_query=True
    ))
    
    if existing_user:
        return jsonify({"error": "User already exists"}), 400

    # Hash the password before storing
    hashed_password = bcrypt.generate_password_hash(password).decode("utf-8")

    new_user = {
        "id": f"user_{pseudo}",
        "pseudo": pseudo,
        "password": hashed_password,
        "quiz_history": {}
    }

    users_container.create_item(new_user)

    return jsonify({"message": "User registered successfully!"})

# ------------------------------------------------------------
# Session management
# ------------------------------------------------------------
app.secret_key = secret_client.get_secret(FLASK_SECRET_NAME).value

@app.route("/logout", methods=["GET"])
def logout():
    session.pop("user_id", None)
    return jsonify({"message": "Logged out successfully"})


@app.route("/login", methods=["POST"])
def login():
    data = request.json
    pseudo = data.get("pseudo")
    password = data.get("password")

    if not pseudo or not password:
        return jsonify({"error": "Pseudo and password are required"}), 400

    user = list(users_container.query_items(
        query=f"SELECT * FROM c WHERE c.pseudo='{pseudo}'",
        enable_cross_partition_query=True
    ))

    if not user:
        return jsonify({"error": "User not found"}), 404

    user = user[0]

    if not bcrypt.check_password_hash(user["password"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    # Store user ID in session
    session["user_id"] = user["id"]

    return jsonify({"message": "Login successful!", "user_id": user["id"]})

@app.route("/current_user", methods=["GET"])
def current_user():
    if "user_id" in session:
        user = users_container.read_item(item=session["user_id"], partition_key=session["user_id"])
        return jsonify({"pseudo": user["pseudo"]})
    return jsonify({"pseudo": None})

# ------------------------------------------------------------
# Run app
# ------------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True)