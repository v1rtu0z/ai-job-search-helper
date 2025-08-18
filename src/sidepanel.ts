import * as pdfjs from "./pdf.mjs";
import * as serverComms from "./server-comms";
import {els} from './dom';
import {hideAll, setHTML, showLoading, toggle} from './view';
import {converter, showError, stateMachine, ViewState} from './state';
import {getUserData, saveUserData, updateJobCache, UserRelevantData} from './storage';
import {arrayBufferToBase64, base64ToArrayBuffer, renderPdfPreview} from './resumePreview';
import {downloadBlob} from './downloads';
import {loadingRotator} from "./loading-rotator";

let abortController: AbortController | null = null;

pdfjs.GlobalWorkerOptions.workerSrc = "./pdf.worker.mjs";

function abortInFlight() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
}

let latestJobId: string; // todo: replace this with better history

async function showMarkdown(markdown: string, isBack = false) {
    abortController = null;
    hideAll();
    setHTML(els.markdownContent, converter.makeHtml(markdown));
    toggle(els.markdownOutputSection, true);
    toggle(els.markdownContent, true);
    toggle(els.tailorResumeBtn, true);
    toggle(els.generateCoverLetterBtn, true);
    toggle(els.retryBtn, true);
    toggle(els.backBtn, true);
    toggle(els.settingsBtn, true);

    stateMachine.set(ViewState.Analysis, isBack);
}

async function showCoverLetter(filename: string, content: string, isBack = false) {
    abortController = null;
    hideAll();
    toggle(els.coverLetterWarning, true);
    toggle(els.markdownOutputSection, true);
    els.coverLetterTextarea.value = content;
    toggle(els.coverLetterTextarea, true);
    toggle(els.downloadCoverLetterBtn, true);
    const textSpan = els.downloadCoverLetterBtn.querySelector('span');
    if (textSpan) {
        textSpan.textContent = `Download as ${filename}`;
    }

    toggle(els.backBtn, true);
    toggle(els.settingsBtn, true);
    toggle(els.tailorResumeBtn, true);
    toggle(els.retryBtn, true);

    els.downloadCoverLetterBtn.onclick = () => {
        downloadBlob(new Blob([els.coverLetterTextarea.value], {type: 'text/plain'}), filename);
    };

    stateMachine.set(ViewState.CoverLetter, isBack);
}

export async function showResumePreview(filename: string, pdfBuffer: ArrayBuffer, isBack = false) {
    abortController = null;
    hideAll();
    toggle(els.markdownOutputSection, true);
    toggle(els.backBtn, true);
    toggle(els.settingsBtn, true);
    toggle(els.generateCoverLetterBtn, true);
    toggle(els.retryBtn, true);

    if (pdfBuffer && pdfBuffer.byteLength > 0) {
        toggle(els.downloadTailoredResumeBtn, true);
        const textSpan = els.downloadTailoredResumeBtn.querySelector('span');
        if (textSpan) {
            textSpan.textContent = `Download as ${filename}`;
        }

        const blob = new Blob([pdfBuffer], {type: 'application/pdf'});

        els.downloadTailoredResumeBtn.onclick = () => {
            const a = document.createElement('a');
            const url = window.URL.createObjectURL(blob);

            a.href = url;
            a.download = filename;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        };
    } else {
        toggle(els.downloadTailoredResumeBtn, false);
        console.error("The PDF buffer is empty. Cannot download a file.");
    }

    await renderPdfPreview(pdfBuffer);

    stateMachine.set(ViewState.ResumePreview, isBack);
}

async function onSearchQueryRefresh(forceRegenerate: boolean): Promise<void> {
    const userRelevantData = await getUserData();
    toggle(els.querySection, false);
    if (!forceRegenerate && userRelevantData.linkedinSearchQuery) {
        showSectionWithQuery(userRelevantData.linkedinSearchQuery);
        return;
    }

    showLoading('Generating a personalized LinkedIn search query...', false);

    const searchQuery = await serverComms.generateSearchQuery();
    userRelevantData.linkedinSearchQuery = searchQuery;
    await saveUserData(userRelevantData);
    showSectionWithQuery(searchQuery);
}

async function onAnalyze(selectedText: string, isRetry = false) {
    abortInFlight();
    abortController = new AbortController();
    showLoading('Analyzing job posting...');

    loadingRotator.start('analyze', {
        intervalMs: 6000,
        stopOn: abortController.signal,
    });
    try {
        let jobPostingText = selectedText.trim().replace(/\n/g, ' ');
        if (jobPostingText.length === 0) {
            throw new Error('Empty job posting text.');
        }
        const {jobPostingCache} = await getUserData();

        if (!isRetry && jobPostingText && jobPostingCache) {
            for (const jobId in jobPostingCache) {
                let jobTitle = jobId.split(' @ ')[0].toLowerCase();
                let companyName = jobId.split(' @ ')[1].toLowerCase();
                const lowercaseJobText = jobPostingText.toLowerCase();
                if (lowercaseJobText.includes(jobTitle) && lowercaseJobText.includes(companyName)) {
                    const rec = jobPostingCache[jobId];
                    return {jobId, companyName: rec.CompanyName, jobAnalysis: rec.Analysis};
                }
            }
        }

        const {
            jobId,
            companyName,
            jobAnalysis
        } = await serverComms.analyzeJobPosting(selectedText, abortController.signal);

        latestJobId = jobId;
        await updateJobCache(jobId, r => {
            r.jobPostingText = jobPostingText;
            r.CompanyName = companyName;
            r.Analysis = jobAnalysis;
        });
        await showMarkdown(jobAnalysis);
    } catch (e: any) {
        showError(e?.message ?? 'Unexpected error during analysis.', ViewState.Analysis);
    } finally {
        loadingRotator.stop();
        abortController = null;
    }
}

async function onGenerateCoverLetter(jobId: string, isRetry = false) {
    abortInFlight();
    abortController = new AbortController();
    showLoading('Drafting a cover letter...');

    loadingRotator.start('cover-letter', {
        intervalMs: 6000,
        stopOn: abortController.signal,
    });
    console.log('(before try) Generating cover letter for job ID:', jobId);
    try {
        const {jobPostingCache, resumeJsonData} = await getUserData();

        if (!isRetry && jobPostingCache[jobId]?.CoverLetter) {
            return jobPostingCache[jobId].CoverLetter;
        }

        console.log('Generating cover letter for job ID:', jobId);
        const {content} = await serverComms.generateCoverLetter(jobId, abortController.signal);
        const filename = `${resumeJsonData.personal.full_name}_cover_letter_${jobPostingCache[jobId].CompanyName}.txt`;
        await updateJobCache(jobId, r => {
            r.CoverLetter = {filename, content};
        });
        await showCoverLetter(filename, content);
    } catch (e: any) {
        showError(e?.message ?? 'Failed to draft a cover letter.', ViewState.CoverLetter);
    } finally {
        abortController = null;
    }
}

async function onTailorResume(jobId: string, isRetry = false) {
    abortInFlight();
    abortController = new AbortController();
    showLoading('Tailoring resume...');

    loadingRotator.start('resume', {
        intervalMs: 6000,
        stopOn: abortController.signal,
    });
    try {
        const {
            resumeJsonData,
            jobPostingCache,
        } = await getUserData();

        if (!isRetry && jobPostingCache[jobId]?.TailoredResume) {
            const {filename, pdfArrayBufferInBase64} = jobPostingCache[jobId].TailoredResume;
            const pdfBuffer = base64ToArrayBuffer(pdfArrayBufferInBase64)
            return {filename, pdfBuffer}
        }

        const filename = `${
            resumeJsonData.personal.full_name.toLowerCase().replace(/\s+/g, '_')
        }_resume_${
            jobPostingCache[jobId].CompanyName.toLowerCase().replace(/\s+/g, '_'
            )
        }.pdf`;
        const {pdfBuffer} = await serverComms.tailorResume(jobId, filename, abortController.signal);
        await updateJobCache(jobId, r => {
            const pdfArrayBufferInBase64 = arrayBufferToBase64(pdfBuffer);
            r.TailoredResume = {filename, pdfArrayBufferInBase64};
        })
        await showResumePreview(filename, pdfBuffer);
    } catch (e: any) {
        showError(e?.message ?? 'Failed to tailor resume.', ViewState.ResumePreview);
    } finally {
        abortController = null;
    }
}

async function retryLastAction() {
    if (!latestJobId) return;
    switch (stateMachine.value) {
        case ViewState.Analysis:
            await onAnalyze(latestJobId, true);
            break;
        case ViewState.CoverLetter:
            await onGenerateCoverLetter(latestJobId, true);
            break;
        case ViewState.ResumePreview:
            await onTailorResume(latestJobId, true);
            break;
    }
}

// TODO: Since it's possible to go to one job analysis from any of the other jobs screens, the history should
//  also keep track of the job id of each screen and not simply the screen state

async function goBack() {
    abortInFlight();
    let prev: ViewState;
    if (els.userDetailsSection.checkVisibility()) {
        prev = stateMachine.value;
    } else {
        prev = stateMachine.back()!;
        if (!prev) {
            prev = ViewState.Instructions;
        }
    }
    const data = await getUserData();
    const rec = latestJobId ? data.jobPostingCache[latestJobId] : null;
    if (latestJobId && !rec) {
        console.error('No job cache found for latest job id:', latestJobId);
        await showInstructions(true);
        return;
    }
    switch (prev) {
        case ViewState.Analysis: {
            if (rec?.Analysis) {
                await showMarkdown(rec.Analysis!, true);
                return;
            }
            break;
        }
        case ViewState.CoverLetter: {
            if (rec?.CoverLetter) {
                await showCoverLetter(rec.CoverLetter.filename, rec.CoverLetter.content, true);
                return;
            }
            break;
        }
        case ViewState.ResumePreview: {
            if (rec?.TailoredResume) {
                await showResumePreview(
                    rec.TailoredResume.filename,
                    base64ToArrayBuffer(rec.TailoredResume.pdfArrayBufferInBase64),
                    true
                );
                return;
            }
            break;
        }
    }
    await showInstructions(true);
}

function addGlobalEventListeners() {
    els.backBtn.addEventListener('click', () => goBack());

    els.retryBtn.addEventListener('click', retryLastAction);

    els.settingsBtn.addEventListener('click', showUserSettings);

    els.analyzeJobDescriptionBtn.addEventListener('click', async () => {
        await onAnalyze(els.jobDescriptionInput.value);
    })

    els.tailorResumeBtn.addEventListener('click', async () => {
        if (!latestJobId) return;
        await onTailorResume(latestJobId);
    });

    els.generateCoverLetterBtn.addEventListener('click', async () => {
        if (!latestJobId) return;
        await onGenerateCoverLetter(latestJobId);
    });
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

    async function updateDesignYamlForTheme() {
        const currentTheme = themes[currentThemeIndex];
        const currentYaml = els.resumeDesignYamlInput.value;

        // If there's existing YAML, replace the theme name
        if (currentYaml) {
            // Find and replace theme references in YAML
            els.resumeDesignYamlInput.value = currentYaml.replace(
                /theme:\s*["']?[a-zA-Z0-9_-]+["']?/g,
                `theme: ${currentTheme}`
            );
        } else {
            // Set default YAML for the theme
            els.resumeDesignYamlInput.value = `theme: "${currentTheme}"\nfont: "Source Sans 3"\nfont_size: 10pt\npage_size: letterpaper`;
        }
    }

    // Add new event listeners
    prevBtn.addEventListener('click', () => {
        currentThemeIndex = (currentThemeIndex - 1 + themes.length) % themes.length;
        updateThemeDisplay();
        updateDesignYamlForTheme();
    });

    nextBtn.addEventListener('click', () => {
        currentThemeIndex = (currentThemeIndex + 1) % themes.length;
        updateThemeDisplay();
        updateDesignYamlForTheme();
    });

    // Set up theme indicator clicks
    const indicators = els.themeSelectionSection.querySelectorAll('.theme-indicator');
    indicators.forEach((indicator, index) => {
        const newIndicator = indicator.cloneNode(true);
        indicator.replaceWith(newIndicator);
        newIndicator.addEventListener('click', () => {
            currentThemeIndex = index;
            updateThemeDisplay();
            updateDesignYamlForTheme();
        });
    });
}

async function showUserSettings() {
    hideAll();
    toggle(els.settingsView, true);
    toggle(els.apiKeySection, true);
    toggle(els.userDetailsSection, true);
    toggle(els.backBtn, true);

    const userRelevantData = await getUserData();
    manageTheme(userRelevantData);

    els.resumeDesignYamlInput.value = userRelevantData.resumeDesignYaml;
    els.resumeLocalYamlInput.value = userRelevantData.resumeLocalYaml;

    els.additionalDetailsTextarea.value = userRelevantData.additionalDetails || '';
    els.resumeFileNameDiv.textContent = userRelevantData.resumeFileName ? `Current resume: ${userRelevantData.resumeFileName}` : 'No resume uploaded yet.';

    // todo: trigger resume parsing and show nicer loading as soon as user uploads a file
    els.resumeFileInput.value = '';
    els.apiKeyMessage.textContent = '';
    els.userDetailsMessage.textContent = '';

    els.saveAllSettingsBtn.addEventListener('click', saveUserSettings);
}

async function saveUserSettings() {
    const apiKey = els.googleApiKeyInput.value.trim();
    const file = els.resumeFileInput.files && els.resumeFileInput.files.length > 0 ? els.resumeFileInput.files[0] : null;
    const additionalDetails = els.additionalDetailsTextarea.value.trim();

    try {
        els.apiKeyMessage.textContent = '';
        els.userDetailsMessage.textContent = '';

        const userRelevantData = await getUserData();
        const oldFileContent = userRelevantData.resumeFileContent;
        const oldAdditionalDetails = userRelevantData.additionalDetails;

        if (!userRelevantData.googleApiKey || userRelevantData.googleApiKey !== apiKey) {
            userRelevantData.googleApiKey = apiKey;
        }

        let newResumeUploaded = false;
        if (file) {
            newResumeUploaded = true;

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

            userRelevantData.resumeFileName = file.name;
            userRelevantData.resumeFileContent = fileContent;
        } else if (!userRelevantData.resumeFileName) {
            els.userDetailsMessage.textContent = 'A resume file is mandatory.';
            els.userDetailsMessage.style.color = 'red';
            return;
        }

        userRelevantData.additionalDetails = additionalDetails;

        const resumeChanged = oldFileContent !== userRelevantData.resumeFileContent;
        if (newResumeUploaded || resumeChanged || (oldAdditionalDetails !== userRelevantData.additionalDetails)) {
            if (resumeChanged) {
                userRelevantData.jobPostingCache = {}
                // todo: make this look better
                showLoading('Parsing your resume...', false);
                const {
                    search_query,
                    resume_data
                } = await serverComms.getResumeJson(userRelevantData.resumeFileContent, additionalDetails);
                userRelevantData.linkedinSearchQuery = search_query;
                userRelevantData.resumeJsonData = resume_data;
            } else {
                userRelevantData.resumeJsonData.additionalDetails = additionalDetails;
            }
            userRelevantData.jobPostingCache = {}
        }

        userRelevantData.theme = els.currentThemeName.textContent;

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

async function showInstructions(isBack: boolean = false) {
    const data = await getUserData()
    if (!data.resumeFileContent && !data.additionalDetails) {
        await showUserSettings()
    } else {
        hideAll();
        toggle(els.instructionDisplay, true);
        stateMachine.set(ViewState.Instructions, isBack);
        toggle(els.settingsBtn, true);
        toggle(els.backBtn, false);
        if (data.linkedinSearchQuery) {
            showSectionWithQuery(data.linkedinSearchQuery);
            return;
        } else {
            await onSearchQueryRefresh(true);
        }
    }
}

function showSectionWithQuery(query: string) {
    if (!els.querySection || !els.codeEl) {
        console.error('Section or code element not found.');
        return;
    }
    toggle(els.loadingSpinnerSection, false);
    els.codeEl.textContent = query;
    toggle(els.querySection, true);

    if (els.refreshBtn) {
        const refreshBtn = els.refreshBtn.cloneNode(true) as HTMLButtonElement;
        els.refreshBtn.replaceWith(refreshBtn);
        refreshBtn.addEventListener('click', () => onSearchQueryRefresh(true));
    }
}

els.saveAllSettingsBtn.addEventListener('click', saveUserSettings);

chrome.runtime.onMessage.addListener((message: {
    type: string;
    text?: string
}, sender: chrome.runtime.MessageSender, sendResponse: (response?: boolean) => void) => {
    if (message.type === 'selected-text' && message.text) {
        onAnalyze(message.text).then(() => {
                return true;
            }
        ).catch((error) => {
            console.log('Error analyzing text:', error);
            throw error
        })
    }
    return false;
});

addGlobalEventListeners();
showInstructions();

chrome.runtime.sendMessage({type: 'side-panel-ready'}).catch(error => console.log('Error sending side-panel-ready message:', error));
