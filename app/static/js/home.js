// Elements
const certifSelect = document.getElementById('certifSelect');
const startQuizBtn = document.getElementById('startQuiz');
const uploadPanel = document.getElementById('uploadPanel');
const closePanelBtn = document.getElementById('closePanel');
const fileInput = document.getElementById('fileInput');
const uploadButton = document.getElementById('uploadButton');
const uploadStatus = document.getElementById('uploadStatus');

// Start Quiz Button
startQuizBtn.addEventListener('click', () => {
    const certifCode = certifSelect.value;
    startQuizBtn.disabled = true;
    
    // Keep original text in hidden span
    startQuizBtn.querySelector('.button-text').textContent = "...";
    
    setTimeout(() => {
        window.location.href = `/quiz/${certifCode}`;
    }, 500);
});

// Add Question Button Listener
document.getElementById('addQuestionBtn').addEventListener('click', () => {
    window.location.href = "/add_question";
});

// Add manual question
document.getElementById('addManualQuestionBtn').addEventListener('click', () => {
    window.location.href = "/manual_question";
});

// Auth Modals
const loginModal = document.getElementById('loginModal');
const registerModal = document.getElementById('registerModal');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const closeModals = document.querySelectorAll('.close-modal');

// Show/hide modals
loginBtn?.addEventListener('click', () => showModal(loginModal));
registerBtn?.addEventListener('click', () => showModal(registerModal));
logoutBtn?.addEventListener('click', handleLogout);

closeModals.forEach(btn => {
btn.addEventListener('click', () => {
    loginModal.style.display = 'none';
    registerModal.style.display = 'none';
});
});

window.addEventListener('click', (e) => {
if (e.target === loginModal) loginModal.style.display = 'none';
if (e.target === registerModal) registerModal.style.display = 'none';
});

function showModal(modal) {
modal.style.display = 'block';
}

// Login Form
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
e.preventDefault();
const username = document.getElementById('loginUsername').value;
const password = document.getElementById('loginPassword').value;

try {
    const response = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pseudo: username, password })
    });
    
    const result = await response.json();
    const messageEl = document.getElementById('loginMessage');
    
    if (response.ok) {
    messageEl.textContent = 'Login successful!';
    messageEl.className = 'status-message success';
    messageEl.style.display = 'block';
    setTimeout(() => window.location.reload(), 1500);
    } else {
    messageEl.textContent = result.error;
    messageEl.className = 'status-message error';
    messageEl.style.display = 'block';
    }
} catch (error) {
    console.error('Login error:', error);
}
});

// Register Form
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
e.preventDefault();
const username = document.getElementById('registerUsername').value;
const password = document.getElementById('registerPassword').value;

try {
    const response = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pseudo: username, password })
    });
    
    const result = await response.json();
    const messageEl = document.getElementById('registerMessage');
    
    if (response.ok) {
    messageEl.textContent = 'Registration successful! Please login.';
    messageEl.className = 'status-message success';
    messageEl.style.display = 'block';
    setTimeout(() => {
        registerModal.style.display = 'none';
        loginModal.style.display = 'block';
    }, 1500);
    } else {
    messageEl.textContent = result.error;
    messageEl.className = 'status-message error';
    messageEl.style.display = 'block';
    }
} catch (error) {
    console.error('Registration error:', error);
}
});

async function handleLogout() {
try {
    await fetch('/logout');
    window.location.reload();
} catch (error) {
    console.error('Logout error:', error);
}
}

