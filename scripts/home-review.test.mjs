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

