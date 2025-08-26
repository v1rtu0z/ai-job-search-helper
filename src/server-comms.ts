import {getUserData} from "./storage";
import {els} from "./dom";
import {showError, ViewState} from "./state";
import {jwtDecode} from 'jwt-decode';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const EXTENSION_SECRET_KEY = import.meta.env.VITE_EXTENSION_SECRET_KEY;

let JWT_TOKEN: string | null = null;

const RATE_LIMIT_ERROR_MESSAGE = `Rate Limit Exceeded
It looks like you've used the service a lot in a short amount of time! To help with the costs of cloud compute and AI APIs, we've set usage limits.

Please consider supporting the project to help us increase these limits.
Thank you for your understanding!`;

/**
 * Authenticates with the server to get a temporary JWT token.
 * This token is used to authorize later requests.
 * @returns {Promise<string | null>} The JWT token or null if authentication fails.
 */
async function authenticate(): Promise<string | null> {
    try {
        const response = await fetch(`${API_BASE_URL}/authenticate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({client_secret: EXTENSION_SECRET_KEY})
        });

        if (response.status === 429) {
            // Show the rate limit message directly
            showError(RATE_LIMIT_ERROR_MESSAGE, ViewState.Instructions);
            return null;
        }

        if (!response.ok) {
            console.error(`Authentication failed with status: ${response.status}`);
            return null;
        }

        const data = await response.json();
        return data.token;

    } catch (error) {
        console.error("Error during authentication:", error);
        return null;
    }
}

// Helper to get the auth token and user's API key
async function getAuthHeadersAndBody(data: any) {
    // Check if the JWT_TOKEN exists and is not expired
    if (!JWT_TOKEN || isTokenExpired(JWT_TOKEN)) {
        const token = await authenticate();
        if (!token) {
            throw new Error("Failed to authenticate with the server.");
        }
        JWT_TOKEN = token;
    }

    const {googleApiKey, modelName} = await getUserData();
    const body = {
        ...data,
        model_name: modelName || '',
        gemini_api_key: googleApiKey || ''
    };

    return {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${JWT_TOKEN}`
        },
        body: JSON.stringify(body)
    };
}

// Helper function to check if a JWT token is expired
function isTokenExpired(token: string): boolean {
    if (!token) return true;
    try {
        const {exp} = jwtDecode(token);
        // The exp field is a Unix timestamp (in seconds)
        const currentTime = Date.now() / 1000;
        return exp < currentTime;
    } catch (error) {
        console.error("Error decoding token:", error);
        return true;
    }
}

export async function getResumeJson(resumeFileContent: string): Promise<{
    search_query: string,
    resume_data: any
}> {
    const {headers, body} = await getAuthHeadersAndBody({
        resume_content: resumeFileContent
    });

    try {
        const response = await fetch(`${API_BASE_URL}/get-resume-json`, {
            method: 'POST',
            headers,
            body
        });

        if (response.status === 429) {
            showError(RATE_LIMIT_ERROR_MESSAGE, ViewState.ResumePreview);
            return;
        }

        const serverResponse = await response.json();
        if (!response.ok) {
            throw new Error(serverResponse.error || 'Failed to get resume JSON from server.');
        }

        return serverResponse;
    } catch (error: any) {
        console.error('Error getting resume JSON from server:', error);
        throw error;
    }
}

export async function generateSearchQuery(): Promise<string> {
    const {resumeJsonData} = await getUserData();
    const {headers, body} = await getAuthHeadersAndBody({
        resume_json_data: JSON.stringify(resumeJsonData)
    });

    try {
        const response = await fetch(`${API_BASE_URL}/generate-search-query`, {
            method: 'POST',
            headers,
            body
        });

        if (response.status === 429) {
            showError(RATE_LIMIT_ERROR_MESSAGE, ViewState.Instructions);
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate search query from server.');
        }

        const data = await response.json();
        return data.search_query;
    } catch (error) {
        console.error('Error generating search query:', error);
        if (els?.instructionContent) {
            els.instructionContent.innerHTML = `
                <h3>Personalized Query</h3>
                <p><strong>Note:</strong> We couldn't generate a personalized search query. Please check your settings and try again later.</p>
            `;
        }
        throw error;
    }
}

export async function analyzeJobPosting(jobPostingText: string, signal: AbortSignal): Promise<{
    jobId: string,
    companyName: string,
    jobAnalysis: string
}> {
    try {
        if (signal.aborted) return;
        const {resumeJsonData} = await getUserData();
        const {headers, body} = await getAuthHeadersAndBody({
            job_posting_text: jobPostingText,
            resume_json_data: JSON.stringify(resumeJsonData)
        });

        const response = await fetch(`${API_BASE_URL}/analyze-job-posting`, {
            method: 'POST',
            headers,
            body
        });

        if (signal.aborted) return;

        if (response.status === 429) {
            showError(RATE_LIMIT_ERROR_MESSAGE, ViewState.Analysis);
            const errorData = await response.json();
            throw new Error(errorData.error || 'Too many requests made to the server.');
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to analyze job posting from server.');
        }

        const data = await response.json();
        console.log('Job Analysis Response:', data);
        return {
            jobId: data.job_id,
            companyName: data.company_name,
            jobAnalysis: data.job_analysis,
        };
    } catch (error: any) {
        console.error('Error processing selected text:', error);
        const errorMessage = `Analysis Failed
An error occurred while analyzing the job posting. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
        showError(errorMessage, ViewState.Analysis);
        throw error;
    }
}

export async function generateCoverLetter(jobId: string, signal: AbortSignal): Promise<{
    content: string
}> {
    try {
        if (signal.aborted) return;
        const {resumeJsonData, jobPostingCache} = await getUserData();
        const {headers, body} = await getAuthHeadersAndBody({
            job_posting_text: jobPostingCache[jobId].jobPostingText,
            resume_json_data: JSON.stringify(resumeJsonData)
        });

        const response = await fetch(`${API_BASE_URL}/generate-cover-letter`, {
            method: 'POST',
            headers,
            body
        });

        if (signal.aborted) return;

        if (response.status === 429) {
            showError(RATE_LIMIT_ERROR_MESSAGE, ViewState.CoverLetter);
            const errorData = await response.json();
            throw new Error(errorData.error || 'Too many requests made to the server.');
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate cover letter from server.');
        }

        const data = await response.json();
        console.log('Cover Letter Response:', data);
        return {
            content: data.content
        };
    } catch (error: any) {
        console.error('Error drafting a cover letter:', error);
        const errorMessage = `Cover letter generation Failed
An error occurred while drafting a cover letter. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
        showError(errorMessage, ViewState.CoverLetter);
        throw error;
    }
}

export async function tailorResume(
    jobId: string,
    filename: string,
    signal: AbortSignal
): Promise<{
    pdfBuffer: ArrayBuffer
}> {
    try {
        if (signal.aborted) return;
        const {resumeJsonData, theme, jobPostingCache} = await getUserData();
        const {jobPostingText} = jobPostingCache[jobId];

        const {headers, body} = await getAuthHeadersAndBody({
            resume_json_data: JSON.stringify(resumeJsonData),
            job_posting_text: jobPostingText,
            filename: filename,
            theme: theme
        });

        const response = await fetch(`${API_BASE_URL}/tailor-resume`, {
            method: 'POST',
            headers,
            body
        });

        if (signal.aborted) return;

        if (response.status === 429) {
            showError(RATE_LIMIT_ERROR_MESSAGE, ViewState.ResumePreview);
            const errorData = await response.json();
            throw new Error(errorData.error || 'Too many requests made to the server.');
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to tailor resume on server.');
        }

        console.log('Resume Tailoring Response:', response);

        return {
            pdfBuffer: await response.arrayBuffer()
        };
    } catch (error: any) {
        console.error('Error tailoring resume:', error);
        const errorMessage = `Resume Tailoring Failed`
        showError(errorMessage, ViewState.ResumePreview);
        throw error;
    }
}