// Get references to HTML elements
import * as llamaindexGoogle from "@llamaindex/google";
import {Document, Settings, VectorStoreIndex} from "llamaindex";
import * as pdfjs from "./pdf.mjs";

const apiKeySection = document.getElementById('api-key-section') as HTMLDivElement;
const googleApiKeyInput = document.getElementById('google-api-key') as HTMLInputElement;
const saveApiKeyBtn = document.getElementById('save-api-key-btn') as HTMLButtonElement;
const apiKeyMessage = document.getElementById('api-key-message') as HTMLParagraphElement;

const userDetailsSection = document.getElementById('user-details-section') as HTMLDivElement;
const resumeFileInput = document.getElementById('resume-file') as HTMLInputElement;
const additionalDetailsTextarea = document.getElementById('additional-details') as HTMLTextAreaElement;
const saveUserDetailsBtn = document.getElementById('save-user-details-btn') as HTMLButtonElement;
const userDetailsMessage = document.getElementById('user-details-message') as HTMLParagraphElement;

const instructionDisplay = document.getElementById('instruction-display') as HTMLDivElement;

const markdownOutputSection = document.getElementById('markdown-output-section') as HTMLDivElement;
const markdownContent = document.getElementById('markdown-content') as HTMLDivElement;

const loadingSpinnerSection = document.getElementById('loading-spinner-section') as HTMLDivElement;
const loadingSpinnerTitle = document.getElementById('loading-spinner-title') as HTMLDivElement;

// New button elements
const tailorResumeBtn = document.getElementById('tailor-resume-btn') as HTMLButtonElement;
const generateCoverLetterBtn = document.getElementById('generate-cover-letter-btn') as HTMLButtonElement;

// Initialize the Showdown converter
const converter = new showdown.Converter();

// Set the workerSrc for pdf.js to use the local worker file.
pdfjs.GlobalWorkerOptions.workerSrc = "./pdf.worker.mjs";

// Global variable to store the VectorStoreIndex to avoid rebuilding it
let globalIndex: VectorStoreIndex | null = null;
let jobPostingText: string | null = null;

// Define interfaces for stored data
interface UserSettings {
    googleApiKey?: string;
    resumeFileName?: string;
    resumeFileContent?: string;
    additionalDetails?: string;
}

/**
 * Hides all main sections of the side panel.
 */
function hideAllSections(): void {
    apiKeySection.classList.add('hidden');
    userDetailsSection.classList.add('hidden');
    instructionDisplay.classList.add('hidden');
    markdownOutputSection.classList.add('hidden');
    loadingSpinnerSection.classList.add('hidden');
}

/**
 * Shows the API key input section.
 */
function showApiKeySection(): void {
    hideAllSections();
    apiKeySection.classList.remove('hidden');
    apiKeyMessage.textContent = '';
}

/**
 * Shows the user details input section.
 */
function showUserDetailsSection(): void {
    hideAllSections();
    userDetailsSection.classList.remove('hidden');
    userDetailsMessage.textContent = '';
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
 * Shows the loading spinner.
 */
function showLoadingSpinner(text: string = "Processing..."): void {
    hideAllSections();
    loadingSpinnerTitle.textContent = text;
    loadingSpinnerSection.classList.remove('hidden');
}

/**
 * Renders and shows the markdown output.
 * @param markdown The markdown string to render.
 */
function showMarkdownOutput(markdown: string): void {
    hideAllSections();
    markdownContent.innerHTML = converter.makeHtml(markdown);
    markdownOutputSection.classList.remove('hidden');
}

/**
 * Retries a promise with exponential backoff.
 * @param fn The function to retry.
 * @param retries The number of retries.
 * @param delay The initial delay in milliseconds.
 */
async function retryWithExponentialBackoff<T>(
    fn: () => Promise<T>,
    retries = 3,
    delay = 1000
): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (retries > 0) {
            await new Promise(res => setTimeout(res, delay));
            return retryWithExponentialBackoff(fn, retries - 1, delay * 2);
        } else {
            throw error;
        }
    }
}

/**
 * Extracts text from a PDF file.
 * @param file The PDF file to process.
 * @returns A promise that resolves with the extracted text.
 */
async function getPdfText(file: File): Promise<string> {
    const arrayBuffer = await new Response(file).arrayBuffer();
    const pdf = await pdfjs.getDocument({data: arrayBuffer}).promise;
    const numPages = pdf.numPages;
    let fullText = '';
    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item: any) => item.str).join(' ');
        fullText += text + ' ';
    }
    return fullText;
}


/**
 * Initializes the side panel by checking for the API key and showing the appropriate section.
 */
async function initializeSidePanel(): Promise<void> {
    try {
        const result: { userSettings?: UserSettings } = await chrome.storage.local.get(['userSettings']);
        const userSettings = result.userSettings || {};

        if (userSettings.googleApiKey) {
            if (userSettings.resumeFileName) {
                showInstructionDisplay();
            } else {
                showUserDetailsSection();
            }
        } else {
            showApiKeySection();
        }
    } catch (error) {
        console.error('Error initializing side panel:', error);
        apiKeyMessage.textContent = 'Error loading settings. Please try again.';
        showApiKeySection();
    }
}

// Event listener for saving the API key
saveApiKeyBtn.addEventListener('click', async () => {
    const apiKey = googleApiKeyInput.value.trim();
    if (apiKey) {
        try {
            const result: { userSettings?: UserSettings } = await chrome.storage.local.get(['userSettings']);
            const userSettings = result.userSettings || {};
            userSettings.googleApiKey = apiKey;

            await chrome.storage.local.set({userSettings});
            apiKeyMessage.textContent = 'API Key saved successfully!';
            apiKeyMessage.style.color = 'green';
            setTimeout(() => {
                showUserDetailsSection();
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

async function readOutputFormatFile(filePath: string): Promise<string> {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error("Failed to read output_format.txt:", error);
        return '';
    }
}

async function create_index_from_data(fileContent: string, additionalDetails: string) {
    // Create Documents from the resume and additional details
    const documents = [
        new Document({text: fileContent, id_: 'resume'}),
        new Document({text: additionalDetails, id_: 'additional_details'}),
    ];

    // Build a VectorStoreIndex from the documents
    return await VectorStoreIndex.fromDocuments(documents);
}

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

            Settings.llm = llamaindexGoogle.gemini({
                apiKey: googleApiKey,
                model: llamaindexGoogle.GEMINI_MODEL.GEMINI_2_0_FLASH,
            });
            Settings.embedModel = new llamaindexGoogle.GeminiEmbedding({
                apiKey: googleApiKey,
            });

            if (file) {
                let fileContent = '';
                // Check file type and process accordingly
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
                    userDetailsMessage.textContent = 'Unsupported file type. Please upload a PDF or TXT file.';
                    userDetailsMessage.style.color = 'red';
                    return;
                }

                globalIndex = await create_index_from_data(fileContent, additionalDetails);

                userSettings.resumeFileName = file.name;
                userSettings.resumeFileContent = fileContent;
                userSettings.additionalDetails = additionalDetails;

                await chrome.storage.local.set({userSettings});
                userDetailsMessage.textContent = 'Details and file vectorized successfully!';
                userDetailsMessage.style.color = 'green';
                setTimeout(() => {
                    showInstructionDisplay();
                }, 500);
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

saveUserDetailsBtn.addEventListener('click', saveUserDetailsListener());

// Listener for messages from the service worker (e.g., selected text)
chrome.runtime.onMessage.addListener((message: {
    type: string;
    text?: string
}, sender: chrome.runtime.MessageSender, sendResponse: (response?: boolean) => void) => {
    if (message.type === 'selected-text' && message.text) {
        showLoadingSpinner("Analyzing job posting...");

        chrome.storage.local.get(['userSettings'])
            .then(async (result: { userSettings?: UserSettings }) => {
                const userSettings = result.userSettings || {};
                const {googleApiKey, resumeFileContent} = userSettings;
                jobPostingText = message.text || '';

                if (!googleApiKey || !resumeFileContent) {
                    showApiKeySection();
                    apiKeyMessage.textContent = 'Please provide your API key and upload a resume to proceed.';
                    apiKeyMessage.style.color = 'red';
                    return false;
                }

                // If the index doesn't exist, create it from stored data
                if (!globalIndex) {
                    console.log("Global index not available for some reason")
                    Settings.llm = llamaindexGoogle.gemini({
                        apiKey: googleApiKey,
                        model: llamaindexGoogle.GEMINI_MODEL.GEMINI_2_5_FLASH_PREVIEW,
                    });
                    Settings.embedModel = new llamaindexGoogle.GeminiEmbedding({
                        apiKey: googleApiKey,
                    });

                    globalIndex = await create_index_from_data(resumeFileContent, userSettings.additionalDetails);
                }

                // Create a query engine from the index
                const queryEngine = globalIndex.asQueryEngine();

                // TODO: Figure out a way to index the output format as well
                const prompt = `
                    You are a professional career assistant. Your task is to analyze a job description against the provided context (resume, additional details and output format).

                    **Job Description:**
                    ${jobPostingText}

                    Analyze the job description and provide a professional, structured analysis in Markdown format as follows:
                    
                    ### Overall Fit
                    Provides a concise summary of how well the user's profile fits the job description. Start it by giving a very visible "score" which should be one of: very poor fit, poor fit, moderate fit, good fit, very good fit, questionable fit. The questionable fit should be used only when there isn't enough information. Note that missing core skills for a job shouldn't be able to lead to more than a poor fit. Similar logic should apply for details like salary, location, industry etc, if the user has specified them of course. For the score - insert an HTML block like this: <span style="color:red">*red* fit score</span>. and color the score from red to green so that it's very obvious to the user.
                    
                    ### Strengths
                    Lists the key skills, experiences, and qualifications from the context that match the job posting.
                    
                    ### Areas for Improvement
                    Identifies any potential gaps or areas where the user's profile does not align with the job description. Mention specific skills, keywords, or experience levels.
                    
                    ### Actionable Advice
                    Provides clear, actionable advice on how the user could tailor their resume or cover letter to better highlight their fit for this specific job.
                    
                    If the provided "Job Description" text is not a job description, return a simple markdown message that says: "### Not a Job Description Found
                     The selected text does not appear to be a job description. Please select a job description and try again."
                    
                    Note that the job description might not be in English and shouldn't be dismissed in that case!
                `;

                try {
                    // Use the query engine to get a response from the model
                    const response = await queryEngine.query({query: prompt});

                    showMarkdownOutput(response.response);

                } catch (error) {
                    console.error('Error during LlamaIndex query:', error);
                    const errorMessage = `### Analysis Failed
An error occurred while analyzing the job posting. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
                    showMarkdownOutput(errorMessage);

                }

                return false;
            })
            .catch(error => {
                console.error('Error processing selected text:', error);
                const errorMessage = `### Analysis Failed
An error occurred while analyzing the job posting. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
                showMarkdownOutput(errorMessage);
                tailorResumeBtn.hidden = true;
                generateCoverLetterBtn.hidden = true;
                return false;
            });

        return true;
    }
    return false;
});

// Event listeners for the new buttons
tailorResumeBtn.addEventListener('click', () => {
    console.log('Tailor Resume button clicked!');
});

generateCoverLetterBtn.addEventListener('click', () => {
    console.log('Generate Cover Letter button clicked!!');
    showLoadingSpinner("Generating a Cover Letter");

    chrome.storage.local.get(['userSettings'])
        .then(async (result: { userSettings?: UserSettings }) => {
            const userSettings = result.userSettings || {};
            const {googleApiKey, resumeFileContent} = userSettings;

            if (!googleApiKey || !resumeFileContent) {
                showApiKeySection();
                apiKeyMessage.textContent = 'Please provide your API key and upload a resume to proceed.';
                apiKeyMessage.style.color = 'red';
                return false;
            }

            // If the index doesn't exist, create it from stored data
            if (!globalIndex) {
                console.log("Global index not available for some reason")
                Settings.llm = llamaindexGoogle.gemini({
                    apiKey: googleApiKey,
                    model: llamaindexGoogle.GEMINI_MODEL.GEMINI_2_5_FLASH_PREVIEW,
                });
                Settings.embedModel = new llamaindexGoogle.GeminiEmbedding({
                    apiKey: googleApiKey,
                });

                globalIndex = await create_index_from_data(resumeFileContent, userSettings.additionalDetails);
            }

            // todo: add error handling to company name fetching

            const llm = llamaindexGoogle.gemini({
                apiKey: googleApiKey,
                model: llamaindexGoogle.GEMINI_MODEL.GEMINI_2_5_FLASH_PREVIEW,
            });

            let prompt = `
            Based on this job description:
                ${jobPostingText}
            
            what is the name of the company? Return just the name and nothing else
            `

            let companyName = (await llm.complete({prompt: prompt})).text

            console.log(companyName)

            // Create a query engine from the index
            const queryEngine = globalIndex.asQueryEngine();

            prompt = `
                You are a professional career assistant. Your task is to generate a cover letter that will 
                help the user apply for the job based on the job description, the users resume and their 
                additional details provided. 

                **Company Name:**
                ${companyName}

                **Job Description:**
                ${jobPostingText}

                Some general guidelines: make it at most 3-4 paragraphs long, address their strengths and in 
                case that there are any missing skills, address those head on based on the users other skills 
                (ie stuff like quick learning, hard-working, commitment to excellence etc). Make sure to 
                reference the details from the job post as much as possible. The start of the output should be 
                a line in the format:
                // [users_name_and_last_name]_cover_letter_{company_name}.txt
                
                Note that the job description might not be in English and shouldn't be dismissed in that case!
            `;

            try {
                // Use the query engine to get a response from the model
                const response = await queryEngine.query({query: prompt});

                showMarkdownOutput(response.response);
                tailorResumeBtn.hidden = true;
                generateCoverLetterBtn.hidden = true;

            } catch (error) {
                console.error('Error during LlamaIndex query:', error);
                const errorMessage = `### Cover letter generation Failed
An error occurred while generating cover letter. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
                showMarkdownOutput(errorMessage);
                tailorResumeBtn.hidden = true;
                generateCoverLetterBtn.hidden = true;
            }

            return false;
        })
        .catch(error => {
            console.error('Error generating cover letter:', error);
            const errorMessage = `### Cover letter generation Failed
An error occurred while generating cover letter. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
            showMarkdownOutput(errorMessage);
            tailorResumeBtn.hidden = true;
            generateCoverLetterBtn.hidden = true;
            return false;
        });

    return true;
});

// Initialize the side panel when the script loads
initializeSidePanel();

// Inform the service worker that the side panel is ready
chrome.runtime.sendMessage({type: 'side-panel-ready'}).catch(error => console.log('Error sending side-panel-ready message:', error));
