# AURA PADDLE website release checklist

> Phase 2 note: the proposed AURA Water Community forum and account-linked lifetime member discount are documented separately in `PHASE_2_COMMUNITY_ROADMAP.md`. They are intentionally excluded from the first website launch and should only begin after the initial website is live and stable.

This build is for local review only. Do not deploy until both parties have confirmed the content, product data, photography and purchase flow.

## 1. Brand and content approval

- Confirm the primary brand lockup is `AURA PADDLE`.
- Confirm the homepage line is `PADDLE OUT. FIND YOUR WAY ON THE WATER.`
- Confirm all Australian market, company, telephone and policy information.
- Resolve the Hydrofoil bundle contents and the conflicting Vela dimensions before either product is offered for sale.

## 2. Product-data approval

- Reconcile every visible specification and AP SKU against the approved product catalogue workbook.
- Confirm retail prices, stock states, launch dates and which variants may be purchased.
- Rebuild the product pages with `node scripts/build-products.mjs` after changing the approved workbook.
- Validate Yoga Cruiser as 11' × 36" × 6", 180 kg and 285 L.

## 3. Photography approval

- Complete the outstanding items in `PHOTO_REQUIREMENTS.md`.
- Export responsive WebP/AVIF and JPEG fallbacks.
- Confirm product, colour, model-release and usage-rights metadata.

## 4. Production preparation

- Promote the approved homepage, shop and policy files to their production routes.
- Replace `noindex,nofollow` with the approved production indexing setting; keep staging and review URLs noindex.
- Confirm every canonical URL resolves to its own production page.
- Publish `robots.txt` and `sitemap.xml` only with the final production route map.
- Validate ProductGroup, Product, Offer, Breadcrumb and Organization structured data.
- Submit the sitemap to Google Search Console and Bing Webmaster Tools.
- Connect Google Merchant Center only after price, availability, shipping and return data match the website.

## 5. Stripe and transaction approval

- Create Stripe products and Price IDs for each purchasable AP SKU.
- Keep secret keys server-side; never add them to HTML or client JavaScript.
- Test success, cancellation, stock, shipping, tax, email and refund flows in Stripe test mode.
- Obtain written approval before enabling live payments.

## 6. Final quality gate

- Test desktop and mobile layouts, keyboard navigation, forms and all internal links.
- Check Core Web Vitals and image loading.
- Verify that no placeholder, unsupported review, unconfirmed superlative or draft price is presented as final.
- Take a backup and deploy only after explicit approval.
