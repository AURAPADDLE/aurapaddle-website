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
  const heroEnd = html.indexOf("</section>", html.indexOf('class="hero"'));
  const featured = html.indexOf('class="featured-yoga"');
  assert.ok(heroEnd > 0 && featured > heroEnd);
  assert.equal(html.slice(html.indexOf('class="hero"'), heroEnd).includes("incoming-offer"), false);
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
  }
});

