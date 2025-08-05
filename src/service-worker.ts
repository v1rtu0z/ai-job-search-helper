// Define types for context menu data and tab information
interface ContextMenuData extends chrome.contextMenus.OnClickData {
    selectionText?: string;
}

interface Tab extends chrome.tabs.Tab {}

// Function to set up the context menu item
function setupContextMenu(): void {
    // Remove all existing context menus first to ensure a clean slate
    // This is good practice when you want to control all menu items your extension creates.
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'analyze-job-posting', // REQUIRED: Must have an ID for Manifest V3 Service Workers
            title: 'Analyze Job Posting Fit', // This will be the only option visible
            contexts: ['selection'] // Appears when text is selected
        });
        // Removed: 'tailor-resume' and 'draft-cover-letter' context menu creations
    });
}

// Listener for when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
    setupContextMenu();
    // Set the side panel to open when the extension's action icon is clicked
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error('Error setting side panel behavior:', error));
});

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener(async (data: ContextMenuData, tab?: Tab) => {
    if (!tab || !tab.id || !data.selectionText) {
        console.warn('No active tab or selected text for context menu action.');
        return;
    }

    const selectedText = data.selectionText;

    // Store the last selected text in session storage (for side panel to pick up)
    await chrome.storage.session.set({ lastSelectedText: selectedText });

    // Since 'analyze-job-posting' is the only context menu item created by this extension,
    // we can assume this is the action being taken.
    // No need for 'if (data.menuItemId === 'analyze-job-posting')' check here.
    console.log('User clicked to analyze selected text:', selectedText);

    try {
        // Step 1: Get the selection's bounding rectangle from the content script
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    return {
                        left: rect.left + window.scrollX,
                        top: rect.top + window.scrollY,
                        width: rect.width,
                        height: rect.height
                    };
                }
                return null;
            },
        });

        const selectionRect = results[0]?.result;

        // Step 2: Inject the content script that will manage the tooltip UI
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['js/content_script.js'] // Ensure this content script is loaded
        });

        // Step 3: Send a message to the content script to display the tooltip
        chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_TOOLTIP_WINDOW',
            payload: 'Great job!',
            selectedText: selectedText,
            selectionRect: selectionRect // Pass the coordinates
        });

    } catch (error) {
        console.error('Failed to inject content script or send message:', error);
    }

    // Optionally, clear any previous analysis result from storage
    await chrome.storage.session.remove('lastAnalysisResult');
});

// Message listener for requests from content scripts (if needed)
chrome.runtime.onMessage.addListener((message: { type: string }, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message.type === 'REQUEST_LAST_SELECTED_TEXT') {
        chrome.storage.session.get('lastSelectedText', ({ lastSelectedText }) => {
            sendResponse({ text: lastSelectedText });
        });
        return true;
    }
    return false; // Important: Return false if not sending an async response
});
