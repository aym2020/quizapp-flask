import json
import os

FILTER = "hotspot"

# Define paths
current_dir = os.path.dirname(__file__)  # Get the directory of the current script (toolbox folder)
data_dir = os.path.join(current_dir, "..", "data")  # Navigate to the data folder in the root

# Input and output file paths
input_file_path = os.path.join(data_dir, "questions_updated.json")
output_file_path = os.path.join(data_dir, f"filtered_questions_{FILTER}.json")

# Load the JSON file
with open(input_file_path, "r", encoding="utf-8") as file:
    data = json.load(file)

# Filter only multiple-choice questions
filtered_data = [q for q in data if q.get("questiontype") == FILTER]

# Save the filtered questions to a new JSON file
with open(output_file_path, "w", encoding="utf-8") as file:
    json.dump(filtered_data, file, indent=4, ensure_ascii=False)

print(f"Filtered {len(filtered_data)} {FILTER} questions and saved to '{output_file_path}'.")
