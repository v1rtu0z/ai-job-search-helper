import {getUserData} from "./storage";
import {els} from "./dom";
import {showError, ViewState} from "./state";

declare var process: {
    env: {
        API_BASE_URL: string;
        EXTENSION_SECRET_KEY: string;
    };
};

const API_BASE_URL: string = process.env.API_BASE_URL;
const EXTENSION_SECRET_KEY: string = process.env.EXTENSION_SECRET_KEY;

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
    const token = await authenticate();
    if (!token) {
        throw new Error("Failed to authenticate with the server.");
    }
    const {googleApiKey} = await getUserData();
    const body = {
        ...data,
        gemini_api_key: googleApiKey || null
    };

    return {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    };
}

export async function getResumeJson(resumeFileContent: string, additionalDetails: string): Promise<{
    search_query: string,
    resume_data: any
}> {
    const {headers, body} = await getAuthHeadersAndBody({
        resume_content: resumeFileContent,
        additional_details: additionalDetails
    });

    try {
        const response = await fetch(`${API_BASE_URL}/get-resume-json`, {
            method: 'POST',
            headers,
            body
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to get resume JSON from server.');
        }

        return await response.json();
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
    const {resumeJsonData} = await getUserData();
    const {headers, body} = await getAuthHeadersAndBody({
        job_posting_text: jobPostingText,
        resume_json_data: JSON.stringify(resumeJsonData)
    });

    try {
        if (signal.aborted) return;

        const response = await fetch(`${API_BASE_URL}/analyze-job-posting`, {
            method: 'POST',
            headers,
            body
        });

        if (signal.aborted) return;

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to analyze job posting from server.');
        }

        const data = await response.json();
        return {
            jobId: data.job_id,
            companyName: data.company_name,
            jobAnalysis: data.job_analysis,
        };
    } catch (error: any) {
        console.error('Error processing selected text:', error);
        const errorMessage = `### Analysis Failed
An error occurred while analyzing the job posting. This could be due to an invalid API key, network issues, or a problem with the Gemini service.
Please check your API key and network connection, then try again.`;
        showError(errorMessage, ViewState.Analysis);
        throw error;
    }
}

export async function generateCoverLetter(jobId: string, signal: AbortSignal): Promise<{
    content: string
}> {
    const {resumeJsonData, jobPostingCache} = await getUserData();
    const {headers, body} = await getAuthHeadersAndBody({
        job_posting_text: jobPostingCache[jobId].jobPostingText,
        resume_json_data: JSON.stringify(resumeJsonData)
    });

    try {
        if (signal.aborted) return;

        const response = await fetch(`${API_BASE_URL}/generate-cover-letter`, {
            method: 'POST',
            headers,
            body
        });

        if (signal.aborted) return;

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate cover letter from server.');
        }

        const data = await response.json();
        return {
            content: data.content
        };
    } catch (error: any) {
        console.error('Error drafting a cover letter:', error);
        const errorMessage = `### Cover letter generation Failed
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
    const {resumeJsonData, theme, resumeDesignYaml, resumeLocalYaml, jobPostingCache} = await getUserData();
    const {jobPostingText} = jobPostingCache[jobId];

    const {headers, body} = await getAuthHeadersAndBody({
        resume_json_data: JSON.stringify(resumeJsonData),
        job_posting_text: jobPostingText,
        filename: filename,
        theme: theme,
        design_yaml_string: resumeDesignYaml,
        locale_yaml_string: resumeLocalYaml,
    });

    try {
        if (signal.aborted) return;

        const response = await fetch(`${API_BASE_URL}/tailor-resume`, {
            method: 'POST',
            headers,
            body
        });

        if (signal.aborted) return;

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to tailor resume on server.');
        }

        const pdfBuffer = await response.arrayBuffer();

        return {
            pdfBuffer
        };
    } catch (error: any) {
        console.error('Error tailoring resume:', error);
        const errorMessage = `### Resume Tailoring Failed`
        showError(errorMessage, ViewState.ResumePreview);
        throw error;
    }
}