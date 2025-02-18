// ----------------------------------------------------------------
// Modal Functions
// ----------------------------------------------------------------

function openRegisterModal() {
  const registerModalOverlay = document.getElementById("modalOverlay");

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
  const signInModalOverlay = document.getElementById("signInModalOverlay");

  history.pushState(null, "", "?isSigningIn=true");
  signInModalOverlay.classList.add("show");
  setupPasswordToggle('signinPassword', 'signinPwdToggle');
  
  const messageEl = document.getElementById('signInMessage');
  if (messageEl) {
    messageEl.style.display = 'none';
    messageEl.className = 'status-message';
  }
  document.body.style.overflow = "hidden";
}

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
// Register Modal Close
// ----------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function () {
    const closeRegisterModalBtn = document.getElementById("closeRegisterModal");
    const registerModalOverlay = document.getElementById("modalOverlay");

    function closeRegisterModal() {
      history.pushState(null, "", "/");
      registerModalOverlay.classList.remove("show");

      const messageEl = document.getElementById('registerMessage');
      if(messageEl) {
        messageEl.style.display = 'none';
        messageEl.textContent = '';
      }

      const form = document.getElementById('modal-form-signup');
      if (form) form.reset();
      
      document.body.style.overflow = "";
    }

    if (closeRegisterModalBtn) {
      closeRegisterModalBtn.addEventListener("click", closeRegisterModal);
    }

    if (window.location.search.includes("isLoggingIn=true")) {
      openRegisterModal();
    }

    window.addEventListener("popstate", function(event) {
      if (event.state && event.state.page) {
        loadContent(event.state.page);
      } else {
        closeRegisterModal();
      }
    });
});

// ----------------------------------------------------------------
// Sign In Modal Close
// ----------------------------------------------------------------
const closeSignInModalBtn = document.getElementById("closeSignInModal");
const signInModalOverlay = document.getElementById("signInModalOverlay");

function closeSignInModal() {
  history.pushState(null, "", "/");
  signInModalOverlay.classList.remove("show");
  
  const messageEl = document.getElementById('signInMessage');
  if(messageEl) {
    messageEl.style.display = 'none';
    messageEl.textContent = '';
  }
  
  const form = document.getElementById('modal-form-signin');
  if (form) form.reset();
  document.body.style.overflow = "";
}

if (closeSignInModalBtn) {
  closeSignInModalBtn.addEventListener("click", closeSignInModal);
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