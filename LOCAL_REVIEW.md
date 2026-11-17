# Local review

The redesign is intentionally separate from the current production homepage.

- Current production source: `index.html`
- Offline homepage preview: `redesign-preview.html`
- Offline shop preview: `shop-preview.html`
- Independent product pages: `products/*.html` (10 product families)
- Legacy product-detail links: `product-preview.html?id=PRODUCT_ID` redirect to the matching independent page
- Offline policies page: `policy-preview.html`
- Homepage `Shop`, `Explore the range`, and range-category links open the separate shop page
- Every shop card opens a dedicated crawlable product URL with unique metadata, product-family structured data and size/colour/AP-SKU selection
- Photography brief: `PHOTO_REQUIREMENTS.md`
- Stripe: interface reserved on the shop page, inactive, and contains no secret keys
- Market: Australia only; contact form uses the eight Australian states and territories
- Deployment: not performed

Review the preview through a local static web server so that image paths and form behaviour match a hosted website. The preview remains `noindex,nofollow`. After written approval, follow `RELEASE_CHECKLIST.md` to promote the preview, switch indexing on, validate structured data, connect Stripe test mode and prepare a separate deployment step.
