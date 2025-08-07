// Get references to HTML elements
import * as llamaindexGoogle from "@llamaindex/google";

const apiKeySection = document.getElementById('api-key-section') as HTMLDivElement;
const googleApiKeyInput = document.getElementById('google-api-key') as HTMLInputElement;
const saveApiKeyBtn = document.getElementById('save-api-key-btn') as HTMLButtonElement;
const apiKeyMessage = document.getElementById('api-key-message') as HTMLParagraphElement;

const userDetailsSection = document.getElementById('user-details-section') as HTMLDivElement;
const resumeFileInput = document.getElementById('resume-file') as HTMLInputElement;
const additionalDetailsTextarea = document.getElementById('additional-details') as HTMLTextAreaElement;
const saveUserDetailsBtn = document.getElementById('save-user-details-btn') as HTMLButtonElement;
const userDetailsMessage = document.getElementById('user-details-message') as HTMLParagraphElement;

const outputDisplay = document.getElementById('output-display') as HTMLDivElement;
const displaySelectedText = document.getElementById('display-selected-text') as HTMLSpanElement;
const displayResumeFile = document.getElementById('display-resume-file') as HTMLSpanElement;
const displayAdditionalDetails = document.getElementById('display-additional-details') as HTMLSpanElement;
// New element to display the document ID
const displayDocumentId = document.getElementById('display-document-id') as HTMLSpanElement;

// New element for the instruction screen
const instructionDisplay = document.getElementById('instruction-display') as HTMLDivElement;


import {Document, Settings, VectorStoreIndex} from "llamaindex";

// Define interfaces for stored data
interface UserSettings {
    googleApiKey?: string;
    resumeFileName?: string;
    resumeFileContent?: string; // Storing the file content as a Base64 string
    additionalDetails?: string;
    documentId?: string; // New field to store the unique document ID
}

/**
 * Hides all main sections of the side panel.
 */
function hideAllSections(): void {
    apiKeySection.classList.add('hidden');
    userDetailsSection.classList.add('hidden');
    outputDisplay.classList.add('hidden');
    instructionDisplay.classList.add('hidden'); // Hide the new instruction section
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
            additionalDetailsTextarea.value = result.userSettings.additionalDetails || '';
        }
    });
}

/**
 * Shows the instructions after a successful setup.
 */
function showInstructionDisplay(): void {
    hideAllSections();
    instructionDisplay.classList.remove('hidden');
}


/**
 * Shows the output display section with provided data.
 * @param selectedText The text selected by the user.
 * @param resumeFileName The name of the saved resume file.
 * @param additionalDetails The saved additional details.
 * @param documentId The unique ID of the vectorized document.
 */
function showOutputDisplay(selectedText: string, resumeFileName: string, additionalDetails: string, documentId: string): void {
    hideAllSections();
    displaySelectedText.textContent = selectedText || 'No text selected.';
    displayResumeFile.textContent = resumeFileName || 'Not provided.';
    displayAdditionalDetails.textContent = additionalDetails || 'Not provided.';
    displayDocumentId.textContent = documentId || 'Not available.'; // Set the new span's text
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
            // If API key exists, check if user details are saved
            if (userSettings.resumeFileName && userSettings.additionalDetails) {
                // If user details are saved, show the instructions
                showInstructionDisplay();
            } else {
                // Otherwise, show the user details section
                showUserDetailsSection();
            }
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
            }, 500);
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

function saveUserDetailsListener() {
    return async () => {
        const file = resumeFileInput.files && resumeFileInput.files.length > 0 ? resumeFileInput.files[0] : null;
        const additionalDetails = additionalDetailsTextarea.value.trim();

        try {
            userDetailsMessage.textContent = 'Saving and vectorizing file...';
            userDetailsMessage.style.color = 'blue';

            const result: { userSettings?: UserSettings } = await chrome.storage.local.get(['userSettings']);
            const userSettings = result.userSettings || {};
            const googleApiKey = userSettings.googleApiKey;

            if (!googleApiKey) {
                userDetailsMessage.textContent = 'API Key not found. Please provide it in the previous step.';
                userDetailsMessage.style.color = 'red';
                return;
            }

            // Set the llamaindex settings with the retrieved API key.
            // This must happen before any llamaindex operations.
            Settings.llm = llamaindexGoogle.gemini({
                apiKey: googleApiKey,
                model: llamaindexGoogle.GEMINI_MODEL.GEMINI_2_0_FLASH,
            });
            Settings.embedModel = new llamaindexGoogle.GeminiEmbedding({
                apiKey: googleApiKey,
            });


            if (file) {
                // Read the file content as a string
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const fileContent = e.target?.result as string;
                    // Generate a unique ID for the document
                    const documentId = crypto.randomUUID();

                    // Create a new Document from the file content with the unique ID
                    const documents = [new Document({ text: fileContent, id_: documentId })];

                    const originalWarn = console.warn;
                    console.warn = (...args) => {
                        const message = args[0];
                        if (typeof message === 'string' && message.includes('LlamaCloud')) {
                            return; // Suppress the specific warning
                        }
                        originalWarn.apply(console, args);
                    };

                    // Load and index documents to create the vector store
                    const index = await VectorStoreIndex.fromDocuments(documents);

                    console.warn = originalWarn;

                    console.log(`Successfully vectorized ${file.name} with ID: ${documentId}!`);

                    // Now save the details to local storage
                    userSettings.resumeFileName = file.name;
                    userSettings.resumeFileContent = fileContent;
                    userSettings.additionalDetails = additionalDetails;
                    userSettings.documentId = documentId; // Save the unique ID

                    await chrome.storage.local.set({userSettings});
                    userDetailsMessage.textContent = 'Details and file vectorized successfully!';
                    userDetailsMessage.style.color = 'green';
                    setTimeout(() => {
                        showInstructionDisplay(); // Show the new instructions
                    }, 500);
                };
                reader.readAsText(file); // Use readAsText for text-based files
            } else {
                userDetailsMessage.textContent = 'Resume is mandatory!';
                userDetailsMessage.style.color = 'red';
            }
        } catch (error) {
            console.error('Error saving user details:', error);
            userDetailsMessage.textContent = 'Failed to save details. Please try again.';
            userDetailsMessage.style.color = 'red';
        }
    };
}

// Event listener for saving user details
saveUserDetailsBtn.addEventListener('click', saveUserDetailsListener());

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

                // Display the selected text and stored user details, including the new document ID
                showOutputDisplay(
                    message.text,
                    userSettings.resumeFileName || '',
                    userSettings.additionalDetails || '',
                    userSettings.documentId || ''
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
chrome.runtime.sendMessage({ type: 'side-panel-ready' }).catch(error => console.log('Error sending side-panel-ready message:', error));
