// training.js
let certifications = {};
let trainingEventListeners = [];

async function populateCertifDropdown(dropdown) {
    try {
        const response = await fetch('/get_certif_details');
        certifications = await response.json();
        
        dropdown.innerHTML = '<option value="" disabled selected>Select Certification</option>';
        Object.values(certifications).forEach(certif => {
            const option = document.createElement('option');
            option.value = certif.code;
            option.textContent = certif.code.toUpperCase();
            dropdown.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading certifications:', error);
    }
}

function updateCertificationPanel(selectedCertif) {
    const container = document.getElementById('certification-panel-container');
    
    if (!container) {
      console.error('Certification panel container not found');
      return;
    }


    if (!selectedCertif) {
        container.style.display = 'none';
        return;
    }

    const certif = certifications[selectedCertif];
    if (!certif) {
        console.error('Certification not found:', selectedCertif);
        return;
    }

    const currentUser = CURRENT_USER;
    
    container.innerHTML = `
        <div class="grid-item-certif">
            <div class="left-part-grid-item color-scheme-pink">
                <button class="button-certif-detail">
                    <span class="grid-text-detail-certif-button">${certif.title}</span>
                </button>
                <span class="grid-certif-name">${certif.name}</span>
                <div class="grid-progress-bar">
                  <div class="progress-fill" style="width: ${currentUser ? certif.progress : 0}%"></div>
                    <span class="progress-text">
                        ${currentUser ? `${Math.round(certif.progress*2.5)}/250` : '0/250'}
                    </span>
                    <i class="fas fa-trophy cup-icon fa-xl"></i>
                </div>
                ${!currentUser ? `
                <div class="warning_message">
                    <i class="fa-solid fa-triangle-exclamation fa-xl"></i>
                    <p class="progress-warning">Progress won't be saved</p>
                </div>` : ''}
                <div class="grid-left-button-continue">
                    <button class="button primary-btn full-width-button scheme-button continue-btn" data-certif="${certif.code}">
                        <span class="button-text">
                            ${currentUser ? 'CONTINUE' : 'START'}
                        </span>
                        <span class="loading-dots"></span>
                    </button>
                </div>
            </div>
            <div class="right-part-grid-item">
                <img id="certif-logo" src="/static/images/${certif.logo}" alt="${certif.name} Logo">           
            </div>
        </div>
    `;

    container.style.display = 'block';
    initializeContinueButton();
}

function initializeContinueButton() {
    const continueBtn = document.querySelector('.continue-btn');
    if (continueBtn) {
        continueBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const certifCode = this.dataset.certif;
            window.location.href = `/quiz/${certifCode}`;
        });
    }
}

function handleCertifSelection() {
    const selectedCertif = this.value;
    updateCertificationPanel(selectedCertif);
}

function initTraining() {
    const certifDropdown = document.getElementById('certifCode');
    if (!certifDropdown) return;

    populateCertifDropdown(certifDropdown);
    certifDropdown.addEventListener('change', handleCertifSelection);

    trainingEventListeners.push(
        { element: certifDropdown, type: 'change', handler: handleCertifSelection }
    );
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