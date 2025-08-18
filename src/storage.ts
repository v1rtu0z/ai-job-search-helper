export type JobPostingCacheRecord = {
    jobPostingText: string;
    CompanyName: string | null;
    Analysis: string | null;
    CoverLetter: { filename: string; content: string } | null;
    TailoredResume: { filename: string; pdfArrayBufferInBase64: string } | null;
};

export interface UserRelevantData {
    googleApiKey?: string;
    resumeJsonData?: any;
    resumeFileName?: string;
    resumeFileContent?: string; // todo: this could be a local variable
    linkedinSearchQuery?: string;
    resumeDesignYaml: string;
    resumeLocalYaml: string;
    theme: string; // todo: this could be read from the design yaml
    modelName: string;
    currentThemeIndex: number;
    jobPostingCache: Record<string, JobPostingCacheRecord>;
    resumesDownloaded: number;
}

export async function getUserData(): Promise<UserRelevantData> {
    const {userRelevantData} = await chrome.storage.local.get('userRelevantData');
    return userRelevantData ?? {
        modelName: 'gemini-2.0-flash',
        theme: 'engineeringclassic',
        currentThemeIndex: 3,
        resumesDownloaded: 0,
        resumeDesignYaml: await fetch('default_design.yaml').then(r => r.text()),
        resumeLocalYaml: await fetch('default_locale.yaml').then(r => r.text()),
        jobPostingCache: {}
    };
}

export async function saveUserData(data: UserRelevantData) {
    await chrome.storage.local.set({userRelevantData: data});
}

export async function updateJobCache(jobId: string, updater: (r: JobPostingCacheRecord) => void) {
    const data = await getUserData();
    if (!data.jobPostingCache[jobId]) {
        data.jobPostingCache[jobId] = {
            jobPostingText: null,
            CompanyName: null,
            Analysis: null,
            CoverLetter: null,
            TailoredResume: null,
        };
    }
    updater(data.jobPostingCache[jobId]);
    await saveUserData(data);
    return data;
}
