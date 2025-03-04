document.addEventListener("DOMContentLoaded", () => {
    // Select all certification cards in the grid.
    // Each card has the class "grid-item-certif"
    const certifCards = document.querySelectorAll('.grid-item-certif');
  
    certifCards.forEach(card => {
      // Find the "continue/start" button within the card.
      // (Note: Make sure the button is not using a duplicate id.)
      const continueButton = card.querySelector('.grid-left-button-continue button');
      if (continueButton) {
        continueButton.addEventListener('click', () => {
          // Get the certification code from the element with the class "grid-certif-name"
          const certifNameElement = card.querySelector('.grid-certif-name');
          if (certifNameElement) {
            // Extract the text (e.g., "DP-900") and convert to lowercase if needed.
            let certifCode = certifNameElement.textContent.trim().toLowerCase();
            // Redirect to the quiz page for this certification.
            window.location.href = `/quiz/${certifCode}`;
          }
        });
      }
    });
  });
  