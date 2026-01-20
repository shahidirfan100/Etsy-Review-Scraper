"""
Etsy Reviews Scraper - High Stealth Review Scraper for Etsy Shops
Uses PlaywrightCrawler with Camoufox for anti-bot evasion
"""

import asyncio
import json
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urlparse

from apify import Actor
from camoufox import AsyncNewBrowser
from bs4 import BeautifulSoup
from crawlee.browsers import BrowserPool, PlaywrightBrowserController, PlaywrightBrowserPlugin
from crawlee.crawlers import PlaywrightCrawler, PlaywrightCrawlingContext
from typing_extensions import override


class CamoufoxPlugin(PlaywrightBrowserPlugin):
    """Browser plugin that uses Camoufox Browser for stealth browsing."""

    @override
    async def new_browser(self) -> PlaywrightBrowserController:
        if not self._playwright:
            raise RuntimeError('Playwright browser plugin is not initialized.')

        return PlaywrightBrowserController(
            browser=await AsyncNewBrowser(self._playwright, headless=True),
            max_open_pages_per_browser=1,
            header_generator=None,  # Camoufox handles headers
        )


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def normalize_text(value: Any) -> str:
    """Normalize and clean text values."""
    if value is None:
        return ''
    return str(value).strip()


def parse_rating_value(value: Any) -> Optional[int]:
    """Parse and validate rating values (1-5 scale)."""
    if value is None:
        return None
    
    if isinstance(value, (int, float)) and 1 <= value <= 5:
        return round(value)
    
    if isinstance(value, str):
        match = re.search(r'(\d+(?:\.\d+)?)', value)
        if match:
            num = float(match.group(1))
            if 1 <= num <= 5:
                return round(num)
    
    return None


def parse_date_value(value: Any) -> str:
    """Parse and format date values."""
    if value is None:
        return ''
    
    if isinstance(value, (int, float)):
        # Handle timestamp (seconds or milliseconds)
        ms = value * 1000 if value < 1e12 else value
        try:
            return datetime.fromtimestamp(ms / 1000).isoformat()
        except (ValueError, OSError):
            return ''
    
    return normalize_text(value)


def get_first_value(obj: Dict, keys: List[str]) -> Any:
    """Get first available value from object by key priority."""
    if not isinstance(obj, dict):
        return None
    
    # Try exact matches first
    for key in keys:
        if key in obj and obj[key] is not None:
            return obj[key]
    
    # Try case-insensitive matches
    lower_key_map = {k.lower(): k for k in obj.keys()}
    for key in keys:
        actual_key = lower_key_map.get(key.lower())
        if actual_key and obj[actual_key] is not None:
            return obj[actual_key]
    
    return None


def normalize_review(raw: Dict, source_url: str = '') -> Optional[Dict]:
    """Normalize a raw review object to standard format."""
    if not isinstance(raw, dict):
        return None
    
    user_obj = get_first_value(raw, ['user', 'buyer', 'reviewer', 'author', 'member', 'profile'])
    listing_obj = get_first_value(raw, ['listing', 'item', 'product'])
    
    username = normalize_text(
        get_first_value(raw, ['user_name', 'username', 'reviewer', 'reviewer_name', 'buyer_name', 'author', 'name'])
        or (get_first_value(user_obj, ['name', 'username', 'login', 'user_name', 'display_name']) if isinstance(user_obj, dict) else None)
    )
    
    rating = parse_rating_value(
        get_first_value(raw, ['rating', 'stars', 'star_rating', 'review_rating', 'reviewRating', 'rating_value', 'score'])
    )
    
    comment = normalize_text(
        get_first_value(raw, ['review', 'review_text', 'reviewText', 'comment', 'feedback', 'message', 'text', 'body', 'content'])
    )
    
    date_text = parse_date_value(
        get_first_value(raw, ['date', 'created_at', 'createdAt', 'created', 'review_date', 'timestamp', 'time'])
    )
    
    item_title = normalize_text(
        get_first_value(raw, ['listing_title', 'item_title', 'title', 'product_title'])
        or (get_first_value(listing_obj, ['title', 'name', 'listing_title']) if isinstance(listing_obj, dict) else None)
    )
    
    item_url = normalize_text(
        get_first_value(raw, ['listing_url', 'item_url', 'url', 'link'])
        or (get_first_value(listing_obj, ['url', 'link', 'listing_url']) if isinstance(listing_obj, dict) else None)
    )
    
    if item_url and item_url.startswith('/'):
        item_url = f'https://www.etsy.com{item_url}'
    
    item_image = normalize_text(
        get_first_value(raw, ['listing_image', 'item_image', 'image_url', 'image', 'img', 'imageUrl'])
        or (get_first_value(listing_obj, ['image', 'image_url', 'imageUrl']) if isinstance(listing_obj, dict) else None)
    )
    
    review_id = normalize_text(
        get_first_value(raw, ['review_id', 'reviewId', 'id', 'transaction_id', 'transactionId'])
    )
    
    # Skip empty reviews
    if not comment and rating is None:
        return None
    
    return {
        'username': username or 'Anonymous',
        'rating': rating,
        'comment': comment,
        'date': date_text,
        'item_title': item_title,
        'item_url': item_url,
        'item_image': item_image,
        'review_id': review_id,
        'scrapedAt': datetime.utcnow().isoformat(),
        'source': source_url or 'unknown'
    }


def has_potential_review_fields(obj: Any) -> bool:
    """Check if object might contain review data."""
    if not isinstance(obj, dict):
        return False
    
    keys = [k.lower() for k in obj.keys()]
    return any(
        k.find(field) >= 0 for k in keys 
        for field in ['review', 'rating', 'comment', 'feedback']
    )


def extract_reviews_from_any(payload: Any, source_url: str = '') -> List[Dict]:
    """Recursively extract reviews from any JSON structure."""
    results = []
    visited = set()
    stack = [payload]
    
    while stack:
        node = stack.pop()
        if not isinstance(node, (dict, list)):
            continue
        
        node_id = id(node)
        if node_id in visited:
            continue
        visited.add(node_id)
        
        if isinstance(node, list):
            for item in node:
                if isinstance(item, dict):
                    review = normalize_review(item, source_url)
                    if review:
                        results.append(review)
                stack.append(item)
            continue
        
        if has_potential_review_fields(node):
            review = normalize_review(node, source_url)
            if review:
                results.append(review)
        
        for value in node.values():
            stack.append(value)
    
    return results


def find_next_page_urls(payload: Any) -> List[str]:
    """Extract pagination URLs from JSON payload."""
    urls: Set[str] = set()
    visited: Set[int] = set()
    stack = [payload]
    url_regex = re.compile(r'^https?://', re.IGNORECASE)
    
    while stack:
        node = stack.pop()
        if not isinstance(node, (dict, list)):
            continue
        
        node_id = id(node)
        if node_id in visited:
            continue
        visited.add(node_id)
        
        if isinstance(node, list):
            for item in node:
                stack.append(item)
            continue
        
        for key, value in node.items():
            if isinstance(value, str):
                if url_regex.match(value) and any(p in value for p in ['page=', 'offset=', 'cursor=']):
                    urls.add(value)
                if 'next' in key.lower() and url_regex.match(value):
                    urls.add(value)
            else:
                stack.append(value)
    
    return list(urls)


def is_likely_review_response(url: str, content_type: str = '') -> bool:
    """Check if URL/response looks like review data."""
    pattern = re.compile(r'review|reviews|feedback|rating|testimonial', re.IGNORECASE)
    return pattern.search(url) or pattern.search(content_type)


def extract_reviews_from_jsonld(html: str) -> List[Dict]:
    """Extract reviews from JSON-LD structured data."""
    results = []
    soup = BeautifulSoup(html, 'html.parser')
    
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string)
            results.extend(extract_reviews_from_any(data, 'jsonld'))
        except (json.JSONDecodeError, TypeError):
            Actor.log.debug('Failed to parse JSON-LD')
    
    return results


def extract_reviews_from_next_data(html: str) -> List[Dict]:
    """Extract reviews from Next.js __NEXT_DATA__ object."""
    soup = BeautifulSoup(html, 'html.parser')
    element = soup.find('script', {'id': '__NEXT_DATA__'})
    
    if not element or not element.string:
        return []
    
    try:
        data = json.loads(element.string)
        return extract_reviews_from_any(data, 'next_data')
    except (json.JSONDecodeError, TypeError):
        Actor.log.debug('Failed to parse __NEXT_DATA__')
        return []


def extract_review_from_element(element_html: str) -> Optional[Dict]:
    """Extract review data from a single DOM element."""
    try:
        soup = BeautifulSoup(element_html, 'html.parser')
        
        # Reviewer Name
        name_el = soup.select_one('p.wt-text-title-01, span.wt-text-title-01, a[href*="/people/"]')
        username = normalize_text(name_el.get_text()) if name_el else 'Anonymous'
        
        # Rating
        rating = None
        rating_el = soup.select_one('span.wt-screen-reader-only, span[aria-label*="out of 5"], span[aria-label*="star"]')
        if rating_el:
            match = re.search(r'(\d+)\s*out of', rating_el.get_text(), re.IGNORECASE)
            if match:
                rating = int(match.group(1))
        
        # Comment
        comment_el = soup.select_one('p.wt-text-body-01.wt-break-word, p.wt-text-body-01, p[data-review-text], .review-text')
        comment = normalize_text(comment_el.get_text()) if comment_el else ''
        
        if not comment and not rating:
            return None
        
        # Date
        date_el = soup.select_one('p.wt-text-caption.wt-text-gray, time, .wt-text-caption')
        date_text = normalize_text(date_el.get_text()) if date_el else ''
        
        # Item Info
        item_link = soup.select_one('a.wt-text-link-no-underline, a[href*="/listing/"]')
        item_title = ''
        item_url = ''
        
        if item_link:
            item_title = normalize_text(item_link.select_one('p.wt-text-caption').get_text()) if item_link.select_one('p.wt-text-caption') else ''
            item_url = item_link.get('href', '')
            if item_url and not item_url.startswith('http'):
                item_url = f'https://www.etsy.com{item_url}'
        
        # Image
        img_el = soup.find('img')
        item_image = img_el.get('src', '') if img_el else ''
        
        return {
            'username': username,
            'rating': rating,
            'comment': comment,
            'date': date_text,
            'item_title': item_title,
            'item_url': item_url,
            'item_image': item_image,
            'scrapedAt': datetime.utcnow().isoformat()
        }
    except Exception as e:
        Actor.log.debug(f'Failed to parse review element: {str(e)}')
        return None


def extract_reviews_from_html(html: str) -> List[Dict]:
    """Extract reviews from HTML DOM."""
    results = []
    soup = BeautifulSoup(html, 'html.parser')
    
    selectors = [
        '[data-review-id]',
        '[data-review-region]',
        'article[data-review]',
        'li[data-review]',
        'div[data-reviews-container] div.wt-grid__item-xs-12',
        '.wt-grid__item-xs-12 .wt-mb-xs-4'
    ]
    
    elements = soup.select(','.join(selectors))
    if not elements:
        Actor.log.warning('No review elements found with primary selectors.')
        return []
    
    for element in elements:
        review = extract_review_from_element(str(element))
        if review:
            results.append(review)
    
    return results


def detect_block_reason(html: str) -> Optional[str]:
    """Detect if page is blocked/captcha."""
    text = html.lower()
    if 'captcha' in text or 'verify' in text:
        return 'captcha'
    if any(term in text for term in ['access blocked', 'access denied', 'forbidden']):
        return 'blocked'
    if any(term in text for term in ['unusual activity', 'unusual traffic', 'robot']):
        return 'bot'
    return None


def extract_block_details(html: str) -> Dict:
    """Extract details about block reason."""
    try:
        soup = BeautifulSoup(html, 'html.parser')
        text = normalize_text(soup.get_text())
        
        id_match = re.search(r'\bID:\s*([a-z0-9-]{8,})\b', text, re.IGNORECASE)
        ip_match = re.search(r'\bIP\s*([0-9]{1,3}(?:\.[0-9]{1,3}){3})\b', text, re.IGNORECASE)
        
        return {
            'requestId': id_match.group(1) if id_match else None,
            'ip': ip_match.group(1) if ip_match else None,
            'snippet': text[:800]
        }
    except Exception:
        return {'requestId': None, 'ip': None, 'snippet': None}


def merge_reviews(*arrays: List[Dict]) -> List[Dict]:
    """Merge multiple review lists, removing duplicates."""
    merged = []
    seen: Set[str] = set()
    
    for review_list in arrays:
        for review in review_list:
            if review.get('review_id'):
                key = f"id:{review['review_id']}"
            else:
                key = f"sig:{review.get('username', '')}-{review.get('comment', '')}-{review.get('date', '')}-{review.get('item_title', '')}"
            
            if key not in seen:
                seen.add(key)
                merged.append(review)
    
    return merged


async def simulate_human_behavior(page) -> None:
    """Simulate human browsing patterns."""
    try:
        # Wait randomly
        await asyncio.sleep(1 + (time.time() % 2))
        
        # Scroll
        scroll_amount = 300 + int(time.time() % 500)
        await page.evaluate(f'window.scrollBy(0, {scroll_amount})')
        await asyncio.sleep(0.5 + (time.time() % 1))
        
        # Mouse movements
        viewport = await page.evaluate('({width: window.innerWidth, height: window.innerHeight})')
        if viewport:
            for _ in range(2 + int(time.time() % 3)):
                x = 100 + (time.time() % (viewport['width'] - 200))
                y = 100 + (time.time() % (viewport['height'] - 200))
                await page.mouse.move(int(x), int(y))
                await asyncio.sleep(0.05 + (time.time() % 0.15))
    except Exception as e:
        Actor.log.debug(f'Human behavior simulation failed: {str(e)}')


async def ensure_reviews_section(page) -> None:
    """Navigate to reviews section if needed."""
    try:
        reviews_tab = page.get_by_role('tab', name=re.compile(r'reviews', re.IGNORECASE)).first
        if await reviews_tab.count():
            await reviews_tab.click(timeout=5000)
            await asyncio.sleep(0.8)
            return
    except Exception as e:
        Actor.log.debug(f'Reviews tab click failed: {str(e)}')
    
    try:
        reviews_link = page.locator('a[href*="#reviews"], a[href*="reviews"]').first
        if await reviews_link.count():
            await reviews_link.click(timeout=5000)
            await asyncio.sleep(0.8)
    except Exception as e:
        Actor.log.debug(f'Reviews link click failed: {str(e)}')


async def scroll_for_reviews(page) -> None:
    """Scroll to load more reviews."""
    for _ in range(6):
        await page.evaluate('window.scrollBy(0, window.innerHeight * 0.8)')
        await asyncio.sleep(0.7 + (time.time() % 0.9))


class ApiResponseCollector:
    """Collect reviews from API responses."""
    
    def __init__(self):
        self.reviews: List[Dict] = []
        self.next_urls: Set[str] = set()
        self.seen_urls: Set[str] = set()
    
    async def on_response(self, response) -> None:
        """Handle API responses."""
        try:
            url = response.url
            if url in self.seen_urls:
                return
            
            content_type = response.headers.get('content-type', '')
            if not is_likely_review_response(url, content_type):
                return
            if 'application/json' not in content_type:
                return
            
            self.seen_urls.add(url)
            payload = await response.json()
            found = extract_reviews_from_any(payload, url)
            if found:
                self.reviews.extend(found)
            
            next_urls = find_next_page_urls(payload)
            for next_url in next_urls:
                self.next_urls.add(next_url)
        except Exception as e:
            Actor.log.debug(f'API response parse failed: {str(e)}')


async def fetch_additional_reviews_from_api(page, seed_urls: List[str], limit: int) -> List[Dict]:
    """Fetch additional reviews from API pagination."""
    results = []
    queue = list(seed_urls)
    visited = set(queue)
    max_pages = 20
    
    while queue and (limit == 0 or len(results) < limit) and len(visited) <= max_pages:
        url = queue.pop(0)
        try:
            response = await page.context.request.get(url, timeout=60000)
            if not response.ok:
                continue
            
            payload = await response.json()
            found = extract_reviews_from_any(payload, url)
            if found:
                results.extend(found)
            
            next_urls = find_next_page_urls(payload)
            for next_url in next_urls:
                if next_url not in visited:
                    visited.add(next_url)
                    queue.append(next_url)
        except Exception as e:
            Actor.log.debug(f'API pagination fetch failed: {str(e)}')
    
    return results


async def main() -> None:
    """Main Actor execution."""
    async with Actor:
        # Get input
        actor_input = await Actor.get_input() or {}
        start_url = actor_input.get('startUrl')
        results_wanted = actor_input.get('results_wanted', 20)
        debug = actor_input.get('debug', False)
        max_request_retries = actor_input.get('maxRequestRetries', 3)
        proxy_config_input = actor_input.get('proxyConfiguration')
        
        if not start_url:
            raise ValueError('Missing "startUrl" in input.')
        
        # Normalize URL to include reviews section
        if '#reviews' not in start_url:
            start_url = f"{start_url.split('#')[0]}#reviews"
        
        Actor.log.info('Starting Etsy Reviews Scraper', {
            'startUrl': start_url,
            'results_wanted': results_wanted,
            'debug': debug,
            'maxRequestRetries': max_request_retries
        })
        
        # Setup proxy
        proxy_config = await Actor.create_proxy_configuration(
            check_access=True,
            **(proxy_config_input or {'useApifyProxy': True, 'apifyProxyGroups': ['RESIDENTIAL']})
        )
        
        # Initialize counters
        total_reviews_scraped = 0
        pages_processed = 0
        start_time = time.time()
        seen_reviews: Set[str] = set()
        
        # Create crawler
        crawler = PlaywrightCrawler(
            proxy_configuration=proxy_config,
            max_concurrency=1,
            navigation_timeout_secs=120,
            request_handler_timeout_secs=300,
            max_request_retries=max_request_retries,
            max_requests_per_crawl=None,
            browser_pool=BrowserPool(plugins=[CamoufoxPlugin()]),
        )
        
        @crawler.router.default_handler
        async def request_handler(context: PlaywrightCrawlingContext) -> None:
            nonlocal total_reviews_scraped, pages_processed, seen_reviews
            
            pages_processed += 1
            page = context.page
            request = context.request
            
            Actor.log.info(f'Processing page {pages_processed}: {request.url}')
            
            try:
                collector = ApiResponseCollector()
                page.on('response', collector.on_response)
                
                await page.wait_for_load_state('domcontentloaded')
                await asyncio.sleep(1.5 + (time.time() % 1.5))
                
                # Check early block
                early_html = await page.content()
                early_block = detect_block_reason(early_html)
                
                if early_block:
                    details = extract_block_details(early_html)
                    if debug:
                        screenshot = await page.screenshot(full_page=True)
                        await Actor.set_value(f'DEBUG_{pages_processed}_early.png', screenshot, content_type='image/png')
                        await Actor.set_value(f'DEBUG_{pages_processed}_early.html', early_html, content_type='text/html')
                    
                    await Actor.set_value(f'BLOCKED_{pages_processed}.json', json.dumps({
                        'stage': 'early',
                        'url': request.url,
                        'reason': early_block,
                        **details,
                        'timestamp': datetime.utcnow().isoformat()
                    }))
                    raise Exception(f'Blocked early: {early_block}')
                
                # Simulate human behavior
                await asyncio.sleep(3 + (time.time() % 2))
                await ensure_reviews_section(page)
                await simulate_human_behavior(page)
                await scroll_for_reviews(page)
                
                # Wait for reviews
                try:
                    await page.wait_for_selector('[data-review-id], [data-reviews-container]', timeout=15000)
                except Exception:
                    Actor.log.warning('Timed out waiting for reviews content.')
                
                await asyncio.sleep(2)
                page.remove_listener('response', collector.on_response)
                
                # Extract reviews
                html = await page.content()
                api_reviews = collector.reviews
                next_data_reviews = extract_reviews_from_next_data(html)
                jsonld_reviews = extract_reviews_from_jsonld(html)
                html_reviews = extract_reviews_from_html(html)
                
                # Fetch extra reviews if needed
                api_extra_reviews = []
                if collector.next_urls and (results_wanted == 0 or total_reviews_scraped + len(api_reviews) < results_wanted):
                    remaining = max(0, results_wanted - total_reviews_scraped - len(api_reviews)) if results_wanted > 0 else 0
                    api_extra_reviews = await fetch_additional_reviews_from_api(page, list(collector.next_urls), remaining)
                
                # Merge all reviews
                reviews = merge_reviews(api_reviews, api_extra_reviews, next_data_reviews, jsonld_reviews, html_reviews)
                
                Actor.log.info('Review extraction summary', {
                    'api': len(api_reviews),
                    'apiExtra': len(api_extra_reviews),
                    'nextData': len(next_data_reviews),
                    'jsonLd': len(jsonld_reviews),
                    'html': len(html_reviews),
                    'total': len(reviews)
                })
                
                if not reviews:
                    block_reason = detect_block_reason(html)
                    msg = f'No reviews extracted.{f" Reason: {block_reason}" if block_reason else ""}'
                    Actor.log.warning(msg)
                    
                    if debug:
                        screenshot = await page.screenshot(full_page=True)
                        await Actor.set_value(f'DEBUG_{pages_processed}.png', screenshot, content_type='image/png')
                        await Actor.set_value(f'DEBUG_{pages_processed}.html', html, content_type='text/html')
                    
                    if block_reason:
                        details = extract_block_details(html)
                        await Actor.set_value(f'BLOCKED_{pages_processed}.json', json.dumps({
                            'stage': 'post-extract',
                            'url': request.url,
                            'reason': block_reason,
                            **details,
                            'timestamp': datetime.utcnow().isoformat()
                        }))
                        raise Exception(f'Blocked: {block_reason}')
                
                # Deduplicate
                unique_reviews = []
                for review in reviews:
                    review_id = review.get('review_id')
                    key = f"id:{review_id}" if review_id else f"sig:{review.get('username', '')}-{review.get('comment', '')}-{review.get('date', '')}-{review.get('item_title', '')}"
                    
                    if key not in seen_reviews:
                        seen_reviews.add(key)
                        unique_reviews.append(review)
                
                # Push data
                slice_size = max(0, results_wanted - total_reviews_scraped) if results_wanted > 0 else len(unique_reviews)
                reviews_to_push = unique_reviews[:slice_size]
                
                for review in reviews_to_push:
                    # Remove internal fields
                    review.pop('review_id', None)
                    review.pop('source', None)
                
                if reviews_to_push:
                    for review in reviews_to_push:
                        await context.push_data(review)
                    total_reviews_scraped += len(reviews_to_push)
                    Actor.log.info(f'Saved {len(reviews_to_push)} new reviews. Total: {total_reviews_scraped}')
                
                # Check if limit reached
                if results_wanted > 0 and total_reviews_scraped >= results_wanted:
                    Actor.log.info(f'Reached goal: {results_wanted} reviews.')
                    return
                
                # Find pagination
                next_page_url = await page.evaluate('''() => {
                    const nextButton = document.querySelector('nav[aria-label="Pagination"] a:last-child');
                    if (nextButton && !nextButton.classList.contains('wt-is-disabled') && nextButton.getAttribute('aria-label')?.includes('Next')) {
                        return nextButton.href;
                    }
                    const alternatives = Array.from(document.querySelectorAll('a[href*="page="]'));
                    const nextLink = alternatives.find(a => a.innerText.includes('Next') || a.getAttribute('aria-label')?.includes('Next'));
                    return nextLink ? nextLink.href : null;
                }''')
                
                if next_page_url and (results_wanted == 0 or total_reviews_scraped < results_wanted):
                    Actor.log.info(f'Enqueuing next page: {next_page_url}')
                    await crawler.add_requests([next_page_url])
                else:
                    Actor.log.info('No more pages to process.')
            
            except Exception as e:
                Actor.log.error(f'Error processing {request.url}: {str(e)}')
                raise
        
        Actor.log.info('Starting crawler...')
        await crawler.run([start_url])
        
        # Save statistics
        duration = int(time.time() - start_time)
        statistics = {
            'totalReviewsScraped': total_reviews_scraped,
            'pagesProcessed': pages_processed,
            'duration': f'{duration} seconds'
        }
        
        await Actor.set_value('statistics', json.dumps(statistics))
        Actor.log.info('Scraping completed!', statistics)


if __name__ == '__main__':
    asyncio.run(main())
