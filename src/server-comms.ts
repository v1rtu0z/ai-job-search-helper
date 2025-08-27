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
async function getAuthHeadersAndBody(data: any, useModelOverride: boolean = false) {
    // Check if the JWT_TOKEN exists and is not expired
    if (!JWT_TOKEN || isTokenExpired(JWT_TOKEN)) {
        const token = await authenticate();
        if (!token) {
            throw new Error("Failed to authenticate with the server.");
        }
        JWT_TOKEN = token;
    }

    const {googleApiKey, modelName, fallbackModelName} = await getUserData();
    const body = {
        ...data,
        model_name: useModelOverride ? fallbackModelName : modelName,
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

// Generic function to make API calls with 429 fallback
async function makeApiCallWithFallback(
    endpoint: string,
    requestData: any,
    errorViewState: ViewState
): Promise<any> {
    // First try with user's preferred model
    try {
        const {headers, body} = await getAuthHeadersAndBody(requestData);
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers,
            body
        });

        if (response.status !== 429) {
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to call ${endpoint}`);
            }
            return await response.json();
        }

        // If we get 429, fall through to try fallback model
        console.log(`Got 429 with primary model, trying fallback model`);
    } catch (error: any) {
        if (!error.message?.includes('429')) {
            throw error; // Re-throw non-429 errors
        }
    }

    // Retry with fallback model
    try {
        const {headers, body} = await getAuthHeadersAndBody(requestData, true);
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers,
            body
        });

        if (response.status === 429) {
            showError(RATE_LIMIT_ERROR_MESSAGE, errorViewState);
            const errorData = await response.json();
            throw new Error(errorData.error || 'Rate limit exceeded on fallback model');
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to call ${endpoint} with fallback model`);
        }

        return await response.json();
    } catch (error: any) {
        if (error.message?.includes('Rate limit exceeded')) {
            throw error;
        }
        console.error(`Error with fallback model on ${endpoint}:`, error);
        throw error;
    }
}

export async function getResumeJson(resumeFileContent: string): Promise<{
    search_query: string,
    resume_data: any
}> {
    try {
        return await makeApiCallWithFallback('/get-resume-json', {
            resume_content: resumeFileContent
        }, ViewState.ResumePreview);
    } catch (error: any) {
        console.error('Error getting resume JSON from server:', error);
        throw error;
    }
}

export async function generateSearchQuery(): Promise<string> {
    try {
        const {resumeJsonData} = await getUserData();
        const result = await makeApiCallWithFallback('/generate-search-query', {
            resume_json_data: JSON.stringify(resumeJsonData)
        }, ViewState.Instructions);

        return result.search_query;
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

        const data = await makeApiCallWithFallback('/analyze-job-posting', {
            job_posting_text: jobPostingText,
            resume_json_data: JSON.stringify(resumeJsonData)
        }, ViewState.Analysis);

        if (signal.aborted) return;

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

        const data = await makeApiCallWithFallback('/generate-cover-letter', {
            job_posting_text: jobPostingCache[jobId].jobPostingText,
            resume_json_data: JSON.stringify(resumeJsonData)
        }, ViewState.CoverLetter);

        if (signal.aborted) return;

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
    // For resume tailoring, we need special handling since it returns a binary PDF
    try {
        if (signal.aborted) return;
        const {resumeJsonData, theme, jobPostingCache} = await getUserData();
        const {jobPostingText} = jobPostingCache[jobId];

        // First try with user's preferred model
        let response: Response;
        try {
            const {headers, body} = await getAuthHeadersAndBody({
                resume_json_data: JSON.stringify(resumeJsonData),
                job_posting_text: jobPostingText,
                filename: filename,
                theme: theme
            });

            response = await fetch(`${API_BASE_URL}/tailor-resume`, {
                method: 'POST',
                headers,
                body
            });

            if (response.status === 429) {
                console.log(`Got 429 with primary model, trying fallback model`);
                // Fall through to try fallback model
            } else {
                if (signal.aborted) return;

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to tailor resume on server.');
                }

                console.log('Resume Tailoring Response:', response);
                return {
                    pdfBuffer: await response.arrayBuffer()
                };
            }
        } catch (error: any) {
            if (!error.message?.includes('429')) {
                throw error;
            }
        }

        // Retry with fallback model if we got 429
        const {headers: fallbackHeaders, body: fallbackBody} = await getAuthHeadersAndBody({
            resume_json_data: JSON.stringify(resumeJsonData),
            job_posting_text: jobPostingText,
            filename: filename,
            theme: theme
        }, true);

        response = await fetch(`${API_BASE_URL}/tailor-resume`, {
            method: 'POST',
            headers: fallbackHeaders,
            body: fallbackBody
        });

        if (signal.aborted) return;

        if (response.status === 429) {
            showError(RATE_LIMIT_ERROR_MESSAGE, ViewState.ResumePreview);
            const errorData = await response.json();
            throw new Error(errorData.error || 'Too many requests made to the server.');
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to tailor resume on server with fallback model.');
        }

        console.log('Resume Tailoring Response (fallback):', response);
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