// ID Card Hover Effects (works for all users)
document.querySelectorAll('.id-card').forEach(card => {
    let timeout;
    const sensitivity = 25;
    const resetDuration = 400;
    const originalTransition = window.getComputedStyle(card).transition;

    const animate = (x, y) => {
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width/2;
        const centerY = rect.top + rect.height/2;

        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;

        const rotateY = -(x - centerX)/sensitivity;
        const rotateX = (y - centerY)/sensitivity;

        card.style.transition = 'transform 0.1s linear';
        card.style.transform = `
            perspective(1000px)
            rotateX(${rotateX}deg)
            rotateY(${rotateY}deg)
        `;
        card.style.setProperty('--pointer-x', `${(x - rect.left) / rect.width * 100}%`);
        card.style.setProperty('--pointer-y', `${(y - rect.top) / rect.height * 100}%`);
    };

    const resetCard = () => {
        if(timeout) cancelAnimationFrame(timeout);
        timeout = null;

        card.style.transition = `
            ${originalTransition},
            --pointer-x ${resetDuration}ms ease-out,
            --pointer-y ${resetDuration}ms ease-out
        `;
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
        card.style.setProperty('--pointer-x', '50%');
        card.style.setProperty('--pointer-y', '50%');

        setTimeout(() => {
            card.style.transition = originalTransition;
        }, resetDuration);
    };

    card.addEventListener('mousemove', (e) => {
        if(timeout) cancelAnimationFrame(timeout);
        timeout = requestAnimationFrame(() => animate(e.clientX, e.clientY));
    });

    card.addEventListener('mouseleave', resetCard);
});

// Username Editing (only for logged-in users)
const editIcon = document.querySelector('.edit-icon');
const editControls = document.querySelector('.edit-controls');

// Only add edit functionality if elements exist (logged-in user)
if (editIcon && editControls) {
    editIcon.addEventListener('click', function(e) {
        e.preventDefault();
        const container = document.querySelector('.id-card');
        const usernameSpan = document.querySelector('.current-username');
        const usernameInput = document.querySelector('.username-input');

        // Enter edit mode
        container.classList.add('edit-mode');
        usernameSpan.style.display = 'none';
        this.style.display = 'none';
        usernameInput.style.display = 'block';
        editControls.style.display = 'flex';
        usernameInput.focus();
    });

    editControls.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;

        const editIcon = document.querySelector('.edit-icon');
        const container = document.querySelector('.id-card');
        const usernameSpan = document.querySelector('.current-username');
        const usernameInput = document.querySelector('.username-input');
        
        if (btn.classList.contains('confirm')) {
            const newUsername = usernameInput.value.trim();
            if (newUsername && newUsername !== usernameSpan.textContent) {
                fetch('/update_pseudo', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ new_pseudo: newUsername })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        usernameSpan.textContent = newUsername;
                        document.querySelectorAll('.user-pseudo-display').forEach(el => {
                            el.textContent = newUsername;
                        });
                    } else {
                        alert(data.error || 'Error updating username');
                    }
                });
            }
        }

        // Exit edit mode
        editIcon.style.display = 'inline';
        container.classList.remove('edit-mode');
        usernameSpan.style.display = 'inline';
        usernameInput.style.display = 'none';
        this.style.display = 'none';
        usernameInput.value = usernameSpan.textContent;
    });
} else {
    // Hide edit controls completely if user isn't logged in
    const usernameEditContainer = document.querySelector('.username-edit-container');
    if (usernameEditContainer) {
        const cleanHTML = `
        <span class="current-username">UNKNOWN</span>
    `;
    usernameEditContainer.innerHTML = cleanHTML;
    }
}