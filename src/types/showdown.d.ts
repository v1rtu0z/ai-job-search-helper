// showdown.d.ts

declare namespace showdown {
    class Converter {
        constructor(options?: any);
        makeHtml(markdown: string): string;
    }
}