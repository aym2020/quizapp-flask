document.addEventListener("DOMContentLoaded", function () {
    const openModalBtn = document.getElementById("createProfile"); // the button that opens modal
    const modalOverlay = document.getElementById("modalOverlay");
    const closeModalBtn = document.getElementById("closeModal");
  
    function openModal() {
      history.pushState(null, "", "?isLoggingIn=true");
      modalOverlay.classList.add("show");
      // Optional: Prevent background scrolling
      document.body.style.overflow = "hidden";
    }
  
    function closeModal() {
      history.pushState(null, "", "/");
      modalOverlay.classList.remove("show");
      // Restore background scrolling
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
  
    // Optionally, handle the browser's back button to close modal
    window.addEventListener("popstate", closeModal);
  });