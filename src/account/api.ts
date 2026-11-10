// Addresses of the BlackBoard server: it answers under api/ next to the page (server/).

export const apiUrl = (path: string) => new URL(`api/${path}`, document.baseURI).href;
