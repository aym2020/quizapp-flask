import json

# Load the JSON file
with open("questions_updated.json", "r", encoding="utf-8") as file:
    data = json.load(file)

FILTER = "multiplechoice"

# Filter only multiple-choice questions
filtered_data = [q for q in data if q.get("questiontype") == FILTER]

# Save the filtered questions to a new JSON file
with open(f"filtered_questions_{FILTER}.json", "w", encoding="utf-8") as file:
    json.dump(filtered_data, file, indent=4, ensure_ascii=False)

print(f"Filtered {len(filtered_data)} multiple-choice questions and saved to 'filtered_questions.json'.")
