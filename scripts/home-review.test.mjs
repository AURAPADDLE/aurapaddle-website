import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("brand hero and established destinations remain intact", () => {
  assert.match(html, /Paddle out\. Find your way on the water\./);
  assert.match(html, /Choose your water/);
  for (const id of ["ranges", "finder", "commercial"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test("homepage ends after the range with legacy journeys handed to focused pages", () => {
  for (const removed of [
    'class="direct-model"',
    'class="section finder"',
    'class="section commercial"',
    'class="newsletter"',
    'id="finderForm"',
  ]) assert.doesNotMatch(html, new RegExp(removed));
  assert.match(html, /href="pre-order\/">Pre-order guidance/);
  assert.match(html, /href="shop\/">Find your board/);
  assert.match(html, /href="products\/wayfinder\.html">Commercial/);
  assert.match(html, /class="legacy-anchor" id="finder"/);
  assert.match(html, /class="legacy-anchor" id="commercial"/);
  assert.match(html, /<footer>[\s\S]*class="newsletter-form" id="newsletterForm"/);
  assert.match(html, /name="marketing_consent"[^>]*required/);
});

test("selected Hyams Beach photograph fills the brand hero without a side media panel", () => {
  assert.match(html, /\.hero\{[^}]*hyams-beach-hero-original\.jpg[^}]*cover no-repeat/);
  assert.doesNotMatch(html, /<div class="hero-media"/);
  assert.doesNotMatch(html, /id="heroVideo"/);
  const photo = fs.readFileSync(new URL("../assets/hero/hyams-beach-hero-original.jpg", import.meta.url));
  assert.deepEqual([...photo.subarray(0, 3)], [255, 216, 255]);
});

test("CoastGo promotion stays available without auto-covering the homepage", () => {
  const offer = fs.readFileSync(new URL("../home-offer.js", import.meta.url), "utf8");
  assert.match(html, />View CoastGo free shipping offer<\/button>/);
  assert.match(offer, /data-preorder-offer-open/);
  assert.doesNotMatch(offer, /open\('automatic'\)|after_privacy_notice|open\('return_visit'\)/);
});

test("Yoga buying information follows rather than occupies the hero", () => {
  const heroStart = html.indexOf('class="hero"');
  const heroEnd = html.indexOf("</section>", heroStart);
  const featured = html.indexOf('class="featured-yoga"');
  assert.ok(heroEnd > 0 && featured > heroEnd);
  const hero = html.slice(heroStart, heroEnd);
  assert.equal(hero.includes("incoming-offer"), false);
  assert.equal(hero.includes("An extra-wide"), false);
  assert.equal((html.match(/An extra-wide/g) || []).length, 1);
  assert.ok(html.indexOf("An extra-wide") > featured);
});

test("hero discipline labels are accessible links to distinct reviewed destinations", () => {
  const links = {
    Paddle: "inflatable-paddle-boards/",
    Surf: "shop/?category=surf#products",
    Foil: "products/inflatable-hydrofoil.html",
    Wake: "products/vela-wakeboard.html",
  };
  for (const [label, href] of Object.entries(links)) {
    assert.match(html, new RegExp(`<a href=["']${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']>${label}</a>`));
  }
  assert.match(html, /\.hero-disciplines a:hover,\.hero-disciplines a:focus-visible/);
});

test("Hyams Beach remains unfiltered with only a local neutral text scrim", () => {
  const selectedHero = html.slice(html.indexOf("/* Review candidate: the selected Hyams"), html.indexOf("</style>"));
  assert.doesNotMatch(selectedHero, /filter\s*:|saturate\(|sepia\(|hue-rotate\(/);
  assert.match(selectedHero, /\.hero::before\{inset:0 42% 0 0;/);
  assert.match(selectedHero, /\.hero::after\{display:none\}/);
});

test("Support and social destinations use the reviewed URLs", () => {
  assert.match(html, /href=["']pre-order\/["']/);
  const destinations = {
    facebook: "https://www.facebook.com/aurapaddleau/",
    instagram: "https://www.instagram.com/aurapaddleau/",
    tiktok: "https://www.tiktok.com/@aurapaddle",
    whatsapp: "https://wa.me/61422679280",
  };
  for (const [name, href] of Object.entries(destinations)) {
    assert.match(html, new RegExp(`href=["']${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`), name);
    const qr = new URL(`../assets/social/${name}-qr.png`, import.meta.url);
    const data = fs.readFileSync(qr);
    assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const card = html.slice(html.lastIndexOf('<div class="social-card"', html.indexOf(`assets/social/${name}-qr.png`)), html.indexOf("</div>", html.indexOf(`assets/social/${name}-qr.png`)) + 6);
    assert.ok(card.indexOf("<a ") < card.indexOf("<img "), `${name} text link precedes QR`);
  }
});

