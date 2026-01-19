/**
 * Etsy Reviews Scraper - High Stealth Review Scraper
 * Uses PlaywrightCrawler with Camoufox
 */

import { PlaywrightCrawler } from '@crawlee/playwright';
import { Actor, log } from 'apify';
import { launchOptions } from 'camoufox-js';
import { firefox } from 'playwright';
import * as cheerio from 'cheerio';

// Initialize the Apify SDK
await Actor.init();

/**
 * Simulate human browsing behavior
 */
async function simulateHumanBehavior(page) {
    try {
        await page.waitForTimeout(1000 + Math.random() * 2000);

        const scrollAmount = 300 + Math.floor(Math.random() * 500);
        await page.evaluate((amount) => {
            window.scrollBy({ top: amount, behavior: 'smooth' });
        }, scrollAmount);

        await page.waitForTimeout(500 + Math.random() * 1000);

        const viewport = page.viewportSize();
        if (viewport) {
            for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
                const x = 100 + Math.random() * (viewport.width - 200);
                const y = 100 + Math.random() * (viewport.height - 200);
                await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 10) });
                await page.waitForTimeout(50 + Math.random() * 150);
            }
        }
    } catch (error) {
        log.debug(`Human behavior simulation failed: ${error.message}`);
    }
}

/**
 * Extract reviews from the page via HTML parsing
 */
async function extractReviewData(page) {
    log.info('Extracting review data via HTML parsing');

    try {
        const html = await page.content();
        const $ = cheerio.load(html);
        const reviews = [];

        // Updated selectors for Etsy reviews (Walthari Design System)
        const reviewContainerSelector = 'div[data-reviews-container] div.wt-grid__item-xs-12';
        const reviewElements = $(reviewContainerSelector);

        if (reviewElements.length === 0) {
            log.warning('No review elements found with primary selector, trying fallback...');
            // Fallback for different layouts
            const fallbackElements = $('.wt-grid__item-xs-12 .wt-mb-xs-4');
            if (fallbackElements.length > 0) {
                fallbackElements.each((_, element) => {
                    const review = extractReviewFromElement($, $(element));
                    if (review) reviews.push(review);
                });
            }
        } else {
            log.info(`Found ${reviewElements.length} review elements`);
            reviewElements.each((_, element) => {
                const review = extractReviewFromElement($, $(element));
                if (review) reviews.push(review);
            });
        }

        log.info(`Extracted ${reviews.length} reviews from this page`);
        return reviews;

    } catch (error) {
        log.warning(`HTML parsing failed: ${error.message}`);
        return [];
    }
}

/**
 * Extract individual review from DOM element
 */
function extractReviewFromElement($, $el) {
    try {
        // Reviewer Name
        const username = $el.find('p.wt-text-title-01').first().text().trim() || 'Anonymous';

        // Rating
        let rating = null;
        const ratingEl = $el.find('span.wt-screen-reader-only').first();
        if (ratingEl.length) {
            const ratingText = ratingEl.text().trim(); // e.g., "5 out of 5 stars"
            const match = ratingText.match(/(\d+)\s*out of/i);
            if (match) rating = parseInt(match[1], 10);
        }

        // Comment
        const comment = $el.find('p.wt-text-body-01.wt-break-word').first().text().trim();
        if (!comment && !rating) return null; // Skip empty skeletons

        // Date
        const dateText = $el.find('p.wt-text-caption.wt-text-gray').first().text().trim();
        
        // Item/Product Info (optional)
        const itemLink = $el.find('a.wt-text-link-no-underline').first();
        const item_title = itemLink.find('p.wt-text-caption').text().trim();
        let item_url = itemLink.attr('href') || '';
        if (item_url && !item_url.startsWith('http')) {
            item_url = `https://www.etsy.com${item_url}`;
        }
        
        const item_image = $el.find('img').attr('src') || '';

        return {
            username,
            rating,
            comment,
            date: dateText,
            item_title,
            item_url,
            item_image,
            scrapedAt: new Date().toISOString()
        };
    } catch (err) {
        log.debug(`Failed to parse review element: ${err.message}`);
        return null;
    }
}

// ============================================================================
// MAIN ACTOR EXECUTION
// ============================================================================

try {
    const input = await Actor.getInput() || {};
    const { startUrl, results_wanted = 20 } = input;

    log.info('Starting Etsy Reviews Scraper', {
        startUrl,
        results_wanted,
    });

    if (!startUrl) {
        throw new Error('Missing "startUrl" in input.');
    }

    // Residential proxy configuration
    const proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ['RESIDENTIAL'],
    });

    let totalReviewsScraped = 0;
    let pagesProcessed = 0;
    const startTime = Date.now();
    const seenReviews = new Set();

    const crawler = new PlaywrightCrawler({
        proxyConfiguration,
        maxConcurrency: 1, // Keep it low for stealth
        navigationTimeoutSecs: 120,
        requestHandlerTimeoutSecs: 300,
        maxRequestRetries: 5,

        postNavigationHooks: [
            async ({ handleCloudflareChallenge }) => {
                await handleCloudflareChallenge();
            }
        ],

        launchContext: {
            launcher: firefox,
            launchOptions: await launchOptions({
                headless: true,
            }),
        },

        async requestHandler({ page, request }) {
            pagesProcessed++;
            log.info(`Processing page ${pagesProcessed}: ${request.url}`);

            try {
                // Wait for page to settle and simulate human behavior
                await page.waitForTimeout(3000 + Math.random() * 2000);
                await simulateHumanBehavior(page);

                // Wait for reviews container to appear
                try {
                    await page.waitForSelector('div[data-reviews-container]', { timeout: 15000 });
                } catch (e) {
                    log.warning('Timed out waiting for reviews container, proceeding with current state.');
                }

                // Extract reviews
                const reviews = await extractReviewData(page);

                if (reviews.length === 0) {
                    log.warning('No reviews extracted from this page.');
                }

                // Deduplicate and filter
                const uniqueReviews = reviews.filter(review => {
                    const key = `${review.username}-${review.comment}-${review.date}`;
                    if (seenReviews.has(key)) return false;
                    seenReviews.add(key);
                    return true;
                });

                // Push data
                const sliceSize = results_wanted > 0 
                    ? Math.max(0, results_wanted - totalReviewsScraped) 
                    : uniqueReviews.length;
                    
                const reviewsToPush = uniqueReviews.slice(0, sliceSize);

                if (reviewsToPush.length > 0) {
                    await Actor.pushData(reviewsToPush);
                    totalReviewsScraped += reviewsToPush.length;
                    log.info(`Saved ${reviewsToPush.length} new reviews. Total: ${totalReviewsScraped}`);
                }

                // Check limit
                if (results_wanted > 0 && totalReviewsScraped >= results_wanted) {
                    log.info(`Reached goal: ${results_wanted} reviews.`);
                    return;
                }

                // PAGINATION
                const nextPageUrl = await page.evaluate(() => {
                    const nextButton = document.querySelector('nav[aria-label="Pagination"] a:last-child');
                    if (nextButton && !nextButton.classList.contains('wt-is-disabled') && nextButton.getAttribute('aria-label')?.includes('Next')) {
                        return nextButton.href;
                    }
                    // Try alternative pagination link
                    const alternatives = Array.from(document.querySelectorAll('a[href*="page="]'));
                    const nextLink = alternatives.find(a => a.innerText.includes('Next') || a.getAttribute('aria-label')?.includes('Next'));
                    return nextLink ? nextLink.href : null;
                });

                if (nextPageUrl && (results_wanted === 0 || totalReviewsScraped < results_wanted)) {
                    log.info(`Enqueuing next page: ${nextPageUrl}`);
                    await crawler.addRequests([{ url: nextPageUrl }]);
                } else {
                    log.info('No more pages to process.');
                }

            } catch (error) {
                log.error(`Error processing ${request.url}: ${error.message}`);
                throw error;
            }
        },

        async failedRequestHandler({ request }, error) {
            log.error(`Request ${request.url} failed: ${error.message}`);
        }
    });

    log.info('Starting crawler...');
    await crawler.run([startUrl]);

    const duration = Math.round((Date.now() - startTime) / 1000);
    const statistics = {
        totalReviewsScraped,
        pagesProcessed,
        duration: `${duration} seconds`,
    };

    await Actor.setValue('statistics', statistics);
    log.info('✓ Scraping completed!', statistics);

} catch (error) {
    log.exception(error, 'Scraper failed');
    throw error;
}

await Actor.exit();
