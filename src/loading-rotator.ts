type LoadingKind = 'analyze' | 'cover-letter' | 'resume';

export class LoadingMessageRotator {
    private timerId: number | null = null;
    private idx = 0;
    private nodes: HTMLElement[] = [];
    private container: HTMLElement | null = null;
    private isFadingOut = false; // Add a state to prevent race conditions

    public start(kind: LoadingKind, options?: {
        intervalMs?: number;
        stopOn?: AbortSignal;
    }) {
        this.stop();

        this.container = document.getElementById('loading-messages');
        if (!this.container) return;

        const candidates = Array.from(
            this.container.querySelectorAll<HTMLElement>('.loading-msg')
        ).filter(el => this.hasKind(el, kind));

        if (!candidates.length) {
            this.container.classList.add('hidden');
            return;
        }

        this.nodes = [...candidates].sort(() => Math.random() - 0.5);

        this.container.classList.remove('hidden');
        this.nodes.forEach(n => {
            n.classList.add('hidden');
            n.classList.remove('visible');
        });

        this.idx = 0;
        const firstNode = this.nodes[this.idx];
        firstNode.classList.remove('hidden');
        // Use a small delay to ensure the DOM is ready for the transition.
        setTimeout(() => firstNode.classList.add('visible'), 10);

        const intervalMs = options?.intervalMs ?? 6000;

        // This is the core of the rotation logic.
        this.timerId = window.setInterval(() => {
            if (this.isFadingOut) return; // Prevent new rotations while one is in progress

            this.isFadingOut = true;
            const currentNode = this.nodes[this.idx];
            currentNode.classList.remove('visible'); // Start fade-out

            // Listen for the CSS transition to end. This is key!
            const onTransitionEnd = () => {
                currentNode.classList.add('hidden');
                currentNode.removeEventListener('transitionend', onTransitionEnd);

                this.idx = (this.idx + 1) % this.nodes.length;
                const nextNode = this.nodes[this.idx];
                nextNode.classList.remove('hidden');

                // Small delay before applying fade-in to ensure classes are processed correctly
                setTimeout(() => {
                    nextNode.classList.add('visible'); // Start fade-in
                    this.isFadingOut = false;
                }, 10);
            };

            currentNode.addEventListener('transitionend', onTransitionEnd, {once: true});

        }, intervalMs);

        options?.stopOn?.addEventListener('abort', () => this.stop(), {once: true});
    }

    public stop() {
        if (this.timerId !== null) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        if (this.container) {
            const all = this.container.querySelectorAll<HTMLElement>('.loading-msg');
            all.forEach(n => {
                n.classList.remove('visible');
                n.classList.add('hidden');
            });
            this.container.classList.add('hidden');
        }
        this.nodes = [];
        this.idx = 0;
        this.container = null;
    }

    private hasKind(el: HTMLElement, kind: LoadingKind): boolean {
        const kinds = (el.getAttribute('data-kinds') || '').split(/\s+/).filter(Boolean);
        return kinds.includes(kind);
    }
}

export const loadingRotator = new LoadingMessageRotator();
