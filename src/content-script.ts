// This script runs in the context of the active webpage.

// Function to create or update the tooltip-style window
function createOrUpdateTooltip(message: string, selectedText: string, rect: DOMRect | null): void {
    let tooltip = document.getElementById('job-fit-tooltip');

    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'job-fit-tooltip';
        tooltip.style.cssText = `
            position: absolute; /* Position relative to the document flow */
            background-color: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 0.75rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            padding: 1rem;
            z-index: 99999; /* Ensure it's on top of other page content */
            font-family: "Inter", sans-serif;
            color: #2d3748;
            width: 280px; /* Slightly wider for content */
            max-height: 200px; /* Max height to prevent it from getting too large */
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            opacity: 0; /* Start hidden for animation */
            transition: opacity 0.2s ease-in-out;
        `;
        document.body.appendChild(tooltip);
    }

    // Position the tooltip next to the selected text
    if (rect) {
        // Adjust position based on selection rectangle
        // Try to place it to the right, or below if not enough space
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        let left = rect.right + 10; // 10px to the right of the selection
        let top = rect.top + window.scrollY; // Align with the top of the selection

        // If it goes off the right edge, try to place it to the left
        if (left + tooltip.offsetWidth > viewportWidth - 20) { // 20px margin from right edge
            left = rect.left - tooltip.offsetWidth - 10;
        }

        // If it still goes off the left edge (or if it's too close to the left),
        // or if the selection is very wide, place it below
        if (left < 10 || rect.width > tooltip.offsetWidth / 2) {
            left = rect.left + window.scrollX; // Align with left of selection
            top = rect.bottom + window.scrollY + 10; // 10px below the selection
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    } else {
        // Fallback positioning if rect is not available (e.g., top right)
        tooltip.style.right = '20px';
        tooltip.style.top = '20px';
    }

    tooltip.innerHTML = `
        <div class="flex justify-between items-center">
            <p class="text-lg font-bold text-green-600">${message}</p>
            <button id="close-tooltip" class="text-gray-400 hover:text-gray-600 text-sm focus:outline-none">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
            </button>
        </div>
        <button id="tailor-resume-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition duration-200 ease-in-out">
            Tailor Resume
        </button>
    `;

    // Make it visible after content is set
    setTimeout(() => {
        if (tooltip) tooltip.style.opacity = '1';
    }, 50); // Small delay for transition effect

    // Add event listener for the "Tailor Resume" button
    const tailorButton = tooltip.querySelector('#tailor-resume-btn');
    if (tailorButton) {
        tailorButton.addEventListener('click', () => {
            console.log('Tailor Resume button clicked in tooltip for:', selectedText);
            // Here you would send a message to the service worker to initiate tailoring
            // chrome.runtime.sendMessage({ type: 'TAILOR_RESUME', text: selectedText });
            alert('Tailoring functionality coming soon!');
        });
    }

    // Add event listener for the close button
    const closeButton = tooltip.querySelector('#close-tooltip');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            tooltip?.remove(); // Remove the tooltip from the DOM
        });
    }

    // Add a click listener to the document to close the tooltip if clicked outside
    document.addEventListener('click', (event) => {
        if (tooltip && !tooltip.contains(event.target as Node) && event.target !== tailorButton) {
            tooltip.remove();
        }
    }, { once: true }); // Use { once: true } to remove the listener after one use
}

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message: { type: string; payload?: string; selectedText?: string; selectionRect?: DOMRect }) => {
    if (message.type === 'SHOW_TOOLTIP_WINDOW' && message.payload) {
        const textToDisplay = message.payload;
        const selectedText = message.selectedText || '';
        const selectionRect = message.selectionRect || null;
        createOrUpdateTooltip(textToDisplay, selectedText, selectionRect);
    }
    return false; // ADDED: Explicitly return false
});

console.log('Job Fit AI Assistant Content Script loaded on page.');
