//question_admin.js
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
        if (jsonEl && jsonEl.textContent) {
            existingData = JSON.parse(jsonEl.textContent);
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
        
        if (!validateFormData(formData)) return;
    
        try {
            updateBtn.disabled = true;
            loader.style.display = "inline-block";
    
            const response = await fetch(window.location.pathname, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
    
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.message || 'Update failed');
            }
    
            showNotification('Question updated successfully!', 'success');
            setTimeout(() => window.location.reload(), 1000);
            
        } catch (error) {
            showNotification(error.message || 'Update failed. Please try again.', 'error');
        } finally {
            updateBtn.disabled = false;
            loader.style.display = "none";
        }
    });

    deleteBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete this question?')) return;
    
        try {
            const response = await fetch(window.location.pathname, {
                method: 'DELETE'
            });
    
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.message || 'Delete failed');
            }
    
            showNotification('Question deleted successfully!', 'success');
            setTimeout(() => window.location.href = "{{ url_for('questions') }}", 1000);
            
        } catch (error) {
            showNotification(error.message || 'Delete failed. Please try again.', 'error');
        }
    });

    // Reuse validation from confirm_question.js
    function validateFormData(data) {
        // Basic validation
        if (!data.certifcode || !data.question || !data.explanation) {
            showNotification('Please fill all required fields', 'error');
            return false;
        }
    
        // Type-specific validation
        let isValid = true;
        switch(data.questiontype) {
            case 'multiplechoice':
                // Check minimum choices
                if (data.choices.length < 2) {
                    showNotification('Multiple choice requires at least 2 choices', 'error');
                    isValid = false;
                }
                
                // Validate answer exists in choices
                if (data.answer && isValid) {
                    const validChoices = data.choices.map(c => c.letter.toUpperCase());
                    const answerLetters = data.answer.toUpperCase().split('');
                    
                    const invalidAnswers = answerLetters.filter(
                        letter => !validChoices.includes(letter)
                    );
    
                    if (invalidAnswers.length > 0) {
                        showNotification(
                            `Invalid answer(s): ${invalidAnswers.join(', ')}. ` +
                            `Valid choices are: ${validChoices.join(', ')}`,
                            'error'
                        );
                        isValid = false;
                    }
                }
                break;
    
            case 'draganddrop':
                // Check presence of both elements
                if (data.choices.length === 0 || data.answer_area.length === 0) {
                    showNotification('Drag & drop requires both items and drop zones', 'error');
                    isValid = false;
                }
                
                // Validate drop answers exist in drag items
                if (isValid) {
                    const dragLetters = data.choices.map(c => c.letter.toUpperCase());
                    const invalidAnswers = data.answer_area
                        .filter(item => !dragLetters.includes(item.correct_answer.toUpperCase()))
                        .map(item => item.correct_answer);
    
                    if (invalidAnswers.length > 0) {
                        const uniqueInvalid = [...new Set(invalidAnswers)];
                        showNotification(
                            `Invalid drag answers: ${uniqueInvalid.join(', ')}. ` +
                            `Valid drag items are: ${dragLetters.join(', ')}`,
                            'error'
                        );
                        isValid = false;
                    }
                }
                break;
    
            case 'hotspot':
                if (data.answer_area.length === 0) {
                    showNotification('Hotspot requires at least one statement', 'error');
                    isValid = false;
                }
                break;
        }
    
        return isValid;
    }

    function toggleFormEditable(enabled) {
        Array.from(form.elements).forEach(element => {
            const isDisabledField = ['exam_topic_id'].includes(element.id);
            element.disabled = !enabled || isDisabledField;
        });
    
        // Show/hide add buttons based on question type
        const type = document.getElementById('questionType').value;
        const addButtons = {
            multiplechoice: document.querySelectorAll('.add-choice-btn'),
            draganddrop: document.querySelectorAll('.add-drag-btn, .add-drop-btn'),
            hotspot: document.querySelectorAll('.add-hotspot-btn'),
            yesno: [] // No add buttons for yesno
        }[type] || [];
    
        addButtons.forEach(btn => {
            btn.style.display = enabled ? 'inline-block' : 'none';
        });
    
        // Hide/Show remove buttons (✕ icons)
        const removeButtons = document.querySelectorAll('[class*="remove-"]');
        removeButtons.forEach(btn => {
            btn.style.display = enabled ? 'inline-block' : 'none';
        });
    
        // Hide/Show update button
        const updateButton = document.getElementById('updateQuestionBtn');
        if (updateButton) {
            updateButton.style.display = enabled ? 'block' : 'none';
        }
    }

    // Clone existing empty template or last entry
    window.addChoice = function() {
        const container = document.getElementById('choicesContainer');
        const entries = container.querySelectorAll('.choice-entry');
        const newEntry = entries[entries.length - 1].cloneNode(true);
        newEntry.querySelectorAll('input').forEach(input => input.value = '');
        container.appendChild(newEntry);
    }

    window.addDragItem = function() {
        const container = document.getElementById('dragChoicesContainer');
        const newItem = container.lastElementChild.cloneNode(true);
        newItem.querySelector('input').value = '';
        container.appendChild(newItem);
    }

    window.addDropTarget = function() {
        const container = document.getElementById('answerAreaContainer');
        const newTarget = container.lastElementChild.cloneNode(true);
        newTarget.querySelectorAll('input').forEach(input => input.value = '');
        container.appendChild(newTarget);
    }

    window.addHotspotStatement = function() {
        const container = document.getElementById('hotspotAnswerAreaContainer');
        const newStatement = container.lastElementChild.cloneNode(true);
        newStatement.querySelectorAll('input, select').forEach(el => {
            if(el.tagName === 'SELECT') el.selectedIndex = 0;
            else el.value = '';
        });
        container.appendChild(newStatement);
    }

    function initAddButtons() {
        const type = document.getElementById('questionType').value;
        const buttons = `
            ${type === 'multiplechoice' ? `<button type="button" class="button cmd-btn add-choice-btn" onclick="addChoice()" style="display: none;">
                <i class="fas fa-plus"></i> Add Choice
            </button>` : ''}
            
            ${type === 'draganddrop' ? `
            <div class="button-group">
                <button type="button" class="button cmd-btn add-drag-btn" onclick="addDragItem()" style="display: none;">
                    <i class="fas fa-plus"></i> Add Drag Item
                </button>
                <button type="button" class="button cmd-btn add-drop-btn" onclick="addDropTarget()" style="display: none;">
                    <i class="fas fa-plus"></i> Add Drop Zone
                </button>
            </div>` : ''}
            
            ${type === 'hotspot' ? `<button type="button" class="button cmd-btn add-hotspot-btn" onclick="addHotspotStatement()" style="display: none;">
                <i class="fas fa-plus"></i> Add Statement
            </button>` : ''}
        `;
    
        const buttonContainer = document.getElementById('dynamicButtons');
        const adminControls = document.querySelector('.admin-controls');
        
        if (!buttonContainer && adminControls) {
            const div = document.createElement('div');
            div.id = 'dynamicButtons';
            div.innerHTML = buttons;
            adminControls.parentNode.insertBefore(div, adminControls);
        } else if (buttonContainer) {
            buttonContainer.innerHTML = buttons;
        }
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

    function showNotification(message, type = 'success') {
        const icon = type === 'success' 
            ? '<i class="fas fa-check-circle"></i>'
            : '<i class="fas fa-exclamation-triangle"></i>';
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `${icon} ${message}`;
        
        document.body.appendChild(notification);
        
        // Auto-remove after animation
        setTimeout(() => {
            notification.remove();
        }, 3600);
    }

    // Update on type change (if applicable)
    document.getElementById('questionType')?.addEventListener('change', () => {
        initAddButtons();
        toggleFormEditable(isEditMode);
    });

    // Initial setup
    initAddButtons();
    toggleFormEditable(isEditMode);

});