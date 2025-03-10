// training.js

// Define our selectors for the training page
const TRAINING_SELECTORS = {
    certifDropdown: document.getElementById('certifCode'),
    trainingBtn: document.getElementById('trainingBtn')
  };
  
  let trainingEventListeners = [];
  
  // Asynchronously populate the certification dropdown
  async function populateCertifDropdown() {
    const dropdown = TRAINING_SELECTORS.certifDropdown;
    try {
      const response = await fetch('/get_certif');
      const certifs = await response.json();
      // Clear existing options and add a placeholder
      dropdown.innerHTML = '<option value="" disabled selected>Select Certification</option>';
      // Add each certification as an option
      certifs.forEach(certif => {
        const option = document.createElement('option');
        option.value = certif;
        option.textContent = certif;
        dropdown.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading certifications:', error);
      alert('Failed to load certifications');
    }
  }
  
  // This function prevents dropdown interactions if a modal is open
  function safeCertifHandler(e) {
    // Only repopulate if the dropdown has one or zero options (the placeholder)
    if (!document.body.classList.contains('modal-open')) {
      if (TRAINING_SELECTORS.certifDropdown.children.length <= 1) {
        populateCertifDropdown();
      }
    } else {
      e.stopPropagation();
    }
  }
  
  
  // Handler for the training button click
  function handleTrainingButtonClick(e) {
    e.preventDefault();
    
    const dropdown = TRAINING_SELECTORS.certifDropdown;
    const trainingBtn = TRAINING_SELECTORS.trainingBtn;
    const loader = trainingBtn.querySelector('.loader');
  
    const selectedCertif = dropdown.value;
    if (!selectedCertif) {
      alert('Please select a certification first!');
      return;
    }
    
    // Show loader and disable the button
    trainingBtn.disabled = true;
    trainingBtn.querySelector('.button-text').style.visibility = 'hidden';
    loader.style.display = 'inline-block';
    
    // Simulate a processing delay then navigate to the quiz page
    setTimeout(() => {
      window.location.href = `/quiz/${selectedCertif}`;
      
      // (Optional) Reset button state if navigation fails
      setTimeout(() => {
        trainingBtn.disabled = false;
        trainingBtn.querySelector('.button-text').style.visibility = 'visible';
        loader.style.display = 'none';
      }, 3000);
    }, 2000);
  }
  
  // Initialize event listeners and populate dropdown
  function initTraining() {
    if (!TRAINING_SELECTORS.certifDropdown || !TRAINING_SELECTORS.trainingBtn) return;
  
    populateCertifDropdown();
  
    // Attach a safe click handler to the dropdown
    TRAINING_SELECTORS.certifDropdown.addEventListener('click', safeCertifHandler);
    trainingEventListeners.push({
      element: TRAINING_SELECTORS.certifDropdown,
      type: 'click',
      handler: safeCertifHandler
    });
    
    // Attach click handler for the training button
    TRAINING_SELECTORS.trainingBtn.addEventListener('click', handleTrainingButtonClick);
    trainingEventListeners.push({
      element: TRAINING_SELECTORS.trainingBtn,
      type: 'click',
      handler: handleTrainingButtonClick
    });
  }
  
  // Remove event listeners when needed
  function destroyTraining() {
    trainingEventListeners.forEach(({ element, type, handler }) => {
      element.removeEventListener(type, handler);
    });
    trainingEventListeners = [];
  }
  
  // Initialize when the DOM content is loaded
  document.addEventListener('DOMContentLoaded', initTraining);
  