// training.js
let certifications = {};
let trainingEventListeners = [];

async function populateCertifDropdown(dropdown) {
    try {
        const response = await fetch('/get_certif_details');
        certifications = await response.json();
       
        dropdown.innerHTML = '<option value="" disabled selected>Select Certification</option>';
        const certifList = Object.values(certifications);
        
        certifList.forEach(certif => {
            const option = document.createElement('option');
            option.value = certif.code;
            option.textContent = certif.code ? certif.code.toUpperCase() : 'UNKNOWN';
            dropdown.appendChild(option);
        });

        // Auto-select first certification if available
        if (certifList.length > 0) {
            const firstCertif = certifList[0];
            dropdown.value = firstCertif.code;
            updateCertificationPanel(firstCertif.code);
        }

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
    const logoToShow = (currentUser && certif.progress >= 100) ? certif.logo_complete : certif.logo;

    
    container.innerHTML = `
        <div class="grid-item-certif">
            <div class="left-part-grid-item color-scheme-pink">
                <button class="button-certif-detail">
                    <span class="grid-text-detail-certif-button">${certif.title}</span>
                </button>
                <span class="grid-certif-name">${certif.name}</span>
                <div class="progress-bar-container">
                    <div class="grid-progress-bar">
                        <div class="progress-fill progress-bar-scheme-blue" 
                            style="--target-width: ${currentUser ? certif.progress : 0}%">
                        </div>      
                    </div>
                    <span class="progress-text">
                            ${currentUser ? 
                                `${Math.round(certif.progress/100 * certif.total_questions)}/${certif.total_questions}` : 
                                `0/${certif.total_questions}`  // Removed || '0'
                            }
                    </span>
                </div>
                ${!currentUser ? `
                <div class="warning_message">
                    <i class="fa-solid fa-triangle-exclamation fa-xl"></i>
                    <p class="progress-warning">Progress won't be saved!</p>
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
                <img id="certif-logo" src="/static/images/certif/${logoToShow}" alt="${certif.name} Logo">                     
            </div>
        </div>
    `;

    container.style.display = 'block';
    initializeContinueButton();

    setTimeout(() => {
        const progressFill = container.querySelector('.progress-fill');
        const cupIcon = container.querySelector('.cup-icon');
        
        if (progressFill) {
            void progressFill.offsetWidth; // Trigger reflow
            progressFill.style.animation = 'none';
    
            const targetWidth = progressFill.style.getPropertyValue('--target-width');
            const targetWidthValue = parseFloat(targetWidth);
    
            // Clean up previous animation style
            if (window.animationStyleTag) {
                window.animationStyleTag.remove();
            }
    
            if (targetWidthValue > 0) {
                // Create new animation
                const animation = `
                    @keyframes fillBars {
                        from { width: 0; }
                        to { width: ${targetWidth}; }
                    }
                `;
                window.animationStyleTag = document.createElement('style');
                window.animationStyleTag.textContent = animation;
                document.head.appendChild(window.animationStyleTag);
    
                setTimeout(() => {
                    progressFill.style.animation = 'fillBars 0.8s ease-in-out forwards';
                    if (cupIcon) {
                        cupIcon.style.transform = `translate(calc(${targetWidth} - 50%), -50%)`;
                    }
                }, 50);
            } else {
                // Set width directly without animation
                progressFill.style.width = targetWidth;
            }
        }
    }, 100);
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