/**
 * Etsy Reviews Scraper - High Stealth Review Scraper
 * Uses PlaywrightCrawler with Camoufox
 */

import { PlaywrightCrawler } from '@crawlee/playwright';
import { Actor, log } from 'apify';
import { launchOptions as camoufoxLaunchOptions } from 'camoufox-js';
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
 * Helpers for review extraction from multiple sources
 */
function normalizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function parseRatingValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value >= 1 && value <= 5) return Math.round(value);
        return null;
    }
    if (typeof value === 'string') {
        const match = value.match(/(\d+(\.\d+)?)/);
        if (!match) return null;
        const num = parseFloat(match[1]);
        if (num >= 1 && num <= 5) return Math.round(num);
    }
    return null;
}

function parseDateValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
        const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : null;
        if (ms) return new Date(ms).toISOString();
    }
    if (value instanceof Date) return value.toISOString();
    return normalizeText(value);
}

function getFirstValue(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
            return obj[key];
        }
    }
    const lowerKeyMap = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
    for (const key of keys) {
        const actual = lowerKeyMap.get(key.toLowerCase());
        if (actual && obj[actual] !== undefined) return obj[actual];
    }
    return null;
}

function normalizeReview(raw, sourceUrl) {
    if (!raw || typeof raw !== 'object') return null;

    const userObj = getFirstValue(raw, ['user', 'buyer', 'reviewer', 'author', 'member', 'profile']);
    const listingObj = getFirstValue(raw, ['listing', 'item', 'product']);

    const username = normalizeText(
        getFirstValue(raw, ['user_name', 'username', 'reviewer', 'reviewer_name', 'buyer_name', 'author', 'name'])
            || getFirstValue(userObj, ['name', 'username', 'login', 'user_name', 'display_name'])
    );

    const rating = parseRatingValue(
        getFirstValue(raw, ['rating', 'stars', 'star_rating', 'review_rating', 'reviewRating', 'rating_value', 'score'])
    );

    const comment = normalizeText(
        getFirstValue(raw, ['review', 'review_text', 'reviewText', 'comment', 'feedback', 'message', 'text', 'body', 'content'])
    );

    const dateText = parseDateValue(
        getFirstValue(raw, ['date', 'created_at', 'createdAt', 'created', 'review_date', 'timestamp', 'time'])
    );

    const item_title = normalizeText(
        getFirstValue(raw, ['listing_title', 'item_title', 'title', 'product_title'])
            || getFirstValue(listingObj, ['title', 'name', 'listing_title'])
    );

    let item_url = normalizeText(
        getFirstValue(raw, ['listing_url', 'item_url', 'url', 'link'])
            || getFirstValue(listingObj, ['url', 'link', 'listing_url'])
    );
    if (item_url && item_url.startsWith('/')) {
        item_url = `https://www.etsy.com${item_url}`;
    }

    const item_image = normalizeText(
        getFirstValue(raw, ['listing_image', 'item_image', 'image_url', 'image', 'img', 'imageUrl'])
            || getFirstValue(listingObj, ['image', 'image_url', 'imageUrl'])
    );

    const review_id = normalizeText(
        getFirstValue(raw, ['review_id', 'reviewId', 'id', 'transaction_id', 'transactionId'])
    );

    if (!comment && rating === null) return null;

    return {
        username: username || 'Anonymous',
        rating,
        comment,
        date: dateText,
        item_title,
        item_url,
        item_image,
        review_id,
        scrapedAt: new Date().toISOString(),
        source: sourceUrl || 'unknown'
    };
}

function hasPotentialReviewFields(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const keys = Object.keys(obj).map((k) => k.toLowerCase());
    return keys.some((k) => k.includes('review') || k.includes('rating') || k.includes('comment') || k.includes('feedback'));
}

function extractReviewsFromAny(payload, sourceUrl) {
    const results = [];
    const visited = new Set();
    const stack = [payload];

    while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;
        if (visited.has(node)) continue;
        visited.add(node);

        if (Array.isArray(node)) {
            for (const item of node) {
                if (item && typeof item === 'object') {
                    const review = normalizeReview(item, sourceUrl);
                    if (review) results.push(review);
                }
                stack.push(item);
            }
            continue;
        }

        if (hasPotentialReviewFields(node)) {
            const review = normalizeReview(node, sourceUrl);
            if (review) results.push(review);
        }

        for (const value of Object.values(node)) {
            stack.push(value);
        }
    }

    return results;
}

function findNextPageUrls(payload) {
    const urls = new Set();
    const visited = new Set();
    const stack = [payload];
    const urlRegex = /^https?:\/\//i;

    while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;
        if (visited.has(node)) continue;
        visited.add(node);

        if (Array.isArray(node)) {
            for (const item of node) stack.push(item);
            continue;
        }

        for (const [key, value] of Object.entries(node)) {
            if (typeof value === 'string') {
                if (urlRegex.test(value) && (value.includes('page=') || value.includes('offset=') || value.includes('cursor='))) {
                    urls.add(value);
                }
                if (key.toLowerCase().includes('next') && urlRegex.test(value)) {
                    urls.add(value);
                }
            } else {
                stack.push(value);
            }
        }
    }

    return Array.from(urls);
}

function isLikelyReviewResponse(url, contentType) {
    const needle = /review|reviews|feedback|rating|testimonial/i;
    return needle.test(url) || needle.test(contentType || '');
}

function extractReviewsFromJsonLd(html) {
    const $ = cheerio.load(html);
    const reviews = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        const raw = $(el).contents().text().trim();
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            reviews.push(...extractReviewsFromAny(parsed, 'jsonld'));
        } catch (err) {
            log.debug(`JSON-LD parse failed: ${err.message}`);
        }
    });
    return reviews;
}

function extractReviewsFromNextData(html) {
    const $ = cheerio.load(html);
    const raw = $('#__NEXT_DATA__').text().trim();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return extractReviewsFromAny(parsed, 'next_data');
    } catch (err) {
        log.debug(`__NEXT_DATA__ parse failed: ${err.message}`);
        return [];
    }
}

function extractReviewsFromHtml(html) {
    const $ = cheerio.load(html);
    const reviews = [];
    const selectors = [
        '[data-review-id]',
        '[data-review-region]',
        'article[data-review]',
        'li[data-review]',
        'div[data-reviews-container] div.wt-grid__item-xs-12',
        '.wt-grid__item-xs-12 .wt-mb-xs-4'
    ];

    const reviewElements = $(selectors.join(','));
    if (reviewElements.length === 0) {
        log.warning('No review elements found with primary selectors.');
        return [];
    }

    reviewElements.each((_, element) => {
        const review = extractReviewFromElement($, $(element));
        if (review) reviews.push(review);
    });

    return reviews;
}

function detectBlockReason(html) {
    const text = html.toLowerCase();
    if (text.includes('captcha') || text.includes('verify')) return 'captcha';
    if (text.includes('access blocked') || text.includes('access denied') || text.includes('forbidden')) return 'blocked';
    if (text.includes('unusual activity') || text.includes('unusual traffic') || text.includes('robot')) return 'bot';
    return null;
}

function extractBlockDetails(html) {
    try {
        const $ = cheerio.load(html);
        const text = normalizeText($('body').text());
        const idMatch = text.match(/\bID:\s*([a-z0-9-]{8,})\b/i);
        const ipMatch = text.match(/\bIP\s*([0-9]{1,3}(\.[0-9]{1,3}){3})\b/i);
        return {
            requestId: idMatch?.[1] || null,
            ip: ipMatch?.[1] || null,
            snippet: text.slice(0, 800)
        };
    } catch (err) {
        return { requestId: null, ip: null, snippet: null };
    }
}

function mergeReviews(...arrays) {
    const merged = [];
    const seen = new Set();

    for (const list of arrays) {
        for (const review of list) {
            const key = review.review_id
                ? `id:${review.review_id}`
                : `sig:${review.username}-${review.comment}-${review.date}-${review.item_title}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(review);
        }
    }

    return merged;
}

function createApiResponseCollector() {
    const reviews = [];
    const nextUrls = new Set();
    const seenUrls = new Set();

    const onResponse = async (response) => {
        try {
            const url = response.url();
            if (seenUrls.has(url)) return;
            const contentType = response.headers()['content-type'] || '';
            if (!isLikelyReviewResponse(url, contentType)) return;
            if (!contentType.includes('application/json')) return;
            seenUrls.add(url);

            const payload = await response.json();
            const found = extractReviewsFromAny(payload, url);
            if (found.length) reviews.push(...found);

            const next = findNextPageUrls(payload);
            for (const nextUrl of next) nextUrls.add(nextUrl);
        } catch (err) {
            log.debug(`API response parse failed: ${err.message}`);
        }
    };

    return {
        onResponse,
        getReviews: () => reviews,
        getNextUrls: () => Array.from(nextUrls)
    };
}

async function fetchAdditionalReviewsFromApi(apiRequest, seedUrls, limit) {
    const results = [];
    const queue = [...seedUrls];
    const visited = new Set(queue);
    const maxPages = 20;

    while (queue.length && (limit === 0 || results.length < limit) && visited.size <= maxPages) {
        const url = queue.shift();
        try {
            const response = await apiRequest.get(url, { timeout: 60000 });
            if (!response.ok()) continue;
            const payload = await response.json();
            const found = extractReviewsFromAny(payload, url);
            if (found.length) results.push(...found);
            const next = findNextPageUrls(payload);
            for (const nextUrl of next) {
                if (!visited.has(nextUrl)) {
                    visited.add(nextUrl);
                    queue.push(nextUrl);
                }
            }
        } catch (err) {
            log.debug(`API pagination fetch failed: ${err.message}`);
        }
    }

    return results;
}

async function ensureReviewsSection(page) {
    try {
        const reviewsTab = page.getByRole('tab', { name: /reviews/i }).first();
        if (await reviewsTab.count()) {
            await reviewsTab.click({ timeout: 5000 });
            await page.waitForTimeout(800);
            return;
        }
    } catch (err) {
        log.debug(`Reviews tab click failed: ${err.message}`);
    }

    try {
        const reviewsLink = page.locator('a[href*="#reviews"], a[href*="reviews"]').first();
        if (await reviewsLink.count()) {
            await reviewsLink.click({ timeout: 5000 });
            await page.waitForTimeout(800);
        }
    } catch (err) {
        log.debug(`Reviews link click failed: ${err.message}`);
    }
}

async function scrollForReviews(page) {
    for (let i = 0; i < 6; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
        await page.waitForTimeout(700 + Math.random() * 900);
    }
}

/**
 * Extract individual review from DOM element
 */
function extractReviewFromElement($, $el) {
    try {
        // Reviewer Name
        const username = $el.find('p.wt-text-title-01, span.wt-text-title-01, a[href*="/people/"]').first().text().trim() || 'Anonymous';

        // Rating
        let rating = null;
        const ratingEl = $el.find('span.wt-screen-reader-only, span[aria-label*="out of 5"], span[aria-label*="star"]').first();
        if (ratingEl.length) {
            const ratingText = ratingEl.text().trim(); // e.g., "5 out of 5 stars"
            const match = ratingText.match(/(\d+)\s*out of/i);
            if (match) rating = parseInt(match[1], 10);
        }

        // Comment
        const comment = $el.find('p.wt-text-body-01.wt-break-word, p.wt-text-body-01, p[data-review-text], .review-text').first().text().trim();
        if (!comment && !rating) return null; // Skip empty skeletons

        // Date
        const dateText = $el.find('p.wt-text-caption.wt-text-gray, time, .wt-text-caption').first().text().trim();

        // Item/Product Info (optional)
        const itemLink = $el.find('a.wt-text-link-no-underline, a[href*="/listing/"]').first();
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
    const {
        startUrl,
        results_wanted = 20,
        debug = false,
        maxRequestRetries = 3,
        proxyConfiguration: proxyConfigurationInput
    } = input;

    if (!startUrl) {
        throw new Error('Missing "startUrl" in input.');
    }

    const normalizedStartUrl = startUrl.includes('#reviews')
        ? startUrl
        : `${startUrl.replace(/#.*$/, '')}#reviews`;

    log.info('Starting Etsy Reviews Scraper', {
        startUrl: normalizedStartUrl,
        results_wanted,
        debug,
        maxRequestRetries
    });

    const proxyConfiguration = await Actor.createProxyConfiguration({
        checkAccess: true,
        ...(proxyConfigurationInput || { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] })
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
        maxRequestRetries,
        useSessionPool: true,
        persistCookiesPerSession: true,
        sessionPoolOptions: {
            maxPoolSize: 5,
            sessionOptions: {
                maxUsageCount: 2,
                maxErrorScore: 1
            }
        },

        postNavigationHooks: [
            async ({ handleCloudflareChallenge }) => {
                await handleCloudflareChallenge();
            }
        ],

        browserPoolOptions: {
            useFingerprints: true,
            fingerprintOptions: {
                browsers: ['firefox'],
                devices: ['desktop']
            }
        },

        launchContext: {
            launcher: firefox,
            // Camoufox launch options for stealth
            launchOptions: await camoufoxLaunchOptions({
                headless: true,
                proxy: await proxyConfiguration.newUrl(),
                geoip: true
            })
        },

        async requestHandler({ page, request, session }) {
            pagesProcessed++;
            log.info(`Processing page ${pagesProcessed}: ${request.url}`);

            try {
                const apiCollector = createApiResponseCollector();
                page.on('response', apiCollector.onResponse);

                await page.waitForLoadState('domcontentloaded');
                await page.waitForTimeout(1500 + Math.random() * 1500);

                const earlyHtml = await page.content();
                const earlyBlockReason = detectBlockReason(earlyHtml);
                if (earlyBlockReason) {
                    const details = extractBlockDetails(earlyHtml);
                    if (debug) {
                        const screenshot = await page.screenshot({ fullPage: true });
                        await Actor.setValue(`DEBUG_${pagesProcessed}_early.png`, screenshot, { contentType: 'image/png' });
                        await Actor.setValue(`DEBUG_${pagesProcessed}_early.html`, earlyHtml, { contentType: 'text/html' });
                    }
                    await Actor.setValue(`BLOCKED_${pagesProcessed}.json`, {
                        stage: 'early',
                        url: request.url,
                        reason: earlyBlockReason,
                        ...details,
                        timestamp: new Date().toISOString()
                    });
                    session?.retire();
                    throw new Error(`Blocked early: ${earlyBlockReason}`);
                }

                // Wait for page to settle and simulate human behavior
                await page.waitForTimeout(3000 + Math.random() * 2000);
                await ensureReviewsSection(page);
                await simulateHumanBehavior(page);
                await scrollForReviews(page);

                // Wait for reviews container to appear
                try {
                    await page.waitForSelector('[data-review-id], [data-reviews-container]', { timeout: 15000 });
                } catch (e) {
                    log.warning('Timed out waiting for reviews content, proceeding with current state.');
                }

                await page.waitForTimeout(2000);
                page.off('response', apiCollector.onResponse);

                const html = await page.content();
                const apiReviews = apiCollector.getReviews();
                const nextDataReviews = extractReviewsFromNextData(html);
                const jsonLdReviews = extractReviewsFromJsonLd(html);
                const htmlReviews = extractReviewsFromHtml(html);

                let apiExtraReviews = [];
                const remaining = results_wanted > 0
                    ? Math.max(0, results_wanted - totalReviewsScraped - apiReviews.length)
                    : 0;
                if (apiCollector.getNextUrls().length > 0 && (results_wanted === 0 || remaining > 0)) {
                    apiExtraReviews = await fetchAdditionalReviewsFromApi(
                        page.context().request,
                        apiCollector.getNextUrls(),
                        remaining
                    );
                }

                const reviews = mergeReviews(apiReviews, apiExtraReviews, nextDataReviews, jsonLdReviews, htmlReviews);

                log.info('Review extraction summary', {
                    api: apiReviews.length,
                    apiExtra: apiExtraReviews.length,
                    nextData: nextDataReviews.length,
                    jsonLd: jsonLdReviews.length,
                    html: htmlReviews.length,
                    total: reviews.length
                });

                if (reviews.length === 0) {
                    const blockReason = detectBlockReason(html);
                    log.warning(`No reviews extracted from this page.${blockReason ? ` Reason: ${blockReason}` : ''}`);
                    if (debug) {
                        const screenshot = await page.screenshot({ fullPage: true });
                        await Actor.setValue(`DEBUG_${pagesProcessed}.png`, screenshot, { contentType: 'image/png' });
                        await Actor.setValue(`DEBUG_${pagesProcessed}.html`, html, { contentType: 'text/html' });
                    }
                    if (blockReason) {
                        const details = extractBlockDetails(html);
                        await Actor.setValue(`BLOCKED_${pagesProcessed}.json`, {
                            stage: 'post-extract',
                            url: request.url,
                            reason: blockReason,
                            ...details,
                            timestamp: new Date().toISOString()
                        });
                        session?.retire();
                        throw new Error(`Blocked: ${blockReason}`);
                    }
                }

                // Deduplicate and filter
                const uniqueReviews = reviews.filter(review => {
                    const key = review.review_id
                        ? `id:${review.review_id}`
                        : `sig:${review.username}-${review.comment}-${review.date}-${review.item_title}`;
                    if (seenReviews.has(key)) return false;
                    seenReviews.add(key);
                    return true;
                });

                // Push data
                const sliceSize = results_wanted > 0
                    ? Math.max(0, results_wanted - totalReviewsScraped)
                    : uniqueReviews.length;

                const reviewsToPush = uniqueReviews.slice(0, sliceSize).map(({ review_id, source, ...rest }) => rest);

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

        async failedRequestHandler({ request, session }, error) {
            session?.retire();
            log.error(`Request ${request.url} failed: ${error.message}`);
        }
    });

    log.info('Starting crawler...');
    await crawler.run([normalizedStartUrl]);

    const duration = Math.round((Date.now() - startTime) / 1000);
    const statistics = {
        totalReviewsScraped,
        pagesProcessed,
        duration: `${duration} seconds`,
    };

    await Actor.setValue('statistics', statistics);
    log.info('Scraping completed!', statistics);

} catch (error) {
    log.exception(error, 'Scraper failed');
    throw error;
}

await Actor.exit();
