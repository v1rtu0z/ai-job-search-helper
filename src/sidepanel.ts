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
const coverLetterTextarea = document.getElementById('cover-letter-textarea') as HTMLTextAreaElement;
const coverLetterTextareaTitle = document.getElementById('cover-letter-textarea-title') as HTMLTextAreaElement;

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

const resumePreviewContainer = document.getElementById('resume-preview-container') as HTMLDivElement;
const downloadTailoredResumeBtn = document.getElementById('download-tailored-resume-btn') as HTMLButtonElement;

let latestJobPostingText: string | null = null

let currentState: 'instructions' | 'analysis' | 'cover-letter' | 'resume-preview' = 'instructions';
const stateHistory: Array<'instructions' | 'analysis' | 'cover-letter' | 'resume-preview'> = [];
let cachedSearchQuery: string | null = null;

const buyMeCoffeeHTML = `
    <p> If this helps you land the job, please consider supporting the project:</p>
    <div style="display: flex; justify-content: center; margin-top: 10px;">
        <a href="https://buymeacoffee.com/v1rtu0z96" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; justify-content: flex-start; padding: 10px 20px; text-decoration: none; color: #000; background-color: #FFDD00; border-radius: 50px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); width: 160px; overflow: hidden; white-space: nowrap;">
            <img src="https://www.buymeacoffee.com/assets/img/BMC-btn-logo.svg" alt="Buy Me a Coffee" style="height: 25px; flex-shrink: 0;">
            <span style="margin-left: 5px; opacity: 1;">Buy me a coffee</span>
        </a>
    </div>
    `
const gotFeedbackHTML = `
    <p>Got feedback? I'd be happy to hear it. Send me a message:</p>
     <div style="display: flex; justify-content: center; margin-top: 10px;">
         <a href="mailto:nikolamandic1996@gmail.com?subject=AI%20Job%20Search%20Helper%20Feedback" style="display: flex; align-items: center; text-decoration: none; color: #333; background-color: #f1f1f1; border: 1px solid #ddd; border-radius: 50px; padding: 10px 20px; font-weight: bold; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="height: 25px; width: 25px; fill: #333;">
                 <path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6zm-2 0l-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z"/>
             </svg>
             <span style="margin-left: 10px;">Send feedback</span>
         </a>
     </div>
    `

const llamaIndexHTML = `
    <a href="https://github.com/run-llama/LlamaIndexTS" target="_blank" rel="noopener noreferrer">LlamaIndexTS</a>
`
const pdfJsHTML = `
    <a href="https://github.com/mozilla/pdf.js" target="_blank" rel="noopener noreferrer">pdf.js</a>
`

const javaScriptHTML = `
    <p>Powered in part by JavaScript, an open-source standard that
                <a href="https://javascript.tm/" target="_blank" rel="noopener noreferrer"> Oracle should definitely release.</a>
             </p>
`
const webStormHTML = `
<p>This extension was developed using 
    <a href="https://www.jetbrains.com/webstorm/" target="_blank" rel="noopener noreferrer">JetBrains WebStorm</a>. 
    It's an awesome IDE for web development!
</p>`
const sourceCodeHTML = `
    <p>This project is open source! 
             <a href="https://github.com/v1rtu0z/ai-job-search-helper" target="_blank" rel="noopener noreferrer">Check out the code on GitHub.</a>
             </p>
`
// todo: use when loading tailored resume
const renderCVHTML = `
    <a href="https://github.com/rendercv/rendercv" target="_blank" rel="noopener noreferrer">renderCV</a>
`

const converter = new showdown.Converter();

pdfjs.GlobalWorkerOptions.workerSrc = "./pdf.worker.mjs";

let globalIndex: VectorStoreIndex | null = null;
let abortController: AbortController | null = null;

type JobPostingCacheRecord = {
    "CompanyName": string;
    'Analysis': string | null;
    'CoverLetter': { filename: string, content: string } | null;
    'TailoredResume': { filename: string, content: string } | null;
};
// note: cache miss fail happen when the selected text is not the same. On LinkedIn for example, if one selects
// everything from the company logo to the end of the job end, different stuff gets selected depending on if
// they select from top to the bottom or from the bottom to the top.
interface UserRelevantData {
    googleApiKey?: string;
    resumeFileName?: string;
    resumeFileContent?: string;
    additionalDetails?: string;
    jobPostingCache?: Record<string, JobPostingCacheRecord>;
}

function updateState(newState: 'instructions' | 'analysis' | 'cover-letter' | 'resume-preview', isBackNavigation: boolean = false): void {
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
    markdownContent.classList.add('hidden');
    coverLetterTextarea.classList.add('hidden');
    coverLetterTextareaTitle.classList.add('hidden');
    settingsBtn.classList.add('hidden');
    resumePreviewContainer.classList.add('hidden');
    downloadTailoredResumeBtn.classList.add('hidden');
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

function showLoadingSpinner(html: string = "Processing..."): void {
    hideAllSections();
    loadingSpinnerTitle.innerHTML = html;
    loadingSpinnerSection.classList.remove('hidden');
    backBtn.classList.remove('hidden');
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

    const userRelevantData = await fetchUserRelevantData();

    googleApiKeyInput.value = userRelevantData.googleApiKey || '';
    additionalDetailsTextarea.value = userRelevantData.additionalDetails || '';
    resumeFileNameDiv.textContent = userRelevantData.resumeFileName ? `Current resume: ${userRelevantData.resumeFileName}` : 'No resume uploaded yet.';
    resumeFileInput.value = '';
    apiKeyMessage.textContent = '';
    userDetailsMessage.textContent = '';

    backBtn.classList.remove('hidden');
}

async function retryLastAction(jobPostingText: string) {
    if (currentState === 'analysis' && jobPostingText) {
        analyzeJobPosting(jobPostingText, true);
    } else if (currentState === 'cover-letter' && jobPostingText) {
        generateCoverLetter(jobPostingText, true);
    } // todo add a case for resume tailoring
}

async function showMarkdown(markdown: string, jobPostingText: string, isBackNavigation: boolean = false) {
    if (abortController) {
        abortController = null;
    }
    hideAllSections();
    markdownContent.innerHTML = converter.makeHtml(markdown);
    markdownOutputSection.classList.remove('hidden');
    markdownContent.classList.remove('hidden');
    tailorResumeBtn.classList.remove('hidden');
    generateCoverLetterBtn.classList.remove('hidden');

    retryBtn.classList.remove('hidden');

    const userRelevantData = await fetchUserRelevantData();

    if (!userRelevantData.jobPostingCache[jobPostingText]) {
        userRelevantData.jobPostingCache[jobPostingText] = {
            Analysis: null,
            CoverLetter: null,
            CompanyName: null,
            TailoredResume: null
        };
    }
    userRelevantData.jobPostingCache[jobPostingText].Analysis = markdown;
    console.log('Current job posting cache keys:', Object.keys(userRelevantData.jobPostingCache));
    await chrome.storage.local.set({userRelevantData});

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
    markdownContent.classList.remove('hidden');
    retryBtn.classList.remove('hidden');
    updateState('analysis', isBackNavigation);
    backBtn.classList.remove('hidden');
    settingsBtn.classList.remove('hidden');
}

async function showCoverLetterOutput(filename: string, content: string, jobPostingText: string, isBackNavigation: boolean = false) {
    if (abortController) {
        abortController = null;
    }
    hideAllSections();
    markdownOutputSection.classList.remove('hidden');
    coverLetterTextarea.value = content;
    coverLetterTextarea.classList.remove('hidden');
    downloadCoverLetterBtn.classList.remove('hidden');
    downloadCoverLetterBtn.textContent = `Download as ${filename}`;
    backBtn.classList.remove('hidden');
    settingsBtn.classList.remove('hidden');
    tailorResumeBtn.classList.remove('hidden');
    retryBtn.classList.remove('hidden');

    retryBtn.addEventListener('click', () => {
        retryLastAction(jobPostingText);
    });

    const userRelevantData = await fetchUserRelevantData();

    if (!userRelevantData.jobPostingCache[jobPostingText]) {
        userRelevantData.jobPostingCache[jobPostingText] = {
            Analysis: null,
            CoverLetter: null,
            CompanyName: null,
            TailoredResume: null
        };
    }
    userRelevantData.jobPostingCache[jobPostingText].CoverLetter = {filename, content};
    console.log('Current job posting cache keys:', Object.keys(userRelevantData.jobPostingCache));
    await chrome.storage.local.set({userRelevantData});

    updateState('cover-letter', isBackNavigation);
    downloadCoverLetterBtn.onclick = () => {
        const blob = new Blob([coverLetterTextarea.value], {type: 'text/plain'});
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

async function showResumePreview(tailoredResumePath: string, isBackNavigation: boolean = false) {
    hideAllSections();
    backBtn.classList.remove('hidden');
    settingsBtn.classList.remove('hidden');

    markdownOutputSection.classList.remove('hidden');
    resumePreviewContainer.classList.remove('hidden');
    generateCoverLetterBtn.classList.remove('hidden');
    downloadTailoredResumeBtn.classList.remove('hidden');
    retryBtn.classList.remove('hidden');

    updateState('resume-preview', isBackNavigation);

    const loadingTask = pdfjs.getDocument(tailoredResumePath);
    const pdf = await loadingTask.promise;

    resumePreviewContainer.innerHTML = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const scale = 0.9;
        const viewport = page.getViewport({scale: scale});

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: context,
            viewport: viewport,
        };
        await page.render(renderContext).promise;
        resumePreviewContainer.appendChild(canvas);
    }
}

async function handleBackButtonClick() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }

    let previousState: "instructions" | "analysis" | "cover-letter" | "resume-preview";
    if (settingsView.classList.contains('hidden')) {
        previousState = stateHistory.pop();
    } else {
        previousState = currentState;
    }

    console.log(`Back button clicked. Previous state: ${previousState}, New history:`, stateHistory);

    let userRelevantData = await fetchUserRelevantData();

    switch (previousState) {
        case 'analysis':
            if (latestJobPostingText && userRelevantData.jobPostingCache[latestJobPostingText]?.Analysis) {
                showMarkdown(userRelevantData.jobPostingCache[latestJobPostingText].Analysis!, latestJobPostingText, true);
            } else {
                showInstructionDisplay(true);
            }
            break;
        case 'resume-preview':
            tailorResume(true);
            break;
        case 'cover-letter':
            if (latestJobPostingText && userRelevantData.jobPostingCache[latestJobPostingText]?.CoverLetter) {
                const {filename, content} = userRelevantData.jobPostingCache[latestJobPostingText].CoverLetter!;
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
        const userRelevantData = await fetchUserRelevantData();
        if (userRelevantData.googleApiKey && userRelevantData.resumeFileName) {
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

const linkedinSearchQueryHTML = `
            <div class="search-query-header">
                <button id="refresh-query-btn" class="icon-button" style="right: 3%;">
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" xml:space="preserve">
<g style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: none; fill-rule: nonzero; opacity: 1;" transform="translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)">
	<path d="M 81.521 31.109 c -0.86 -1.73 -2.959 -2.438 -4.692 -1.575 c -1.73 0.86 -2.436 2.961 -1.575 4.692 c 2.329 4.685 3.51 9.734 3.51 15.01 C 78.764 67.854 63.617 83 45 83 S 11.236 67.854 11.236 49.236 c 0 -16.222 11.501 -29.805 26.776 -33.033 l -3.129 4.739 c -1.065 1.613 -0.62 3.784 0.992 4.85 c 0.594 0.392 1.264 0.579 1.926 0.579 c 1.136 0 2.251 -0.553 2.924 -1.571 l 7.176 -10.87 c 0.001 -0.001 0.001 -0.002 0.002 -0.003 l 0.018 -0.027 c 0.063 -0.096 0.106 -0.199 0.159 -0.299 c 0.049 -0.093 0.108 -0.181 0.149 -0.279 c 0.087 -0.207 0.152 -0.419 0.197 -0.634 c 0.009 -0.041 0.008 -0.085 0.015 -0.126 c 0.031 -0.182 0.053 -0.364 0.055 -0.547 c 0 -0.014 0.004 -0.028 0.004 -0.042 c 0 -0.066 -0.016 -0.128 -0.019 -0.193 c -0.008 -0.145 -0.018 -0.288 -0.043 -0.431 c -0.018 -0.097 -0.045 -0.189 -0.071 -0.283 c -0.032 -0.118 -0.065 -0.236 -0.109 -0.35 c -0.037 -0.095 -0.081 -0.185 -0.125 -0.276 c -0.052 -0.107 -0.107 -0.211 -0.17 -0.313 c -0.054 -0.087 -0.114 -0.168 -0.175 -0.25 c -0.07 -0.093 -0.143 -0.183 -0.223 -0.27 c -0.074 -0.08 -0.153 -0.155 -0.234 -0.228 c -0.047 -0.042 -0.085 -0.092 -0.135 -0.132 L 36.679 0.775 c -1.503 -1.213 -3.708 -0.977 -4.921 0.53 c -1.213 1.505 -0.976 3.709 0.53 4.921 l 3.972 3.2 C 17.97 13.438 4.236 29.759 4.236 49.236 C 4.236 71.714 22.522 90 45 90 s 40.764 -18.286 40.764 -40.764 C 85.764 42.87 84.337 36.772 81.521 31.109 z" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: rgb(0,0,0); fill-rule: nonzero; opacity: 1;" transform=" matrix(1 0 0 1 0 0) " stroke-linecap="round"/>
</g>
</svg>
                                        </button>
                <h3>Your Personalized Search Query</h3>
            </div>
            <p>Here's a personalized LinkedIn search query, copy and paste it into the LinkedIn job search bar to get you started:</p>
`

async function generateSearchQuery(forceRegenerate: boolean = false): Promise<void> {
    if (!forceRegenerate && cachedSearchQuery) {
        instructionContent.innerHTML = `
                ${linkedinSearchQueryHTML}
            <pre><code>${cachedSearchQuery}</code></pre>
            <p><strong>Tip:</strong> Extending the query with more specific terms will yield better results!</p>
        `;
        document.getElementById('refresh-query-btn')?.addEventListener('click', () => generateSearchQuery(true));
        return;
    }

    instructionContent.innerHTML = `
        <br>
        <h3>Generating a Personalized LinkedIn Search Query...</h3>
        <div class="loading-spinner"></div>
    `;

    try {
        const userRelevantData = await fetchUserRelevantData();
        const {googleApiKey, resumeFileContent, additionalDetails} = userRelevantData;

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
                ${linkedinSearchQueryHTML}
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

        const userRelevantData = await fetchUserRelevantData();
        const oldFileContent = userRelevantData.resumeFileContent;
        const oldAdditionalDetails = userRelevantData.additionalDetails;

        if (!apiKey) {
            apiKeyMessage.textContent = 'API Key cannot be empty.';
            apiKeyMessage.style.color = 'red';
            return;
        }

        userRelevantData.googleApiKey = apiKey;

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

            userRelevantData.resumeFileName = file.name;
            userRelevantData.resumeFileContent = fileContent;
        } else if (!userRelevantData.resumeFileName) {
            userDetailsMessage.textContent = 'A resume file is mandatory.';
            userDetailsMessage.style.color = 'red';
            return;
        }

        userRelevantData.additionalDetails = additionalDetails;

        if (newResumeUploaded || (oldFileContent !== userRelevantData.resumeFileContent) || (oldAdditionalDetails !== userRelevantData.additionalDetails)) {
            Settings.llm = llamaindexGoogle.gemini({
                apiKey: apiKey,
                model: llamaindexGoogle.GEMINI_MODEL.GEMINI_2_5_FLASH_PREVIEW,
            });
            Settings.embedModel = new llamaindexGoogle.GeminiEmbedding({
                apiKey: apiKey,
            });
            globalIndex = await create_index_from_data(userRelevantData.resumeFileContent!, userRelevantData.additionalDetails || '');
            cachedSearchQuery = null;
        }

        userDetailsMessage.textContent = 'All data saved successfully!';
        userDetailsMessage.style.color = 'green';

        userRelevantData.jobPostingCache = {};

        console.log('Current job posting cache keys:', Object.keys(userRelevantData.jobPostingCache));
        await chrome.storage.local.set({userRelevantData});

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

async function fetchUserRelevantData() {
    const result: { userRelevantData?: UserRelevantData } = await chrome.storage.local.get(['userRelevantData']);
    return result.userRelevantData || {};
}

async function analyzeJobPosting(text: string, retry: boolean = false): Promise<boolean> {
    let jobPostingText = text.trim().replace(/\n/g, ' ');
    if (jobPostingText.length === 0) {
        console.log('Empty job posting text.');
        return false;
    }
    latestJobPostingText = jobPostingText

    const userRelevantData = await fetchUserRelevantData();

    // fixme: this fails on linkedin sometimes because it adds some extra text
    if (!retry && userRelevantData.jobPostingCache[jobPostingText]?.Analysis) {
        console.log("Serving cached analysis.");
        showMarkdown(userRelevantData.jobPostingCache[jobPostingText].Analysis!, jobPostingText);
        return true;
    }

    const messages = [
        `<p>Analyzing job posting with the help of
            <a href="https://github.com/showdownjs/showdown" target="_blank" rel="noopener noreferrer">Showdown</a>,
            an amazing open source Markdown converter tool...
        </p>`,
        `<p>Analyzing job posting with the help of ${pdfJsHTML}, an amazing open source pdf tool...</p>`,
        `<p>Analyzing job posting with the help of ${llamaIndexHTML}, an amazing open source LLM tool...</p>`,
        `<p>Analyzing job posting...</p>${javaScriptHTML}`,
        `<p>Analyzing job posting...</p>${webStormHTML}`,
        `<p>Analyzing job posting...</p>${buyMeCoffeeHTML}`,
        `<p>Analyzing job posting...</p>${gotFeedbackHTML}`,
        `<p>Analyzing job posting...</p>${sourceCodeHTML}`
    ]

    showLoadingSpinner(
        messages[Math.floor(Math.random() * messages.length)]
    );

    if (abortController) {
        abortController.abort();
    }
    abortController = new AbortController();
    const signal = abortController.signal;

    try {
        const {googleApiKey, resumeFileContent} = userRelevantData;

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
            globalIndex = await create_index_from_data(resumeFileContent, userRelevantData.additionalDetails || '');
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
            Do the same in case of incomplete job descriptions, example being just job titles, or job titles with the company names and such.
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
    const userRelevantData = await fetchUserRelevantData();

    if (!retry && jobPostingText && userRelevantData.jobPostingCache[jobPostingText]?.CoverLetter) {
        console.log("Serving cached cover letter.");
        const {filename, content} = userRelevantData.jobPostingCache[jobPostingText].CoverLetter!;
        showCoverLetterOutput(filename, content, jobPostingText);
        return true;
    }

    const messages = [
        `<p>Generating a Cover Letter with the help of ${llamaIndexHTML}, an amazing open source LLM tool...</p>`,
        `<p>Generating a Cover Letter with the help of ${pdfJsHTML}, an amazing open source pdf tool...</p>`,
        `<p>Generating a Cover Letter...</p>${javaScriptHTML}`,
        `<p>Generating a Cover Letter...</p>${webStormHTML}`,
        `<p>Generating a Cover Letter...</p>${buyMeCoffeeHTML}`,
        `<p>Generating a Cover Letter...</p>${gotFeedbackHTML}`,
        `<p>Generating a Cover Letter...</p>${sourceCodeHTML}`
    ]

    showLoadingSpinner(
        messages[Math.floor(Math.random() * messages.length)]
    );
    if (abortController) {
        abortController.abort();
    }
    abortController = new AbortController();
    const signal = abortController.signal;

    try {
        const {googleApiKey, resumeFileContent} = userRelevantData;

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
            globalIndex = await create_index_from_data(resumeFileContent, userRelevantData.additionalDetails || '');
        }

        if (signal.aborted) return false;

        const llm = llamaindexGoogle.gemini({
            apiKey: googleApiKey,
            model: llamaindexGoogle.GEMINI_MODEL.GEMINI_2_5_FLASH_PREVIEW,
        });

        let companyNamePrompt = `Based on this job description: ${jobPostingText} what is the name of the company? Return just the name and nothing else`;
        let companyName: string | null = null;
        if (userRelevantData.jobPostingCache[jobPostingText]?.CompanyName) {
            companyName = userRelevantData.jobPostingCache[jobPostingText].CompanyName;
        } else {
            companyName = (await llm.complete({prompt: companyNamePrompt})).text;
            if (!userRelevantData.jobPostingCache[jobPostingText]) {
                userRelevantData.jobPostingCache[jobPostingText] = {
                    Analysis: null,
                    CoverLetter: null,
                    CompanyName: null,
                    TailoredResume: null
                };
            }
            userRelevantData.jobPostingCache[jobPostingText].CompanyName = companyName;
            console.log('Current job posting cache keys:', Object.keys(userRelevantData.jobPostingCache));
            await chrome.storage.local.set({userRelevantData});
        }

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
            let filename = "cover-letter.txt";
            let coverLetterContent = responseText.trim();
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1].trim();
                coverLetterContent = responseText.replace(filenameMatch[0], '').trim();
            }

            showCoverLetterOutput(filename, coverLetterContent, jobPostingText);

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

function tailorResume(isBackNavigation: boolean = false) {
    return () => {
        // TODO: add prompts for filename and yaml content and logic for using rendercv to
        //  generate a resume pdf from the yaml and pass the path to that pdf to showResumePreview
        showResumePreview('file:///home/nikola/Downloads/personal/Nikola_Mandic_resume.pdf', isBackNavigation);
    };
}

function downloadTailoredResume(): void {
    // TODO: Add logic for downloading the tailored resume here
    console.log('Download as tailored_resume.pdf!');
}


tailorResumeBtn.addEventListener('click', tailorResume());
downloadTailoredResumeBtn.addEventListener('click', downloadTailoredResume);

backBtn.addEventListener('click', handleBackButtonClick);
settingsBtn.addEventListener('click', showSettingsView);

initializeSidePanel();
chrome.runtime.sendMessage({type: 'side-panel-ready'}).catch(error => console.log('Error sending side-panel-ready message:', error));