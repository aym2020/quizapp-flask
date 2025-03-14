document.addEventListener('DOMContentLoaded', function() {
    const certifDropdown = document.getElementById('certifCode');
    const questionsTableBody = document.getElementById('questionsBody');
    const searchInput = document.getElementById('searchInput');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    const tbody = document.getElementById('questionsBody');

    let currentPage = 1;
    let currentCertif = '';
    let searchQuery = '';
    const pageSize = 10;

    /** Load Certifications into Dropdown */
async function populateCertifDropdown() {
    try {
        const response = await fetch('/get_certif_details');
        const certifications = await response.json();
        const certifList = Object.values(certifications);
        
        certifDropdown.innerHTML = '<option value="" disabled selected>Select Certification</option>';
        
        certifList.forEach(certif => {
            const option = document.createElement('option');
            option.value = certif.code;
            option.textContent = certif.code.toUpperCase();
            certifDropdown.appendChild(option);
        });

        // Auto-select first certification if available
        if (certifList.length > 0) {
            certifDropdown.value = certifList[0].code;
            currentCertif = certifList[0].code;
            loadQuestions();
        }
    } catch (error) {
        console.error('Error loading certifications:', error);
    }
}

    /** Load Questions from API */
    async function loadQuestions() {
        try {
            const response = await fetch(`/api/questions?certif=${currentCertif}&page=${currentPage}&search=${searchQuery}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
    
            const data = await response.json();
            
            if (data.error) {
                console.error('API Error:', data.error);
                return;
            }
    
            renderTable(data.questions || []);
            updatePagination(data.total_count || 0);
            
        } catch (error) {
            console.error('Error loading questions:', error);
            // Optional: Show error message to user
        }
    }

    /** Render Questions Table */
    function renderTable(questions) {
        try {
            if (!tbody) {
                console.error('Table body element not found');
                return;
            }
            
            tbody.innerHTML = '';
            
            questions.forEach(question => {

                const row = `
                    <tr>
                        <td>${question.exam_topic_id}</td>
                        <td class="truncate" title="${question.question}">${question.question}</td>
                        <td>
                            <span class="question-type ${question.type.toLowerCase()}">
                                ${question.type.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                        </td>
                        <td>
                            <div class="status-indicator ${question.status}"></div>
                        </td>
                        <td>
                            <a href="/question/${question.id}" class="action-icon">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                        </td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        } catch (error) {
            console.error('Error rendering table:', error);
        }
    }

    /** Update Pagination Controls */
    function updatePagination(totalItems) {
        const totalPages = Math.ceil(totalItems / pageSize);
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages;
    }

    /** Event Listeners */
    certifDropdown.addEventListener('change', function(e) {
        currentCertif = e.target.value;
        currentPage = 1;
        loadQuestions();
    });

    searchInput.addEventListener('input', function(e) {
        searchQuery = e.target.value.trim();
        currentPage = 1;
        loadQuestions();
    });

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadQuestions();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        currentPage++;
        loadQuestions();
    });

    /** Initialize Page */
    async function initializePage() {
        await populateCertifDropdown();
        loadQuestions();
    }

    initializePage();
});
