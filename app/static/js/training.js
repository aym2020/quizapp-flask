// training.js
let trainingEventListeners = [];

// Modified to receive dropdown as parameter
async function populateCertifDropdown(dropdown) {
  try {
    const response = await fetch('/get_certif');
    const certifs = await response.json();
    
    // Clear and repopulate dropdown
    dropdown.innerHTML = '<option value="" disabled selected>Select Certification</option>';
    certifs.forEach(certif => {
      const option = document.createElement('option');
      option.value = certif;
      option.textContent = certif;
      dropdown.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading certifications:', error);
    // Remove alert to prevent blocking
  }
}

// Modified to receive elements as parameters
function handleTrainingButtonClick(trainingBtn, dropdown) {
  return function(e) {
    e.preventDefault();
    
    const selectedCertif = dropdown.value;
    if (!selectedCertif) {
      alert('Please select a certification first!');
      return;
    }

    const loader = trainingBtn.querySelector('.loader');
    trainingBtn.disabled = true;
    trainingBtn.querySelector('.button-text').style.visibility = 'hidden';
    loader.style.display = 'inline-block';

    setTimeout(() => {
      window.location.href = `/quiz/${selectedCertif}`;
      setTimeout(() => {
        trainingBtn.disabled = false;
        trainingBtn.querySelector('.button-text').style.visibility = 'visible';
        loader.style.display = 'none';
      }, 3000);
    }, 2000);
  };
}

// Initialize with DOM elements
function initTraining() {
  const certifDropdown = document.getElementById('certifCode');

  if (!certifDropdown) return;

  // Initialize dropdown
  populateCertifDropdown(certifDropdown);

  // Event handlers with proper element references
  const safeClickHandler = (e) => {
    if (!document.body.classList.contains('modal-open') && certifDropdown.children.length <= 1) {
      populateCertifDropdown(certifDropdown);
    }
  };

  // Add event listeners
  certifDropdown.addEventListener('click', safeClickHandler);
  trainingBtn.addEventListener('click', handleTrainingButtonClick(trainingBtn, certifDropdown));

  // Store listeners for cleanup
  trainingEventListeners = [
    { element: certifDropdown, type: 'click', handler: safeClickHandler },
    { element: trainingBtn, type: 'click', handler: handleTrainingButtonClick(trainingBtn, certifDropdown) }
  ];
}

// Cleanup function
function destroyTraining() {
  trainingEventListeners.forEach(({ element, type, handler }) => {
    element.removeEventListener(type, handler);
  });
  trainingEventListeners = [];
}

// Initialize when ready
document.addEventListener('DOMContentLoaded', initTraining);