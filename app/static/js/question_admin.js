// question_admin.js - Edit question functionality
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('confirmForm');
    const textarea = document.getElementById("questionText");
    const explanationarea = document.getElementById("explanation");

    if (!form) return;

    adjustHeight(textarea);
    adjustHeight(explanationarea);
    
    // Safely parse with defaults
    const questionData = {
        type: document.getElementById('questionType').value,
        choices: JSON.parse(form.dataset.choices || '[]'),
        answer_area: JSON.parse(form.dataset.answerArea || '[]'),
        answer: form.dataset.answer || ''
    };

    // Populate form based on question type
    switch(questionData.type) {
        case 'multiplechoice':
            populateMultipleChoice(questionData.choices, questionData.answer);
            break;
        case 'draganddrop':
            populateDragAndDrop(questionData.choices, questionData.answer_area);
            break;
        case 'hotspot':
            populateHotspot(questionData.answer_area);
            break;
        case 'yesno':
            document.getElementById('yesnoAnswer').value = questionData.answer;
            break;
    }

    // Set up dynamic field handlers
    window.addChoice = addChoice;
    window.addDragItem = addDragItem;
    window.addDropTarget = addDropTarget;
    window.addHotspotStatement = addHotspotStatement;

    // Update question handler
    document.getElementById('updateQuestionBtn').addEventListener('click', handleUpdateQuestion);
});

function adjustHeight(element) {
    element.style.height = 'auto'; // Reset height to recalculate
    element.style.height = element.scrollHeight + 'px'; // Set height to match content
}

// Population functions
function populateMultipleChoice(choices, correctAnswer) {
    const container = document.getElementById('choicesContainer');
    container.innerHTML = '';
    
    choices.forEach((choice) => {
        const newChoice = document.querySelector('.choice-entry').cloneNode(true);
        newChoice.querySelector('[name="choiceLetter[]"]').value = choice.letter;
        newChoice.querySelector('[name="choiceText[]"]').value = choice.text;
        newChoice.querySelector('.remove-choice').addEventListener('click', () => newChoice.remove());
        container.appendChild(newChoice);
    });
    
    document.getElementById('answer').value = correctAnswer;
}

function populateDragAndDrop(dragItems, dropTargets) {
    const dragContainer = document.getElementById('dragChoicesContainer');
    dragItems.forEach((item) => {
        const newItem = document.querySelector('.drag-choice-entry').cloneNode(true);
        newItem.querySelector('input').value = item;
        newItem.querySelector('.remove-item').addEventListener('click', () => newItem.remove());
        dragContainer.appendChild(newItem);
    });

    const dropContainer = document.getElementById('answerAreaContainer');
    dropTargets.forEach((target) => {
        const newTarget = document.querySelector('.answer-area-entry').cloneNode(true);
        newTarget.querySelector('[name="dropQuestion[]"]').value = target.question;
        newTarget.querySelector('[name="dropAnswer[]"]').value = target.correct_answer;
        newTarget.querySelector('.remove-target').addEventListener('click', () => newTarget.remove());
        dropContainer.appendChild(newTarget);
    });
}

function populateHotspot(statements) {
    const container = document.getElementById('hotspotAnswerAreaContainer');
    statements.forEach((statement) => {
        const newStatement = document.querySelector('.hotspot-answer-entry').cloneNode(true);
        newStatement.querySelector('[name="statement[]"]').value = statement.statement;
        newStatement.querySelector('[name="correct[]"]').value = statement.correct_answer;
        newStatement.querySelector('.remove-statement').addEventListener('click', () => newStatement.remove());
        container.appendChild(newStatement);
    });
}

// Dynamic field handlers
function addChoice() {
    const container = document.getElementById('choicesContainer');
    const newChoice = document.querySelector('.choice-entry').cloneNode(true);
    newChoice.querySelectorAll('input').forEach(input => input.value = '');
    container.appendChild(newChoice);
}

function addDragItem() {
    const container = document.getElementById('dragChoicesContainer');
    const newItem = document.querySelector('.drag-choice-entry').cloneNode(true);
    newItem.querySelector('input').value = '';
    container.appendChild(newItem);
}

function addDropTarget() {
    const container = document.getElementById('answerAreaContainer');
    const newTarget = document.querySelector('.answer-area-entry').cloneNode(true);
    newTarget.querySelectorAll('input').forEach(input => input.value = '');
    container.appendChild(newTarget);
}

function addHotspotStatement() {
    const container = document.getElementById('hotspotAnswerAreaContainer');
    const newStatement = document.querySelector('.hotspot-answer-entry').cloneNode(true);
    newStatement.querySelector('input').value = '';
    container.appendChild(newStatement);
}

// Form submission
async function handleUpdateQuestion(e) {
    e.preventDefault();
    const formData = new FormData(document.getElementById('confirmForm'));
    const questionId = document.querySelector('[name="question_id"]').value;

    const questionData = {
        exam_topic_id: formData.get('exam_topic_id'),
        certifcode: formData.get('certifcode'),
        questiontype: formData.get('questiontype'),
        question: formData.get('question'),
        explanation: formData.get('explanation'),
        id: questionId
    };

    // Handle type-specific data
    switch(questionData.questiontype) {
        case 'multiplechoice':
            questionData.choices = Array.from(formData.getAll('choiceLetter[]'))
                .map((letter, index) => ({
                    letter,
                    text: formData.getAll('choiceText[]')[index]
                }));
            questionData.answer = formData.get('answer');
            break;
        case 'draganddrop':
            questionData.choices = formData.getAll('dragLetter[]');
            questionData.answer_area = formData.getAll('dropQuestion[]')
                .map((question, index) => ({
                    question,
                    correct_answer: formData.getAll('dropAnswer[]')[index]
                }));
            break;
        case 'hotspot':
            questionData.answer_area = formData.getAll('statement[]')
                .map((statement, index) => ({
                    statement,
                    correct_answer: formData.getAll('correct[]')[index]
                }));
            break;
        case 'yesno':
            questionData.answer = formData.get('answer');
            break;
    }

    try {
        const response = await fetch(`/question/${questionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(questionData)
        });

        if (response.ok) {
            window.location.href = '/questions';
        } else {
            const error = await response.json();
            alert(`Error: ${error.message}`);
        }
    } catch (error) {
        console.error('Update failed:', error);
        alert('Failed to update question');
    }
}