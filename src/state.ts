export enum ViewState {
    Instructions = 'instructions',
    Analysis = 'analysis',
    CoverLetter = 'cover-letter',
    ResumePreview = 'resume-preview',
}

export interface ViewStateWithJob {
    state: ViewState;
    jobId?: string;
}

export class StateMachine {
    private current: ViewStateWithJob = {state: ViewState.Instructions};
    private history: ViewStateWithJob[] = [];

    get value() {
        return this.current.state;
    }

    get currentJobId() {
        return this.current.jobId;
    }

    set(newState: ViewState, isBack = false, jobId?: string) {
        const newStateWithJob = {state: newState, jobId};
        if (this.current.state === newState && this.current.jobId === jobId) return;
        if (!isBack) this.history.push(this.current);
        this.current = newStateWithJob;
    }

    back(): ViewStateWithJob | undefined {
        const prev = this.history.pop();
        if (prev) this.current = prev;
        return prev;
    }
}

export const stateMachine = new StateMachine();
