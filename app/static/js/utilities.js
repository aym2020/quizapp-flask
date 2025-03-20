// static/js/utilities.js
export function showNotification(message, type = 'success') {
    const icon = type === 'success' 
        ? '<i class="fas fa-check-circle"></i>'
        : '<i class="fas fa-exclamation-triangle"></i>';
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `${icon} ${message}`;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3600);
}

export function validateMultipleChoice(data) {
    let isValid = true;
    
    // Validate answer exists
    if (!data.answer) {
        showNotification('Please provide a correct answer', 'error');
        return false;
    }

    // Convert answer to uppercase and split into letters
    const answer = data.answer.toUpperCase().replace(/\s/g, ''); // Remove spaces
    const answerLetters = answer.split('');
    
    // Check for empty answer
    if (answerLetters.length === 0) {
        showNotification('Answer cannot be empty', 'error');
        return false;
    }

    // Check for duplicate answer letters
    const uniqueAnswerLetters = [...new Set(answerLetters)];
    if (uniqueAnswerLetters.length !== answerLetters.length) {
        showNotification('Answer contains duplicate letters', 'error');
        isValid = false;
    }

    // Check for duplicate choice letters
    const choiceLetters = data.choices.map(c => c.letter.toUpperCase());
    const uniqueChoiceLetters = [...new Set(choiceLetters)];
    if (uniqueChoiceLetters.length !== choiceLetters.length) {
        showNotification('Choices contain duplicate letters', 'error');
        isValid = false;
    }

    // Validate answers against choices
    const invalidAnswers = answerLetters.filter(
        letter => !choiceLetters.includes(letter)
    );

    if (invalidAnswers.length > 0) {
        showNotification(
            `Invalid answer(s): ${invalidAnswers.join(', ')}. Valid choices are: ${choiceLetters.join(', ')}`,
            'error'
        );
        isValid = false;
    }
    
    return isValid;
}

export function validateDragAndDrop(data) {
    let isValid = true;
    
    if (data.choices.length === 0 || data.answer_area.length === 0) {
        showNotification('Drag & drop requires both items and drop zones', 'error');
        isValid = false;
    }
    
    if (isValid) {
        const dragLetters = data.choices.map(c => c.letter.toUpperCase());
        const invalidAnswers = data.answer_area
            .filter(item => !dragLetters.includes(item.correct_answer.toUpperCase()))
            .map(item => item.correct_answer);

        if (invalidAnswers.length > 0) {
            const uniqueInvalid = [...new Set(invalidAnswers)];
            showNotification(
                `Invalid drag answers: ${uniqueInvalid.join(', ')}. Valid drag items are: ${dragLetters.join(', ')}`,
                'error'
            );
            isValid = false;
        }
    }
    
    return isValid;
}

export function validateFormData(data) {
    if (!data.certifcode || !data.question || !data.explanation) {
        showNotification('Please fill all required fields', 'error');
        return false;
    }

    switch(data.questiontype) {
        case 'multiplechoice': 
            if (!data.answer) {
                showNotification('Please provide a correct answer', 'error');
                return false;
            }
            return validateMultipleChoice(data);
        case 'draganddrop': return validateDragAndDrop(data);
        case 'hotspot': 
            if (data.answer_area.length === 0) {
                showNotification('Hotspot requires at least one statement', 'error');
                return false;
            }
            return true;
        default: return true;
    }
}