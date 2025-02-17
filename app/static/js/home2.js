// ----------------------------------------------------------------
// Password Toggle Function (Generic)
// ----------------------------------------------------------------
function setupPasswordToggle(passwordInputId, toggleButtonId) {
  const passwordInput = document.getElementById(passwordInputId);
  const togglePwdBtn = document.getElementById(toggleButtonId);

  if (togglePwdBtn && passwordInput) {
    togglePwdBtn.addEventListener("click", function () {
      if (passwordInput.type === "password") {
        passwordInput.type = "text";
        togglePwdBtn.innerHTML = `<i class="fa-solid fa-eye-slash fa-flip-horizontal fa-lg" style="color: var(--scheme-main)"></i>`;
      } else {
        passwordInput.type = "password";
        togglePwdBtn.innerHTML = `<i class="fa-solid fa-eye fa-flip-horizontal fa-lg" style="color: var(--scheme-main)"></i>`;
      }
    });
  } else {
    console.error("Toggle button or password input not found!");
  }
}

// ----------------------------------------------------------------
// Register Modal
// ----------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function () {
    const openModalBtn = document.getElementById("createProfile"); // the button that opens modal
    const modalOverlay = document.getElementById("modalOverlay");
    const closeModalBtn = document.getElementById("closeModal");
    const togglePwdBtn = document.querySelector(".see-pwd-signup");
    const passwordInput = document.getElementById("registerPassword");
    
    function openModal() {
      history.pushState(null, "", "?isLoggingIn=true");
      modalOverlay.classList.add("show");

      setupPasswordToggle('registerPassword', 'registerPwdToggle');
      
      const messageEl = document.getElementById('registerMessage');
      if (messageEl) {
        messageEl.style.display = 'none'; 
        messageEl.textContent = ''; 
        messageEl.className = 'status-message'; // Reset the class
      }

      document.body.style.overflow = "hidden";
    }
  
    function closeModal() {
      history.pushState(null, "", "/");
      modalOverlay.classList.remove("show");

      const messageEl = document.getElementById('registerMessage');
      if(messageEl) {
        messageEl.style.display = 'none';
        messageEl.textContent = '';
      }

      // Reset the form fields
      const form = document.getElementById('modal-form-signup');
      if(form) form.reset();
      
      document.body.style.overflow = "";
    }
  
    if (openModalBtn) {
      openModalBtn.addEventListener("click", openModal);
    }
    if (closeModalBtn) {
      closeModalBtn.addEventListener("click", closeModal);
    }
    
    // Auto-open modal if URL has ?isLoggingIn=true
    if (window.location.search.includes("isLoggingIn=true")) {
      openModal();
    }
  
    // Handle the browser's back button to close modal
    window.addEventListener("popstate", closeModal);

    // Check that both elements exist
    if (togglePwdBtn && passwordInput) {
      togglePwdBtn.addEventListener("click", function () {
        // If the password is hidden, show it and update the icon
        if (passwordInput.type === "password") {
          passwordInput.type = "text";
          togglePwdBtn.innerHTML = '<i class="fa-solid fa-eye-slash fa-flip-horizontal fa-lg" style="color: #ff99a9;"></i>';
        } else {
          // If the password is visible, hide it and update the icon
          passwordInput.type = "password";
          togglePwdBtn.innerHTML = '<i class="fa-solid fa-eye fa-flip-horizontal fa-lg" style="color: #ff99a9;"></i>';
        }
      });
    } else {
      console.error("Toggle button or password input not found!");
    }
});

// ----------------------------------------------------------------
// Register Form
// ----------------------------------------------------------------
document.getElementById('modal-form-signup')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = document.getElementById('register');
  submitBtn.disabled = true;
  submitBtn.querySelector('.loader').style.display = 'inline-block';

  const username = document.getElementById('registerUsername').value;
  const password = document.getElementById('registerPassword').value;
  const registerModal = document.getElementById('registerModal');
  const messageEl = document.getElementById('registerMessage')
  const loginModal = document.getElementById('modalOverlay');

  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    const response = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pseudo: username, password})
    })

    const result = await response.json();
  
    if (response.ok) {
      messageEl.textContent = 'Registration successful! Please login.';
      messageEl.className = 'status-message success';
      messageEl.style.display = 'block';

      const form = document.getElementById('modal-form-signup');
      if(form) form.reset();

      setTimeout(() => {
        modalOverlay.classList.remove('show');
        document.body.style.overflow = '';
        
        // Force-clear message after animation
        setTimeout(() => {
          messageEl.style.display = 'none';
          messageEl.textContent = '';
        }, 1500);
      }, 1500);
    } else {
    messageEl.textContent = result.error || 'Registration failed';
    messageEl.className = 'status-message error';
    messageEl.style.display = 'block';
    }
  } catch (error) {
    console.error('Registration error:', error);
    messageEl.textContent = 'Connection error. Please try again.';
    messageEl.className = 'status-message error';
    messageEl.style.display = 'block';
  
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector('.loader').style.display = 'none';
  }
});

// ----------------------------------------------------------------
// Sign In Modal Handling
// ----------------------------------------------------------------
const signInBtn = document.getElementById("signIn");
const signInModalOverlay = document.getElementById("signInModalOverlay");
const closeSignInModalBtn = document.getElementById("closeSignInModal");

function openSignInModal() {
  history.pushState(null, "", "?isSigningIn=true");
  signInModalOverlay.classList.add("show");
  
  // Initialize password toggle for sign-in
  setupPasswordToggle('signinPassword', 'signinPwdToggle');
  
  const messageEl = document.getElementById('signInMessage');
  if (messageEl) {
    messageEl.style.display = 'none';
    messageEl.textContent = '';
    messageEl.className = 'status-message';
  }
  document.body.style.overflow = "hidden";
}

function closeSignInModal() {
  history.pushState(null, "", "/");
  signInModalOverlay.classList.remove("show");
  
  const messageEl = document.getElementById('signInMessage');
  if(messageEl) {
    messageEl.style.display = 'none';
    messageEl.textContent = '';
  }
  
  const form = document.getElementById('modal-form-signin');
  if(form) form.reset();
  document.body.style.overflow = "";
}

if (signInBtn) {
  signInBtn.addEventListener("click", openSignInModal);
}

if (closeSignInModalBtn) {
  closeSignInModalBtn.addEventListener("click", closeSignInModal);
}

// ----------------------------------------------------------------
// Handle sign-in form submission
// ----------------------------------------------------------------
document.getElementById('modal-form-signin')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = document.getElementById('signInSubmit');
  submitBtn.disabled = true;
  submitBtn.querySelector('.loader').style.display = 'inline-block';

  const username = document.getElementById('signinUsername').value;
  const password = document.getElementById('signinPassword').value;
  const messageEl = document.getElementById('signInMessage');

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pseudo: username, password })
    });

    const result = await response.json();

    if (response.ok) {
      messageEl.textContent = 'Sign in successful!';
      messageEl.className = 'status-message success';
      messageEl.style.display = 'block';

      setTimeout(() => {
        window.location.reload(); // Refresh to update UI
      }, 1500);
    } else {
      messageEl.textContent = result.error || 'Sign in failed';
      messageEl.className = 'status-message error';
      messageEl.style.display = 'block';
    }
  } catch (error) {
    console.error('Sign in error:', error);
    messageEl.textContent = 'Connection error. Please try again.';
    messageEl.className = 'status-message error';
    messageEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector('.loader').style.display = 'none';
  }
});

// Auto-open signin modal if URL has ?isSigningIn=true
if (window.location.search.includes("isSigningIn=true")) {
  openSignInModal();
}
