// static/js/confirm_question.js
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('confirmForm');
    
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
            data.choices = Array.from(formData.getAll('dragChoiceLetter[]'))
                .map((letter) => ({ letter }));
            data.answer_area = Array.from(formData.getAll('answerAreaQuestion[]'))
                .map((question, index) => ({
                    question: question,
                    correct_answer: formData.getAll('answerAreaCorrect[]')[index]
                }));

        } else if (questionType === 'hotspot') {
            data.answer_area = Array.from(formData.getAll('hotspotStatement[]'))
                .map((statement, index) => ({
                    statement: statement,
                    correct_answer: formData.getAll('hotspotCorrect[]')[index]
                }));
        }

        try {
            const response = await fetch('/submit_question', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            
            if (response.ok) {
                alert('Question created successfully!');
                window.location.href = '/uploads';
            } else {
                alert(`Error: ${result.error}`);
            }
        } catch (error) {
            console.error('Submission error:', error);
            alert('Failed to submit question. Please check the console for details.');
        }
    }

    form.addEventListener('submit', handleSubmit);
});