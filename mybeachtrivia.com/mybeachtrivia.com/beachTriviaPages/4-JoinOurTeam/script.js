// Form validation and submission handling

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
    authDomain: "beach-trivia-website.firebaseapp.com",
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.firebasestorage.app",
    messagingSenderId: "459479368322",
    appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
    measurementId: "G-24MQRKKDNY"
  };
  
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  
  // Initialize Firestore
  const db = firebase.firestore();
  
  document.addEventListener('DOMContentLoaded', function() {
      const form = document.getElementById('teamApplicationForm');
      
      // Form validation and submission
      form.addEventListener('submit', function(e) {
          e.preventDefault();
          
          if (validateForm()) {
              // Show loading indicator
              const loadingIndicator = document.getElementById('formLoading');
              loadingIndicator.style.display = 'block';
              
              // Disable submit button during submission
              const submitButton = document.querySelector('.submit-button');
              submitButton.disabled = true;
              
              // Collect form data
              const formData = new FormData(form);
              
              // Get availability checkboxes
              const availabilityCheckboxes = document.querySelectorAll('input[name="availability"]:checked');
              const availabilityValues = Array.from(availabilityCheckboxes).map(cb => cb.value);
              
              // Create an object to hold all form data
              const formDataObj = {};
              for (let [key, value] of formData.entries()) {
                  if (key !== 'availability') { // Skip individual availability checkboxes
                      formDataObj[key] = value;
                  }
              }
              
              // Add the availability array
              formDataObj.availability = availabilityValues;
              
              // Add submission date and status
              formDataObj.submissionDate = new Date();
              formDataObj.status = "pending";
              
              // Submit to Firestore
              db.collection("Applications").add(formDataObj)
                  .then((docRef) => {
                      console.log("Application submitted with ID: ", docRef.id);
                      
                      // Hide loading indicator
                      loadingIndicator.style.display = 'none';
                      
                      // Show success message
                      document.getElementById('formSuccess').style.display = 'block';
                      document.getElementById('formSuccess').scrollIntoView({ behavior: 'smooth' });
                      
                      // Reset form
                      form.reset();
                      
                      // Re-enable submit button
                      submitButton.disabled = false;
                  })
                  .catch((error) => {
                      console.error("Error adding document: ", error);
                      
                      // Hide loading indicator
                      loadingIndicator.style.display = 'none';
                      
                      // Show error message
                      alert('Error submitting application. Please try again later.');
                      
                      // Re-enable submit button
                      submitButton.disabled = false;
                  });
          }
      });
      
      // Form validation function
      function validateForm() {
          let isValid = true;
          const requiredFields = form.querySelectorAll('[required]');
          
          // Clear previous error styling
          const errorFields = form.querySelectorAll('.error-field');
          errorFields.forEach(field => field.classList.remove('error-field'));
          
          // Check each required field
          requiredFields.forEach(field => {
              if (!field.value.trim()) {
                  field.classList.add('error-field');
                  isValid = false;
              }
          });
          
          // Check email format
          const emailField = document.getElementById('email');
          const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (emailField.value && !emailPattern.test(emailField.value)) {
              emailField.classList.add('error-field');
              isValid = false;
          }
          
          // Check phone format
          const phoneField = document.getElementById('phone');
          const phonePattern = /^[\d\s\-\(\)\.]+$/; // Basic phone validation
          if (phoneField.value && !phonePattern.test(phoneField.value)) {
              phoneField.classList.add('error-field');
              isValid = false;
          }
          
          // Check availability (at least one day must be selected)
          const availabilityCheckboxes = form.querySelectorAll('input[name="availability"]:checked');
          if (availabilityCheckboxes.length === 0) {
              const availabilitySection = document.querySelector('.checkbox-group');
              availabilitySection.classList.add('error-field');
              isValid = false;
          }
          
          // Check new required text areas
          const textAreas = ['disputeHandling', 'techIssues', 'triviaEngagement'];
          textAreas.forEach(id => {
              const textArea = document.getElementById(id);
              if (textArea && textArea.hasAttribute('required') && !textArea.value.trim()) {
                  textArea.classList.add('error-field');
                  isValid = false;
              }
          });
          
          // If form is invalid, show alert
          if (!isValid) {
              alert('Please complete all required fields correctly.');
          }
          
          return isValid;
      }
      
      // Format phone number as user types
      const phoneInput = document.getElementById('phone');
      phoneInput.addEventListener('input', function(e) {
          let value = e.target.value.replace(/\D/g, '');
          if (value.length > 0) {
              if (value.length <= 3) {
                  value = value;
              } else if (value.length <= 6) {
                  value = value.slice(0, 3) + '-' + value.slice(3);
              } else {
                  value = value.slice(0, 3) + '-' + value.slice(3, 6) + '-' + value.slice(6, 10);
              }
              e.target.value = value;
          }
      });
  });