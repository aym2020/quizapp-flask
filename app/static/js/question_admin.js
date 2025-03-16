document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('confirmForm');
    const editToggle = document.getElementById('editToggle');
    const deleteBtn = document.getElementById('deleteBtn');
    const updateBtn = document.getElementById('updateQuestionBtn');
    const loader = updateBtn.querySelector('.loader');
    let isEditMode = false;
    let existingData = {};

    // Properly handle hidden data
    try {
        const jsonEl = document.getElementById('questionData');
        if (jsonEl && jsonEl.value) {
            existingData = JSON.parse(jsonEl.value);
        } else {
            console.warn('questionData element or value missing');
        }
    } catch(e) {
        console.error('Error parsing existing data:', e);
        existingData = {};
    }

    // Initial setup
    toggleFormEditable(false);
    
    // Text Area
    const textarea = document.getElementById("questionText");
    const explanationarea = document.getElementById("explanation");

    adjustHeight(textarea);
    adjustHeight(explanationarea);

    function adjustHeight(element) {
        element.style.height = 'auto'; // Reset height to recalculate
        element.style.height = element.scrollHeight + 'px'; // Set height to match content
    }

    // Toggle edit mode
    editToggle.addEventListener('click', () => {
        isEditMode = !isEditMode;
        toggleFormEditable(isEditMode);
        editToggle.innerHTML = isEditMode 
            ? '<i class="fas fa-times"></i> Cancel Edit'
            : '<i class="fas fa-edit"></i> Toggle Edit';
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = getFormData();
        
        if (!validateFormData(formData)) {
            return;
        }

        try {
            updateBtn.disabled = true;
            loader.style.display = "inline-block";

            const response = await fetch(window.location.pathname, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(error || 'Update failed');
            }

            window.location.reload();
        } catch (error) {
            alert(`Update failed: ${error.message}`);
        } finally {
            updateBtn.disabled = false;
            loader.style.display = "none";
        }
    });

    // Reuse validation from confirm_question.js
    function validateFormData(data) {
        // Basic validation
        if (!data.certifcode || !data.question || !data.explanation) {
            alert('Please fill all required fields');
            return false;
        }

        // Type-specific validation
        switch(data.questiontype) {
            case 'multiplechoice':
                if (!data.answer || data.choices.length < 2) {
                    alert('Multiple choice requires at least 2 choices and an answer');
                    return false;
                }
                break;
            case 'draganddrop':
                if (data.choices.length === 0 || data.answer_area.length === 0) {
                    alert('Drag & drop requires both items and drop zones');
                    return false;
                }
                break;
            case 'hotspot':
                if (data.answer_area.length === 0) {
                    alert('Hotspot requires at least one statement');
                    return false;
                }
                break;
        }
        return true;
    }

    function toggleFormEditable(enabled) {
        Array.from(form.elements).forEach(element => {
            // Only disable exam_topic_id, keep questiontype enabled but readonly
            const isDisabledField = ['exam_topic_id'].includes(element.id);
            element.disabled = !enabled || isDisabledField;
        });
    }
    function getFormData() {
        const formData = new FormData(form);
        const baseData = {
            certifcode: formData.get('certifcode') || '',
            exam_topic_id: formData.get('exam_topic_id') || '',
            // Get questiontype from existing data if form field is empty
            questiontype: formData.get('questiontype') || existingData.questiontype || '',
            question: formData.get('question') || '',
            explanation: formData.get('explanation') || ''
        };

        try {
            const jsonEl = document.getElementById('questionData');
            if (jsonEl && jsonEl.value) {
                const existingData = JSON.parse(jsonEl.value);
                ['id', '_rid', '_self', '_etag', '_ts'].forEach(field => {
                    if(existingData[field]) baseData[field] = existingData[field];
                });
            }
        } catch (e) {
            console.error('Error parsing existing data:', e);
        }

        // Type-specific data with fallbacks
        switch(baseData.questiontype) {
            case 'multiplechoice':
                baseData.choices = Array.from(formData.getAll('choiceLetter[]'))
                    .map((letter, index) => ({
                        letter: (letter || '').toUpperCase(),
                        text: formData.getAll('choiceText[]')[index] || ''
                    })).filter(c => c.letter && c.text); // Remove empty entries
                baseData.answer = (formData.get('answer') || '').toUpperCase();
                break;
    
            case 'yesno':
                baseData.answer = (formData.get('answer') || 'N').toUpperCase();
                break;
    
            case 'draganddrop':
                baseData.choices = Array.from(formData.getAll('dragLetter[]'))
                    .map(letter => ({ letter: (letter || '').trim() }))
                    .filter(c => c.letter);
                
                baseData.answer_area = Array.from(formData.getAll('dropQuestion[]'))
                    .map((q, i) => ({
                        question: q || '',
                        correct_answer: formData.getAll('dropAnswer[]')[i] || ''
                    })).filter(a => a.question);
                break;
    
            case 'hotspot':
                baseData.answer_area = Array.from(formData.getAll('statement[]'))
                    .map((s, i) => ({
                        statement: s || '',
                        correct_answer: formData.getAll('correct[]')[i] || 'No'
                    })).filter(a => a.statement);
                break;
        }
    
        // Add error handling for hidden data
        try {
            const jsonEl = document.getElementById('questionData');
            if (jsonEl && jsonEl.value) {
                const existingData = JSON.parse(jsonEl.value);
                ['id', '_rid', '_self', '_etag', '_ts'].forEach(field => {
                    if(existingData[field]) baseData[field] = existingData[field];
                });
                // Add partition key if needed
                if(existingData.certifcode) baseData.partitionKey = existingData.certifcode;
            }
        } catch (e) {
            console.error('Error parsing existing data:', e);
        }
        
        return baseData;
    }

});