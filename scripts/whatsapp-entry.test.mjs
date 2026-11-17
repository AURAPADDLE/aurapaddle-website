import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const pages=["index.html","contact/index.html"];

test("homepage and contact page provide the verified enquiry-only WhatsApp link",()=>{
  for(const page of pages){
    const html=fs.readFileSync(path.join(root,page),"utf8");
    const links=[...html.matchAll(/<a\b[^>]*href="https:\/\/wa\.me\/61422679280"[^>]*>[\s\S]*?<\/a>/g)].map(match=>match[0]);
    assert.equal(links.length,1,`${page} should contain one WhatsApp entry`);
    assert.match(links[0],/>Chat on WhatsApp<\/a>/);
    assert.match(links[0],/target="_blank"/);
    assert.match(links[0],/rel="noopener"/);
    assert.doesNotMatch(links[0],/\?/);
    assert.match(html,/enquir/i);
    assert.match(html,/Replies may not be immediate/);
    assert.match(html,/payments remain on AURA PADDLE's secure checkout/i);
  }
});

test("WhatsApp stays outside checkout and form submission flows",()=>{
  for(const page of pages){
    const html=fs.readFileSync(path.join(root,page),"utf8");
    assert.doesNotMatch(html,/wa\.me\/61422679280[^"\s>]*\?/);
    assert.doesNotMatch(html,/<form[\s\S]*?wa\.me\/61422679280[\s\S]*?<\/form>/);
  }
});

test("mobile styles keep both WhatsApp buttons within the viewport",()=>{
  const home=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const shared=fs.readFileSync(path.join(root,"standalone-page.css"),"utf8");
  assert.match(home,/@media\(max-width:650px\)[\s\S]*?\.footer-col \.whatsapp-button\{width:100%\}/);
  assert.match(shared,/@media\(max-width:640px\)[\s\S]*?\.contact-copy \.whatsapp-contact \.btn\{width:100%\}/);
});
