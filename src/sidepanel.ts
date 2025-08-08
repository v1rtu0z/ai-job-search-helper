// Get references to HTML elements
import * as llamaindexGoogle from "@llamaindex/google";
import {Document, Settings, VectorStoreIndex} from "llamaindex";
import * as pdfjs from "./pdf.mjs";

const apiKeySection = document.getElementById('api-key-section') as HTMLDivElement;
const googleApiKeyInput = document.getElementById('google-api-key') as HTMLInputElement;
const apiKeyMessage = document.getElementById('api-key-message') as HTMLParagraphElement;

const userDetailsSection = document.getElementById('user-details-section') as HTMLDivElement;
const resumeFileInput = document.getElementById('resume-file') as HTMLInputElement;
const resumeFileNameDiv = document.getElementById('resume-file-name') as HTMLDivElement;
const additionalDetailsTextarea = document.getElementById('additional-details') as HTMLTextAreaElement;
const userDetailsMessage = document.getElementById('user-details-message') as HTMLParagraphElement;

const instructionDisplay = document.getElementById('instruction-display') as HTMLDivElement;

const markdownOutputSection = document.getElementById('markdown-output-section') as HTMLDivElement;
const markdownContent = document.getElementById('markdown-content') as HTMLDivElement;

const loadingSpinnerSection = document.getElementById('loading-spinner-section') as HTMLDivElement;
const loadingSpinnerTitle = document.getElementById('loading-spinner-title') as HTMLDivElement;

const settingsView = document.getElementById('settings-view') as HTMLDivElement;

const tailorResumeBtn = document.getElementById('tailor-resume-btn') as HTMLButtonElement;
const generateCoverLetterBtn = document.getElementById('generate-cover-letter-btn') as HTMLButtonElement;
const downloadCoverLetterBtn = document.getElementById('download-cover-letter-btn') as HTMLButtonElement;
const saveAllSettingsBtn = document.getElementById('save-all-settings-btn') as HTMLButtonElement;

const backBtn = document.getElementById('back-btn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
const retryBtn = document.getElementById('retry-btn') as HTMLButtonElement;

let lastAnalysisMarkdown: string | null = null;
let lastCoverLetterOutput: { filename: string, content: string, jobPostingText: string } | null = null;
let jobPostingText: string | null = null;
let lastAction: 'analyze' | 'cover-letter' | null = null;
let lastPrompt: string | null = null;

let currentState: 'instructions' | 'analysis' | 'cover-letter' | 'settings' | 'loading' = 'instructions';
let lastView: 'analysis' | 'cover-letter' | 'instructions' | 'settings' | null = null; // Added 'settings' to lastView

const converter = new showdown.Converter();

pdfjs.GlobalWorkerOptions.workerSrc = "./pdf.worker.mjs";

let globalIndex: VectorStoreIndex | null = null;
let abortController: AbortController | null = null;

interface UserSettings {
    googleApiKey?: string;
    resumeFileName?: string;
    resumeFileContent?: string;
    additionalDetails?: string;
}

function hideAllSections(): void {
    apiKeySection.classList.add('hidden');
    userDetailsSection.classList.add('hidden');
    instructionDisplay.classList.add('hidden');
    markdownOutputSection.classList.add('hidden');
    loadingSpinnerSection.classList.add('hidden');
    settingsView.classList.add('hidden');
    backBtn.classList.add('hidden');
    tailorResumeBtn.classList.add('hidden');
    generateCoverLetterBtn.classList.add('hidden');
    downloadCoverLetterBtn.classList.add('hidden');
    retryBtn.classList.add('hidden');
}

function showInstructionDisplay(): void {
    hideAllSections();
    instructionDisplay.classList.remove('hidden');
    if (currentState !== 'loading' && lastView !== currentState) {
        lastView = currentState;
    }
    currentState = 'instructions';
    settingsBtn.classList.remove('hidden');
    backBtn.classList.add('hidden');
}

function showLoadingSpinner(text: string = "Processing..."): void {
    hideAllSections();
    loadingSpinnerTitle.textContent = text;
    loadingSpinnerSection.classList.remove('hidden');
    if (currentState !== 'loading' && lastView !== currentState) {
        lastView = currentState;
    }
    currentState = 'loading';
    backBtn.classList.remove('hidden');
    settingsBtn.classList.add('hidden');
}

async function showSettingsView(): Promise<void> {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    hideAllSections();
    settingsView.classList.remove('hidden');
    apiKeySection.classList.remove('hidden');
    userDetailsSection.classList.remove('hidden');

    const result: { userSettings?: UserSettings } = await chrome.storage.local.get(['userSettings']);
    const userSettings = result.userSettings || {};

    googleApiKeyInput.value = userSettings.googleApiKey || '';
    additionalDetailsTextarea.value = userSettings.additionalDetails || '';
    resumeFileNameDiv.textContent = userSettings.resumeFileName ? `Current resume: ${userSettings.resumeFileName}` : 'No resume uploaded yet.';
    resumeFileInput.value = '';
    apiKeyMessage.textContent = '';
    userDetailsMessage.textContent = '';

    if (currentState !== 'loading' && lastView !== currentState) {
        lastView = currentState;
    }
    currentState = 'settings';
    settingsBtn.classList.add('hidden');
    if (userSettings.googleApiKey && userSettings.resumeFileName) {
        backBtn.classList.remove('hidden');
    }
}

function showMarkdownOutput(markdown: string): void {
    if (abortController) {
        abortController = null;
    }
    hideAllSections();
    markdownContent.innerHTML = converter.makeHtml(markdown);
    markdownOutputSection.classList.remove('hidden');
    tailorResumeBtn.classList.remove('hidden');
    generateCoverLetterBtn.classList.remove('hidden');
    if (lastAction === 'analyze') {
        retryBtn.classList.remove('hidden');
    }
    lastAnalysisMarkdown = markdown;
    if (currentState !== 'loading' && lastView !== currentState) {
        lastView = currentState;
    }
    currentState = 'analysis';
    backBtn.classList.remove('hidden');
    settingsBtn.classList.remove('hidden');
}

function showErrorOutput(message: string, action: 'analyze' | 'cover-letter'): void {
    if (abortController) {
        abortController = null;
    }
    hideAllSections();
    markdownContent.innerHTML = converter.makeHtml(message);
    markdownOutputSection.classList.remove('hidden');
    retryBtn.classList.remove('hidden'); // This is already in your code, but I'm keeping it for clarity on the change.
    lastAction = action;
    if (currentState !== 'loading' && lastView !== currentState) {
        lastView = currentState;
    }
    currentState = 'analysis';
    backBtn.classList.remove('hidden');
    settingsBtn.classList.remove('hidden');
}

function wrapText(text: string, lineLength: number): string {
    const words = text.split(' ');
    let lines = [];
    let currentLine = '';
    for (const word of words) {
        if (currentLine.length + word.length + 1 > lineLength) {
            lines.push(currentLine.trim());
            currentLine = word + ' ';
        } else {
            currentLine += word + ' ';
        }
    }
    lines.push(currentLine.trim());
    return lines.join('\n');
}

function showCoverLetterOutput(filename: string, content: string): void {
    if (abortController) {
        abortController = null;
    }
    hideAllSections();
    const wrappedContent = wrapText(content, 85);
    markdownContent.innerHTML = converter.makeHtml(`\`\`\`\n${wrappedContent}\n\`\`\``);
    markdownOutputSection.classList.remove('hidden');
    downloadCoverLetterBtn.classList.remove('hidden');
    downloadCoverLetterBtn.textContent = `Download as ${filename}`;
    backBtn.classList.remove('hidden');
    settingsBtn.classList.remove('hidden');
    tailorResumeBtn.classList.remove('hidden');
    // We now show the retry button when showing the cover letter output.
    if (lastAction === 'cover-letter') {
        retryBtn.classList.remove('hidden');
    }
    lastCoverLetterOutput = {filename, content, jobPostingText: jobPostingText!};
    if (currentState !== 'loading' && lastView !== currentState) {
        lastView = currentState;
    }
    currentState = 'cover-letter';
    downloadCoverLetterBtn.onclick = () => {
        const blob = new Blob([wrappedContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
}

function handleBackButtonClick(): void {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }

    switch (lastView) {
        case 'cover-letter':
            if (lastCoverLetterOutput) {
                showCoverLetterOutput(lastCoverLetterOutput.filename, lastCoverLetterOutput.content);
            } else {
                showInstructionDisplay();
            }
            break;
        case 'analysis':
            if (lastAnalysisMarkdown) {
                showMarkdownOutput(lastAnalysisMarkdown);
            } else {
                showInstructionDisplay();
            }
            break;
        case 'instructions':
            showInstructionDisplay();
            break;
        case 'settings':
            showSettingsView();
            break;
        default:
            showInstructionDisplay();
            break;
    }
}

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

async function initializeSidePanel(): Promise<void> {
    try {
        const result: { userSettings?: UserSettings } = await chrome.storage.local.get(['userSettings']);
        const userSettings = result.userSettings || {};
        if (userSettings.googleApiKey && userSettings.resumeFileName) {
            showInstructionDisplay();
        } else {
            showSettingsView();
        }
    } catch (error) {
        console.error('Error initializing side panel:', error);
        apiKeyMessage.textContent = 'Error loading settings. Please try again.';
        showSettingsView();
    }
}

async function create_index_from_data(fileContent: string, additionalDetails: string): Promise<VectorStoreIndex> {
    const documents = [
        new Document({text: fileContent, id_: 'resume'}),
        new Document({text: additionalDetails, id_: 'additional_details'}),
    ];
    return await VectorStoreIndex.fromDocuments(documents);
}

saveAllSettingsBtn.addEventListener('click', async () => {
    const apiKey = googleApiKeyInput.value.trim();
    const file = resumeFileInput.files && resumeFileInput.files.length > 0 ? resumeFileInput.files[0] : null;
    const additionalDetails = additionalDetailsTextarea.value.trim();

    try {
        apiKeyMessage.textContent = '';
        userDetailsMessage.textContent = '';

        const result: { userSettings?: UserSettings } = await chrome.storage.local.get(['userSettings']);
        const userSettings = result.userSettings || {};
        const oldFileContent = userSettings.resumeFileContent;
        const oldAdditionalDetails = userSettings.additionalDetails;

        if (!apiKey) {
            apiKeyMessage.textContent = 'API Key cannot be empty.';
            apiKeyMessage.style.color = 'red';
            return;
        }

        userSettings.googleApiKey = apiKey;

        let newResumeUploaded = false;
        if (file) {
            newResumeUploaded = true;
            userDetailsMessage.textContent = 'Saving and vectorizing resume...';
            userDetailsMessage.style.color = 'blue';

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
                userDetailsMessage.textContent = 'Unsupported file type. Please upload a PDF or TXT file.';
                userDetailsMessage.style.color = 'red';
                return;
            }

            userSettings.resumeFileName = file.name;
            userSettings.resumeFileContent = fileContent;
        } else if (!userSettings.resumeFileName) {
            userDetailsMessage.textContent = 'A resume file is mandatory.';
            userDetailsMessage.style.color = 'red';
            return;
        }

        userSettings.additionalDetails = additionalDetails;

        await chrome.storage.local.set({userSettings});

        if (newResumeUploaded || (oldFileContent !== userSettings.resumeFileContent) || (oldAdditionalDetails !== userSettings.additionalDetails)) {
            Settings.llm = llamaindexGoogle.gemini({
                apiKey: apiKey,
                model: llamaindexGoogle.GEMINI_MODEL.GEMINI_2_5_FLASH_PREVIEW,
            });
            Settings.embedModel = new llamaindexGoogle.GeminiEmbedding({
                apiKey: apiKey,
            });
            globalIndex = await create_index_from_data(userSettings.resumeFileContent!, userSettings.additionalDetails || '');
        }

        userDetailsMessage.textContent = 'All data saved successfully!';
        userDetailsMessage.style.color = 'green';

        setTimeout(() => {
            handleBackButtonClick(); // This will navigate to the correct last view
            apiKeyMessage.textContent = '';
            userDetailsMessage.textContent = '';
        }, 1000);

    } catch (error) {
        console.error('Error saving all settings:', error);
        userDetailsMessage.textContent = 'Failed to save settings. Please try again.';
        userDetailsMessage.style.color = 'red';
    }
});

async function analyzeJobPosting(text: string): Promise<boolean> {
    showLoadingSpinner("Analyzing job posting...");
    if (abortController) {
        abortController.abort();
    }
    abortController = new AbortController();
    const signal = abortController.signal;

    try {
        const result: { userSettings?: UserSettings } = await chrome.storage.local.get(['userSettings']);
        const userSettings = result.userSettings || {};
        const {googleApiKey, resumeFileContent} = userSettings;
        jobPostingText = text;

        if (signal.aborted) return false;

        if (!googleApiKey || !resumeFileContent) {
            showSettingsView();
            apiKeyMessage.textContent = 'Please provide your API key and upload a resume to proceed.';
            apiKeyMessage.style.color = 'red';
            return false;
        }

        if (signal.aborted) return false;

        if (!globalIndex) {
            Settings.llm = llamaindexGoogle.gemini({
                apiKey: googleApiKey,
                model: llamaindexGoogle.GEMINI_MODEL.GEMINI_2_5_FLASH_PREVIEW,
            });
            Settings.embedModel = new llamaindexGoogle.GeminiEmbedding({
                apiKey: googleApiKey,
            });
            globalIndex = await create_index_from_data(resumeFileContent, userSettings.additionalDetails || '');
        }

        if (signal.aborted) return false;

        const queryEngine = globalIndex.asQueryEngine();
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
        lastPrompt = prompt;

        const chunks: string[] = [];
        try {
            const response = await queryEngine.query({query: prompt, stream: true});
            for await (const chunk of response) {
                if (signal.aborted) {
                    console.log('Analysis was aborted during streaming.');
                    return false;
                }
                chunks.push(chunk.response);
            }
            if (signal.aborted) {
                console.log('Analysis was aborted after streaming completed.');
                return false;
            }
            showMarkdownOutput(chunks.join(""));
            lastAction = 'analyze';
            retryBtn.classList.remove('hidden');
        } catch (error: any) {
            console.error('Error during LlamaIndex query:', error);
            if (signal.aborted) {
                return false;
            }
            const errorMessage = `### Analysis Failed
An error occurred while analyzing the job posting. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
            showErrorOutput(errorMessage, 'analyze');
        }
    } catch (error) {
        console.error('Error processing selected text:', error);
        if (abortController?.signal.aborted) {
            return false;
        }
        const errorMessage = `### Analysis Failed
An error occurred while analyzing the job posting. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
        showErrorOutput(errorMessage, 'analyze');
    }
    return true;
}

async function generateCoverLetter(retry = false): Promise<boolean> {
    if (!retry && lastCoverLetterOutput && lastCoverLetterOutput.jobPostingText === jobPostingText) {
        console.log("Serving cached cover letter.");
        showCoverLetterOutput(lastCoverLetterOutput.filename, lastCoverLetterOutput.content);
        return true;
    }

    showLoadingSpinner("Generating a Cover Letter");
    if (abortController) {
        abortController.abort();
    }
    abortController = new AbortController();
    const signal = abortController.signal;

    try {
        const result: { userSettings?: UserSettings } = await chrome.storage.local.get(['userSettings']);
        const userSettings = result.userSettings || {};
        const {googleApiKey, resumeFileContent} = userSettings;

        if (signal.aborted) return false;

        if (!googleApiKey || !resumeFileContent || !jobPostingText) {
            showSettingsView();
            apiKeyMessage.textContent = 'Please provide your API key, upload a resume and select a job description to proceed.';
            apiKeyMessage.style.color = 'red';
            return false;
        }

        if (signal.aborted) return false;

        if (!globalIndex) {
            Settings.llm = llamaindexGoogle.gemini({
                apiKey: googleApiKey,
                model: llamaindexGoogle.GEMINI_MODEL.GEMINI_2_5_FLASH_PREVIEW,
            });
            Settings.embedModel = new llamaindexGoogle.GeminiEmbedding({
                apiKey: googleApiKey,
            });
            globalIndex = await create_index_from_data(resumeFileContent, userSettings.additionalDetails || '');
        }

        if (signal.aborted) return false;

        const llm = llamaindexGoogle.gemini({
            apiKey: googleApiKey,
            model: llamaindexGoogle.GEMINI_MODEL.GEMINI_2_5_FLASH_PREVIEW,
        });

        let companyNamePrompt = `Based on this job description: ${jobPostingText} what is the name of the company? Return just the name and nothing else`;
        let companyName = (await llm.complete({prompt: companyNamePrompt})).text;

        if (signal.aborted) return false;

        const queryEngine = globalIndex.asQueryEngine();
        const prompt = `
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
            Always write the cover letter in the same language as the job description.
        `;
        lastPrompt = prompt;

        try {
            const chunks: string[] = [];
            const response = await queryEngine.query({query: prompt, stream: true});
            for await (const chunk of response) {
                if (signal.aborted) {
                    console.log('Cover letter generation was aborted during streaming.');
                    return false;
                }
                chunks.push(chunk.response);
            }
            const responseText = chunks.join("");

            if (signal.aborted) {
                console.log('Cover letter generation was aborted after streaming completed.');
                return false;
            }

            const filenameMatch = responseText.match(/\/\/ (.*?)\n/);
            if (filenameMatch && filenameMatch[1]) {
                const filename = filenameMatch[1].trim();
                const coverLetterContent = responseText.replace(filenameMatch[0], '').trim();
                showCoverLetterOutput(filename, coverLetterContent);
                lastAction = 'cover-letter';
                retryBtn.classList.remove('hidden');
            } else {
                showMarkdownOutput(responseText);
                lastAction = 'cover-letter';
                retryBtn.classList.remove('hidden');
            }
        } catch (error: any) {
            console.error('Error during LlamaIndex query:', error);
            if (signal.aborted) {
                return false;
            }
            const errorMessage = `### Cover letter generation Failed
An error occurred while generating cover letter. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
            showErrorOutput(errorMessage, 'cover-letter');
        }
    } catch (error: any) {
        console.error('Error generating cover letter:', error);
        if (abortController?.signal.aborted) {
            return false;
        }
        const errorMessage = `### Cover letter generation Failed
An error occurred while generating cover letter. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
        showErrorOutput(errorMessage, 'cover-letter');
    }
    return true;
}

// fixme: retry not showing on job analysis, back not going back correctly after retry
function retryLastAction(): boolean {
    if (!lastAction || !lastPrompt) {
        console.error("No last action to retry.");
        return false;
    }
    if (lastAction === 'analyze') {
        analyzeJobPosting(jobPostingText!);
    } else if (lastAction === 'cover-letter') {
        generateCoverLetter(true);
    }
    return true;
}

chrome.runtime.onMessage.addListener((message: {
    type: string;
    text?: string
}, sender: chrome.runtime.MessageSender, sendResponse: (response?: boolean) => void) => {
    if (message.type === 'selected-text' && message.text) {
        analyzeJobPosting(message.text);
        return true;
    }
    return false;
});

tailorResumeBtn.addEventListener('click', () => {
    console.log('Tailor Resume button clicked!');
});

generateCoverLetterBtn.addEventListener('click', () => {
    generateCoverLetter();
});

backBtn.addEventListener('click', handleBackButtonClick);
settingsBtn.addEventListener('click', showSettingsView);
retryBtn.addEventListener('click', retryLastAction);

initializeSidePanel();
chrome.runtime.sendMessage({type: 'side-panel-ready'}).catch(error => console.log('Error sending side-panel-ready message:', error));
