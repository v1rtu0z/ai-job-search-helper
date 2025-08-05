// Define a type for the expected message structure from the service worker
interface AnalysisResult {
    overallFitScore: number;
    matchSummary: string;
    keyMatches: string[];
    potentialGaps: string[];
    recommendedAction: string;
}

// Define a type for the changes object from chrome.storage.session.onChanged
interface StorageChanges {
    lastSelectedText?: chrome.storage.StorageChange;
    lastAnalysisResult?: chrome.storage.StorageChange; // Added this for completeness
    // Add other storage keys if your extension uses them
}

// Function to update the UI with analysis results
function updateAnalysisResult(result: AnalysisResult | null): void {
    const analysisOutput = document.body.querySelector<HTMLDivElement>('#analysis-output');
    const instructions = document.body.querySelector<HTMLDivElement>('#instructions');

    if (!analysisOutput || !instructions) {
        console.error('Required DOM elements not found.');
        return;
    }

    if (result) {
        // Hide instructions and show results
        instructions.style.display = 'none';
        analysisOutput.style.display = 'block';

        analysisOutput.innerHTML = `
      <h2 class="text-lg font-semibold mb-2">Fit Score: ${result.overallFitScore}%</h2>
      <p class="mb-2">${result.matchSummary}</p>
      <h3 class="font-medium mt-4 mb-1">Key Matches:</h3>
      <ul class="list-disc list-inside">
        ${result.keyMatches.map(match => `<li>${match}</li>`).join('')}
      </ul>
      <h3 class="font-medium mt-4 mb-1">Potential Gaps:</h3>
      <ul class="list-disc list-inside">
        ${result.potentialGaps.map(gap => `<li>${gap}</li>`).join('')}
      </ul>
      <h3 class="font-medium mt-4 mb-1">Recommended Action:</h3>
      <p>${result.recommendedAction}</p>
    `;
    } else {
        // Show instructions if no result
        instructions.style.display = 'block';
        analysisOutput.style.display = 'none';
        instructions.innerText = 'Select text on a job posting and right-click to analyze!';
    }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message: { type: string; payload?: AnalysisResult | string }, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message.type === 'JOB_FIT_ANALYSIS_RESULT' && message.payload && typeof message.payload !== 'string') {
        updateAnalysisResult(message.payload);
    } else if (message.type === 'CLEAR_ANALYSIS_RESULT') {
        updateAnalysisResult(null); // Clear results and show instructions
    } else if (message.type === 'SELECTED_TEXT_RESPONSE' && typeof message.payload === 'string') {
        // If the content script sends the selected text back
        const selectedText = message.payload;
        const resultsDiv = document.getElementById('results'); // Re-get resultsDiv
        if (resultsDiv) {
            resultsDiv.textContent = `Selected Text Received: ${selectedText.substring(0, 50)}...`;
            // Now send this to the background for LLM processing
            // This message should ideally be handled by the background script, not sent back from sidepanel
            // For this example, we'll just log it.
            console.log('Sidepanel received selected text:', selectedText);
        }
    } else if (message.type === 'ANALYZE_TEXT_FROM_CONTEXT_MENU' && typeof message.payload === 'string') {
        // Handle text directly from context menu if side panel was opened this way
        const selectedText = message.payload;
        const resultsDiv = document.getElementById('results'); // Re-get resultsDiv
        if (resultsDiv) {
            resultsDiv.textContent = `Analyzing text from context menu: ${selectedText.substring(0, 50)}...`;
            // This message should ideally be handled by the background script, not sent back from sidepanel
            // For this example, we'll just log it.
            console.log('Sidepanel received context menu text:', selectedText);
        }
    }
    // Important: Return false if you are not calling sendResponse asynchronously.
    // This tells Chrome that you are not expecting to send a response later.
    return false;
});

// On load, try to get the last analysis result (if stored) or show instructions
chrome.storage.session.get('lastAnalysisResult', ({ lastAnalysisResult }) => {
    if (lastAnalysisResult) {
        updateAnalysisResult(lastAnalysisResult as AnalysisResult);
    } else {
        updateAnalysisResult(null);
    }
});

// Listen for changes in session storage (e.g., if background script updates it)
chrome.storage.session.onChanged.addListener((changes: StorageChanges) => {
    const lastAnalysisResultChange = changes['lastAnalysisResult'];

    if (lastAnalysisResultChange) {
        updateAnalysisResult(lastAnalysisResultChange.newValue as AnalysisResult);
    }
});

// Initial setup for the side panel UI (assuming sidepanel.html has these IDs)
document.addEventListener('DOMContentLoaded', () => {
    // You might want to add event listeners for resume upload or preferences here
    const uploadResumeButton = document.body.querySelector<HTMLButtonElement>('#upload-resume-button');
    if (uploadResumeButton) {
        uploadResumeButton.addEventListener('click', () => {
            // Logic to open file picker or text area for resume
            alert('Resume upload functionality coming soon!'); // Replace with actual UI
        });
    }

    // Ensure initial state is correct
    updateAnalysisResult(null);
});
