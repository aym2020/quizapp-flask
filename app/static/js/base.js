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
    modal.classList.remove('hidden');
    modal.classList.add('visible');
    // Disable interactions on the background
    document.body.classList.add('modal-open');
}

function hideModal(modal) {
    modal.classList.remove('visible');
    modal.classList.add('hidden');
    // Re-enable background interactions
    document.body.classList.remove('modal-open');
}

async function handleSignIn(e) {
    e.preventDefault();
    e.stopPropagation();

    const form = e.target;
    const pseudoInput = form.querySelector('#pseudo');
    const passwordInput = form.querySelector('#password');
    const loader = form.querySelector('.loader');

    if (!loader) {
        console.error("Loader element is missing inside the form.");
        return;
    }

    const formData = {
        pseudo: pseudoInput.value.trim(),
        password: passwordInput.value.trim(),
        remember: form.querySelector('input[name="remember"]').checked
    };

    try {
        form.querySelector('.button-text').style.visibility = 'hidden';
        loader.style.display = 'inline-block';

        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
            credentials: 'include',
        });

        const result = await response.json();

        if (response.ok) {
            authState.isAuthenticated = true;
            authState.currentUser = result;

            hideModal(form.closest('.modal'));
            location.reload();
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
        form.querySelector('.button-text').style.visibility = 'visible';
        loader.style.display = 'none';
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