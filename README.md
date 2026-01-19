# Etsy Reviews Scraper

Extract verified reviews from any Etsy shop with ease. This powerful tool helps you gather structured review data for market research, competitor analysis, and sentiment tracking.

---

## 🚀 Features

- **Comprehensive Review Data**: Extract reviewer names, star ratings, full comments, and review dates.
- **Product Context**: Get the title, URL, and image of the product associated with each review.
- **High Stealth**: Built-in support for advanced browser fingerprinting and residential proxies to bypass anti-bot measures.
- **Pagination Support**: Automatically crawls through multiple pages of reviews to gather as much data as needed.
- **Clean Output**: Data is delivered in structured JSON or CSV formats, ready for analysis.

---

## 📦 Output Data

The scraper extracts the following fields for each review:

| Field | Description |
|-------|-------------|
| `username` | Name of the reviewer |
| `rating` | Star rating (1-5) |
| `comment` | Full text content of the review |
| `date` | Date when the review was posted |
| `item_title` | Title of the product reviewed |
| `item_url` | Direct link to the product |
| `item_image` | URL of the product image |
| `scrapedAt` | Timestamp of when the data was extracted |

---

## 🛠️ Input Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `startUrl` | String | (Required) | The URL of the shop's review section. |
| `results_wanted` | Integer | `20` | Maximum number of reviews to collect (0 for unlimited). |
| `proxyConfiguration` | Object | (Residential) | Proxy settings for reliable scraping. |

---

## 💡 Use Cases

- **Market Research**: Understand what customers love (or hate) about specific types of handmade or vintage items.
- **Competitor Analysis**: Analyze the feedback and growth of top-performing shops in your niche.
- **Product Development**: Identify common customer pain points and feature requests from competitor reviews.
- **Brand Monitoring**: Track and analyze reviews for your own shop to improve customer satisfaction.

---

## 📝 Integration

You can easily integrate this scraper with other tools in the Apify ecosystem, such as:

- **Google Sheets**: Export data directly to a spreadsheet.
- **Webhooks**: Get notified instantly when new reviews are found.
- **API**: Trigger the scraper programmatically from your own applications.

---

## ⚖️ Legal Notice

Please ensure your scraping activities comply with Etsy's Terms of Use and relevant data privacy regulations in your jurisdiction. This tool is intended for ethical data collection purposes only.
