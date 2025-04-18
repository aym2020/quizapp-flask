// uploads.js
const UPLOAD_SELECTORS = {
    dropArea: null,
    imageInput: null,
    previewContainer: null,
    previewImage: null,
    uploadForm: null,
    certifCode: null,
    pasteContainer: document.body // Moved to init function
};

let eventListeners = [];
let selectedFile = null;

async function populateCertifDropdown() {
    const certifDropdown = document.getElementById("certifCode");
    
    try {
        const response = await fetch("/get_certif");
        const certifs = await response.json();
        
        certifDropdown.innerHTML = '<option value="" disabled selected>Select Certification</option>';
        
        certifs.forEach(certif => {
            const option = document.createElement("option");
            option.value = certif;
            option.textContent = certif.toUpperCase();  
            certifDropdown.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading certifications:", error);
        alert('Failed to load certifications');
    }
}

function initUploads() {
    // RE-INITIALIZE DOM ELEMENTS EVERY TIME
    const UPLOAD_SELECTORS = {
        dropArea: document.getElementById('dropArea'),
        imageInput: document.getElementById('imageInput'),
        previewContainer: document.getElementById('previewContainer'),
        previewImage: document.getElementById('previewImage'),
        uploadForm: document.getElementById('uploadForm'),
        certifCode: document.getElementById('certifCode'),
        pasteContainer: document.body
    };

    // Populate dropdown
    populateCertifDropdown();
    destroyUploads();

    // Drag & Drop Handlers
    const preventDefaults = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const highlightDropArea = () => UPLOAD_SELECTORS.dropArea.classList.add('dragover');
    const unhighlightDropArea = () => UPLOAD_SELECTORS.dropArea.classList.remove('dragover');

    // File Handling
    const handleFiles = (files) => {
        if (!files || !files.length) return;
        
        const file = files[0];
        if (!file.type.startsWith('image/')) {
            alert('Please select a valid image file.');
            return;
        }

        // Save the file to the global variable
        selectedFile = file;

        updateFileDisplay(file);
        showImagePreview(file);
    };

    const handlePaste = (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        
        for (const item of items) {
            if (item.type.indexOf('image') === 0) {
                const blob = item.getAsFile();
                const file = new File([blob], 'screenshot.png', {
                    type: blob.type,
                    lastModified: Date.now()
                });
                
                handleFiles([file]);
                e.preventDefault();
                break;
            }
        }
    };

    const updateFileDisplay = (file) => {
        UPLOAD_SELECTORS.dropArea.innerHTML = `
            <p>Selected File: <strong>${file.name}</strong></p>
            <p class="file-details">${(file.size / 1024 / 1024).toFixed(2)} MB</p>
        `;
    };

    const showImagePreview = (file) => {
        UPLOAD_SELECTORS.previewContainer.classList.remove('hidden');
        UPLOAD_SELECTORS.previewImage.src = URL.createObjectURL(file);
        UPLOAD_SELECTORS.previewImage.onload = () => {
            URL.revokeObjectURL(UPLOAD_SELECTORS.previewImage.src);
        };
    };

    // Form Submission
    async function handleSubmit(e) {
        e.preventDefault();
        
        const certifCode = UPLOAD_SELECTORS.certifCode.value.trim();
        const file = selectedFile;
        const uploadBtn = document.getElementById("uploadBtn");
        const loader = uploadBtn.querySelector(".loader");
    
        if (!certifCode || !file) {
            alert('Please fill out all fields.');
            return;
        }
    
        const formData = new FormData();
        formData.append('certifcode', certifCode);
        formData.append('image', file);
    
        try {
            // Disable button & show loader
            uploadBtn.disabled = true;
            loader.style.display = "inline-block";
    
            const response = await fetch('/process_question_image', {
                method: 'POST',
                body: formData
            });
    
            if (!response.ok) throw new Error('Upload failed');
    
            // Redirect after successful upload
            window.location.href = '/confirm_question';
        } catch (error) {
            console.error('Upload Error:', error);
            alert('Failed to upload image.');
        } finally {
            // Re-enable button & hide loader
            uploadBtn.disabled = false;
            loader.style.display = "none";
        }
    };

    // Event Listeners
    const clickHandler = () => UPLOAD_SELECTORS.imageInput.click();
    const dropHandler = (e) => handleFiles(e.dataTransfer.files);
    const changeHandler = () => handleFiles(UPLOAD_SELECTORS.imageInput.files);

    eventListeners = [
        { element: UPLOAD_SELECTORS.dropArea, type: 'click', handler: clickHandler },
        { element: UPLOAD_SELECTORS.dropArea, type: 'drop', handler: dropHandler },
        { element: UPLOAD_SELECTORS.imageInput, type: 'change', handler: changeHandler },
        { element: UPLOAD_SELECTORS.uploadForm, type: 'submit', handler: handleSubmit },
    ];

    // Only add paste handler if container exists
    if (UPLOAD_SELECTORS.pasteContainer) {
        eventListeners.push({
            element: UPLOAD_SELECTORS.pasteContainer,
            type: 'paste',
            handler: handlePaste
        });
    }

    eventListeners.forEach(({ element, type, handler }) => {
        element.addEventListener(type, handler);
    });

    // Drag & Drop Events
    ['dragenter', 'dragover'].forEach(event => {
        UPLOAD_SELECTORS.dropArea.addEventListener(event, highlightDropArea, false);
    });

    ['dragleave', 'drop'].forEach(event => {
        UPLOAD_SELECTORS.dropArea.addEventListener(event, unhighlightDropArea, false);
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
        UPLOAD_SELECTORS.dropArea.addEventListener(event, preventDefaults, false);
    });
}

// Clean up event listeners
function destroyUploads() {
    eventListeners.forEach(({ element, type, handler }) => {
        element.removeEventListener(type, handler);
    });
    eventListeners = [];
}

// Initialize when the page loads
if (document.body.dataset.defaultPage === 'uploads') {
    initUploads();
}

// Export for cleanup
export { initUploads, destroyUploads };

