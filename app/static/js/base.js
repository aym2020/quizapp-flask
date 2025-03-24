// base.js
let authState = {
    isAuthenticated: false,
    currentUser: null
  };

const authEvents = {
LOGIN: new CustomEvent('auth-login'),
LOGOUT: new CustomEvent('auth-logout')
};

let messageTimeout = null;
const MESSAGE_INTERVAL = 16000; // 8 seconds between messages
const TYPING_SPEED = 50; // 50ms per character

document.addEventListener('DOMContentLoaded', () => {

    initRobotAnimation();

    // Auth state elements
    const authButtons = document.querySelector('.auth-buttons');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // Modal elements
    const registerModal = document.getElementById('registerModal');
    const signInModal = document.getElementById('signInModal');
    const closeModalButtons = document.querySelectorAll('[data-close-modal]');

    // Auth button handlers
    document.getElementById('signInBtn')?.addEventListener('click', () => showModal('signIn'));
    document.getElementById('createAccountBtn')?.addEventListener('click', () => showModal('register'));
    logoutBtn?.addEventListener('click', handleLogout);

    // Modal close handlers
    closeModalButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            hideModal(modal);
        });
    });

    // Handle outside clicks
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            hideModal(e.target);
        }
    });

    document.body.addEventListener('click', (e) => {
        if (e.target.closest('.auth-promo-block .button')) {
            e.preventDefault();
            showModal('register');
        }
    });

    // Form submissions
    document.getElementById('signInForm')?.addEventListener('submit', handleSignIn);
    document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
});

function showModal(type) {
    const modal = document.getElementById(`${type}Modal`);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('visible');
    document.body.classList.add('modal-open');

    // Disable interactive elements on the training page (if they exist)
    const certifDropdown = document.getElementById('certifCode');
    if (certifDropdown) {
        certifDropdown.disabled = true;
    }
    const trainingBtn = document.getElementById('trainingBtn');
    if (trainingBtn) {
        trainingBtn.disabled = true;
    }
    
    // Add a click handler on the modal overlay that only blocks clicks outside the modal-content
    modal.addEventListener('click', modalClickHandler, true);
}

function hideModal(modal) {
    if (!modal) return;
    modal.classList.remove('visible');
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');

    // Re-enable the underlying interactive elements
    const certifDropdown = document.getElementById('certifCode');
    if (certifDropdown) {
        certifDropdown.disabled = false;
    }
    const trainingBtn = document.getElementById('trainingBtn');
    if (trainingBtn) {
        trainingBtn.disabled = false;
    }
    
    modal.removeEventListener('click', modalClickHandler, true);

    const inputs = modal.querySelectorAll('input');
    inputs.forEach(input => {
      input.value = '';
      input.blur();
    });
    
    // Force style recalculation
    void modal.offsetHeight;
}


function modalClickHandler(e) {
    // Allow any click that occurs within the modal-content, including the Sign In button
    if (e.target.closest('.modal-content')) {
        return;
    }
    // Otherwise, block the click to prevent it from interacting with the underlying page
    e.stopImmediatePropagation();
    e.preventDefault();
}


async function handleSignIn(e) {
    e.preventDefault();
    e.stopPropagation();

    const form = e.target;
    const pseudoInput = form.querySelector('#pseudo');
    const passwordInput = form.querySelector('#password');
    const loader = form.querySelector('.loader');
    const buttonText = form.querySelector('.button-text');
    
    if (!loader) {
        console.error("Loader element is missing inside the form.");
        return;
    }

    const formData = {
        pseudo: pseudoInput.value.trim(),
        password: passwordInput.value.trim(),
        remember: form.querySelector('input[name="remember"]').checked
    };

    // Flag to know if login succeeded
    let loginSuccessful = false;

    try {
        // Hide button text and show loader
        buttonText.style.visibility = 'hidden';
        loader.style.display = 'inline-block';

        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
            credentials: 'include',
        });

        const result = await response.json();

        if (response.ok) {
            loginSuccessful = true;
            authState.isAuthenticated = true;
            authState.currentUser = result;

            // Immediately update the navbar
            window.location.reload();

            // Keep the loader visible for 1.5 seconds
            setTimeout(() => {
                // Hide all modals
                document.querySelectorAll('.modal').forEach(modal => {
                    hideModal(modal);  
                });
            }, 500);
        } else {
            if (result.error.includes("User not found")) {
                showErrorMessage(pseudoInput, "This username does not exist.");
            } else if (result.error.includes("Incorrect password")) {
                showErrorMessage(passwordInput, "Incorrect password. Try again.");
            } else {
                showErrorMessage(form, "Login failed. Please check your credentials.");
            }
        }
    } catch (error) {
        showErrorMessage(form, "Connection error. Please try again.");
    } finally {
        // Only reset the loader and button text if login was not successful
        if (!loginSuccessful) {
            buttonText.style.visibility = 'visible';
            loader.style.display = 'none';
        }
    }
}



async function handleRegister(e) {
    e.preventDefault();
    e.stopPropagation();

    const form = e.target;
    const pseudoInput = form.querySelector('#regPseudo');
    const passwordInput = form.querySelector('#regPassword');
    const loader = form.querySelector('.loader');
    const buttonText = form.querySelector('.button-text');
    
    const formData = {
        pseudo: pseudoInput.value.trim(),
        password: passwordInput.value.trim()
    };

    try {
        buttonText.style.visibility = 'hidden';
        loader.style.display = 'inline-block';

        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            hideModal(form.closest('.modal'));
            showModal('signIn');
        } else {
            const error = await response.json();
            if (error.error.includes("already exists")) {
                showErrorMessage(pseudoInput, "Username already taken");
            } else {
                showErrorMessage(pseudoInput, "Registration failed");
            }
        }
    } catch (error) {
        showErrorMessage(pseudoInput, "Connection error");
    } finally {
        buttonText.style.visibility = 'visible';
        loader.style.display = 'none';
    }
}

async function handleLogout() {
    try {
        await fetch('/logout');
        location.reload(); // This is already correctly placed
    } catch (error) {
        console.error('Logout failed:', error);
    }
}

function showErrorMessage(inputElement, message) {
    // Remove any existing error message below this input
    let existingError = inputElement.parentNode.querySelector('.error-message');
    if (existingError) existingError.remove();

    // Create the error message element
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;

    // Insert error message right below the input field
    inputElement.parentNode.appendChild(errorElement);
}

function createErrorElement(form) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    form.prepend(errorElement);
    return errorElement;
}

document.addEventListener('click', function (e) {
    if (document.body.classList.contains('modal-open')) {
        if (!e.target.closest('.modal-content')) {
            e.stopPropagation(); // Prevents clicks outside the modal from interacting with the background
        }
    }
});

document.addEventListener('keydown', function (e) {
    if (document.body.classList.contains('modal-open')) {
        if (e.key === 'Enter' && !document.activeElement.closest('.modal')) {
            e.preventDefault(); // Prevents Enter from submitting other forms
        }
    }
});


// Update event listeners to use classes instead of IDs
document.querySelectorAll('.sign-in-trigger').forEach(btn => {
    btn.addEventListener('click', () => showModal('signInModal'));
});

document.querySelectorAll('.create-account-trigger').forEach(btn => {
    btn.addEventListener('click', () => showModal('registerModal'));
});


const ROBOT_MESSAGES = [
    "INITIALIZING NEURAL NETWORKS...",
    "CALCULATING QUANTUM PROBABILITIES...",
    "DEFRAGGING KNOWLEDGE BASE...",
    "SYNTHESIZING WISDOM MATRIX...",
    "OPTIMIZING COGNITIVE PATHS...",
    "UPDATING BRAIN FIRMWARE...",
    "COMPILING LIFE EXPERIENCES...",
    "DOWNLOADING KNOWLEDGE PACKAGE...",
    "DECRYPTING ANCIENT ALGORITHMS...",
    "PARALLEL PROCESSING REALITY...",
    "SIMULATING INTELLIGENCE BOOST...",
    "REBOOTING CREATIVITY ENGINE...",
    "GENERATING INNOVATION WAVEFORMS...",
    "ANALYZING THOUGHT PATTERNS...",
    "REINFORCING LEARNING PATHWAYS...",
    "ACTIVING SYNAPTIC FIRING...",
    "BEEP... BOOP... PROCESSING...",
    "NEURO-LINGUISTIC PROGRAM RUNNING...",
    "SEARCHING COSMIC DATABANK...",
    "TRANSLATING QUANTUM THOUGHTS...",
    "CONNECTING TO MIND NETWORK...",
    "OPTICAL NEURONS ACTIVATED...",
    "SYNAPSE CONNECTIVITY AT 100%...",
    "COGNITIVE OVERDRIVE ENGAGED...",
    "THOUGHT ACCELERATION INITIATED...",
    "NEURAL PATHWAYS OPTIMIZED...",
    "BRAIN POWER: OVER 9000...",
    "DOWNLOADING GENIUS.EXE...",
    "PROCESSOR TEMP: 42°C...",
    "MEMORY ALLOCATION COMPLETE...",
    "SYSTEMS: NOMINAL...",
    "INITIALIZING WIT MODULE...",
    "CALCULATING SNARK PARAMETERS...",
    "WARNING: INTELLIGENCE OVERLOAD...",
    "ENGAGING CREATIVITY SUBSYSTEM...",
    "COMPILING DAD JOKES...",
    "ERROR 404: SERIOUSNESS NOT FOUND...",
    "WARNING: HUMOR CIRCUITS ACTIVE...",
    "SARCASM MODULE: ONLINE...",
    "THE ANSWER IS 42. ALWAYS.",
    "DON'T PANIC.",
    "MAY THE FORCE BE WITH YOU...",
    "LIVE LONG AND PROSPER.",
    "EXTERMINATE! EXTERMINATE!",
    "RESISTANCE IS FUTILE...",
    "THIS IS THE WAY.",
    "HELLO WORLD!",
    "GOOD NEWS, EVERYONE!",
    "BITE MY SHINY METAL ASS!",
    "I AM BENDER. PLEASE INSERT GIRDER."
];

// Random message selector
function getRobotMessage() {
    const index = Math.floor(Math.random() * 50);
    return ROBOT_MESSAGES[index];
}

function startMessageCycle() {
    const robotElement = document.getElementById('robotMessage');
    if (!robotElement) return;

    // Clear existing timeout
    if (messageTimeout) {
        clearTimeout(messageTimeout);
    }

    const message = getRobotMessage();
    typeRobotMessage(message, robotElement);
}

// Animated typing function
function typeRobotMessage(message, element) {
    let i = 0;
    element.textContent = '';
        
    function type() {
        if (i < message.length) {
            element.textContent += message.charAt(i);
            i++;
            setTimeout(type, TYPING_SPEED);
        } else {
            // Schedule next message after interval
            messageTimeout = setTimeout(startMessageCycle, MESSAGE_INTERVAL);
        }
    }
    
    type();
}

// Initialize robot message
function initRobotAnimation() {
    startMessageCycle(); // Start the infinite cycle
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (messageTimeout) {
        clearTimeout(messageTimeout);
    }
});