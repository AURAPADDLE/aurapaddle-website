import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const yoga = fs.readFileSync(new URL("../products/yoga-cruiser.html", import.meta.url), "utf8");
const finder = fs.readFileSync(new URL("../find-your-board/index.html", import.meta.url), "utf8");
const collection = fs.readFileSync(new URL("../inflatable-paddle-boards/index.html", import.meta.url), "utf8");

test("homepage, finder, product and collection keep distinct discovery roles", () => {
  assert.match(home, /href="find-your-board\/">Find your board<\/a>/);
  assert.match(home, /href="inflatable-paddle-boards\/">[^<]*inflatable stand up paddle boards<\/a>/);
  assert.match(finder, /id="finderForm"/);
  assert.match(yoga, /href="\.\.\/guides\/how-to-choose-a-yoga-sup\/">Read the yoga SUP buying guide<\/a>/);
  assert.match(yoga, /href="\.\.\/inflatable-paddle-boards\/">Inflatable SUP Boards<\/a>/);
  assert.match(collection, /href="\.\.\/guides\/how-to-choose-an-inflatable-sup\/">Read the buying guide<\/a>/);
});

test("reviewed product and collection links avoid legacy homepage redirects", () => {
  for (const page of [yoga, collection]) {
    assert.doesNotMatch(page, /href="\.\.\/#finder"/);
    assert.doesNotMatch(page, /href="\.\.\/#commercial"/);
    assert.match(page, /href="\.\.\/find-your-board\/"/);
    assert.match(page, /href="\.\.\/commercial\/"/);
  }
});

test("all reviewed direct destinations exist in the static build", () => {
  for (const relative of [
    "../find-your-board/index.html",
    "../commercial/index.html",
    "../guides/how-to-choose-a-yoga-sup/index.html",
    "../guides/how-to-choose-an-inflatable-sup/index.html",
    "../inflatable-paddle-boards/index.html",
    "../products/yoga-cruiser.html",
  ]) assert.equal(fs.existsSync(new URL(relative, import.meta.url)), true, relative);
});
