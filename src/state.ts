import {hideAll, setHTML, toggle} from "./view";
import {els} from "./dom";

export enum ViewState {
  Instructions = 'instructions',
  Analysis = 'analysis',
  CoverLetter = 'cover-letter',
  ResumePreview = 'resume-preview',
}

export class StateMachine {
  private current: ViewState = ViewState.Instructions;
  private history: ViewState[] = [];

  get value() { return this.current; }
  get stack() { return [...this.history]; }

  set(newState: ViewState, isBack = false) {
    console.log('Current state (before state setting): ', this.current);
    if (this.current === newState) return;
    if (!isBack) this.history.push(this.current);
    this.current = newState;
    console.log('Current state (after state setting): ', this.current);
  }

  back(): ViewState | undefined {
    return this.history.pop();
  }
}

export const stateMachine = new StateMachine();

export function showError(errorMessage: string, state: ViewState, isBack = false) {
    hideAll();
    els.analysisContent.textContent = errorMessage;
    toggle(els.outputSection, true);
    toggle(els.analysisContent, true);
    toggle(els.retryBtn, true);
    toggle(els.backBtn, true);
    toggle(els.settingsBtn, true);
    stateMachine.set(state, isBack);
}