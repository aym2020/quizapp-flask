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

        try {
            // Handle different question types
            if (questionType === 'multiplechoice') {
                data.choices = Array.from(formData.getAll('choiceLetter[]'))
                    .map((letter, index) => ({
                        letter: letter,
                        text: formData.getAll('choiceText[]')[index]
                    }));
                data.answer = formData.get('answer');

            } else if (questionType === 'yesno') {
                data.answer = formData.get('answer');

            } else if (questionType === 'draganddrop') {
                data.choices = Array.from(formData.getAll('dragLetter[]'))
                    .map(letter => ({ letter }));
                
                data.answer_area = Array.from(formData.getAll('dropQuestion[]'))
                    .map((question, index) => ({
                        question: question,
                        correct_answer: formData.getAll('dropAnswer[]')[index]
                    }));

            } else if (questionType === 'hotspot') {
                data.answer_area = Array.from(formData.getAll('statement[]'))
                    .map((statement, index) => ({
                        statement: statement,
                        correct_answer: formData.getAll('correct[]')[index]
                    }));
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

            alert('Question created successfully!');
            window.location.href = '/uploads';
            
        } catch (error) {
            console.error('Submission error:', error);
            alert(`Failed to submit question: ${error.message}`);
        }
    }

    form.addEventListener('submit', handleSubmit);
});