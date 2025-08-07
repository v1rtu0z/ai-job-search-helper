// TODO: Make use of this when showing user:
//  1. which good/bad sides there are for a job
//  2. a cover letter preview

// Get references to the HTML elements
const fileInput = document.getElementById('markdown-file') as HTMLInputElement;
const previewDiv = document.getElementById('preview') as HTMLDivElement;

// Initialize the Showdown converter
const converter = new showdown.Converter();

/**
 * Reads the content of a local file and returns it as a string.
 * @param file The File object from the input element.
 * @returns A Promise that resolves with the file's content as a string.
 */
function readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target && typeof event.target.result === 'string') {
                resolve(event.target.result);
            } else {
                reject(new Error('Failed to read file content.'));
            }
        };
        reader.onerror = () => reject(new Error('Error reading file.'));
        reader.readAsText(file);
    });
}

/**
 * Renders the markdown content into the preview div.
 * @param markdown The raw markdown string to render.
 */
function renderMarkdown(markdown: string) {
    const html = converter.makeHtml(markdown);
    previewDiv.innerHTML = html;
}

// Add an event listener to the file input to handle file selection
fileInput.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];

    if (file) {
        try {
            // Show a loading message
            previewDiv.innerHTML = '<p>Loading file...</p>';

            // Read the content of the selected file
            const markdownContent = await readFileContent(file);

            // Render the markdown content
            renderMarkdown(markdownContent);
        } catch (error) {
            console.error('Error processing file:', error);
            previewDiv.innerHTML = `<p style="color: red;">Error: Failed to process the file. Please try again.</p>`;
        }
    }
});