// static/js/confirm_question.js
import { showNotification, validateFormData } from './utilities.js';


document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('confirmForm');

    const textarea = document.getElementById("questionText");
    const explanationarea = document.getElementById("explanation");

    adjustHeight(textarea);
    adjustHeight(explanationarea);

    function adjustHeight(element) {
        element.style.height = 'auto'; // Reset height to recalculate
        element.style.height = element.scrollHeight + 'px'; // Set height to match content
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const formData = new FormData(form);
        const questionType = formData.get('questiontype');
    
        const data = {
            exam_topic_id: formData.get('exam_topic_id'),
            certifcode: formData.get('certifcode'),
            questiontype: questionType,
            question: formData.get('question'),
            explanation: formData.get('explanation'),
        };
    
        const submitBtn = document.getElementById('createQuestionBtn');
        const buttonText = submitBtn.querySelector('.button-text');
        const loader = submitBtn.querySelector('.loader');
        
        submitBtn.disabled = true;
        buttonText.style.visibility = 'hidden';
        loader.style.display = 'block';
    
        try {
            if (questionType === 'multiplechoice') {
                data.choices = Array.from(formData.getAll('choiceLetter[]'))
                    .map((letter, index) => ({
                        letter: letter.toUpperCase(),
                        text: formData.getAll('choiceText[]')[index]
                    }));
                data.answer = formData.get('answer').toUpperCase();
    
            } else if (questionType === 'yesno') {
                data.answer = formData.get('answer');
    
            } else if (questionType === 'draganddrop') {
                const dragLetters = Array.from(formData.getAll('dragLetter[]'))
                    .map(letter => letter.toUpperCase());
                
                data.choices = dragLetters.map(letter => ({ letter }));
                
                data.answer_area = Array.from(formData.getAll('dropQuestion[]'))
                    .map((question, index) => ({
                        question: question,
                        correct_answer: formData.getAll('dropAnswer[]')[index].toUpperCase()
                    }));
    
            } else if (questionType === 'hotspot') {
                data.answer_area = Array.from(formData.getAll('statement[]'))
                    .map((statement, index) => ({
                        statement: statement,
                        correct_answer: formData.getAll('correct[]')[index]
                    }));
            }
    
            // Validate using utility function
            if (!validateFormData(data)) {
                throw new Error('Validation failed');
            }
    
            const response = await fetch('/submit_question', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
    
            const text = await response.text();
            const result = text ? JSON.parse(text) : {};
    
            if (!response.ok) {
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }
    
            showNotification('Question created successfully!', 'success');
            setTimeout(() => window.location.href = '/uploads', 1000);
            
        } catch (error) {
            console.error('Submission error:', error);
            // Error message already shown by validateFormData, avoid duplication
            if (!error.message.includes('Validation failed')) {
                showNotification(error.message || 'Failed to submit question', 'error');
            }
            submitBtn.disabled = false;
            buttonText.style.visibility = 'visible';
            loader.style.display = 'none';
        }
    }

    form.addEventListener('submit', handleSubmit);
});