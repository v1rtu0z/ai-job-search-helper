// Define types for context menu data and tab information
interface ContextMenuData extends chrome.contextMenus.OnClickData {
    selectionText?: string;
}

interface Tab extends chrome.tabs.Tab {}

// Function to set up the context menu item
function setupContextMenu(): void {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'analyze-job-posting',
            title: 'Analyze Job Posting Fit',
            contexts: ['selection']
        });
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
chrome.contextMenus.onClicked.addListener((data: ContextMenuData, tab?: Tab) => {
    if (!tab || !tab.id || !data.selectionText) {
        console.warn('No active tab or selected text for context menu action.');
        return;
    }

    const selectedText = data.selectionText;
    const tabId = tab.id;

    // Open the side panel for the current tab.
    chrome.sidePanel.open({ tabId: tabId });

    // Try to send the message synchronously
    chrome.runtime.sendMessage({
        type: 'selected-text',
        text: selectedText
    }).catch(error => {
        // If the message fails, it means the side panel is not open yet.
        console.warn('Side panel not active yet, adding a listener for its readiness:', error);

        // Create a temporary listener for the 'side-panel-ready' message.
        const messageListener = (message: any, sender: chrome.runtime.MessageSender) => {
            if (message.type === 'side-panel-ready') {
                console.log('Side panel is ready, sending selected text.');

                // Once ready, send the message.
                chrome.runtime.sendMessage({
                    type: 'selected-text',
                    text: selectedText
                }).catch(error => console.error('Error sending message:', error));

                // Remove this temporary listener to prevent memory leaks.
                chrome.runtime.onMessage.removeListener(messageListener);

                // Return true to keep the message channel open.
                return true;
            }
            return false;
        };

        // Add the listener.
        chrome.runtime.onMessage.addListener(messageListener);
    });
});