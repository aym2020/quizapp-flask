// base.js
let authState = {
    isAuthenticated: false,
    currentUser: null
  };

const authEvents = {
LOGIN: new CustomEvent('auth-login'),
LOGOUT: new CustomEvent('auth-logout')
};

document.addEventListener('DOMContentLoaded', () => {
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

function updateNavbar() {
    const authButtons = document.querySelector('.auth-buttons');
    const logoutButton = document.getElementById('choice-menu-logout');

    if (authState.isAuthenticated) {
        // Hide Sign In & Create Profile buttons
        if (authButtons) authButtons.style.display = 'none';

        // Show Logout button
        if (logoutButton) logoutButton.style.display = 'block';
    } else {
        // Show Sign In & Create Profile buttons
        if (authButtons) authButtons.style.display = 'block';

        // Hide Logout button
        if (logoutButton) logoutButton.style.display = 'none';
    }
}

async function checkAuthState() {
    try {
        const response = await fetch('/current_user');
        const user = await response.json();

        if (user.pseudo) {
            authState.isAuthenticated = true;
            authState.currentUser = user;
            document.dispatchEvent(authEvents.LOGIN);
        } else {
            authState.isAuthenticated = false;
            authState.currentUser = null;
            document.dispatchEvent(authEvents.LOGOUT);
        }

        updateNavbar(); // ✅ Ensure navbar updates dynamically
    } catch (error) {
        console.error('Auth check error:', error);
    }
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
            updateNavbar();

            // Keep the loader visible for 1.5 seconds
            setTimeout(() => {
                // Hide all modals
                document.querySelectorAll('.modal').forEach(modal => {
                    hideModal(modal);
                });
            
            }, 300);
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
    const form = e.target;
    const formData = new FormData(form);
    const loader = form.querySelector('.loader');

    try {
        form.querySelector('.button-text').style.visibility = 'hidden';
        loader.style.display = 'inline-block';

        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pseudo: formData.get('pseudo'),
                password: formData.get('password')
            })
        });

        if (response.ok) {
            hideModal(form.closest('.modal'));
            showModal('signIn');
        } else {
            const error = await response.json();
            showError(form, error.error);
        }
    } catch (error) {
        showError(form, 'Connection error');
    } finally {
        form.querySelector('.button-text').style.visibility = 'visible';
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