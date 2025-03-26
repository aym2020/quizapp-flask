// Quiz.js

// Global Variables
let questions = [];
let certif = null;
let currentIndex = 0;
let selectedAnswers = [];
let hotspotAnswers = [];
let dragDropAnswer = "";
let certifDetails = null;
let questionCount = 0;


// Initialization
async function initializeQuiz() {
  try {
    const pathParts = window.location.pathname.split('/');
    certif = pathParts[pathParts.length - 1];

    // Check localStorage for existing question
    const savedQuestionId = localStorage.getItem(`currentQuestion_${certif}`);
    let shouldLoadNew = true;

    if (savedQuestionId) {
      try {
        const response = await fetch(`/get_question/${certif}/${savedQuestionId}`);
        if (response.ok) {
          questions = [await response.json()];
          currentIndex = 0;
          shouldLoadNew = false;
        }
      } catch (error) {
        console.log('No saved question found');
      }
    }
    
    // Fetch certification details
    const certifResponse = await fetch(`/get_certif_details/${certif}`);
    if (!certifResponse.ok) {
      throw new Error(`Failed to load certification details: ${certifResponse.status}`);
    }
    certifDetails = await certifResponse.json();
    
    // Initialize progress bar with actual counts
    const initialCorrect = Math.round((certifDetails.progress / 100) * certifDetails.total_questions);
    updateCertifProgress(initialCorrect, certifDetails.total_questions);
    
    // Show loading state
    document.getElementById('question-id').textContent = "Loading...";
    
    if (shouldLoadNew) {
      // Fetch initial question
      const response = await fetch(`/questions/${certif}?limit=1`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      questions = await response.json();
      
      if (!Array.isArray(questions)) throw new Error('Invalid question data format');

      if (questions.length === 0) throw new Error('No questions available');
    }
      currentIndex = 0;
      initializeQuestion();
      setupEventListeners();

      localStorage.setItem(`currentQuestion_${certif}`, questions[currentIndex].id);
  } catch (error) {
    console.error('Quiz initialization failed:', error);
    showError(error.message);
    document.querySelectorAll('.quiz-button').forEach(btn => btn.disabled = true);
  }
}

// Question Initialization (Fixed DOM Update)
function initializeQuestion() {
  const currentQuestion = questions[currentIndex];
  const container = document.getElementById('question-container');
  
  // Clear previous content
  container.replaceChildren();
  
  // Create question header
  const header = document.createElement('div');
  header.id = 'question-header';
  header.innerHTML = `
  <div class="question-header-top">
    <p id="question-id">Question ${currentQuestion.exam_topic_id}</p>
    <span class="weight-display">Weight: ${currentQuestion.weight}</span>
  </div>
  <pre><code id="question-code" class="language-json"></code></pre>
`;

  const questionText = header.querySelector('#question-code');
  questionText.textContent = currentQuestion.main_question;

  container.appendChild(header);

  // Create question body
  const questionBody = document.createElement('div');
  questionBody.className = 'dynamic-content';
  
  switch(currentQuestion.questiontype) {
    case 'hotspot':
      questionBody.appendChild(createHotspotContainer(currentQuestion));
      break;
    case 'draganddrop':
      questionBody.appendChild(createDragDropContainer(currentQuestion));
      break;
    case 'yesno':
      questionBody.appendChild(createYesNoContainer());
      break;
    default:
      questionBody.appendChild(createMultipleChoiceContainer(currentQuestion));
  }
  
  container.appendChild(questionBody);
  enableInteractions();
}

// Helper functions
function getWeightClass(weight) {
  return weight < 50 ? 'easy' : weight < 150 ? 'medium' : 'hard';
}

// Setup all event listeners
function setupEventListeners() {
  // Answer selection via event delegation
  document.getElementById('quiz-section').addEventListener('click', handleAnswerSelection);

  // Control Buttons
  document.getElementById('submit-btn').addEventListener('click', checkAnswer);
  document.getElementById('stop-quiz').addEventListener('click', () => window.location.href = '/');
  document.getElementById('stop-quiz-result').addEventListener('click', () => window.location.href = '/');
  document.getElementById('explanation-btn').addEventListener('click', showExplanation);
  document.getElementById('next-question-btn').addEventListener('click', loadNextQuestion);

  // Modal interactions
  document.querySelector('.close').addEventListener('click', closeExplanation);

  // Drag and Drop Event Listeners (delegated)
  document.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('draggable')) {
      e.dataTransfer.setData('letter', e.target.dataset.letter);
    }
  });
  document.getElementById('quiz-section').addEventListener('dragover', allowDrop);
  document.getElementById('quiz-section').addEventListener('drop', handleDrop);

  ['stop-quiz', 'stop-quiz-result'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      localStorage.removeItem(`currentQuestion_${certif}`);
    });
  });
}

// Answer Selection Handling
function handleAnswerSelection(event) {
  const btn = event.target.closest('.choice-btn, .yn-btn, .yesno-btn');
  if (!btn) return;
  const currentQuestion = questions[currentIndex];
  const questionType = currentQuestion.questiontype;
  let letter = btn.dataset.letter || btn.dataset.value;

  if (questionType === 'hotspot') {
    handleHotspotSelection(btn, letter);
  } else if (questionType === 'yesno') {
    handleYesNoSelection(btn, letter);
  } else {
    handleMultipleChoiceSelection(btn, letter);
  }
}

function handleHotspotSelection(btn, value) {
  const index = parseInt(btn.dataset.statementIndex);
  // Deselect all buttons for this statement
  btn.parentElement.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  hotspotAnswers[index] = value;
}

function handleYesNoSelection(btn, letter) {
  document.querySelectorAll('#yesno-container button').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedAnswers = [letter];
}

function handleMultipleChoiceSelection(btn, letter) {
  if (selectedAnswers.includes(letter)) {
    selectedAnswers = selectedAnswers.filter(ans => ans !== letter);
    btn.classList.remove('selected');
  } else {
    selectedAnswers.push(letter);
    btn.classList.add('selected');
  }
}

// Drag and Drop Functions
function allowDrop(ev) {
  ev.preventDefault();
}

function handleDrop(ev) {
  ev.preventDefault();
  const dropzone = ev.target.closest('.dropzone');
  if (!dropzone) return;
  const letter = ev.dataTransfer.getData('letter');
  // Clear any existing draggable in the dropzone
  dropzone.querySelectorAll('.draggable').forEach(el => el.remove());
  const original = document.querySelector(`.draggable[data-letter="${letter}"]`);
  if (!original) return;
  const clone = original.cloneNode(true);
  clone.setAttribute('draggable', 'false');
  dropzone.appendChild(clone);
  updateDragDropAnswer();
}

function updateDragDropAnswer() {
  dragDropAnswer = Array.from(document.querySelectorAll('.dropzone'))
    .map(zone => {
      const draggable = zone.querySelector('.draggable');
      return draggable ? draggable.dataset.letter : '';
    }).join('');
}

function checkAnswer() {
    const currentQuestion = questions[currentIndex];
    let isCorrect = false;
    let userAnswer = null;
    

    switch (currentQuestion.questiontype) {
        case 'hotspot':
            userAnswer = hotspotAnswers;
            isCorrect = validateHotspotAnswer(currentQuestion);
            break;
        case 'draganddrop':
            userAnswer = dragDropAnswer;
            isCorrect = validateDragDropAnswer(currentQuestion);
            break;
        case 'yesno':
            userAnswer = selectedAnswers[0] || null;
            isCorrect = validateStandardAnswer(currentQuestion);
            break;
        default:
            userAnswer = selectedAnswers.sort().join('');
            isCorrect = validateStandardAnswer(currentQuestion);
    }

    highlightCorrectAnswers(currentQuestion);

    disableInteractions();
    document.getElementById('buttons-container').style.display = 'none';
    document.getElementById('result-container').style.display = 'block';

    // Submit quiz answer to update quiz history
    submitQuizAnswer(currentQuestion.id, isCorrect);
}



async function submitQuizAnswer(questionId, isCorrect) {
  const payload = {
      certif: certif,
      answers: [{ question_id: questionId, is_correct: isCorrect }]
  };

  try {
      // Submit the answer
      const response = await fetch('/submit_quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      // Remove current question from storage after submission
      localStorage.removeItem(`currentQuestion_${certif}`);

      // Refresh certification progress after submission
      const updatedCertifResponse = await fetch(`/get_certif_details/${certif}`);
      if (updatedCertifResponse.ok) {
        certifDetails = await updatedCertifResponse.json();
        const correctCount = Math.round((certifDetails.progress / 100) * certifDetails.total_questions);
        updateCertifProgress(correctCount, certifDetails.total_questions);
      }
      
      // Fetch the updated question data
      await fetchUpdatedQuestion(questionId);
  } catch (error) {
      console.error('Error submitting quiz results:', error);
  }
}

async function fetchUpdatedQuestion(questionId) {
    try {
      const response = await fetch(`/get_question/${certif}/${questionId}`);
      if (!response.ok) throw new Error('Failed to fetch updated question');
      const updatedQuestion = await response.json();
      
      const index = questions.findIndex(q => q.id === updatedQuestion.id);
      if (index !== -1) {
        questions[index] = updatedQuestion;
        updateQuestionWeight(updatedQuestion.weight);
      }

      const currentQuestion = questions[currentIndex];
        if(currentQuestion.id === updatedQuestion.id) {
        updateQuestionWeight(updatedQuestion.weight);
        }
    } catch (error) {
      console.error('Error fetching updated question:', error);
    }
  }
  
  // New helper function
  function showError(message) {
    const header = document.getElementById('question-header');
    if (!header) {
        header = document.createElement('div');
        header.id = 'question-header';
        document.getElementById('question-container').appendChild(header);
    }
    header.innerHTML = `<div class="error-message">${message}</div>`;
}
  
// Start the quiz
document.addEventListener('DOMContentLoaded', initializeQuiz);

function updateQuestionWeight(newWeight) {
  const questionHeader = document.getElementById('question-header');
  if (!questionHeader) return;
  
  let weightDisplay = questionHeader.querySelector('.weight-display');
  
  // Create element if it doesn't exist
  if (!weightDisplay) {
      weightDisplay = document.createElement('span');
      weightDisplay.className = 'weight-display';
      const headerTop = questionHeader.querySelector('.question-header-top');
      if (headerTop) headerTop.appendChild(weightDisplay);
  }
  
  weightDisplay.textContent = `Weight: ${newWeight}`;
}

function validateHotspotAnswer(question) {
    // Build an array of expected answers based on the correct_answer in answer_area.
    const expected = question.answer_area.map(item => {
      const answer = item.correct_answer.toLowerCase();
      return answer === 'yes' ? 'Y' : answer === 'no' ? 'N' : answer;
    });
    
    return hotspotAnswers.length === expected.length &&
           hotspotAnswers.every((val, i) => val === expected[i]);
}

function validateDragDropAnswer(question) {
    // For drag and drop, build expected answer by concatenating the correct_answer values.
    const expected = question.answer_area.map(item => item.correct_answer).join('');
    return dragDropAnswer === expected;
}

function validateStandardAnswer(question) {
  const correctAnswers = [...question.answer].sort();
  return selectedAnswers.sort().join('') === correctAnswers.join('');
}

function showResult(isCorrect) {
  const resultEl = document.getElementById('result-message');
  resultEl.textContent = isCorrect ? 'Correct! Well done!' : 'Incorrect. Try again!';
  resultEl.className = isCorrect ? 'correct' : 'incorrect';
}

// Highlighting Correct Answers
function highlightCorrectAnswers(question) {
  switch (question.questiontype) {
    case 'hotspot':
      highlightHotspotAnswers(question);
      break;
    case 'draganddrop':
      highlightDragDropAnswers(question);
      break;
    default:
      highlightStandardAnswers(question);
  }
}

function highlightHotspotAnswers(question) {
    // Build an array of expected answers from each answer_area item.
    const expected = question.answer_area.map(item => {
      const answer = item.correct_answer.toLowerCase();
      return answer === 'yes' ? 'Y' : answer === 'no' ? 'N' : answer;
    });
    
    expected.forEach((correctVal, index) => {
      const buttons = document.querySelectorAll(`[data-statement-index="${index}"]`);
      buttons.forEach(btn => {
        btn.classList.toggle('correct-answer', btn.dataset.value === correctVal);
        btn.classList.toggle('wrong-answer', btn.classList.contains('selected') && btn.dataset.value !== correctVal);
      });
    });
  }

function highlightDragDropAnswers(question) {
    const expected = question.answer_area.map(item => item.correct_answer);
    document.querySelectorAll('.dropzone').forEach((zone, index) => {
        const draggable = zone.querySelector('.draggable');
        if (!draggable) return;
        const isCorrect = draggable.dataset.letter === expected[index];
        draggable.classList.toggle('correct-answer', isCorrect);
        draggable.classList.toggle('wrong-answer', !isCorrect);
    });
}

function highlightStandardAnswers(question) {
  const correctAnswers = question.answer.split('');
  const container = document.getElementById('choices-container') || document.getElementById('yesno-container');
  container.querySelectorAll('button').forEach(btn => {
    const isCorrect = correctAnswers.includes(btn.dataset.letter);
    btn.classList.toggle('correct-answer', isCorrect);
    btn.classList.toggle('wrong-answer', btn.classList.contains('selected') && !isCorrect);
  });
}

// Disable/Enable Answer Interactions (control buttons remain active)
function disableInteractions() {
  document.querySelectorAll('.choice-btn, .yn-btn, .yesno-btn, .draggable').forEach(el => {
    el.style.pointerEvents = 'none';
  });
}

function enableInteractions() {
  document.querySelectorAll('.choice-btn, .yn-btn, .yesno-btn, .draggable').forEach(el => {
    el.style.pointerEvents = '';
  });
}

async function loadNextQuestion() {
  const quizContent = document.querySelector('.quiz-content');
  const questionContainer = document.getElementById('question-container');
  const actionButtons = document.getElementById('action-buttons');
  
  questionCount++;
  const forceNew = questionCount % 5 === 0;

  try {
    // Disable buttons during transition
    document.querySelectorAll('.quiz-button').forEach(btn => btn.disabled = true);
    
    // Fade out only the question content
    questionContainer.style.opacity = '0';
    questionContainer.style.transform = 'translateY(5px)';
    
    // Wait for fade-out animation
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Reset state without removing DOM elements
    resetQuestionState();
    
    // Fetch new question in the background
    const response = await fetch(`/questions/${certif}?limit=1&force_new=${forceNew}`);
    const newQuestions = await response.json();

    if (newQuestions.length > 0) {
      questions.push(...newQuestions);
      currentIndex = questions.length - 1;

      // Store new question
      localStorage.setItem(`currentQuestion_${certif}`, questions[currentIndex].id);
      
      // Update question content while hidden
      updateQuestionContent();
      
      // Fade in new content
      questionContainer.style.opacity = '1';
      questionContainer.style.transform = 'translateY(0)';
    }
  } catch (error) {
    console.error('Error fetching next question:', error);
  } finally {
    // Re-enable buttons
    document.querySelectorAll('.quiz-button').forEach(btn => btn.disabled = false);
  }
}

function updateQuestionContent() {
  const currentQuestion = questions[currentIndex];
  const container = document.getElementById('question-container');

  // Update header content
  const header = container.querySelector('#question-header') || document.createElement('div');
  header.id = 'question-header';
  header.innerHTML = `
    <div class="question-header-top">
      <p id="question-id">Question ${currentQuestion.exam_topic_id}</p>
      <span class="weight-display">Weight: ${currentQuestion.weight}</span>
    </div>
    <pre><code id="question-code" class="language-json"></code></pre>
  `;

  // Update question text
  const questionText = header.querySelector('#question-code');
  questionText.textContent = currentQuestion.main_question;

  // Update weight display
  updateQuestionWeight(currentQuestion.weight);

  // Handle question body
  let questionBody = container.querySelector('.dynamic-content');
  if (!questionBody) {
    questionBody = document.createElement('div');
    questionBody.className = 'dynamic-content';
    container.appendChild(questionBody);
  } else {
    questionBody.innerHTML = ''; // Clear existing content
  }

  // Populate new content
  switch(currentQuestion.questiontype) {
    case 'hotspot':
      questionBody.appendChild(createHotspotContainer(currentQuestion));
      break;
    case 'draganddrop':
      questionBody.appendChild(createDragDropContainer(currentQuestion));
      break;
    case 'yesno':
      questionBody.appendChild(createYesNoContainer());
      break;
    default:
      questionBody.appendChild(createMultipleChoiceContainer(currentQuestion));
  }

  enableInteractions();
  localStorage.setItem(`currentQuestion_${certif}`, currentQuestion.id);
}

function resetQuestionState() {
  selectedAnswers = [];
  hotspotAnswers = [];
  dragDropAnswer = "";
  enableInteractions();
  
  // Only clear interactive elements
  const questionBody = document.querySelector('.dynamic-content');
  if (questionBody) questionBody.innerHTML = '';
  
  // Reset UI states
  document.getElementById('buttons-container').style.display = 'flex';
  document.getElementById('result-container').style.display = 'none';
}

// Functions to Create Question Containers Dynamically
function createHotspotContainer(question) {
    const container = document.createElement('div');
    container.id = 'hotspot-container';
    question.answer_area.forEach((statement, index) => {
        const div = document.createElement('div');
        div.className = 'hotspot-statement';
        div.innerHTML = `
        <p class="statement-text">${statement.statement} (Y/N)</p>
        <div class="yn-buttons">
            <button class="yn-btn" data-value="Y" data-statement-index="${index}">YES</button>
            <button class="yn-btn" data-value="N" data-statement-index="${index}">NO</button>
        </div>
        `;
        container.appendChild(div);
    });
    return container;
}

function createDragDropContainer(question) {
  const container = document.createElement('div');
  container.id = 'drag-drop-container';
  
  // Create Drop Zones
  const dropzonesDiv = document.createElement('div');
  dropzonesDiv.id = 'dropzones';
  question.answer_area.forEach((zone, index) => {
    const dz = document.createElement('div');
    dz.className = 'dropzone';
    dz.dataset.number = index + 1;
    dz.innerHTML = `
      <span class="dropzone-number">${index + 1}.</span>
      <span class="dropzone-text">${zone.question}</span>
    `;
    dropzonesDiv.appendChild(dz);
  });
  container.appendChild(dropzonesDiv);
  
  // Create Draggables
  const draggablesDiv = document.createElement('div');
  draggablesDiv.id = 'draggables';
  question.choices.forEach(choice => {
    const d = document.createElement('div');
    d.className = 'draggable';
    d.setAttribute('draggable', 'true');
    d.dataset.letter = choice.letter;
    d.innerHTML = `<span class="draggable-text">${choice.letter}</span>`;
    draggablesDiv.appendChild(d);
  });
  container.appendChild(draggablesDiv);
  return container;
}

function createYesNoContainer() {
  const container = document.createElement('div');
  container.id = 'yesno-container';
  container.innerHTML = `
    <button class="yesno-btn" data-letter="Y">YES</button>
    <button class="yesno-btn" data-letter="N">NO</button>
  `;
  return container;
}

function createMultipleChoiceContainer(question) {
  const container = document.createElement('div');
  container.id = 'choices-container';
  question.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.dataset.letter = choice.letter;
    btn.innerHTML = `
      <span class="choice-letter">${choice.letter}</span>
      <span class="choice-text">${choice.text}</span>
    `;
    container.appendChild(btn);
  });
  return container;
}

// Explanation Modal Functions
function showExplanation() {
  const explanation = questions[currentIndex].explanation || "No explanation available.";
  document.getElementById('explanation-text').innerHTML = explanation.replace(/\n/g, '<br>');
  document.getElementById('explanation-modal').style.display = 'flex';
}

function closeExplanation() {
  document.getElementById('explanation-modal').style.display = 'none';
}


/*------------------------------------------------- */
// PROGRESS BAR
/*------------------------------------------------- */

function updateCertifProgress(correctCount, totalQuestions) {
  const progressFill = document.querySelector('.progress-fill');
  const progressText = document.querySelector('.progress-text');
  
  if (!progressFill || !progressText) return;

  const progressPercent = totalQuestions > 0 
    ? (correctCount / totalQuestions) * 100 
    : 0;

  progressFill.style.width = `${progressPercent}%`;
  progressText.textContent = `${correctCount}/${totalQuestions}`;
}