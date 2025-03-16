// static/js/confirm_question.js
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

    function showNotification(message, type = 'success') {
        const icon = type === 'success' 
            ? '<i class="fas fa-check-circle"></i>'
            : '<i class="fas fa-exclamation-triangle"></i>';
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `${icon} ${message}`;
        
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3600);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const formData = new FormData(form);
        const questionType = formData.get('questiontype');

        // Build base data object
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
        
        // Disable button and show loader
        submitBtn.disabled = true;
        buttonText.style.visibility = 'hidden';
        loader.style.display = 'block';

        try {
            // Handle different question types
            if (questionType === 'multiplechoice') {
                data.choices = Array.from(formData.getAll('choiceLetter[]'))
                    .map((letter, index) => ({
                        letter: letter.toUpperCase(),
                        text: formData.getAll('choiceText[]')[index]
                    }));
                data.answer = formData.get('answer').toUpperCase();

                // Validation: Check answer exists in choices
                const validChoices = data.choices.map(c => c.letter);
                const answerLetters = data.answer.split('');
                
                const invalidAnswers = answerLetters.filter(
                    letter => !validChoices.includes(letter)
                );

                if (invalidAnswers.length > 0) {
                    throw new Error(`Invalid answer(s): ${invalidAnswers.join(', ')}. 
                        Valid choices are: ${validChoices.join(', ')}`);
                }

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

                // Validation: Check all answers exist in drag items
                const invalidAnswers = data.answer_area
                    .filter(item => !dragLetters.includes(item.correct_answer))
                    .map(item => item.correct_answer);

                if (invalidAnswers.length > 0) {
                    throw new Error(`Invalid drag answers: ${[...new Set(invalidAnswers)].join(', ')}. 
                        Valid drag items are: ${dragLetters.join(', ')}`);
                }

            } else if (questionType === 'hotspot') {
                data.answer_area = Array.from(formData.getAll('statement[]'))
                    .map((statement, index) => ({
                        statement: statement,
                        correct_answer: formData.getAll('correct[]')[index]
                    }));
            }

            // Proceed with submission if validations pass
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
            showNotification(error.message || 'Failed to submit question', 'error');
            submitBtn.disabled = false;
            buttonText.style.visibility = 'visible';
            loader.style.display = 'none';
        }
    }

    form.addEventListener('submit', handleSubmit);
});