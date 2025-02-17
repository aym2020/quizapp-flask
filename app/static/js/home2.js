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
        const container = document.querySelector('.container');
        if (container) {
          container.classList.add('fade-out');
        }
        setTimeout(() => {
          closeSignInModal();
          window.location.reload();
        }, 500);
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


// ----------------------------------------------------------------
// Handle LOGOUT
// ----------------------------------------------------------------
const logoutBtn = document.getElementById('logoutBtn');

logoutBtn?.addEventListener('click', handleLogout);


async function handleLogout() {
  try {

      logoutBtn.disabled = true;
      const loader = logoutBtn.querySelector('.loader')

      if (loader) {
        loader.style.display = 'inline-block';
      }
      
      await fetch('/logout');

      setTimeout(() => {
        const container = document.querySelector('.container');
        if(container) {
          container.classList.add('fade-out');
        }
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }, 1500);
      
  } catch (error) {
      console.error('Logout error:', error);
  }
}


// ----------------------------------------------------------------
// Prevent User a logged-in user from opening the login modal
// ----------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async function () {
  // Check if the user is logged in
  const response = await fetch("/current_user");
  const userData = await response.json();
  const isLoggedIn = userData.pseudo !== null;

  // If logged in, prevent access to login/register modals
  if (isLoggedIn) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has("isSigningIn") || urlParams.has("isLoggingIn")) {
          history.replaceState(null, "", "/"); // Remove query parameters
      }
  }
});

async function openSignInModal() {
  const response = await fetch("/current_user");
  const userData = await response.json();
  if (userData.pseudo) {
      history.replaceState(null, "", "/"); // Remove query param if user is logged in
      return; // Stop execution
  }

  history.pushState(null, "", "?isSigningIn=true");
  signInModalOverlay.classList.add("show");
  
  setupPasswordToggle('signinPassword', 'signinPwdToggle');
  
  const messageEl = document.getElementById('signInMessage');
  if (messageEl) {
      messageEl.style.display = 'none';
      messageEl.textContent = '';
      messageEl.className = 'status-message';
  }
  document.body.style.overflow = "hidden";
}


// ----------------------------------------------------------------
// Menu navigation
// ----------------------------------------------------------------

document.addEventListener("DOMContentLoaded", function () {
  const menuItems = document.querySelectorAll(".choice-menu-box");
  const contentArea = document.getElementById("dynamic-content");

  let currentPage = "training";

  async function loadContent(page) {

    if (!page) {
      page = "training";
    }

    if (currentPage === page) return; // Prevent redundant reloads
    currentPage = page; // Update current page tracker

    try {
      const response = await fetch(`/page/${page}`);
      const html = await response.text();
      document.getElementById("dynamic-content").innerHTML = html;
    } catch (error) {
        console.error("Error loading page:", error);
        document.getElementById("dynamic-content").innerHTML = "<p>Failed to load content.</p>";
    }
  }

  function reinitializeEventListeners() {
    console.log("Reinitializing event listeners...");

    // Example: Add event listener for buttons in dynamic content
    const continueBtn = document.getElementById("continue");
    if (continueBtn) {
        continueBtn.addEventListener("click", function () {
            alert("Continuing Training...");
        });
    }
  }

  // Handle menu click event
  menuItems.forEach(item => {
      item.addEventListener("click", function () {
          // Remove 'selected' class from all, then add to clicked one
          menuItems.forEach(i => i.classList.remove("selected"));
          this.classList.add("selected");

          const page = this.getAttribute("data-page");
          loadContent(page);
      });
  });

  // Load default page (Training) on first load
  loadContent("training");
});

