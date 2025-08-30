// Updated settings.ts with browser detection
import * as pdfjs from "../js/pdf.mjs";
import {getUserData, saveUserData, UserRelevantData} from "./storage";
import {els} from "./dom";
import * as serverComms from "./server-comms";
import {hideAll, toggle} from "./view";
import {getPdfText, goBack, removeAllListeners} from "./sidepanel";
import {DebugLogger} from "./logging";

pdfjs.GlobalWorkerOptions.workerSrc = "./pdf.worker.mjs";

export const settingsLogger = new DebugLogger('settings');

// Browser detection functions
export function isFirefox(): boolean {
    return navigator.userAgent.toLowerCase().includes('firefox');
}

// Theme configuration
const themes = ['classic', 'sb2nov', 'engineeringresumes', 'engineeringclassic', 'moderncv'];

function manageTheme(userRelevantData: UserRelevantData) {
    let currentThemeIndex = themes.indexOf(userRelevantData.theme);

    function updateThemeDisplay() {
        const currentTheme = themes[currentThemeIndex];

        // Update theme image
        els.currentThemeImage.src = `themes/${currentTheme}.png`;
        els.currentThemeImage.alt = `${currentTheme} Theme`;
        els.currentThemeName.textContent = currentTheme;

        // Update theme indicators
        const indicators = els.themeSelectionSection.querySelectorAll('.theme-indicator');
        indicators.forEach((indicator, index) => {
            if (index === currentThemeIndex) {
                indicator.classList.add('active', 'bg-blue-500');
                indicator.classList.remove('bg-gray-300');
            } else {
                indicator.classList.remove('active', 'bg-blue-500');
                indicator.classList.add('bg-gray-300');
            }
        });

        // Update theme display border
        els.currentThemeDisplay.classList.add('selected');
    }

    // Set up theme display and controls
    updateThemeDisplay();
    // Remove existing event listeners
    const prevBtn = els.themePrevBtn.cloneNode(true);
    const nextBtn = els.themeNextBtn.cloneNode(true);
    els.themePrevBtn.replaceWith(prevBtn);
    els.themeNextBtn.replaceWith(nextBtn);

    // Add new event listeners
    prevBtn.addEventListener('click', () => {
        currentThemeIndex = (currentThemeIndex - 1 + themes.length) % themes.length;
        updateThemeDisplay();
    });

    nextBtn.addEventListener('click', () => {
        currentThemeIndex = (currentThemeIndex + 1) % themes.length;
        updateThemeDisplay();
    });

    // Set up theme indicator clicks
    const indicators = els.themeSelectionSection.querySelectorAll('.theme-indicator');
    indicators.forEach((indicator, index) => {
        const newIndicator = indicator.cloneNode(true);
        indicator.replaceWith(newIndicator);
        newIndicator.addEventListener('click', () => {
            currentThemeIndex = index;
            updateThemeDisplay();
        });
    });
}

/**
 * Asynchronously parses resume content and updates the UI.
 * This function is called by event listeners for both file uploads and changes to additional details.
 * @param userData The user data object to be updated.
 */
async function parseAndUpdateResume(userData: UserRelevantData): Promise<void> {
    settingsLogger.log('parseAndUpdateResume called');
    // Check for a file and additional details before proceeding
    if (!userData.resumeFileContent) {
        els.userDetailsMessage.textContent = 'Please upload a resume file first.';
        els.userDetailsMessage.style.color = 'red';
        return;
    }

    // Display a loading message
    els.userDetailsMessage.textContent = 'Parsing your resume...';
    els.userDetailsMessage.style.color = 'blue';

    try {
        const {
            search_query,
            resume_data
        } = await serverComms.getResumeJson(userData.resumeFileContent);
        resume_data.additionalDetails = els.additionalDetailsTextarea.value.trim();

        // Update the resume JSON data
        userData.linkedinSearchQuery = search_query;
        userData.resumeJsonData = resume_data;
        userData.jobPostingCache = {}; // Clear the cache as the resume has changed

        saveUserData(userData);

        // Update the textarea with formatted JSON
        els.resumeJsonDataTextarea.value = JSON.stringify(resume_data, null, 2);

        // Display a success message
        els.userDetailsMessage.textContent = 'Resume successfully parsed!';
        els.userDetailsMessage.style.color = 'green';

    } catch (error) {
        console.error('Error parsing resume:', error);
        els.userDetailsMessage.textContent = 'Failed to parse resume. Please check the file and try again.';
        els.userDetailsMessage.style.color = 'red';
    }
}

export function showSettingsExplainerPopup() {
    if (els.settingsExplainerOverlay && els.closeExplainerBtn && els.settingsExplainerModal) {
        els.settingsExplainerOverlay.classList.remove('hidden');

        els.closeExplainerBtn.addEventListener('click', () => {
            settingsLogger.log('closeExplainerBtn clicked');
            els.settingsExplainerOverlay.classList.add('hidden');
        }, {once: true});

        els.settingsExplainerOverlay.addEventListener('click', (event) => {
            if (event.target === els.settingsExplainerOverlay) {
                els.settingsExplainerOverlay.classList.add('hidden');
            }
        });
    }
}

export async function showUserSettings() {
    // Hide all other views
    hideAll();

    // Show the settings view elements
    toggle(els.settingsView, true);
    toggle(els.googleAiConfigSection, true);
    toggle(els.apiKeySection, true);
    toggle(els.userDetailsSection, true);
    toggle(els.backBtn, true);
    toggle(els.advancedSettingsToggle, true);
    els.advancedSettingsIcon.style.transform = 'rotate(0deg)';

    // Fetch user data and manage theme settings
    const userData = await getUserData();
    manageTheme(userData);

    // Populate existing fields
    els.additionalDetailsTextarea.value = userData.resumeJsonData?.additionalDetails || '';
    els.resumeFileNameDiv.textContent = userData.resumeFileName ? `Current resume: ${userData.resumeFileName}` : 'No resume uploaded yet.';

    // Clear old values and messages
    els.resumeFileInput.value = '';
    els.apiKeyMessage.textContent = '';
    els.userDetailsMessage.textContent = '';

    // Populate the new fields from user data
    els.modelNameInput.value = userData.modelName || 'gemini-2.5-flash';
    els.fallbackModelNameInput.value = userData.fallbackModelName || 'gemini-2.0-flash';
    els.resumeJsonDataTextarea.value = JSON.stringify(userData.resumeJsonData, null, 2) || '';

    // Advanced settings toggle functionality
    if (els.advancedSettingsToggle && els.advancedSettingsContent && els.advancedSettingsIcon) {
        els.advancedSettingsToggle = removeAllListeners(els.advancedSettingsToggle)
        els.advancedSettingsToggle.addEventListener('click', () => {
            const isHidden = els.advancedSettingsContent.classList.contains('hidden');
            if (isHidden) {
                els.advancedSettingsContent.classList.remove('hidden');
                els.advancedSettingsIcon.style.transform = 'rotate(180deg)';
            } else {
                els.advancedSettingsContent.classList.add('hidden');
                els.advancedSettingsIcon.style.transform = 'rotate(0deg)';
            }
        });
    } else {
        console.error('Advanced settings elements were not found. Please check your HTML IDs.');
    }

    // Add the save button event listener
    els.saveAllSettingsBtn = removeAllListeners(els.saveAllSettingsBtn);
    els.saveAllSettingsBtn.addEventListener('click', saveUserSettings);

    // Resume file input change listener
    els.resumeFileInput = removeAllListeners(els.resumeFileInput);
    els.resumeFileInput.addEventListener('change', async (event) => {
        const fileInput = event.target as HTMLInputElement;
        const file = fileInput.files && fileInput.files.length > 0 ? fileInput.files[0] : null;

        if (!file) {
            els.userDetailsMessage.textContent = 'A resume file is mandatory.';
            els.userDetailsMessage.style.color = 'red';
            return;
        }

        try {
            let fileContent = '';
            if (file.type === 'application/pdf') {
                fileContent = await getPdfText(file);
            } else if (file.type === 'text/plain') {
                fileContent = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target?.result as string);
                    reader.onerror = (e) => reject(e);
                    reader.readAsText(file);
                });
            } else {
                els.userDetailsMessage.textContent = 'Unsupported file type. Please upload a PDF or TXT file.';
                els.userDetailsMessage.style.color = 'red';
                return;
            }

            userData.resumeFileName = file.name;
            userData.resumeFileContent = fileContent;

            // Trigger parsing and display
            await parseAndUpdateResume(userData);

        } catch (error) {
            console.error('Error reading resume file:', error);
            els.userDetailsMessage.textContent = 'Failed to read resume file. Please try again.';
            els.userDetailsMessage.style.color = 'red';
        }
    });

    // Add the event listener for the additional details textarea
    els.additionalDetailsTextarea = removeAllListeners(els.additionalDetailsTextarea);
    els.additionalDetailsTextarea.addEventListener('input', () => {
        const resumeJsonData = userData.resumeJsonData || {};
        resumeJsonData.additionalDetails = els.additionalDetailsTextarea.value.trim();
        els.resumeJsonDataTextarea.value = JSON.stringify(resumeJsonData, null, 2);
    });

    if (!userData.resumeJsonData) {
        showSettingsExplainerPopup();
    }
}

export async function saveUserSettings() {
    // Get values from the new fields
    const modelName = els.modelNameInput.value.trim();
    const fallbackModelName = els.fallbackModelNameInput.value.trim();
    const resumeJsonDataInput = els.resumeJsonDataTextarea.value.trim();

    const apiKey = els.googleApiKeyInput.value.trim();

    try {
        els.apiKeyMessage.textContent = '';
        els.userDetailsMessage.textContent = '';

        const userRelevantData = await getUserData();

        // Check if the resume JSON data from the textarea is valid JSON
        if (resumeJsonDataInput) {
            try {
                // If it's valid, parse it and save it
                userRelevantData.resumeJsonData = JSON.parse(resumeJsonDataInput);
            } catch (e) {
                // If not, display an error and stop
                els.userDetailsMessage.textContent = 'Invalid JSON in the resume data field. Please fix the formatting.';
                els.userDetailsMessage.style.color = 'red';
                return;
            }
        }

        const oldModelName = userRelevantData.modelName;

        if (!userRelevantData.googleApiKey || userRelevantData.googleApiKey !== apiKey) {
            userRelevantData.googleApiKey = apiKey;
        }

        // Save the new model name
        if (oldModelName !== modelName) {
            userRelevantData.modelName = modelName;
        }

        // Save the new fallback model name
        if (oldModelName !== fallbackModelName) {
            userRelevantData.fallbackModelName = fallbackModelName;
        }

        userRelevantData.theme = els.currentThemeName.textContent;

        // Save user data
        await saveUserData(userRelevantData);

        const {resumeJsonData} = await getUserData();

        if (!resumeJsonData) {
            throw new Error('Resume file content failed to save.');
        }

        await goBack();
    } catch (error) {
        console.error('Error saving all settings:', error);
        els.userDetailsMessage.textContent = 'Failed to save settings. Please try again.';
        els.userDetailsMessage.style.color = 'red';
    }
}