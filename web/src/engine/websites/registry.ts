import * as websites from './_index';

/**
 * Central registry of all production website scraper constructors.
 *
 * This keeps plugin discovery in one place without changing the current
 * synchronous loading behavior.
 */
export const WebsiteRegistry = Object.freeze(
    Object.values(websites)
);
