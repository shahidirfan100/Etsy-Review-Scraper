# Etsy Reviews Scraper

Extract comprehensive review data from any Etsy shop with ease. Collect reviewer names, ratings, comments, and purchase details at scale without being blocked. Perfect for market research, sentiment analysis, and competitor brand monitoring.

---

## Features

- **Store-Wide Coverage** — Extract reviews from any Etsy seller or individual product listing.
- **Complete Review Profiles** — Capture reviewer names, star ratings, and detailed feedback text.
- **Product Context** — Get information on the specific items being reviewed, including titles and images.
- **Historical Data** — Effortlessly handle pagination to collect all historical reviews for any shop.
- **High Reliability** — Advanced browser-based extraction ensures data accuracy even on dynamic pages.
- **Structured Data** — Download your data in clean JSON or CSV formats ready for analysis.

---

## Use Cases

### Sentiment Analysis
Understand what customers love or dislike about specific items. Identify common themes in feedback to improve product offerings or marketing messaging.

### Competitor Intelligence
Monitor your competitors' shop performance. Analyze their review frequency, average ratings, and customer satisfaction levels to find opportunities.

### Market Research
Identify trending products and customer preferences within specific niches on Etsy. Build high-quality datasets for deeper market insights.

### Brand Reputation Monitoring
Keep track of how your own brand or specific products are performing. Respond to feedback more effectively with automated data collection.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | Yes | — | The URL of the shop's review section. Example: `https://www.etsy.com/shop/SOLELYWHIMSICAL#reviews` |
| `results_wanted` | Integer | No | `20` | Maximum number of reviews to collect. Use `0` for unlimited extraction. |
| `debug` | Boolean | No | `false` | When enabled, saves additional diagnostic information if zero results are found. |
| `maxRequestRetries` | Integer | No | `3` | Maximum number of retries for individual pages if they fail to load. |
| `proxyConfiguration` | Object | No | `{ "useApifyProxy": true }` | Proxy settings. Residential proxies are recommended for best performance. |

---

## Output Data

Each review item in the dataset contains:

| Field | Type | Description |
|-------|------|-------------|
| `username` | String | The name or username of the reviewer. |
| `rating` | Number | The star rating given (1-5). |
| `comment` | String | The full text of the review comment. |
| `date` | String | The date the review was posted. |
| `item_title` | String | Title of the product that was reviewed. |
| `item_url` | String | Link to the specific product listing page. |
| `item_image` | String | URL to the product thumbnail image. |
| `scrapedAt` | String | Timestamp of when the data was extracted. |

---

## Usage Examples

### Basic Extraction
Extract the latest 20 reviews from a specific shop:

```json
{
    "startUrl": "https://www.etsy.com/shop/SolelyWhimsical#reviews"
}
```

### High-Volume Collection
Collect up to 500 reviews using residential proxies for maximum reliability:

```json
{
    "startUrl": "https://www.etsy.com/shop/SolelyWhimsical#reviews",
    "results_wanted": 500,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    }
}
```

### Broad Research
Collect all available reviews for a competitor's shop to build a complete sentiment dataset:

```json
{
    "startUrl": "https://www.etsy.com/shop/CompetitorShop#reviews",
    "results_wanted": 0
}
```

---

## Sample Output

```json
{
  "username": "Sarah Miller",
  "rating": 5,
  "comment": "Absolutely beautiful! The craftsmanship is incredible and shipping was much faster than expected. Highly recommend this seller!",
  "date": "October 15, 2023",
  "item_title": "Handmade Ceramic Mug - Desert Sky Blue",
  "item_url": "https://www.etsy.com/listing/123456789/handmade-ceramic-mug",
  "item_image": "https://i.etsystatic.com/...",
  "scrapedAt": "2024-01-20T11:45:22.123Z"
}
```

---

## Tips for Best Results

### Use Residential Proxies
Etsy has sophisticated protection mechanisms. Using residential proxies is the most reliable way to ensure consistent data collection without interruptions.

### URL Format
Always ensure your `startUrl` ends with `#reviews` (e.g., `https://www.etsy.com/shop/NAME#reviews`) to ensure the scraper lands directly on the feedback section for faster extraction.

### Start Small
When testing a new shop, set `results_wanted` to a small number (like 20) to verify the data structure before launching a large-scale collection.

---

## Integrations

Connect your review data with your favorite tools:

- **Google Sheets** — Export directly for analysis and reporting.
- **Airtable** — Build beautiful databases for sentiment tracking.
- **Webhooks** — Send data to your own API or CRM in real-time.
- **Zapier** — Trigger automated workflows based on new reviews.

### Export Formats
- **JSON** — Standard format for developers and integrations.
- **CSV** — Easy to use with Excel or other spreadsheet software.
- **XML** — For system-to-system data exchange.

---

## Frequently Asked Questions

### Can I scrape reviews from any Etsy shop?
Yes, as long as the shop has public reviews enabled, the scraper can extract them.

### Is there a limit to how many reviews I can collect?
Technically no, but we recommend monitoring your proxy usage for extremely large shops with thousands of reviews.

### Does it handle different languages?
Yes, the scraper extracts text as it appears on the page, supporting all languages available on Etsy.

---

## Support
For issues or feature requests, please contact support through the Apify Console.

### Resources
- [Apify Platform Documentation](https://docs.apify.com/)
- [Etsy Scraper Support Guide](https://docs.apify.com/platform/actors)

---

## Legal Notice
This actor is designed for legitimate data research and monitoring. Users are responsible for complying with Etsy's terms of service and applicable local laws regarding data collection. Use data responsibly and respect website rate limits.
