# Etsy Reviews Scraper

Extract comprehensive reviews from any Etsy shop with ease. Collect detailed feedback, star ratings, and product information at scale to power your market research and competitor analysis.

---

## Features

- **Multi-Source Extraction** — Gathers data from hidden APIs, JSON-LD, and HTML for maximum reliability
- **Complete Review Profiles** — Extracts username, rating, full comment, and review date
- **Product Context** — Links each review to its specific product title, URL, and image
- **Smart Navigation** — Automatically handles pagination to reach your desired result count
- **High Success Rate** — Built to handle sophisticated bot protection and ensure stable data collection
- **Clean Data Formatting** — Delivers structured data ready for analysis in JSON or CSV

---

## Use Cases

### Competitor Analysis
Track customer sentiment for competing shops. Identify what users love about their products and where their customer service falls short to improve your own offerings.

### Market Trend Monitoring
Analyze reviews across various handmade and vintage categories to spot rising trends and popular product features before they become mainstream.

### Brand Reputation Tracking
Monitor feedback for your own Etsy shop or brand partners. Set up automated runs to stay on top of new reviews and maintain high customer satisfaction.

### Sentiment Analysis
Build large datasets of verified buyer feedback to train sentiment analysis models or conduct deep-dive qualitative research into customer behavior.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | Yes | — | The URL of the Etsy shop's review section |
| `results_wanted` | Integer | No | `20` | Maximum number of reviews to collect |
| `proxyConfiguration` | Object | No | `{ "useApifyProxy": true }` | Proxy settings for reliable extraction |
| `debug` | Boolean | No | `false` | Enable to save screenshots and HTML for troubleshooting |

---

## Output Data

Each review in the dataset contains the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `username` | String | Name of the reviewer |
| `rating` | Number | Star rating (1-5) |
| `comment` | String | Full text of the review |
| `date` | String | Date the review was posted |
| `item_title` | String | Title of the reviewed product |
| `item_url` | String | URL to the reviewed product |
| `item_image` | String | Image URL for the product |
| `scrapedAt` | String | ISO timestamp of the extraction |

---

## Usage Examples

### Basic Extraction

Extract the latest 20 reviews from a shop:

```json
{
    "startUrl": "https://www.etsy.com/shop/SolelyWhimsical#reviews"
}
```

### Extensive Collection

Collect up to 100 reviews for deep analysis:

```json
{
    "startUrl": "https://www.etsy.com/shop/SolelyWhimsical#reviews",
    "results_wanted": 100
}
```

### Troubleshooting Mode

Enable debug logs and storage if you encounter issues:

```json
{
    "startUrl": "https://www.etsy.com/shop/SolelyWhimsical#reviews",
    "debug": true
}
```

---

## Sample Output

```json
{
  "username": "Jane Doe",
  "rating": 5,
  "comment": "Absolutely beautiful! The quality exceeded my expectations and it arrived so quickly.",
  "date": "Dec 15, 2023",
  "item_title": "Custom Silver Necklace",
  "item_url": "https://www.etsy.com/listing/123456789/custom-silver-necklace",
  "item_image": "https://i.etsystatic.com/...",
  "scrapedAt": "2024-01-19T14:50:00.000Z"
}
```

---

## Tips for Best Results

### URL Selection
- Ensure you use the shop URL ending in `#reviews` or the direct reviews page for best results.
- Verify the shop is publicly accessible before starting the run.

### Scaling Up
- For large-scale data collection, use residential proxies to ensure maximum reliability and speed.
- Start with a small `results_wanted` (e.g., 50) to verify data quality before running large batches.

### Data Freshness
- Schedule regular runs using Apify's scheduler to keep your dataset updated with the latest customer feedback.

---

## Integrations

Connect your review data with your favorite tools:

- **Google Sheets** — Auto-export for analysis and reporting
- **Airtable** — Build a searchable review database
- **Slack** — Get notified of new positive or negative feedback
- **Webhooks** — Send data to your own CRM or dashboard
- **Make / Zapier** — Create complex automated workflows

### Export Formats

Download your data in seconds:

- **JSON** — For developers and database imports
- **CSV** — For easy spreadsheet analysis
- **Excel** — For business presentations and reporting
- **XML** — For system-to-system integrations

---

## Frequently Asked Questions

### Can I scrape reviews from any Etsy shop?
Yes, as long as the shop is public and has visible reviews, this scraper can extract them.

### Is there a limit to how many reviews I can collect?
The only limit is what is visible on the website. You can set the `results_wanted` to a high number or 0 for all reviews.

### Are the reviews verified?
Etsy reviews are posted by customers who have purchased the items, making them highly reliable for research.

### Why are some fields missing?
If a reviewer didn't leave a comment or the product information is no longer available on Etsy, some fields may be empty.

---

## Support

For issues or feature requests, please reach out via the Support tab in the Apify Console.

---

## Legal Notice

This tool is intended for legitimate data collection and research purposes. Users are responsible for ensuring their use of the data complies with all applicable terms of service and local regulations.
