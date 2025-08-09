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
const instructionContent = document.getElementById('instruction-content') as HTMLDivElement;

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

type JobAnalysisCache = {
    'Analysis': string | null;
    'CoverLetter': { filename: string, content: string } | null;
};

// note: cache miss fail happen when the selected text is not the same. On LinkedIn for example, if one selects
// everything from the company logo to the end of the job end, different stuff gets selected depending on if
// they select from top to the bottom or from the bottom to the top.
let jobPostingCache: Record<string, JobAnalysisCache> = {};
let latestJobPostingText: string | null = null

let currentState: 'instructions' | 'analysis' | 'cover-letter' = 'instructions';
const stateHistory: Array<'instructions' | 'analysis' | 'cover-letter'> = [];
let cachedSearchQuery: string | null = null;

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

function updateState(newState: 'instructions' | 'analysis' | 'cover-letter', isBackNavigation: boolean = false): void {
    if (currentState !== newState) {
        if (!isBackNavigation) {
            stateHistory.push(currentState);
        }
        currentState = newState;
        console.log(`State changed to: ${currentState}, History:`, stateHistory);
    }
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

function showInstructionDisplay(isBackNavigation: boolean = false): void {
    hideAllSections();
    instructionDisplay.classList.remove('hidden');
    instructionContent.innerHTML = '';
    updateState('instructions', isBackNavigation);
    settingsBtn.classList.remove('hidden');
    backBtn.classList.add('hidden');
    generateSearchQuery();
}

function showLoadingSpinner(text: string = "Processing...", isBackNavigation: boolean = false): void {
    hideAllSections();
    loadingSpinnerTitle.textContent = text;
    loadingSpinnerSection.classList.remove('hidden');
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

    settingsBtn.classList.add('hidden');
    backBtn.classList.remove('hidden');
}

async function retryLastAction(jobPostingText: string) {
    if (currentState === 'analysis' && jobPostingText) {
        analyzeJobPosting(jobPostingText, true);
    } else if (currentState === 'cover-letter' && jobPostingText) {
        generateCoverLetter(jobPostingText, true);
    }
}

function showMarkdown(markdown: string, jobPostingText: string, isBackNavigation: boolean = false): void {
    if (abortController) {
        abortController = null;
    }
    hideAllSections();
    markdownContent.innerHTML = converter.makeHtml(markdown);
    markdownOutputSection.classList.remove('hidden');
    tailorResumeBtn.classList.remove('hidden');
    generateCoverLetterBtn.classList.remove('hidden');

    retryBtn.classList.remove('hidden');

    if (!jobPostingCache[jobPostingText]) {
        jobPostingCache[jobPostingText] = { Analysis: null, CoverLetter: null };
    }
    jobPostingCache[jobPostingText].Analysis = markdown;

    updateState('analysis', isBackNavigation);
    backBtn.classList.remove('hidden');
    settingsBtn.classList.remove('hidden');

    generateCoverLetterBtn.addEventListener('click', () => {
        generateCoverLetter(jobPostingText);
    });

    retryBtn.addEventListener('click', () => {
        retryLastAction(jobPostingText);
    });
}

function showErrorOutput(message: string, isBackNavigation: boolean = false): void {
    if (abortController) {
        abortController = null;
    }
    hideAllSections();
    markdownContent.innerHTML = converter.makeHtml(message);
    markdownOutputSection.classList.remove('hidden');
    retryBtn.classList.remove('hidden');
    updateState('analysis', isBackNavigation);
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

function showCoverLetterOutput(filename: string, content: string, jobPostingText: string, isBackNavigation: boolean = false): void {
    // FIXME: Output looks lame, it should be polished and made editable by the user
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
    retryBtn.classList.remove('hidden');

    retryBtn.addEventListener('click', () => {
        retryLastAction(jobPostingText);
    });

    if (!jobPostingCache[jobPostingText]) {
        jobPostingCache[jobPostingText] = { Analysis: null, CoverLetter: null };
    }
    jobPostingCache[jobPostingText].CoverLetter = { filename, content };

    updateState('cover-letter', isBackNavigation);
    downloadCoverLetterBtn.onclick = () => {
        const blob = new Blob([wrappedContent], {type: 'text/plain'});
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

    let previousState: "instructions" | "analysis" | "cover-letter";
    if (settingsView.classList.contains('hidden')) {
        previousState = stateHistory.pop();
    } else {
        previousState = currentState;
    }

    console.log(`Back button clicked. Previous state: ${previousState}, New history:`, stateHistory);

    switch (previousState) {
        case 'analysis':
            if (latestJobPostingText && jobPostingCache[latestJobPostingText]?.Analysis) {
                showMarkdown(jobPostingCache[latestJobPostingText].Analysis!, latestJobPostingText, true);
            } else {
                showInstructionDisplay(true);
            }
            break;
        case 'cover-letter':
            if (latestJobPostingText && jobPostingCache[latestJobPostingText]?.CoverLetter) {
                const {filename, content} = jobPostingCache[latestJobPostingText].CoverLetter!;
                showCoverLetterOutput(filename, content, latestJobPostingText, true);
            } else {
                showInstructionDisplay(true);
            }
            break;
        case 'instructions':
        default:
            showInstructionDisplay(true);
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

async function generateSearchQuery(forceRegenerate: boolean = false): Promise<void> {
    if (!forceRegenerate && cachedSearchQuery) {
        instructionContent.innerHTML = `
            <div class="search-query-header">
                <h3>Your Personalized Search Query</h3>
                <button id="refresh-query-btn" class="icon-button" style="right: 3%;">
                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="256" height="256" viewBox="0 0 256 256" xml:space="preserve">
<g style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: none; fill-rule: nonzero; opacity: 1;" transform="translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)">
	<path d="M 81.521 31.109 c -0.86 -1.73 -2.959 -2.438 -4.692 -1.575 c -1.73 0.86 -2.436 2.961 -1.575 4.692 c 2.329 4.685 3.51 9.734 3.51 15.01 C 78.764 67.854 63.617 83 45 83 S 11.236 67.854 11.236 49.236 c 0 -16.222 11.501 -29.805 26.776 -33.033 l -3.129 4.739 c -1.065 1.613 -0.62 3.784 0.992 4.85 c 0.594 0.392 1.264 0.579 1.926 0.579 c 1.136 0 2.251 -0.553 2.924 -1.571 l 7.176 -10.87 c 0.001 -0.001 0.001 -0.002 0.002 -0.003 l 0.018 -0.027 c 0.063 -0.096 0.106 -0.199 0.159 -0.299 c 0.049 -0.093 0.108 -0.181 0.149 -0.279 c 0.087 -0.207 0.152 -0.419 0.197 -0.634 c 0.009 -0.041 0.008 -0.085 0.015 -0.126 c 0.031 -0.182 0.053 -0.364 0.055 -0.547 c 0 -0.014 0.004 -0.028 0.004 -0.042 c 0 -0.066 -0.016 -0.128 -0.019 -0.193 c -0.008 -0.145 -0.018 -0.288 -0.043 -0.431 c -0.018 -0.097 -0.045 -0.189 -0.071 -0.283 c -0.032 -0.118 -0.065 -0.236 -0.109 -0.35 c -0.037 -0.095 -0.081 -0.185 -0.125 -0.276 c -0.052 -0.107 -0.107 -0.211 -0.17 -0.313 c -0.054 -0.087 -0.114 -0.168 -0.175 -0.25 c -0.07 -0.093 -0.143 -0.183 -0.223 -0.27 c -0.074 -0.08 -0.153 -0.155 -0.234 -0.228 c -0.047 -0.042 -0.085 -0.092 -0.135 -0.132 L 36.679 0.775 c -1.503 -1.213 -3.708 -0.977 -4.921 0.53 c -1.213 1.505 -0.976 3.709 0.53 4.921 l 3.972 3.2 C 17.97 13.438 4.236 29.759 4.236 49.236 C 4.236 71.714 22.522 90 45 90 s 40.764 -18.286 40.764 -40.764 C 85.764 42.87 84.337 36.772 81.521 31.109 z" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: rgb(0,0,0); fill-rule: nonzero; opacity: 1;" transform=" matrix(1 0 0 1 0 0) " stroke-linecap="round"/>
</g>
</svg>
                </button>
            </div>
            <p>Here's a personalized LinkedIn search query, copy and paste it into the LinkedIn job search bar to get you started:</p>
            <pre><code>${cachedSearchQuery}</code></pre>
            <p><strong>Tip:</strong> Extending the query with more specific terms will yield better results!</p>
        `;
        document.getElementById('refresh-query-btn')?.addEventListener('click', () => generateSearchQuery(true));
        return;
    }

    instructionContent.innerHTML = `
        <br>
        <h3>Generating a Search Query...</h3>
        <div class="loading-spinner"></div>
    `;

    try {
        const result: { userSettings?: UserSettings } = await chrome.storage.local.get(['userSettings']);
        const userSettings = result.userSettings || {};
        const {googleApiKey, resumeFileContent, additionalDetails} = userSettings;

        if (!googleApiKey || !resumeFileContent) {
            instructionContent.innerHTML = '<h3>Personalized Query</h3><p>Please go to settings to provide your API key and upload your resume to get a personalized LinkedIn search query.</p>';
            return;
        }

        const llm = llamaindexGoogle.gemini({
            apiKey: googleApiKey,
            model: llamaindexGoogle.GEMINI_MODEL.GEMINI_2_5_FLASH_PREVIEW,
        });

        const prompt = `
            Based on the following user data (resume and additional details), generate a personalized LinkedIn search query. The query should use Boolean search operators and be in the format: ("job title 1" OR "job title 2") AND NOT ("skill 1" OR "skill 2"). The query should be designed to help the user start their job search. Return only the search query string and nothing else.

            User data:
            Resume: ${resumeFileContent}
            Additional Details: ${additionalDetails}
        `;

        const response = await llm.complete({prompt: prompt});
        cachedSearchQuery = response.text.trim();

        instructionContent.innerHTML = `
            <div class="search-query-header">
                <h3>Your Personalized Search Query</h3>
                <button id="refresh-query-btn" class="icon-button" style="right: 3%;">
                    <svg xmlns="http://www.w3.org/2000/svg"  version="1.1" width="256" height="256" viewBox="0 0 256 256" xml:space="preserve">
<g style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: none; fill-rule: nonzero; opacity: 1;" transform="translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)">
	<path d="M 81.521 31.109 c -0.86 -1.73 -2.959 -2.438 -4.692 -1.575 c -1.73 0.86 -2.436 2.961 -1.575 4.692 c 2.329 4.685 3.51 9.734 3.51 15.01 C 78.764 67.854 63.617 83 45 83 S 11.236 67.854 11.236 49.236 c 0 -16.222 11.501 -29.805 26.776 -33.033 l -3.129 4.739 c -1.065 1.613 -0.62 3.784 0.992 4.85 c 0.594 0.392 1.264 0.579 1.926 0.579 c 1.136 0 2.251 -0.553 2.924 -1.571 l 7.176 -10.87 c 0.001 -0.001 0.001 -0.002 0.002 -0.003 l 0.018 -0.027 c 0.063 -0.096 0.106 -0.199 0.159 -0.299 c 0.049 -0.093 0.108 -0.181 0.149 -0.279 c 0.087 -0.207 0.152 -0.419 0.197 -0.634 c 0.009 -0.041 0.008 -0.085 0.015 -0.126 c 0.031 -0.182 0.053 -0.364 0.055 -0.547 c 0 -0.014 0.004 -0.028 0.004 -0.042 c 0 -0.066 -0.016 -0.128 -0.019 -0.193 c -0.008 -0.145 -0.018 -0.288 -0.043 -0.431 c -0.018 -0.097 -0.045 -0.189 -0.071 -0.283 c -0.032 -0.118 -0.065 -0.236 -0.109 -0.35 c -0.037 -0.095 -0.081 -0.185 -0.125 -0.276 c -0.052 -0.107 -0.107 -0.211 -0.17 -0.313 c -0.054 -0.087 -0.114 -0.168 -0.175 -0.25 c -0.07 -0.093 -0.143 -0.183 -0.223 -0.27 c -0.074 -0.08 -0.153 -0.155 -0.234 -0.228 c -0.047 -0.042 -0.085 -0.092 -0.135 -0.132 L 36.679 0.775 c -1.503 -1.213 -3.708 -0.977 -4.921 0.53 c -1.213 1.505 -0.976 3.709 0.53 4.921 l 3.972 3.2 C 17.97 13.438 4.236 29.759 4.236 49.236 C 4.236 71.714 22.522 90 45 90 s 40.764 -18.286 40.764 -40.764 C 85.764 42.87 84.337 36.772 81.521 31.109 z" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: rgb(0,0,0); fill-rule: nonzero; opacity: 1;" transform=" matrix(1 0 0 1 0 0) " stroke-linecap="round"/>
</g>
</svg>
                </button>
            </div>
            <p>Here's a personalized LinkedIn search query, copy and paste it into the LinkedIn job search bar to get you started:</p>
            <pre><code>${cachedSearchQuery}</code></pre>
            <p><strong>Tip:</strong> Extending the query with more specific terms will yield better results!</p>
        `;
        document.getElementById('refresh-query-btn')?.addEventListener('click', () => generateSearchQuery(true));

    } catch (error) {
        console.error('Error generating search query:', error);
        instructionContent.innerHTML = `
            <h3>Personalized Query</h3>
            <p><strong>Note:</strong> We couldn't generate a personalized search query. Please check your settings and try again later.</p>
        `;
    }
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
            cachedSearchQuery = null;
        }

        userDetailsMessage.textContent = 'All data saved successfully!';
        userDetailsMessage.style.color = 'green';
        jobPostingCache = {};

        setTimeout(() => {
            showInstructionDisplay();
            apiKeyMessage.textContent = '';
            userDetailsMessage.textContent = '';
        }, 1000);

    } catch (error) {
        console.error('Error saving all settings:', error);
        userDetailsMessage.textContent = 'Failed to save settings. Please try again.';
        userDetailsMessage.style.color = 'red';
    }
});

async function analyzeJobPosting(text: string, retry: boolean = false): Promise<boolean> {
    let jobPostingText = text.trim();
    console.log('jobPostingText: ', jobPostingText);
    latestJobPostingText = jobPostingText

    if (!retry && jobPostingCache[jobPostingText]?.Analysis) {
        console.log("Serving cached analysis.");
        showMarkdown(jobPostingCache[jobPostingText].Analysis!, jobPostingText);
        return true;
    }

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

        if (signal.aborted) return false;

        if (!googleApiKey || !resumeFileContent) {
            await showSettingsView();
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
            Provides a concise summary of how well the user's profile fits the job description. Start it by giving a very visible "score" which should be one of: very poor fit, poor fit, moderate fit, good fit, very good fit, questionable fit. Use only those options and *do not include the work score in the actual score*. The questionable fit should be used only when there isn't enough information. Note that missing core skills for a job shouldn't be able to lead to more than a poor fit. Similar logic should apply for details like salary, location, industry etc, if the user has specified them of course. For the score - insert an HTML block like this: <span style="color:red">*red* fit</span>. and color the text from red to green so that it's very obvious to the user.
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
            const fullResponse = chunks.join("");
            showMarkdown(fullResponse, jobPostingText);
        } catch (error: any) {
            console.error('Error during LlamaIndex query:', error);
            if (signal.aborted) {
                return false;
            }
            const errorMessage = `### Analysis Failed
An error occurred while analyzing the job posting. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
            showErrorOutput(errorMessage);
        }
    } catch (error) {
        console.error('Error processing selected text:', error);
        if (abortController?.signal.aborted) {
            return false;
        }
        const errorMessage = `### Analysis Failed
An error occurred while analyzing the job posting. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
        showErrorOutput(errorMessage);
    }
    return true;
}

async function generateCoverLetter(jobPostingText: string, retry = false): Promise<boolean> {
    if (!retry && jobPostingText && jobPostingCache[jobPostingText]?.CoverLetter) {
        console.log("Serving cached cover letter.");
        const { filename, content } = jobPostingCache[jobPostingText].CoverLetter!;
        showCoverLetterOutput(filename, content, jobPostingText);
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
            await showSettingsView();
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
                showCoverLetterOutput(filename, coverLetterContent, jobPostingText);
            } else {
                showMarkdown(responseText, jobPostingText);
            }
        } catch (error: any) {
            console.error('Error during LlamaIndex query:', error);
            if (signal.aborted) {
                return false;
            }
            const errorMessage = `### Cover letter generation Failed
An error occurred while generating cover letter. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
            showErrorOutput(errorMessage);
        }
    } catch (error: any) {
        console.error('Error generating cover letter:', error);
        if (abortController?.signal.aborted) {
            return false;
        }
        const errorMessage = `### Cover letter generation Failed
An error occurred while generating cover letter. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
        showErrorOutput(errorMessage);
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

function tailorResume() {
    return () => {
        console.log('Tailor Resume button clicked!');
    };
}

tailorResumeBtn.addEventListener('click', tailorResume());

backBtn.addEventListener('click', handleBackButtonClick);
settingsBtn.addEventListener('click', showSettingsView);

initializeSidePanel();
chrome.runtime.sendMessage({type: 'side-panel-ready'}).catch(error => console.log('Error sending side-panel-ready message:', error));