// manual_question.js
import { showNotification, validateFormData } from './utilities.js';


document.addEventListener('DOMContentLoaded', () => {
    // Question type templates
    const templates = {
        multiplechoice: document.getElementById('multiplechoiceTemplate').content,
        draganddrop: document.getElementById('draganddropTemplate').content,
        hotspot: document.getElementById('hotspotTemplate').content,
        yesno: document.getElementById('yesnoTemplate').content
    };

    const textarea = document.getElementById("questionText");
    const explanationarea = document.getElementById("explanation");

    adjustHeight(textarea);
    adjustHeight(explanationarea);

    function adjustHeight(element) {
        element.style.height = 'auto'; // Reset height to recalculate
        element.style.height = element.scrollHeight + 'px'; // Set height to match content
    }

    
    // Initialize form based on selected question type
    function updateForm() {
        const type = document.getElementById('questionType').value;
        const container = document.getElementById('typeSpecificFields');
        container.innerHTML = '';
        container.appendChild(document.importNode(templates[type], true));

        // Initialize first choice for multiple choice
        if (type === 'multiplechoice') {
            const firstLetterInput = container.querySelector('[name="choiceLetter[]"]');
            if (firstLetterInput && !firstLetterInput.value) {
                firstLetterInput.value = 'A';
            }
        }
    }

    
    // Fetch certification codes and populate dropdown
    fetch('/get_certif')
    .then(response => response.json())
    .then(certifs => {
    const certifSelect = document.getElementById('certifcode');
    certifSelect.innerHTML = '<option value="" disabled selected>Select a certification</option>';
    
    certifs.forEach(certif => {
        const option = document.createElement('option');
        option.value = certif;
        option.textContent = certif.toUpperCase();
        certifSelect.appendChild(option);
    });
    
    // Set initial value if present in question_data
    if (certifSelect.dataset.initialValue) {
        certifSelect.value = certifSelect.dataset.initialValue;
    }
    })
    .catch(error => console.error('Error loading certifications:', error));

    // Dynamic field handlers
    window.addChoice = function() {
        const choices = Array.from(document.querySelectorAll('[name="choiceLetter[]"]'));
        const validLetters = choices
            .map(input => input.value.toUpperCase())
            .filter(value => value.match(/^[A-Z]$/));

        let newLetter = 'A';
        if (validLetters.length > 0) {
            const lastCharCode = validLetters[validLetters.length-1].charCodeAt(0);
            newLetter = String.fromCharCode(lastCharCode + 1);
        }

        const newChoice = document.querySelector('.choice-entry').cloneNode(true);
        newChoice.querySelector('[name="choiceLetter[]"]').value = newLetter;
        newChoice.querySelector('[name="choiceText[]"]').value = '';
        document.getElementById('choicesContainer').appendChild(newChoice);
    }

    window.addDragItem = function() {
        const newItem = document.querySelector('.drag-choice-entry').cloneNode(true);
        newItem.querySelector('input').value = '';
        document.getElementById('dragChoicesContainer').appendChild(newItem);
    }

    window.addDropTarget = function() {
        const newTarget = document.querySelector('.answer-area-entry').cloneNode(true);
        newTarget.querySelectorAll('input').forEach(input => input.value = '');
        document.getElementById('answerAreaContainer').appendChild(newTarget);
    }

    window.addHotspotStatement = function() {
        const newStatement = document.querySelector('.hotspot-answer-entry').cloneNode(true);
        newStatement.querySelector('input').value = '';
        document.getElementById('hotspotAnswerAreaContainer').appendChild(newStatement);
    }

    // Form submission handler
    document.getElementById('createQuestionBtn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const formData = new FormData(document.getElementById('confirmForm'));
        const questionType = formData.get('questiontype');
    
        const questionData = {
            exam_topic_id: formData.get('exam_topic_id'),
            certifcode: formData.get('certifcode'),
            questiontype: questionType,
            question: formData.get('question'),
            explanation: formData.get('explanation'),
        };

        const submitBtn = document.getElementById('createQuestionBtn');
        const buttonText = submitBtn.querySelector('.button-text');
        const loader = submitBtn.querySelector('.loader');

        // Handle question type specific data
        switch(questionType) {
            case 'multiplechoice':
                questionData.choices = Array.from(formData.getAll('choiceLetter[]'))
                    .map((letter, index) => ({
                        letter: letter,
                        text: formData.getAll('choiceText[]')[index]
                    }));
                questionData.answer = formData.get('answer').toUpperCase().replace(/\s/g, '');
                break;
    
            case 'draganddrop':
                // Drag items (choices) - map to objects with 'letter' property
                questionData.choices = Array.from(formData.getAll('dragLetter[]')).map(letter => ({
                    letter: letter
                }));
                
                // Drop targets (answer_area)
                questionData.answer_area = Array.from(formData.getAll('dropQuestion[]'))
                    .map((question, index) => ({
                        question: question,
                        correct_answer: formData.getAll('dropAnswer[]')[index]
                    }));
                break;
    
            case 'hotspot':
                questionData.answer_area = Array.from(formData.getAll('statement[]'))
                    .map((statement, index) => ({
                        statement: statement,
                        correct_answer: formData.getAll('correct[]')[index]
                    }));
                break;
    
            case 'yesno':
                questionData.answer = formData.get('answer');
                break;
        }

        if (!validateFormData(questionData)) return;
        
        // Disable button and show loader
        submitBtn.disabled = true;
        buttonText.style.visibility = 'hidden'; // Hide text
        loader.style.display = 'block'; // Show loader
    

        try {
            const response = await fetch('/submit_question', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(questionData)
            });
    
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Submission failed');
            }
    
            showNotification('Question created successfully!', 'success');
            setTimeout(() => window.location.href = '/uploads', 1000);
            
        } catch (error) {
            showNotification(error.message || 'Failed to submit question', 'error');
            submitBtn.disabled = false;
            buttonText.style.visibility = 'visible';
            loader.style.display = 'none';
        }
    });

    // Initial setup
    document.getElementById('questionType').addEventListener('change', updateForm);
    updateForm();
});