const DEBUG_ENABLED = import.meta.env.VITE_DEBUG_LOGGING === 'true';

export class DebugLogger {
    private prefix: string;

    constructor(prefix: string = '') {
        this.prefix = prefix ? `[${prefix}] ` : '';
    }

    log(...args: any[]) {
        if (DEBUG_ENABLED) {
            console.log(this.prefix, ...args);
        }
    }

    error(...args: any[]) {
        if (DEBUG_ENABLED) {
            console.error(this.prefix, ...args);
        }
    }

    warn(...args: any[]) {
        if (DEBUG_ENABLED) {
            console.warn(this.prefix, ...args);
        }
    }

    info(...args: any[]) {
        if (DEBUG_ENABLED) {
            console.info(this.prefix, ...args);
        }
    }

    // Always log errors in production for debugging critical issues
    criticalError(...args: any[]) {
        console.error(this.prefix, ...args);
    }
}