document.addEventListener('DOMContentLoaded', () => {
    // Add New Task button functionality
    const addTaskBtn = document.querySelector('.add-task-btn');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => {
            alert('Add New Task functionality to be implemented');
        });
    }

    // Navigation menu active state
    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // Remove active class from all links
            navLinks.forEach(l => l.classList.remove('active'));
            
            // Add active class to clicked link
            e.target.classList.add('active');
        });
    });

    // Optional: Highlight today's event
    const today = new Date();
    const eventCards = document.querySelectorAll('.event-card');
    eventCards.forEach(card => {
        const dateText = card.querySelector('h4').textContent;
        const eventDate = new Date(dateText);
        
        // Simple date comparison (not accounting for time zones)
        if (eventDate.toDateString() === today.toDateString()) {
            card.classList.add('today');
        }
    });
});