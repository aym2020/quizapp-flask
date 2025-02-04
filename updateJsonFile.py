import json

# Load the JSON file
with open("questions.json", "r", encoding="utf-8") as file:
    data = json.load(file)

# Function to transform each question
for question in data:
    question["id"] = str(question.pop("QuestionID"))  # Rename and convert to string
    question["certifCode"] = question.pop("CertifCode")  # Rename
    question["questionType"] = question.pop("QuestionType")  # Rename
    question["choices"] = question.pop("Choices")  # Rename
    
    # Convert all other keys to lowercase
    for key in list(question.keys()):
        new_key = key.lower()
        if new_key != key:  # Avoid reassigning if already lowercase
            question[new_key] = question.pop(key)

# Save the updated JSON file
with open("questions_updated.json", "w", encoding="utf-8") as file:
    json.dump(data, file, indent=4, ensure_ascii=False)

print("JSON file updated successfully!")