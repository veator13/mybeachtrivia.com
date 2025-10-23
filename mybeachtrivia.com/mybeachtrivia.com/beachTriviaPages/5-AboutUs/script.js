// JavaScript to handle fade effect when scrolling with improved animations
document.addEventListener('DOMContentLoaded', function() {
    // Constants for positioning
    const headerHeight = 80;     // Header height in pixels
    const barrierTop = 95;       // Position of JS barrier (15px below header)
    
    // Create header mask element if it doesn't exist
    if (!document.getElementById('header-mask')) {
        const headerMask = document.createElement('div');
        headerMask.id = 'header-mask';
        document.body.appendChild(headerMask);
    }

    // Create JS barrier element if it doesn't exist
    if (!document.getElementById('js-barrier')) {
        const jsBarrier = document.createElement('div');
        jsBarrier.id = 'js-barrier';
        document.body.appendChild(jsBarrier);
    }

    // Get elements
    const headerMask = document.getElementById('header-mask');
    const jsBarrier = document.getElementById('js-barrier');
    const detailsContainer = document.querySelector('.details');
    
    // Set up the header mask
    headerMask.style.height = headerHeight + 'px';
    headerMask.style.background = 'url(../images/BGimage2.jpeg) no-repeat fixed';
    headerMask.style.backgroundSize = 'cover';
    
    // Set up the JS barrier position
    jsBarrier.style.top = barrierTop + 'px';
    
    // Create fade overlay element if it doesn't exist
    if (!document.querySelector('.fade-overlay')) {
        const fadeOverlay = document.createElement('div');
        fadeOverlay.className = 'fade-overlay';
        detailsContainer.appendChild(fadeOverlay);
    }

    // Wrap content in a details-content div if not already wrapped
    if (!document.querySelector('.details-content')) {
        // Get all direct children of the details container
        const detailsChildren = Array.from(detailsContainer.childNodes);
        
        // Create the content wrapper
        const detailsContent = document.createElement('div');
        detailsContent.className = 'details-content';
        
        // Move all children (except the fade-overlay) into the content wrapper
        detailsChildren.forEach(child => {
            if (!child.classList || !child.classList.contains('fade-overlay')) {
                detailsContent.appendChild(child);
            }
        });
        
        // Add the content wrapper to the details container
        detailsContainer.appendChild(detailsContent);
    }

    const fadeOverlay = document.querySelector('.fade-overlay');
    
    // Function to update fade effects based on scroll position
    function updateFadeEffects() {
        const rect = detailsContainer.getBoundingClientRect();
        const containerTop = rect.top;
        const containerHeight = rect.height;
        
        // Distance from container top to barrier
        const distanceToBarrier = containerTop - barrierTop;
        
        if (distanceToBarrier <= 0) {
            // Calculate how much of the container should be faded
            const pixelsAboveBarrier = Math.abs(distanceToBarrier);
            const fadeHeight = Math.min(containerHeight, pixelsAboveBarrier);
            
            // Set the overlay height
            fadeOverlay.style.height = `${fadeHeight}px`;
            
            // Create a gradient mask effect from transparent to visible
            const gradientStart = fadeHeight;
            const gradientEnd = Math.min(containerHeight, fadeHeight + 30); // 30px transition zone
            
            // Create a smooth gradient for the mask
            const gradientPercentages = [0, 0.1, 0.3, 0.5, 0.7, 0.9];
            let maskGradient = 'linear-gradient(to bottom, transparent 0, ';
            
            gradientPercentages.forEach((percent, i) => {
                const position = gradientStart + ((gradientEnd - gradientStart) * (i / (gradientPercentages.length - 1)));
                maskGradient += `rgba(0,0,0,${percent}) ${position}px, `;
            });
            
            maskGradient += `black ${gradientEnd}px, black 100%)`;
            
            // Apply the mask
            detailsContainer.style.maskImage = maskGradient;
            detailsContainer.style.webkitMaskImage = maskGradient;
            
            // Disable pointer events when mostly hidden
            if (fadeHeight > containerHeight * 0.9) {
                detailsContainer.style.pointerEvents = 'none';
            } else {
                detailsContainer.style.pointerEvents = 'auto';
            }
        } else {
            // Reset when below barrier
            fadeOverlay.style.height = '0px';
            detailsContainer.style.maskImage = 'none';
            detailsContainer.style.webkitMaskImage = 'none';
            detailsContainer.style.pointerEvents = 'auto';
        }
    }
    
    // Use requestAnimationFrame for smooth animation
    function animate() {
        updateFadeEffects();
        requestAnimationFrame(animate);
    }
    
    // Start smooth animation loop
    animate();
});