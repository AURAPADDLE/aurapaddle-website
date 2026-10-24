import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const expected={
  "yoga-cruiser":{raw:[10.81,17.27,[100,45,28]],display:["11 kg","17 kg","100 × 45 × 28 cm"]},
  "angler-fishing":{raw:[10.9,19,[100,45,28]],display:["11 kg","19 kg","100 × 45 × 28 cm"]},
  "touring-performance":{raw:[10.92,17.32,[100,45,28]],display:["11 kg","17 kg","100 × 45 × 28 cm"]},
  "coast-go":{raw:[9.14,13.3,[90,46,26]],display:["9 kg","13 kg","90 × 46 × 26 cm"]}
};

function page(slug){
  const html=fs.readFileSync(path.join(root,"products",`${slug}.html`),"utf8");
  const product=JSON.parse(html.match(/<script id="product-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  return {html,product,variants:schema["@graph"].find(node=>node["@type"]==="ProductGroup").hasVariant};
}

test("four inflatable boards retain source measurements and publish rounded physical specs",()=>{
  for(const [slug,{raw,display}] of Object.entries(expected)){
    const {html,product,variants}=page(slug);
    assert.deepEqual(product.physicalSpecs,{boardWeightKg:raw[0],completePackageWeightKg:raw[1],packedBagDimensionsCm:raw[2]});
    assert.deepEqual(product.specs.slice(-3),[["Approx. board weight",display[0]],["Approx. complete package weight",display[1]],["Packed bag dimensions",display[2]]]);
    assert.match(html,new RegExp(`Approx\\. board weight</td><td>${display[0]}`));
    for(const variant of variants){
      const properties=Object.fromEntries(variant.additionalProperty.map(item=>[item.name,item]));
      assert.deepEqual(properties["Approx. board weight"],{"@type":"PropertyValue",name:"Approx. board weight",value:Number(display[0].split(" ")[0]),unitText:"kg"});
      assert.deepEqual(properties["Approx. complete package weight"],{"@type":"PropertyValue",name:"Approx. complete package weight",value:Number(display[1].split(" ")[0]),unitText:"kg"});
      assert.equal(properties["Packed bag dimensions"].value,display[2]);
    }
  }
});

test("Touring thickness is 6 inches everywhere in its product and comparison data",()=>{
  const {html,product,variants}=page("touring-performance");
  assert.deepEqual(product.specs.find(row=>row[0]==="Thickness"),["Thickness","6\""]);
  assert.ok(product.variants.every(variant=>/× 6";/.test(variant.specification)));
  assert.ok(variants.every(variant=>variant.additionalProperty.some(item=>item.name==="Thickness"&&item.value==="6 in")));
  assert.doesNotMatch(html,/5\.5&quot;|5\.5"/);
  const comparison=fs.readFileSync(path.join(root,"inflatable-paddle-boards","index.html"),"utf8");
  const shop=fs.readFileSync(path.join(root,"shop","index.html"),"utf8");
  assert.match(comparison,/Touring Performance[\s\S]*?14'0&quot; × 30&quot; × 6&quot;/);
  assert.match(shop,/Touring Performance[\s\S]*?14' × 30&quot; × 6&quot;/);
});

test("the inflatable comparison shows weights and packed-bag dimensions for all four boards",()=>{
  const html=fs.readFileSync(path.join(root,"inflatable-paddle-boards","index.html"),"utf8");
  for(const [slug,{display}] of Object.entries(expected)){
    const card=html.match(new RegExp(`<article class="card"[^>]*data-product="${slug}"[\\s\\S]*?<\\/article>`))?.[0]||"";
    assert.match(card,new RegExp(`Approx\\. board / complete package weight</b><span>${display[0].replace(" kg","")} kg / ${display[1]}`));
    assert.ok(card.includes(`Packed bag dimensions</b><span>${display[2]}`));
  }
});
