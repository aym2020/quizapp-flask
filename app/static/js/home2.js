// ----------------------------------------------------------------
// Modal Functions
// ----------------------------------------------------------------

function openRegisterModal() {
  const registerModalOverlay = document.getElementById("registerModalOverlay");

  history.pushState(null, "", "?isLoggingIn=true");
  registerModalOverlay.classList.add("show");
  setupPasswordToggle('registerPassword', 'registerPwdToggle');
  
  const messageEl = document.getElementById('registerMessage');
  if (messageEl) {
    messageEl.style.display = 'none'; 
    messageEl.className = 'status-message';
  }
  document.body.style.overflow = "hidden";
}

function openSignInModal() {
  // Get the modal element
  const signInModalOverlay = document.getElementById("signInModalOverlay");

  // Update the URL and show the modal
  history.pushState(null, "", "?isSigningIn=true");
  signInModalOverlay.classList.add("show");

  // Initialize password toggle for the sign-in form
  setupPasswordToggle('signinPassword', 'signinPwdToggle');

  // Hide any previous messages
  const messageEl = document.getElementById('signInMessage');
  if (messageEl) {
    messageEl.style.display = 'none';
    messageEl.textContent = '';
    messageEl.className = 'status-message';
  }

  document.body.style.overflow = "hidden";
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
    
      // Immediately hide modal
      document.getElementById("signInModalOverlay").classList.remove("show");
      document.body.style.overflow = "";
    
      // Remove query parameter to prevent modal reopening
      history.replaceState(null, "", window.location.pathname);
    
      setTimeout(() => {
        window.location.reload(); // Reload after showing message
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
// Sign In Modal Close
// ----------------------------------------------------------------
function closeSignInModal() {
  history.pushState(null, "", "/");

  const signInModalOverlay = document.getElementById("signInModalOverlay");
  signInModalOverlay.classList.remove("show"); 

  const messageEl = document.getElementById('signInMessage');
  if (messageEl) {
    messageEl.style.display = 'none';
    messageEl.textContent = '';
  }
  
  const form = document.getElementById('modal-form-signin');
  if (form) form.reset();
  document.body.style.overflow = "";
}

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
  const registerModalOverlay = document.getElementById('registerModalOverlay');
  const messageEl = document.getElementById('registerMessage')

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
        registerModalOverlay.classList.remove('show');
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
// Register Modal Close
// ----------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function () {
  const closeRegisterModalBtn = document.getElementById("closeRegisterModal");
  const registerModalOverlay = document.getElementById("registerModalOverlay");

  function closeRegisterModal() {
    history.pushState(null, "", "/");
    registerModalOverlay.classList.remove('show');
    document.body.style.overflow = '';

    const messageEl = document.getElementById('registerMessage');
    if (messageEl) {
      messageEl.style.display = 'none';
      messageEl.textContent = '';
    }

    const form = document.getElementById('modal-form-signup');
    if (form) form.reset();
  }

  if (closeRegisterModalBtn) {
    closeRegisterModalBtn.addEventListener("click", closeRegisterModal);
  }

  if (window.location.search.includes("isLoggingIn=true")) {
    openRegisterModal();
  }

  window.addEventListener("popstate", function (event) {
    if (event.state && event.state.page) {
      loadContent(event.state.page);
    } else {
      closeRegisterModal();
    }
  });
});

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
// Menu Navigation + URL Update
// ----------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function () {
  const menuItems = document.querySelectorAll(".choice-menu-box");
  const contentArea = document.getElementById("dynamic-content");

  let currentPage = new URLSearchParams(window.location.search).get("page") || "training";

  async function loadContent(page) {
    if (!page) page = "training";
    if (currentPage === page) return;

    currentPage = page;

    try {
      const response = await fetch(`/page/${page}`);
      const html = await response.text();
      contentArea.innerHTML = html;

      // Update URL dynamically
      history.pushState({ page: page }, "", `?page=${page}`);

    } catch (error) {
      console.error("Error loading page:", error);
      contentArea.innerHTML = "<p>Failed to load content.</p>";
    }
  }

  menuItems.forEach(item => {
      item.addEventListener("click", function () {
          menuItems.forEach(i => i.classList.remove("selected"));
          this.classList.add("selected");

          const page = this.getAttribute("data-page");
          loadContent(page);
      });
  });

  // Auto-load page from URL on refresh
  loadContent(currentPage);
});

// ----------------------------------------------------------------
// Prevent Logged-in Users from Opening Login/Register Modals
// ----------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async function () {
  try {
    const response = await fetch("/current_user");
    const userData = await response.json();
    const isLoggedIn = userData.pseudo !== null;

    if (isLoggedIn) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has("isSigningIn") || urlParams.has("isLoggingIn")) {
        history.replaceState(null, "", "/");
      }
    }
  } catch (error) {
    console.error("Error checking user login status:", error);
  }
});


document.addEventListener("click", function(e) {
  // Handle "Create Account" button
  if (e.target.closest("#createProfile")) {
    e.preventDefault();
    openRegisterModal();
  }

  // Handle "Sign In" button
  if (e.target.closest("#signIn")) {
    e.preventDefault();
    openSignInModal();
  }
});

// ----------------------------------------------------------------
// Logout
// ----------------------------------------------------------------

document.addEventListener("DOMContentLoaded", function () {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
});

document.addEventListener("click", function(e) {
  if (e.target.closest("#logoutBtn")) {
    e.preventDefault();
    handleLogout();
  }
});

async function handleLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.disabled = true;
    const loader = logoutBtn.querySelector('.loader');
    if (loader) {
      loader.style.display = 'inline-block';
    }
  }

  try {
    await fetch('/logout');

    // Wait 1500ms to show the loader and then reload
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (error) {
    console.error('Logout error:', error);
  }
}
