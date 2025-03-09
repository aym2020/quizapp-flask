
// training.js
document.addEventListener('DOMContentLoaded', () => {
  const certifDropdown = document.getElementById('certifCode');
  const trainingBtn = document.getElementById('trainingBtn');
  const loader = trainingBtn.querySelector('.loader');
  
  // Populate certification dropdown
  async function populateCertifDropdown() {
      try {
          const response = await fetch('/get_certif');
          const certifs = await response.json();
          
          certifDropdown.innerHTML = '<option value="" disabled selected>Select Certification</option>';
          certifs.forEach(certif => {
              const option = document.createElement('option');
              option.value = certif;
              option.textContent = certif;
              certifDropdown.appendChild(option);
          });
      } catch (error) {
          console.error('Error loading certifications:', error);
          alert('Failed to load certifications');
      }
  }

  // Handle button click with loader and delay
  trainingBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      const selectedCertif = certifDropdown.value;
      if (!selectedCertif) {
          alert('Please select a certification first!');
          return;
      }

      // Show loader and disable button
      trainingBtn.disabled = true;
      trainingBtn.querySelector('.button-text').style.visibility = 'hidden';
      loader.style.display = 'inline-block';

      // Simulate processing delay
      setTimeout(() => {
          // Navigate to quiz page with selected certification
          window.location.href = `/quiz/${selectedCertif}`;
          
          // Reset button state (optional - in case navigation fails)
          setTimeout(() => {
              trainingBtn.disabled = false;
              trainingBtn.querySelector('.button-text').style.visibility = 'visible';
              loader.style.display = 'none';
          }, 3000);
      }, 2000); // 2 second delay
  });

  // Initial population of dropdown
  populateCertifDropdown();
});