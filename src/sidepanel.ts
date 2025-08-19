import * as serverComms from "./server-comms";
import {els} from './dom';
import {hideAll, setHTML, showLoading, toggle} from './view';
import {converter, showError, stateMachine, ViewState} from './state';
import {getUserData, saveUserData, updateJobCache} from './storage';
import {arrayBufferToBase64, base64ToArrayBuffer, renderPdfPreview} from './resumePreview';
import {downloadBlob} from './downloads';
import {loadingRotator} from "./loading-rotator";
import {saveUserSettings, showUserSettings} from "./settings";

let abortController: AbortController | null = null;

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

function showSupportPopup() {
    if (els.sponsorshipPopupOverlay && els.closePopupBtn && els.sponsorshipPopupModal) {
        // Show the popup by removing the 'hidden' class
        els.sponsorshipPopupOverlay.classList.remove('hidden');

        // Add event listener to close button
        els.closePopupBtn.addEventListener('click', () => {
            els.sponsorshipPopupOverlay.classList.add('hidden');
        }, { once: true }); // Use { once: true } to automatically remove the listener after it's been called once

        // Add event listener to close when clicking outside the modal
        els.sponsorshipPopupOverlay.addEventListener('click', (event) => {
            // Check if the click target is the overlay itself, not the modal
            if (event.target === els.sponsorshipPopupOverlay) {
                els.sponsorshipPopupOverlay.classList.add('hidden');
            }
        });
    }
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

        els.downloadTailoredResumeBtn.onclick = async () => {
            const a = document.createElement('a');
            const url = window.URL.createObjectURL(blob);

            a.href = url;
            a.download = filename;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            let userData = await getUserData();
            userData.resumesDownloaded++;
            await saveUserData(userData);

            if (userData.resumesDownloaded % 20 === 0) {
                showSupportPopup();
            }
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

    const searchQuery = await serverComms.generateSearchQuery(userRelevantData.modelName);
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
        const {jobPostingCache, modelName} = await getUserData();

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
        } = await serverComms.analyzeJobPosting(selectedText, abortController.signal, modelName);

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
        const {jobPostingCache, resumeJsonData, modelName} = await getUserData();

        if (!isRetry && jobPostingCache[jobId]?.CoverLetter) {
            return jobPostingCache[jobId].CoverLetter;
        }

        console.log('Generating cover letter for job ID:', jobId);
        const {content} = await serverComms.generateCoverLetter(jobId, abortController.signal, modelName);
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
            modelName
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
        const {pdfBuffer} = await serverComms.tailorResume(jobId, filename, abortController.signal, modelName);
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

export async function goBack() {
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

async function showInstructions(isBack: boolean = false) {
    const data = await getUserData()
    if (!data.resumeJsonData) {
        await showUserSettings()
    } else {
        hideAll();
        const firstName = data.resumeJsonData.personal.full_name.split(' ')[0];
        els.instructionsGreeting.textContent = `Welcome, ✨${firstName}✨! Let's get you set up for success!`;
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
    if (!els.querySection || !els.searchQueryLink || !els.searchQueryText) {
        console.error('One or more search query elements not found.');
        return;
    }

    toggle(els.loadingSpinnerSection, false);

    const linkedInBaseUrl = 'https://www.linkedin.com/jobs/search/?keywords=';
    const encodedQuery = encodeURIComponent(query);
    els.searchQueryLink.href = `${linkedInBaseUrl}${encodedQuery}`;

    els.searchQueryText.textContent = query;

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
