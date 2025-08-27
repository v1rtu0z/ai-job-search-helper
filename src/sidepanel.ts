import * as serverComms from "./server-comms";
import {els} from './dom';
import {hideAll, setHTML, showLoading, toggle} from './view';
import {showError, stateMachine, ViewState} from './state';
import {getUserData, saveUserData, updateJobCache} from './storage';
import {arrayBufferToBase64, base64ToArrayBuffer, renderPdfPreview} from './resumePreview';
import {downloadBlob} from './downloads';
import {loadingRotator} from "./loading-rotator";
import {isFirefox, saveUserSettings, showUserSettings} from "./settings";

import '../backdrop_overlay_style.css';
import {browser} from "webextension-polyfill-ts";

import * as pdfjs from "../js/pdf.mjs";

// Set PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = "./pdf.worker.mjs";

let abortController: AbortController | null = null;

function abortInFlight() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
}

let latestJobId: string; // todo: replace this with better history

export async function getPdfText(file: File): Promise<string> {
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

export function showSettingsExplainerPopup() {
    if (els.settingsExplainerOverlay && els.closeExplainerBtn && els.settingsExplainerModal) {
        els.settingsExplainerOverlay.classList.remove('hidden');

        els.closeExplainerBtn.addEventListener('click', () => {
            els.settingsExplainerOverlay.classList.add('hidden');
        }, {once: true});

        els.settingsExplainerOverlay.addEventListener('click', (event) => {
            if (event.target === els.settingsExplainerOverlay) {
                els.settingsExplainerOverlay.classList.add('hidden');
            }
        });
    }
}

// fixme: removal and re-adding of event listeners is needed
// fixme: going back from a cached view goes to instructions instead of the previous screen
async function showAnalysis(html: string, isBack = false, jobId: string = null) {
    abortController = null;
    hideAll();
    setHTML(els.analysisContent, html);
    toggle(els.outputSection, true);
    toggle(els.analysisContent, true);
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
    toggle(els.outputSection, true);
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
        }, {once: true}); // Use { once: true } to automatically remove the listener after it's been called once

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
    toggle(els.outputSection, true);
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

    const searchQuery = await serverComms.generateSearchQuery();
    userRelevantData.linkedinSearchQuery = searchQuery;
    await saveUserData(userRelevantData);
    showSectionWithQuery(searchQuery);
}

async function onAnalyze(selectedText: string, isRetry = false) {
    console.log(`[onAnalyze] Function called. isRetry: ${isRetry}`);
    console.log(`[onAnalyze] Input text (first 50 chars): "${selectedText.substring(0, 50)}..."`);

    abortInFlight();

    try {
        let jobPostingText = selectedText.trim().replace(/\n/g, ' ');
        if (jobPostingText.length === 0) {
            console.error('[onAnalyze] Error: Empty job posting text.');
            throw new Error('Empty job posting text.');
        }

        const {jobPostingCache} = await getUserData();
        console.log('[onAnalyze] Fetched user data. Cache size:', Object.keys(jobPostingCache || {}).length);

        // Caching Logic
        if (!isRetry && jobPostingText && jobPostingCache) {
            console.log('[onAnalyze] Starting cache lookup...');
            for (const jobId in jobPostingCache) {
                const parts = jobId.split(' @ ');
                if (parts.length < 2) continue; // Skip malformed cache keys

                const jobTitleFromCache = parts[0].toLowerCase();
                const companyNameFromCache = parts[1].toLowerCase();
                const lowercaseJobText = jobPostingText.toLowerCase();

                console.log(`[onAnalyze] Checking cache key: "${jobId}"`);
                console.log(`[onAnalyze] Looking for "${jobTitleFromCache}" and "${companyNameFromCache}" in the selected text.`);

                if (lowercaseJobText.includes(jobTitleFromCache) && lowercaseJobText.includes(companyNameFromCache)) {
                    const rec = jobPostingCache[jobId];
                    console.log(`[onAnalyze] CACHE HIT! Returning cached data for: "${jobId}"`);
                    await showAnalysis(rec.Analysis, false, jobId);
                    return;
                }
            }
            console.log('[onAnalyze] CACHE MISS. No matching entry found.');
        }

        abortController = new AbortController();
        showLoading('Analyzing job posting...');
        loadingRotator.start('analyze', {
            intervalMs: 6000,
            stopOn: abortController.signal,
        });
        console.log('[onAnalyze] Calling server for new analysis...');
        const {
            jobId,
            companyName,
            jobAnalysis
        } = await serverComms.analyzeJobPosting(selectedText, abortController.signal);

        latestJobId = jobId;
        console.log(`[onAnalyze] Server response received. New jobId: "${jobId}"`);
        console.log('[onAnalyze] Updating cache...');

        await updateJobCache(jobId, r => {
            r.jobPostingText = jobPostingText;
            r.CompanyName = companyName;
            r.Analysis = jobAnalysis;
        });

        console.log('[onAnalyze] Cache updated successfully. Showing output.');
        await showAnalysis(jobAnalysis);

    } catch (e: any) {
        console.error('[onAnalyze] Analysis failed. Error:', e);
        showError(e?.message ?? 'Unexpected error during analysis.', ViewState.Analysis);
    } finally {
        console.log('[onAnalyze] onAnalyze finished. Stopping loading spinner.');
        loadingRotator.stop();
        abortController = null;
    }
}

async function onGenerateCoverLetter(jobId: string, isRetry = false) {
    console.log(`[onGenerateCoverLetter] Function called. isRetry: ${isRetry}. JobId: "${jobId}"`);

    abortInFlight();
    abortController = new AbortController();
    showLoading('Drafting a cover letter...');
    loadingRotator.start('cover-letter', {
        intervalMs: 6000,
        stopOn: abortController.signal,
    });

    try {
        const {jobPostingCache, resumeJsonData} = await getUserData();
        console.log(`[onGenerateCoverLetter] Fetched user data. Looking for jobId: "${jobId}" in cache.`);

        if (!isRetry && jobPostingCache[jobId]?.CoverLetter) {
            console.log(`[onGenerateCoverLetter] CACHE HIT! Returning cached cover letter for: "${jobId}"`);
            const cachedLetter = jobPostingCache[jobId].CoverLetter;
            await showCoverLetter(cachedLetter.filename, cachedLetter.content);
            return cachedLetter;
        }

        console.log(`[onGenerateCoverLetter] CACHE MISS. Calling server for new cover letter for: "${jobId}"`);
        const {content} = await serverComms.generateCoverLetter(jobId, abortController.signal);

        const companyName = jobPostingCache[jobId]?.CompanyName || 'UnknownCompany';
        const filename = `${resumeJsonData.personal.full_name}_cover_letter_${companyName}.txt`;
        console.log(`[onGenerateCoverLetter] Server response received. Filename: "${filename}"`);

        console.log('[onGenerateCoverLetter] Awaiting cache update...');
        await updateJobCache(jobId, r => {
            r.CoverLetter = {filename, content};
        });

        console.log('[onGenerateCoverLetter] Cache updated successfully. Showing cover letter.');
        await showCoverLetter(filename, content);
        return {filename, content};
    } catch (e: any) {
        console.error('[onGenerateCoverLetter] Failed to draft cover letter. Error:', e);
        showError(e?.message ?? 'Failed to draft a cover letter.', ViewState.CoverLetter);
    } finally {
        console.log('[onGenerateCoverLetter] Finished. Stopping loading spinner.');
        loadingRotator.stop();
        abortController = null;
    }
}

async function onTailorResume(jobId: string, isRetry = false) {
    console.log(`[onTailorResume] Function called. isRetry: ${isRetry}. JobId: "${jobId}"`);

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
            jobPostingCache
        } = await getUserData();
        console.log(`[onTailorResume] Fetched user data. Looking for jobId: "${jobId}" in cache.`);


        if (!isRetry && jobPostingCache[jobId]?.TailoredResume) {
            console.log(`[onTailorResume] CACHE HIT! Returning cached tailored resume for: "${jobId}"`);
            const {filename, pdfArrayBufferInBase64} = jobPostingCache[jobId].TailoredResume;
            const pdfBuffer = base64ToArrayBuffer(pdfArrayBufferInBase64);
            await showResumePreview(filename, pdfBuffer);
            return {filename, pdfBuffer};
        }

        console.log(`[onTailorResume] CACHE MISS. Calling server for new tailored resume for: "${jobId}"`);
        const companyName = jobPostingCache[jobId]?.CompanyName || 'UnknownCompany';
        const filename = `${
            resumeJsonData.personal.full_name.toLowerCase().replace(/\s+/g, '_')
        }_resume_${
            companyName.toLowerCase().replace(/\s+/g, '_')
        }.pdf`;

        const {pdfBuffer} = await serverComms.tailorResume(jobId, filename, abortController.signal);
        console.log(`[onTailorResume] Server response received for filename: "${filename}"`);

        console.log('[onTailorResume] Awaiting cache update...');
        await updateJobCache(jobId, r => {
            const pdfArrayBufferInBase64 = arrayBufferToBase64(pdfBuffer);
            r.TailoredResume = {filename, pdfArrayBufferInBase64};
        });

        console.log('[onTailorResume] Cache updated successfully. Showing resume preview.');
        await showResumePreview(filename, pdfBuffer);
        return {filename, pdfBuffer};
    } catch (e: any) {
        console.error('[onTailorResume] Failed to tailor resume. Error:', e);
        showError(e?.message ?? 'Failed to tailor resume.', ViewState.ResumePreview);
    } finally {
        console.log('[onTailorResume] Finished. Stopping loading spinner.');
        loadingRotator.stop();
        abortController = null;
    }
}

async function retryAction(jobId: string = null) {
    let jobIdToRetry = null
    if (jobId) {
        jobIdToRetry = jobId;
    } else {
        if (latestJobId) {
            jobIdToRetry = latestJobId;
        } else {
            return;
        }
    }

    switch (stateMachine.value) {
        case ViewState.Analysis:
            const {jobPostingCache} = await getUserData();
            await onAnalyze(jobPostingCache[jobIdToRetry].jobPostingText, true);
            break;
        case ViewState.CoverLetter:
            await onGenerateCoverLetter(jobIdToRetry, true);
            break;
        case ViewState.ResumePreview:
            await onTailorResume(jobIdToRetry, true);
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
                await showAnalysis(rec.Analysis!, true);
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
    console.log("sidepanel.ts: Adding global event listeners.");
    els.backBtn.addEventListener('click', () => goBack());

    els.retryBtn.addEventListener('click', () => {
        retryAction()
    })

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

    if (isFirefox()) {
        els.shortcutInstructions.innerHTML = els.shortcutInstructions.innerHTML.replace(
            '+B', '+Y'
        ).replace(
            '+B', '+Y'
        ).replace(
            'Chrome extension', 'Firefox add-On'
        )
    }
}

async function showInstructions(isBack: boolean = false) {
    console.log("sidepanel.ts: Showing instructions.");
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

    const linkedInBaseUrl = 'https://www.linkedin.com/jobs/search/?f_TPR=r86400&keywords=';
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

console.log("sidepanel.ts: Setting up runtime message listener.");
browser.runtime.onMessage.addListener((message, sender) => {
    // Log every message that comes into this listener.
    console.log("sidepanel.ts: Message received!", {message, sender});

    // Check if the incoming message is of the correct type.
    if (message.type === 'selected-text' && message.text) {
        console.log("sidepanel.ts: Received 'selected-text' message. Starting analysis...");

        // Call the asynchronous analysis function.
        // Note: The listener will continue to execute while onAnalyze is running.
        onAnalyze(message.text).then(() => {
            console.log("sidepanel.ts: onAnalyze completed successfully.");
            // You can optionally return true here to signal to the sender that
            // you are handling the message asynchronously.
        }).catch((error) => {
            // Log any errors that occur during analysis.
            console.error('sidepanel.ts: Error analyzing text:', error);
            // Re-throw the error to ensure it's propagated.
            throw error;
        });
    } else {
        // Log if the message type is not what we expect.
        console.log("sidepanel.ts: Message type is not 'selected-text'. Ignoring.");
    }
});


// Execute the initial setup functions.
addGlobalEventListeners();
showInstructions();


console.log("sidepanel.ts: Attempting to send 'side-panel-ready' message.");
browser.runtime.sendMessage({type: 'side-panel-ready'}).catch(error => {
    // Log if the message fails to send, which can happen if no one is listening yet.
    console.log('sidepanel.ts: Error sending side-panel-ready message:', error);
});