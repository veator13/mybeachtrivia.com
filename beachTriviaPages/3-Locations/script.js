// JavaScript to handle fade effect when scrolling with improved animations
document.addEventListener('DOMContentLoaded', function() {
    // Constants for positioning
    const headerHeight = 80;     // Header height in pixels
    const barrierTop = 95;       // Position of JS barrier (15px below header)
    
    // Get elements
    const headerMask = document.getElementById('header-mask');
    const jsBarrier = document.getElementById('js-barrier');
    const services = document.querySelectorAll('.service');
    const fadeOverlays = document.querySelectorAll('.fade-overlay');
    
    // Set up the header mask
    headerMask.style.height = headerHeight + 'px';
    headerMask.style.background = 'url(../images/BGimage2.jpeg) no-repeat fixed';
    headerMask.style.backgroundSize = 'cover';
    
    // Set up the JS barrier position
    jsBarrier.style.top = barrierTop + 'px';
    
    // Function to update fade effects based on scroll position
    function updateFadeEffects() {
        services.forEach((service, index) => {
            const rect = service.getBoundingClientRect();
            const serviceTop = rect.top;
            const serviceHeight = rect.height;
            const fadeOverlay = fadeOverlays[index];
            
            // Distance from service top to barrier
            const distanceToBarrier = serviceTop - barrierTop;
            
            if (distanceToBarrier <= 0) {
                // Calculate how much of the service should be faded
                const pixelsAboveBarrier = Math.abs(distanceToBarrier);
                const fadeHeight = Math.min(serviceHeight, pixelsAboveBarrier);
                
                // Set the overlay height
                fadeOverlay.style.height = `${fadeHeight}px`;
                
                // Create a gradient mask effect from transparent to visible
                const gradientStart = fadeHeight;
                const gradientEnd = Math.min(serviceHeight, fadeHeight + 30); // 30px transition zone
                
                // Create a smooth gradient for the mask
                const gradientPercentages = [0, 0.1, 0.3, 0.5, 0.7, 0.9];
                let maskGradient = 'linear-gradient(to bottom, transparent 0, ';
                
                gradientPercentages.forEach((percent, i) => {
                    const position = gradientStart + ((gradientEnd - gradientStart) * (i / (gradientPercentages.length - 1)));
                    maskGradient += `rgba(0,0,0,${percent}) ${position}px, `;
                });
                
                maskGradient += `black ${gradientEnd}px, black 100%)`;
                
                // Apply the mask
                service.style.maskImage = maskGradient;
                service.style.webkitMaskImage = maskGradient;
                
                // Disable pointer events when mostly hidden
                if (fadeHeight > serviceHeight * 0.9) {
                    service.style.pointerEvents = 'none';
                } else {
                    service.style.pointerEvents = 'auto';
                }
            } else {
                // Reset when below barrier
                fadeOverlay.style.height = '0px';
                service.style.maskImage = 'none';
                service.style.webkitMaskImage = 'none';
                service.style.pointerEvents = 'auto';
            }
        });
    }
    
    // Use requestAnimationFrame for smooth animation
    function animate() {
        updateFadeEffects();
        requestAnimationFrame(animate);
    }
    
    // Start smooth animation loop
    animate();
    
    // Make sure the iframe has proper pointer events
    const mapIframe = document.getElementById('map-iframe');
    if (mapIframe) {
        // Make sure iframe is fully interactive
        mapIframe.style.pointerEvents = 'auto';
    }
});
