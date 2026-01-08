declare module 'node-fetch' {
  const fetch: any;
  export default fetch;
}

declare module 'puppeteer' {
  export type Browser = any;
  export type BrowserContext = any;
  export type Page = any;
  const puppeteer: any;
  export default puppeteer;
}

declare module 'string-width' {
  export default function stringWidth(input: string): number;
}
