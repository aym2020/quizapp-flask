document.querySelectorAll('.id-card').forEach(card => {
    let timeout;
    const sensitivity = 25;
    const resetDuration = 400;

    // Store original transition values
    const originalTransition = window.getComputedStyle(card).transition;

    const animate = (x, y) => {
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width/2;
        const centerY = rect.top + rect.height/2;

        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            return;
        }

        const rotateY = -(x - centerX)/sensitivity;
        const rotateX = (y - centerY)/sensitivity;

        // Remove transition for immediate response
        card.style.transition = 'transform 0.1s linear';
        card.style.transform = `
            perspective(1000px)
            rotateX(${rotateX}deg)
            rotateY(${rotateY}deg)
        `;

        // Update glow position without transition
        card.style.setProperty('--pointer-x', `${(x - rect.left) / rect.width * 100}%`);
        card.style.setProperty('--pointer-y', `${(y - rect.top) / rect.height * 100}%`);
    };

    const resetCard = () => {
        if(timeout) {
            cancelAnimationFrame(timeout);
            timeout = null;
        }

        // Apply smooth transition for reset
        card.style.transition = `
            ${originalTransition},
            --pointer-x ${resetDuration}ms ease-out,
            --pointer-y ${resetDuration}ms ease-out
        `;

        card.style.transform = `
            perspective(1000px)
            rotateX(0deg)
            rotateY(0deg)
        `;
        card.style.setProperty('--pointer-x', '50%');
        card.style.setProperty('--pointer-y', '50%');

        // Clear temporary transition after animation
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