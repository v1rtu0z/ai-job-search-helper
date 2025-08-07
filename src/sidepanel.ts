// Get references to HTML elements
const apiKeySection = document.getElementById('api-key-section') as HTMLDivElement;
const googleApiKeyInput = document.getElementById('google-api-key') as HTMLInputElement;
const saveApiKeyBtn = document.getElementById('save-api-key-btn') as HTMLButtonElement;
const apiKeyMessage = document.getElementById('api-key-message') as HTMLParagraphElement;

const userDetailsSection = document.getElementById('user-details-section') as HTMLDivElement;
const resumePathInput = document.getElementById('resume-path') as HTMLInputElement;
const additionalDetailsTextarea = document.getElementById('additional-details') as HTMLTextAreaElement;
const saveUserDetailsBtn = document.getElementById('save-user-details-btn') as HTMLButtonElement;
const userDetailsMessage = document.getElementById('user-details-message') as HTMLParagraphElement;

const outputDisplay = document.getElementById('output-display') as HTMLDivElement;
const displaySelectedText = document.getElementById('display-selected-text') as HTMLSpanElement;
const displayResumePath = document.getElementById('display-resume-path') as HTMLSpanElement;
const displayAdditionalDetails = document.getElementById('display-additional-details') as HTMLSpanElement;

// Define interfaces for stored data
interface UserSettings {
    googleApiKey?: string;
    resumePath?: string;
    additionalDetails?: string;
}

/**
 * Hides all main sections of the side panel.
 */
function hideAllSections(): void {
    apiKeySection.classList.add('hidden');
    userDetailsSection.classList.add('hidden');
    outputDisplay.classList.add('hidden');
}

/**
 * Shows the API key input section.
 */
function showApiKeySection(): void {
    hideAllSections();
    apiKeySection.classList.remove('hidden');
    apiKeyMessage.textContent = ''; // Clear previous messages
}

/**
 * Shows the user details input section.
 */
function showUserDetailsSection(): void {
    hideAllSections();
    userDetailsSection.classList.remove('hidden');
    userDetailsMessage.textContent = ''; // Clear previous messages
    // Load existing details if any
    chrome.storage.local.get(['userSettings'], (result: { userSettings?: UserSettings }) => {
        if (result.userSettings) {
            resumePathInput.value = result.userSettings.resumePath || '';
            additionalDetailsTextarea.value = result.userSettings.additionalDetails || '';
        }
    });
}

/**
 * Shows the output display section with provided data.
 * @param selectedText The text selected by the user.
 * @param resumePath The saved resume path.
 * @param additionalDetails The saved additional details.
 */
function showOutputDisplay(selectedText: string, resumePath: string, additionalDetails: string): void {
    hideAllSections();
    displaySelectedText.textContent = selectedText || 'No text selected.';
    displayResumePath.textContent = resumePath || 'Not provided.';
    displayAdditionalDetails.textContent = additionalDetails || 'Not provided.';
    outputDisplay.classList.remove('hidden');
}

/**
 * Initializes the side panel by checking for the API key and showing the appropriate section.
 */
async function initializeSidePanel(): Promise<void> {
    try {
        const result: { userSettings?: UserSettings } = await chrome.storage.local.get(['userSettings']);
        const userSettings = result.userSettings || {};

        if (userSettings.googleApiKey) {
            // If API key exists, show user details section
            showUserDetailsSection();
        } else {
            // If API key doesn't exist, prompt for it
            showApiKeySection();
        }
    } catch (error) {
        console.error('Error initializing side panel:', error);
        apiKeyMessage.textContent = 'Error loading settings. Please try again.';
        showApiKeySection(); // Fallback to API key input on error
    }
}

// Event listener for saving the API key
saveApiKeyBtn.addEventListener('click', async () => {
    const apiKey = googleApiKeyInput.value.trim();
    if (apiKey) {
        try {
            // Retrieve existing settings to merge
            const result: { userSettings?: UserSettings } = await chrome.storage.local.get(['userSettings']);
            const userSettings = result.userSettings || {};
            userSettings.googleApiKey = apiKey;

            await chrome.storage.local.set({ userSettings });
            apiKeyMessage.textContent = 'API Key saved successfully!';
            apiKeyMessage.style.color = 'green';
            setTimeout(() => {
                showUserDetailsSection(); // Move to next step
            }, 1000);
        } catch (error) {
            console.error('Error saving API key:', error);
            apiKeyMessage.textContent = 'Failed to save API Key. Please try again.';
            apiKeyMessage.style.color = 'red';
        }
    } else {
        apiKeyMessage.textContent = 'API Key cannot be empty.';
        apiKeyMessage.style.color = 'red';
    }
});

// Event listener for saving user details
saveUserDetailsBtn.addEventListener('click', async () => {
    const resumePath = resumePathInput.value.trim();
    const additionalDetails = additionalDetailsTextarea.value.trim();

    try {
        // Retrieve existing settings to merge
        const result: { userSettings?: UserSettings } = await chrome.storage.local.get(['userSettings']);
        const userSettings = result.userSettings || {};
        userSettings.resumePath = resumePath;
        userSettings.additionalDetails = additionalDetails;

        await chrome.storage.local.set({ userSettings });
        userDetailsMessage.textContent = 'Details saved successfully!';
        userDetailsMessage.style.color = 'green';
        // No immediate section change here, as the user might want to adjust details.
        // The display section will be shown on context menu click.
    } catch (error) {
        console.error('Error saving user details:', error);
        userDetailsMessage.textContent = 'Failed to save details. Please try again.';
        userDetailsMessage.style.color = 'red';
    }
});

// Listener for messages from the service worker (e.g., selected text)
chrome.runtime.onMessage.addListener((message: { type: string; text?: string }, sender: chrome.runtime.MessageSender, sendResponse: () => void) => {
    if (message.type === 'selected-text' && message.text) {
        // Perform async operations using .then() and .catch()
        chrome.storage.local.get(['userSettings'])
            .then((result: { userSettings?: UserSettings }) => {
                const userSettings = result.userSettings || {};

                // Ensure API key is present before showing analysis
                if (!userSettings.googleApiKey) {
                    console.warn('API Key not set. Cannot display analysis without it.');
                    showApiKeySection(); // Redirect to API key input if missing
                    apiKeyMessage.textContent = 'Please provide your API key to proceed.';
                    apiKeyMessage.style.color = 'red';
                    // No need to return true here, as the outer function will handle it.
                    return false; // Exit early from this .then() block
                }

                // Display the selected text and stored user details
                showOutputDisplay(
                    message.text,
                    userSettings.resumePath || '',
                    userSettings.additionalDetails || ''
                );
                return true;
            })
            .catch(error => {
                console.error('Error processing selected text:', error);
                // Fallback to a default message or API key input on error
                showApiKeySection();
                apiKeyMessage.textContent = 'An error occurred. Please try again.';
                apiKeyMessage.style.color = 'red';
                return false;
            });

        return false;
    }
    return false;
});

// Initialize the side panel when the script loads
initializeSidePanel();

// Inform the service worker that the side panel is ready (optional, but good for robust communication)
chrome.runtime.sendMessage({ type: 'side-panel-ready' }).catch(error => console.error('Error sending side-panel-ready message:', error));
