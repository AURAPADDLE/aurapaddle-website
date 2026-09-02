import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const siteDir=path.resolve(scriptDir,"..");
const source=path.resolve(siteDir,"../outputs/aura_catalogue_2026_v4/AURA_Product_Catalogue_2026_V4.xlsx.inspect.ndjson");
const records=fs.readFileSync(source,"utf8").trim().split("\n").map(line=>JSON.parse(line));
const catalogue=records.find(item=>item.kind==="table"&&item.sheet==="产品目录"&&item.values?.length>100);
if(!catalogue)throw new Error("Product catalogue table not found");
const rows=catalogue.values.slice(6);
const rrpOverrides=JSON.parse(fs.readFileSync(path.join(scriptDir,"rrp-overrides.json"),"utf8"));
const merchantPolicy={"@type":"MerchantReturnPolicy",applicableCountry:"AU",returnPolicyCategory:"https://schema.org/MerchantReturnFiniteReturnWindow",merchantReturnDays:30,returnMethod:"https://schema.org/ReturnByMail",returnFees:"https://schema.org/ReturnShippingFees",returnPolicyCountry:"AU"};

const colours={
  glacier:{name:"Glacier Blue",catalogue:"Glacier Blue",swatch:"linear-gradient(135deg,#62bfd1,#287e9e)"},
  sandstone:{name:"Matte Sandstone",catalogue:"Matte Sandstone",swatch:"linear-gradient(135deg,#dcc3a3,#b59673)"},
  eucalyptus:{name:"Eucalyptus Green",catalogue:"Eucalyptus Green",swatch:"linear-gradient(135deg,#6a9474,#365d46)"},
  coral:{name:"Coral White",catalogue:"Coral White",swatch:"linear-gradient(135deg,#f7eee2,#ead8c0)"},
  blueorange:{name:"Blue Orange",catalogue:"Blue Orange",swatch:"linear-gradient(135deg,#0c6688 0 55%,#f15a2d 55%)"},
  mintgrey:{name:"Mint Grey",catalogue:"Mint Grey",swatch:"linear-gradient(135deg,#65bdb2 0 55%,#b8bcb9 55%)"},
  bluecoral:{name:"Blue Coral",catalogue:"Blue Coral",swatch:"linear-gradient(135deg,#22a8c0 0 55%,#ed7e6e 55%)"},
  carbon:{name:"Carbon / Green",catalogue:"Carbon/Green",swatch:"linear-gradient(135deg,#1d2729 0 55%,#4fb398 55%)"},
  foil:{name:"Carbon & Teal",catalogue:"Carbon & Teal",swatch:"linear-gradient(135deg,#56adbc 0 55%,#ea504b 55%)"},
  standard:{name:"Standard Set",catalogue:"Standard Set",swatch:"linear-gradient(135deg,#203946,#7f9aa3)"},
  clear:{name:"Clear White",catalogue:"Clear White",swatch:"#f7f7f3"},
  beigewhite:{name:"Beige / White",catalogue:"Beige/White",swatch:"linear-gradient(135deg,#d2cab8 0 55%,#f8f7f2 55%)"},
  purplewhite:{name:"Purple / White",catalogue:"Purple/White",swatch:"linear-gradient(135deg,#bbb9d4 0 55%,#f7f7f3 55%)"},
  currentmint:{name:"Mint / White",catalogue:"Beige/White",catalogueDisplay:"Mint/White",swatch:"linear-gradient(135deg,#7da798 0 55%,#f7f7f3 55%)"},
  currentgrey:{name:"Grey / White",catalogue:"Purple/White",catalogueDisplay:"Grey/White",swatch:"linear-gradient(135deg,#c5c8c7 0 55%,#f7f7f3 55%)"},
  beige:{name:"Beige",catalogue:"Beige",swatch:"#c8bfaa"},
  lightblue:{name:"Light Blue",catalogue:"LT Blue",swatch:"#9dccea"},
  olivewhite:{name:"Olive / White",catalogue:"Olive/White",swatch:"linear-gradient(135deg,#7b8154 0 55%,#f7f7f3 55%)"},
  mintwhite:{name:"Mint / White",catalogue:"Mint/White",swatch:"linear-gradient(135deg,#54c1b8 0 55%,#f7f7f3 55%)"}
};
const supColourKeys=["glacier","sandstone","eucalyptus","coral"];
const preorderTerms={deadline:"30 September 2026",deadlineISO:"2026-09-30",estimatedDelivery:"30 November 2026",discountAUD:50,reserved:0,payment:"50% when ordered · 50% before dispatch",thresholdRequired:true};
const sharedPaddleSlugs=new Set(["yoga-cruiser","angler-fishing","touring-performance"]);
const fiveBoardSlugs=new Set(["inflatable-hydrofoil","hydrofoil-set","vela-wakeboard"]);

function campaignFor(product){
  if(sharedPaddleSlugs.has(product.slug))return {...preorderTerms,id:"paddle-launch-batch-01",name:"Paddle Board Launch Batch 01",target:50,scopeLabel:"Shared Paddle batch",title:"50 boards unlock the combined Paddle Board batch.",description:"Paid pre-orders for Yoga Cruiser pre-order colours, Angler Fishing and Touring Performance are combined. Production starts when this shared batch reaches 50 boards, regardless of the selected model or colour."};
  if(product.slug==="hydrofoil-set")return {...preorderTerms,id:"hydrofoil-set-launch-batch",name:"Hydrofoil Kit Set Launch Batch",target:5,scopeLabel:"Hydrofoil Kit Set total",countLabel:"paid sets",itemLabel:"set",title:"5 Hydrofoil Kit Sets unlock production.",description:"All paid Hydrofoil Kit Set pre-orders are combined. Production starts when this product reaches 5 sets."};
  if(fiveBoardSlugs.has(product.slug))return {...preorderTerms,id:`${product.slug}-launch-batch`,name:`${product.short} Launch Batch`,target:5,scopeLabel:`${product.short} total`,title:`5 ${product.short} boards unlock production.`,description:`All paid ${product.short} pre-orders are combined. Production starts when this product reaches 5 boards.`};
  return {...preorderTerms,id:`${product.slug}-launch-batch`,name:`${product.short} Launch Batch`,target:10,scopeLabel:`${product.short} total`,title:`10 ${product.short} boards unlock production.`,description:`All paid ${product.short} pre-orders are combined across every size and colour. Production starts when this product reaches 10 boards.`};
}

function confirmedPreorderFor(product){
  const isYoga=product.slug==="yoga-cruiser";
  return {
    id:isYoga?"yoga-glacier-confirmed-preorder":"coastgo-confirmed-preorder",
    name:isYoga?"Incoming Stock Reservation":"Confirmed Production Pre-order",
    target:0,
    thresholdRequired:false,
    inventoryIncoming:isYoga,
    scopeLabel:isYoga?"Stock arriving next week":"In production · No minimum",
    title:isYoga?"Glacier Blue stock is arriving next week.":"Production is confirmed — no minimum quantity required.",
    description:isYoga?"Reserve a Glacier Blue board from the incoming stock allocation before it arrives. This order does not depend on a production target.":"Your board is reserved in a confirmed production schedule. This pre-order is not conditional on a minimum order quantity.",
    deadline:"Not applicable",
    deadlineISO:"",
    estimatedDelivery:isYoga?"15 September 2026":"30 October 2026",
    discountAUD:50,
    reserved:0,
    payment:"50% when ordered · 50% before dispatch"
  };
}

function sellingPrice(variant){return variant.retailAUD?(variant.orderMode==="preorder"?Number(variant.retailAUD)-variant.preorder.discountAUD:Number(variant.retailAUD)):null}
function preorderStatus(preorder){return preorder.thresholdRequired?`${preorder.scopeLabel} 0/${preorder.target}`:preorder.inventoryIncoming?preorder.scopeLabel:`Confirmed · ${preorder.scopeLabel}`}
function preorderTermsCopy(preorder){const item=preorder.itemLabel||"board";return preorder.thresholdRequired?`${preorder.description} A 50% initial payment reserves the ${item} and counts it towards the target once successfully paid. The remaining 50%, together with the confirmed shipping charge, is requested through a separate secure payment link before dispatch. The campaign closes on ${preorder.deadline}, with estimated dispatch on ${preorder.estimatedDelivery}. Each eligible pre-ordered ${item} receives an AUD $${preorder.discountAUD} incentive. If the target is not reached, affected orders will be cancelled and the initial payment fully refunded. Australian Consumer Law rights are not excluded.`:`${preorder.description} A 50% initial payment reserves the ${item}. The remaining 50%, together with the confirmed shipping charge, is requested through a separate secure payment link before dispatch. Estimated dispatch is ${preorder.estimatedDelivery}. Each eligible pre-ordered ${item} receives an AUD $${preorder.discountAUD} incentive. This order does not depend on a production target. Australian Consumer Law rights are not excluded.`}

const products=[
  {slug:"yoga-cruiser",prefix:"Yoga Cruiser",name:"AURA PADDLE Yoga Cruiser",short:"Yoga Cruiser",series:"Yoga Cruiser Series",category:"Inflatable paddleboard",description:"An extra-wide inflatable stand-up paddleboard for SUP yoga, shared paddles and stable family use in Australian waters.",status:"1 colour available · 3 colours on pre-order",badge:"Yoga & family",price:"AUD $799",canBuy:true,stock:"In stock · Dispatch confirmed with order",sizes:["11'0\""],colourKeys:supColourKeys,images:{glacier:["../assets/products/yoga-cruiser/glacier-blue/AP734955_yoga-cruiser_11ft_glacier-blue_hero-01.webp","../assets/products/yoga-cruiser/glacier-blue/AP734955_yoga-cruiser_11ft_glacier-blue_deck-02.webp","../assets/products/yoga-cruiser/glacier-blue/AP734955_yoga-cruiser_11ft_glacier-blue_bottom-03.webp","../assets/products/yoga-cruiser/glacier-blue/AP734955_yoga-cruiser_11ft_glacier-blue_side-04.webp","../assets/products/yoga-cruiser/glacier-blue/AP734955_yoga-cruiser_11ft_glacier-blue_three-quarter-05.webp","../assets/products/yoga-cruiser/glacier-blue/AP734955_yoga-cruiser_11ft_glacier-blue_deck-detail-06.webp","../assets/products/yoga-cruiser/glacier-blue/AP734955_yoga-cruiser_11ft_glacier-blue_full-kit-07.jpg","../assets/products/yoga-cruiser/glacier-blue/AP734955_yoga-cruiser_11ft_glacier-blue_yoga-lifestyle-08.webp","../assets/products/yoga-cruiser/glacier-blue/AP734955_yoga-cruiser_11ft_glacier-blue_colour-lineup-09.webp"],sandstone:["../pic 3 matte sandstone.png"],eucalyptus:["../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_hero-01.webp","../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_deck-02.webp","../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_bottom-03.webp","../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_side-04.webp","../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_three-quarter-05.webp","../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_deck-detail-06.webp","../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_full-kit-07.jpg","../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_yoga-lifestyle-08.webp","../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_colour-lineup-09.webp"],coral:["../pic 5 coral white.png"]},specs:[["Length","11'0\""],["Width","36\""],["Thickness","6\""],["Volume","285 L"],["Maximum capacity","180 kg"],["Construction","Woven drop stitch"]],included:["Yoga Cruiser board","Wheeled carry bag","Adjustable 3-piece paddle","Electric pump","10ft coiled leash","2+1 removable fins","Waterproof phone pouch","Repair kit"],bestFor:"SUP yoga, beginners who prioritise stability, relaxed family paddles and carrying a seated passenger within the stated capacity.",notFor:"Riders whose main priority is maximum touring speed, narrow race-style tracking or specialised fishing mounts.",why:"The 36-inch platform and 285-litre volume prioritise stability and usable deck space.",photoNeed:"Glacier Blue and Eucalyptus Green have detailed imagery. Matte Sandstone and Coral White still need complete top, bottom, side and lifestyle photography."},
  {slug:"angler-fishing",prefix:"Angler Fishing",name:"AURA PADDLE Angler Fishing",short:"Angler Fishing",series:"Angler Fishing Series",category:"Inflatable fishing paddleboard",description:"A high-capacity inflatable fishing paddleboard with dedicated equipment mounting points and four colourways.",status:"Range preview",badge:"Fishing",price:"From AUD $1199",canBuy:false,stock:"Availability confirmed by enquiry",sizes:["12'0\""],colourKeys:supColourKeys,images:{glacier:["../pic 7 fishing glacier blue.png"],sandstone:["../pic 8 fishing matte sandstone.png"],eucalyptus:["../pic 9 fishing eucalyptus green.png"],coral:["../pic 10 fishing coral white.png"]},specs:[["Length","12'0\""],["Width","34\""],["Thickness","6\""],["Volume","293.7 L"],["Maximum capacity","220 kg"],["Mounts","Rod, rack and action-camera mounts"]],included:["Angler Fishing board","Wheeled carry bag","Adjustable 3-piece paddle","Electric pump","10ft coiled leash","2+1 removable fins","Waterproof phone pouch","Repair kit"],bestFor:"Fishing, higher equipment loads and paddlers who want dedicated rod, rack and action-camera mounting positions.",notFor:"Minimalist paddlers who want the lightest all-round package or a narrow board for pure touring speed.",why:"A 220 kg stated capacity and equipment mounting system support fishing-specific use.",photoNeed:"All four catalogue colours are represented by renders; full studio, equipment-detail and on-water photography is still required."},
  {slug:"touring-performance",prefix:"Touring Performance",name:"AURA PADDLE Touring Performance",short:"Touring Performance",series:"Touring Performance Series",category:"Touring inflatable paddleboard",description:"A 14-foot touring iSUP shaped for efficient tracking, distance and fast open-water paddling.",status:"Range preview",badge:"Touring",price:"From AUD $1499",canBuy:false,stock:"Availability confirmed by enquiry",sizes:["14'0\""],colourKeys:supColourKeys,images:{glacier:["../pic 11 toring glacier blue.png"],sandstone:["../pic 12 toring matte sandstone.png"],eucalyptus:["../pic 13 toring eucalyptus green.png"],coral:["../pic 14 toring coral white.png"]},specs:[["Length","14'0\""],["Width","30\""],["Thickness","5.5\""],["Volume","302.4 L"],["Maximum capacity","150 kg"],["Hull","V hull and speed tail"]],included:["Touring Performance board","Wheeled carry bag","Adjustable 3-piece paddle","Electric pump","10ft coiled leash","Single 9-inch removable fin","Waterproof phone pouch","Repair kit"],bestFor:"Longer distances, efficient tracking and paddlers who value glide and speed over maximum width.",notFor:"SUP yoga, fishing loads or riders who require the widest and most forgiving first-time platform.",why:"The 14-foot length, 30-inch width, V hull and speed tail are intended to support tracking and glide.",photoNeed:"All four catalogue colours have renders; detailed construction and on-water touring photography is still required."},
  {slug:"coast-go",prefix:"Coast Go iSUP",name:"AURA PADDLE CoastGo",short:"CoastGo",series:"CoastGo Series",category:"All-round inflatable paddleboard",description:"An approachable all-round inflatable paddleboard package for first paddles, weekends and easy transport.",status:"All 3 colours available",badge:"All-round",price:"AUD $349",canBuy:true,stock:"In stock · Dispatch confirmed with order",sizes:["10'6\""],colourKeys:["blueorange","mintgrey","bluecoral"],images:{},specs:[["Length","10'6\""],["Width","33\""],["Thickness","6\""],["Volume","249 L"],["Maximum capacity","120 kg"],["Format","All-round iSUP"]],included:["CoastGo board","Carry bag","Adjustable 3-piece paddle","Hand pump","10ft leg rope","2+1 removable fins","Waterproof phone pouch","Repair kit"],bestFor:"First-time paddlers, casual weekends and customers who want an accessible complete all-round package.",notFor:"Heavy fishing loads, specialised yoga use or long-distance performance touring.",why:"Its 10'6\" all-round format balances stability, portability and straightforward handling.",photoNeed:"Top, bottom, side, three-quarter, full-kit and on-water photographs are required for all three colours."},
  {slug:"inflatable-hydrofoil",prefix:"AURA Inflatable Hydrofoil",name:"AURA PADDLE Inflatable Hydrofoil Board",short:"Inflatable Hydrofoil Board",series:"Foil Series",category:"Inflatable hydrofoil board",description:"A packable 110-litre inflatable foil platform for developing wing-foil riders who value practical transport, storage and progression.",status:"Pre-order",badge:"Foil",price:"Price on enquiry",canBuy:false,stock:"Pre-order · 50% due today",sizes:["5'7\""],colourKeys:["foil"],images:{},sizeGuide:[{size:"5'7\"",width:"27.5\"",thickness:"6\"",volume:"110 L"}],specs:[["Length","5'7\" / 170 cm"],["Width","27.5\" / 70 cm"],["Thickness","6\" / 15 cm"],["Volume","110 L"],["Maximum pressure","20 PSI"],["Format","Inflatable foil board"]],included:["Inflatable foil board","Wheeled carry bag","10ft coiled leg rope","Repair kit","Electric pump","Waterproof phone floating pouch"],bestFor:"Developing wing-foil riders who prioritise packability, convenient storage and an inflatable 110-litre platform.",notFor:"Riders seeking a compact rigid carbon platform or a complete hydrofoil kit bundled with the board.",why:"The reinforced inflatable construction, high-density EVA deck and dedicated foil connection combine travel convenience with a confidence-building progression platform.",photoNeed:"Complete assembled-system, kit flat lay, setup details, packed-bag and on-water action photography are required."},
  {slug:"hydrofoil-set",prefix:"",name:"AURA PADDLE Hydrofoil Kit Set",short:"Hydrofoil Kit Set",series:"Foil Series",category:"Hydrofoil kit set",description:"A modular hydrofoil kit combining carbon-fibre wings and mast components with a durable aluminium-alloy fuselage for efficient lift, controlled carving and repeatable setup.",status:"Pre-order",badge:"Foil",price:"AUD $1,499",canBuy:true,stock:"Pre-order · 50% due today",sizes:["Set"],colourKeys:["standard"],images:{},manualVariants:[{size:"Set",colourKey:"standard",sku:"AP246531",specification:"Hydrofoil Kit Set",retailAUD:1499}],specs:[["Product type","Hydrofoil kit set"],["Product SKU","AP246531"],["Wings and mast","Carbon fibre"],["Fuselage","642 mm · aluminium alloy"],["Front wing","1310 × 187 mm"],["Rear wing","390 × 90 mm"],["Mast","750 × 130 mm"],["Mast top plate","168 × 120 mm"],["Compatibility","Confirm with AURA PADDLE before ordering"]],included:["Front wing × 1","Rear wing × 1","Mast × 1","Fuselage × 1","Mast top plate × 1","Allen key × 2","Carry bag × 1","Track nuts: M8 × 4","M8 × 45 mm × 2","M8 × 30 mm × 6","M8 × 20 mm × 5","M8 × 25 mm × 2","M6 × 20 mm × 2"],bestFor:"Riders seeking a modular hydrofoil kit with responsive carbon-fibre control surfaces and a durable aluminium-alloy fuselage.",notFor:"Ordering before board compatibility has been confirmed with AURA PADDLE.",why:"Carbon-fibre wings and mast provide responsive control, while standardised hardware and a carry bag simplify assembly, transport and servicing.",photoNeed:"Complete product, component, detail and carry-bag photography is available."},
  {slug:"gannet",prefix:"AURA Gannet EPS Shortboard",name:"AURA PADDLE Gannet",short:"Gannet",series:"EPS Shortboard Series",category:"EPS surfboard",description:"A responsive EPS shortboard family in eight sizes and three colours for progressive surfing.",status:"Design preview · 24 SKUs",badge:"Shortboard",price:"Price on enquiry",canBuy:false,stock:"Pre-launch enquiry",sizes:["5'8\"","5'10\"","6'0\"","6'2\"","6'4\"","6'6\"","6'8\"","6'10\""],colourKeys:["clear","beigewhite","purplewhite"],images:{},sizeGuide:[{size:"5'8\"",width:"22\"",thickness:"2 11/16\"",volume:"38.75 L"},{size:"5'10\"",width:"22 1/4\"",thickness:"2 13/16\"",volume:"42.18 L"},{size:"6'0\"",width:"22 1/2\"",thickness:"2 3/4\"",volume:"43.26 L"},{size:"6'2\"",width:"22 1/2\"",thickness:"2 7/8\"",volume:"46.33 L"},{size:"6'4\"",width:"22 3/4\"",thickness:"2 7/8\"",volume:"48.39 L"},{size:"6'6\"",width:"22 7/8\"",thickness:"2 7/8\"",volume:"50.13 L"},{size:"6'8\"",width:"23\"",thickness:"2 15/16\"",volume:"52.69 L"},{size:"6'10\"",width:"23\"",thickness:"3\"",volume:"55.27 L"}],specs:[["Size range","5'8\"–6'10\""],["Size options","8"],["Colour options","3"],["Core","Premium EPS"],["Deck glass","6 oz + 4 oz + tail patch"],["Fin setup","Versatile 5-fin"]],included:["Gannet board","Fin configuration confirmed with order"],bestFor:"Surfers who want responsive shortboard handling with a broad size ladder for rider fit and progression.",notFor:"First-time surfers who need a high-volume teaching softboard or customers seeking longboard trim and stability.",why:"Eight sizes and a 5-fin configuration provide more precise fit and setup choices.",photoNeed:"Deck, bottom, rail, tail, resin-tint and fin-box views are required in all three colours, plus on-wave action."},
  {slug:"current",prefix:"AURA Current EPS Minimal",name:"AURA PADDLE Current",short:"Current",series:"EPS Minimal Series",category:"EPS minimal surfboard",description:"A balanced EPS minimal in three sizes and three colours for glide, control and relaxed progression.",status:"Design preview · 9 SKUs",badge:"Minimal",price:"AUD $599",canBuy:true,stock:"Pre-order · 50% due today",metaDescription:"A stable 7ft–8ft EPS minimal for beginners and progressing surfers seeking easy glide and control in Australian waves.",sizes:["7'0\"","7'6\"","8'0\""],colourKeys:["clear","currentmint","currentgrey"],images:{},sizeGuide:[{size:"7'0\"",width:"21 1/2\"",thickness:"2 11/16\"",volume:"46.54 L"},{size:"7'6\"",width:"22\"",thickness:"2 13/16\"",volume:"53.37 L"},{size:"8'0\"",width:"22 1/2\"",thickness:"3\"",volume:"62.39 L"}],specs:[["Size range","7'0\"–8'0\""],["Size options","3"],["Colour options","3"],["Core","Premium EPS"],["Bottom glass","6 oz"],["Fin setup","Thruster"]],included:["Current board","Thruster fin package to be confirmed"],bestFor:"Relaxed progression, smaller waves and riders wanting more glide than a shortboard without moving to a full longboard.",notFor:"Commercial surf-school fleets or advanced riders seeking the most compact shortboard response.",why:"The minimal outline combines accessible volume and glide with a familiar thruster setup.",photoNeed:"Deck, bottom, rail, tail and thruster-fin views are required for Clear White, Mint / White and Grey / White, plus small-to-medium-wave action photography."},
  {slug:"meridian",prefix:"AURA Meridian EPS Longboard",name:"AURA PADDLE Meridian",short:"Meridian",series:"EPS Longboard Series",category:"EPS longboard surfboard",description:"A classic EPS longboard in three sizes and three colours for stability, trim speed and flowing manoeuvres.",status:"Design preview · 9 SKUs",badge:"Longboard",price:"AUD $699",canBuy:true,stock:"Pre-order · 50% due today",metaDescription:"A lightweight 9ft–9ft 6in EPS longboard for all levels, especially beginner and intermediate surfers exploring longboarding in Australia.",sizes:["9'0\"","9'3\"","9'6\""],catalogueSizeAliases:{"9'0\"":"9'1\""},colourKeys:["clear","beige","lightblue"],images:{},sizeGuide:[{size:"9'0\"",width:"22 1/2\"",thickness:"2 3/4\"",volume:"65.49 L"},{size:"9'3\"",width:"23\"",thickness:"2 15/16\"",volume:"72.59 L"},{size:"9'6\"",width:"23 3/8\"",thickness:"3 1/2\"",volume:"91.14 L"}],specs:[["Size range","9'0\"–9'6\""],["Size options","3"],["Colour options","3"],["Core","Premium EPS"],["Deck glass","6 oz + 4 oz + tail patch"],["Bottom glass","6 oz + tail patch"],["Fin setup","2+1"]],included:["Meridian board","2+1 fin package to be confirmed"],bestFor:"Longboard glide, trim, stability and surfers who value a flowing rather than compact shortboard feel.",notFor:"Customers wanting compact transport, shortboard-style pivot or a commercial teaching softboard.",why:"Three longboard sizes and a 2+1 setup support stability, trim and setup flexibility.",photoNeed:"Deck, bottom, nose, rail, tail and fin views are required in all three colours, plus trim or cross-stepping action."},
  {slug:"wayfinder",prefix:"AURA Wayfinder Surf School Softboard",name:"AURA PADDLE Wayfinder",short:"Wayfinder",series:"Surf School Softboard Series",category:"Commercial soft surfboard",description:"A commercial softboard family in six sizes and three colours for surf schools, rentals and teaching programmes.",status:"Commercial pre-order · 18 SKUs",badge:"School-ready",price:"From AUD $599",canBuy:true,stock:"Pre-order · 50% due today",metaDescription:"Durable 6ft 6in–9ft softboards for beginners, surf schools and hire fleets, with commercial support across Australia.",warrantyCopy:"Commercial warranty terms available with quotation",sizes:["6'6\"","7'0\"","7'6\"","8'0\"","8'6\"","9'0\""],colourKeys:["olivewhite","mintwhite","beigewhite"],images:{},sizeGuide:[{size:"6'6\"",width:"22\"",thickness:"2 13/16\"",volume:"46.06 L"},{size:"7'0\"",width:"22\"",thickness:"2 13/16\"",volume:"50.06 L"},{size:"7'6\"",width:"22 5/8\"",thickness:"2 7/8\"",volume:"56.13 L"},{size:"8'0\"",width:"22 7/8\"",thickness:"2 7/8\"",volume:"60.54 L"},{size:"8'6\"",width:"24\"",thickness:"3 1/2\"",volume:"87.72 L"},{size:"9'0\"",width:"24\"",thickness:"3 7/16\"",volume:"91.29 L"}],specs:[["Size range","6'6\"–9'0\""],["Size options","6"],["Colour options","3"],["Core","25 kg/m³ EPS"],["Reinforcement","Two T-stringers + bamboo support"],["Bottom","HDPE slick bottom"],["Deck","Croc-textured EVA"],["Rail protection","EVA rail bumpers"],["Handling","Integrated rescue handles"],["Instruction","Foot-placement cues"],["Fins","Durable plastic fins"]],included:["Wayfinder softboard","Durable plastic fins","Fleet sizing support","Replacement planning support"],bestFor:"Surf schools, hire fleets and teaching programmes that need six sizes and clear colour-based fleet planning.",notFor:"Customers seeking a performance EPS shortboard, minimal or longboard construction.",why:"Six sizes and three colours support rider matching, fleet identification and programme planning.",photoNeed:"All three colours need deck and bottom views, plus the complete six-size lineup, lesson, fleet-rack and safety-detail photography."},
  {slug:"vela-wakeboard",prefix:"AURA Vela Wakeboard",name:"AURA PADDLE Vela Wakeboard",short:"Vela Wakeboard",series:"Vela Performance Series",category:"Wakeboard",description:"A carbon-hybrid wakeboard package designed for responsive control and progression; production length requires final confirmation.",status:"Pre-launch · Dimension confirmation required",badge:"Wake",price:"Price on enquiry",canBuy:false,stock:"Pre-launch enquiry",sizes:["138 cm stated"],colourKeys:["carbon"],images:{},specs:[["Length","138 cm stated / catalogue also states 55\""],["Width","21.3\" / 44.7 cm stated"],["Depth","0.9\" / 2.9 cm stated"],["Construction","Carbon hybrid"],["Fin setup","4 removable fins"],["Package","Bindings and 18 m tow rope"]],included:["Vela wakeboard","Bindings","4 removable fins","18 m tow rope"],bestFor:"Wake riders seeking a responsive complete-package concept with bindings, fins and tow rope.",notFor:"Final purchase until the conflicting 55-inch and 138-centimetre length statements have been resolved.",why:"The planned carbon-hybrid construction and four-fin package focus on responsive control.",photoNeed:"Front, back, complete-package, construction-detail and branded on-water action photography are required."}
];

const metaDescriptions={
  "yoga-cruiser":"An extra-wide 11ft inflatable SUP for yoga, beginners and family paddling, with a stable 36in deck and Australia-wide delivery.",
  "angler-fishing":"A stable 12ft inflatable fishing SUP with 220kg capacity, rod and rack mounts, four colours and Australia-wide delivery.",
  "touring-performance":"A streamlined 14ft touring iSUP for tracking, distance and efficient glide, available in four colours across Australia.",
  "coast-go":"An approachable 10ft 6in all-round inflatable SUP package for beginners, weekends and easy transport across Australia.",
  "inflatable-hydrofoil":"A packable 5ft 7in, 110L inflatable hydrofoil board for wing-foil progression, travel and compact storage in Australia.",
  "hydrofoil-set":"A lightweight carbon-fibre hydrofoil kit with an aluminium-alloy fuselage, complete components and hardware for compatible foil boards in Australia.",
  "gannet":"A progressive 5ft 8in–6ft 10in EPS shortboard range for everyday surfing, with eight sizes and three colours in Australia.",
  "current":"A stable 7ft–8ft EPS minimal for beginners and progressing surfers seeking easy glide and control in Australian waves.",
  "meridian":"A lightweight 9ft–9ft 6in EPS longboard for all levels, especially beginner and intermediate surfers exploring longboarding.",
  "wayfinder":"Durable 6ft 6in–9ft softboards for beginners, surf schools and hire fleets, with commercial support across Australia.",
  "vela-wakeboard":"A carbon-hybrid 55in wakeboard package with bindings, four removable fins and an 18m tow rope for Australian riders."
};
for(const product of products)product.metaDescription=metaDescriptions[product.slug]||product.description;

// Customer-facing English copy. Commercial facts continue to come from the
// catalogue records and the locked pre-order configuration above.
const productCopy={
  "yoga-cruiser":{
    description:"A spacious, confidence-inspiring iSUP created for yoga, relaxed cruising and unhurried days on the water. Its 36-inch-wide deck gives you room to move, reset your stance or bring a seated passenger while the high-volume shape keeps the ride reassuringly composed.",
    bestFor:"SUP yoga, first-time paddlers who value stability, relaxed family outings and carrying a seated passenger within the stated capacity.",
    notFor:"Choose another board if outright touring speed, a narrow race-style feel or dedicated fishing mounts matter more than deck space and stability.",
    why:"The 36-inch platform and 285-litre volume create a steady, usable deck for movement, balance and easy-paced paddling."
  },
  "angler-fishing":{
    description:"A purpose-built fishing iSUP with the stability, carrying capacity and mounting options to organise a more capable day on the water. The open working deck accommodates tackle and equipment, while dedicated rod, rack and action-camera mounts keep essential gear within reach.",
    bestFor:"Anglers carrying more equipment, paddlers who value a stable working platform and anyone who wants integrated rod, rack and action-camera mounting positions.",
    notFor:"Choose another board if your priority is the lightest all-round package, a minimalist deck or the narrowest shape for distance-focused touring.",
    why:"A stated 220 kg capacity, 293.7-litre volume and fishing-specific mounting system create room for both the paddler and a carefully organised setup."
  },
  "touring-performance":{
    description:"A long, streamlined touring iSUP for paddlers who want to cover more water with less wasted effort. The 14-foot outline promotes clean tracking, while the V hull and speed tail are shaped to support glide and maintain momentum over longer distances.",
    bestFor:"Fitness paddles, longer coastal or flat-water routes and experienced riders who value tracking, glide and pace over maximum width.",
    notFor:"Choose another board for SUP yoga, equipment-heavy fishing or if you want the widest and most forgiving platform for a first paddle.",
    why:"Its 14-foot length, 30-inch width, V hull and speed tail favour directional efficiency and sustained glide."
  },
  "coast-go":{
    description:"An easy-going all-round iSUP package that makes getting on the water straightforward. The familiar 10'6\" shape blends everyday stability with manageable handling, then packs down for simple storage, transport and spontaneous weekend paddles.",
    bestFor:"First-time paddlers, casual beach and lake sessions, and customers who want an accessible complete package for everyday use.",
    notFor:"Choose another board for heavy fishing loads, a yoga-specific deck or the speed and tracking of a dedicated long-distance tourer.",
    why:"The 10'6\" × 33\" all-round format balances reassuring stability, practical portability and uncomplicated handling."
  },
  "inflatable-hydrofoil":{
    description:"A packable 110-litre inflatable platform for riders developing their wing-foil skills or travelling with limited storage space. The compact 5'7\" format keeps transport practical, while reinforced rails, a high-density EVA deck and a dedicated foil connection support confident progression.",
    bestFor:"Developing wing-foil riders who prioritise packability, convenient storage and an inflatable 110-litre platform.",
    notFor:"Choose another product if you need a rigid carbon foil board or expect the hydrofoil kit itself to be included with this board.",
    why:"The reinforced inflatable construction and compact format reduce transport and storage barriers while maintaining a dedicated foil connection and confident deck grip."
  },
  "gannet":{
    description:"A versatile EPS shortboard range for surfers ready to sharpen their turns without being locked into a single stock size. Eight lengths, three colourways and a five-fin configuration make it easier to select a board that suits your build, preferred setup and next stage of progression. Easy to pick up and ready for everyday sessions, Gannet is a dependable progression board for surfers building from beginner fundamentals towards confident intermediate and advanced surfing.",
    bestFor:"Surfers progressing from beginner fundamentals towards confident intermediate and advanced surfing who want responsive shortboard handling, a broad size ladder and the flexibility of a five-fin setup.",
    notFor:"Choose another board if you need the soft construction and generous stability of a first-lesson board, or the trim and glide of a longboard.",
    why:"Eight catalogue sizes support a more considered fit, while the five-fin layout allows different fin configurations as conditions and preferences change."
  },
  "current":{
    description:"An EPS minimal that brings together easy glide, useful volume and more manoeuvrability than a full longboard. Available in three graduated sizes, Current is designed to make wave entry feel less demanding while leaving room to refine turns and positioning. Exceptionally stable for a minimal, Current gives beginners a calm, confidence-building platform for catching more waves and progressing at their own pace.",
    bestFor:"Beginners, relaxed progression, smaller-wave sessions and riders who want more stability, paddle power and glide than a shortboard without moving to a full longboard.",
    notFor:"Choose another board for commercial surf-school use or if compact, highly reactive shortboard performance is your main objective.",
    why:"The minimal outline pairs accessible volume with a familiar thruster setup, bridging the space between shortboard response and longboard ease."
  },
  "meridian":{
    description:"A classic EPS longboard range shaped for early entry, steady trim and smooth, flowing lines. Three sizes let riders choose the balance of manoeuvrability and volume that suits them, while the 2+1 fin setup keeps configuration options open. Lightweight and versatile, Meridian is a longboard for surfers of all levels, with an especially friendly feel for beginner and intermediate riders who want to explore longboarding.",
    bestFor:"Surfers of all levels who are drawn to longboard glide, trim and stability, especially beginner and intermediate riders exploring longboarding.",
    notFor:"Choose another board if compact transport, shortboard-style pivot or commercial teaching durability is the priority.",
    why:"The longboard outline carries momentum and supports stable trim, while three sizes and a 2+1 setup provide useful fit and tuning choices."
  },
  "wayfinder":{
    description:"A commercial softboard system built around the day-to-day needs of surf schools, hire fleets and structured lesson programmes. Six sizes support better rider matching, while three clear colourways help instructors organise groups and manage fleet rotation at a glance. Built for durability and repeated use, Wayfinder is a dependable softboard for first-time and beginner surfers, as well as anyone looking for an approachable way to try surfing.",
    bestFor:"First-time and beginner surfers, surf schools, rental operators and teaching programmes that need an approachable softboard, a broad size run and durable fleet construction.",
    notFor:"Choose another board for the sharper response and construction feel of a performance EPS shortboard, minimal or longboard.",
    why:"Six sizes improve rider matching, while three colourways support fleet identification, lesson grouping and replacement planning."
  },
  "vela-wakeboard":{
    description:"A carbon-hybrid wakeboard concept built around responsive control and a ready-to-ride package. Bindings, four removable fins and an 18-metre tow rope are included in the planned setup.",
    bestFor:"Wake riders looking for a responsive complete-package concept with bindings, removable fins and tow rope included.",
    notFor:"Choose another board if you need a different size, flex pattern or riding-specific setup from the confirmed 55-inch package.",
    why:"The planned carbon-hybrid construction and four removable fins are intended to deliver direct control with setup flexibility."
  }
};
for(const product of products)Object.assign(product,productCopy[product.slug]);

// Latest confirmed Product Catalogue dimensions and construction (2026 FINAL).
Object.assign(products.find(product=>product.slug==="gannet"),{sizeGuide:[
  {size:"5'8\"",width:"22\"",thickness:"2 11/16\"",volume:"38.75 L"},
  {size:"5'10\"",width:"22 1/4\"",thickness:"2 13/16\"",volume:"42.18 L"},
  {size:"6'0\"",width:"22 1/2\"",thickness:"2 3/4\"",volume:"43.26 L"},
  {size:"6'2\"",width:"22 1/2\"",thickness:"2 7/8\"",volume:"46.33 L"},
  {size:"6'4\"",width:"22 3/4\"",thickness:"2 7/8\"",volume:"48.39 L"},
  {size:"6'6\"",width:"22 7/8\"",thickness:"2 7/8\"",volume:"50.13 L"},
  {size:"6'8\"",width:"23\"",thickness:"2 15/16\"",volume:"52.69 L"},
  {size:"6'10\"",width:"23\"",thickness:"3\"",volume:"55.27 L"}
]});
Object.assign(products.find(product=>product.slug==="current"),{images:{
  clear:["../assets/products/current/clear-white/AP200288_current-minimal_7ft0in_clear-white_hero-01.jpg","../assets/products/current/clear-white/AP200288_current-minimal_7ft0in_clear-white_deck-02.jpg","../assets/products/current/clear-white/AP200288_current-minimal_7ft0in_clear-white_bottom-03.jpg","../assets/products/current/clear-white/AP200288_current-minimal_7ft0in_clear-white_side-04.jpg","../assets/products/current/clear-white/AP200288_current-minimal_7ft0in_clear-white_three-quarter-05.jpg"],
  currentmint:["../assets/products/current/mint-white/AP558837_current-minimal_8ft0in_mint-white_hero-01.jpg","../assets/products/current/mint-white/AP558837_current-minimal_8ft0in_mint-white_deck-02.jpg","../assets/products/current/mint-white/AP558837_current-minimal_8ft0in_mint-white_bottom-03.jpg","../assets/products/current/mint-white/AP558837_current-minimal_8ft0in_mint-white_side-04.jpg","../assets/products/current/mint-white/AP011855_current-minimal_7ft0in_mint-white_three-quarter-05.jpg"],
  currentgrey:["../assets/products/current/grey-white/AP695811_current-minimal_7ft0in_grey-white_hero-01.jpg","../assets/products/current/grey-white/AP695811_current-minimal_7ft0in_grey-white_deck-02.jpg","../assets/products/current/grey-white/AP695811_current-minimal_7ft0in_grey-white_bottom-03.jpg","../assets/products/current/grey-white/AP695811_current-minimal_7ft0in_grey-white_side-04.jpg","../assets/products/current/grey-white/AP925022_current-minimal_7ft6in_grey-white_three-quarter-05.jpg"]
},photoNeed:"Five studio views are available for Clear White, Mint / White and Grey / White. Small-to-medium-wave action photography can be added when available.",sizeGuide:[
  {size:"7'0\"",width:"21 1/2\"",thickness:"2 11/16\"",volume:"46.54 L"},
  {size:"7'6\"",width:"22\"",thickness:"2 13/16\"",volume:"53.37 L"},
  {size:"8'0\"",width:"22 1/2\"",thickness:"3\"",volume:"62.39 L"}
]});
Object.assign(products.find(product=>product.slug==="meridian"),{
  images:{
    clear:["../assets/products/meridian/clear-white/AP665269_meridian-longboard_9ft1in_clear-white_hero-01.jpg","../assets/products/meridian/clear-white/AP665269_meridian-longboard_9ft1in_clear-white_deck-02.jpg","../assets/products/meridian/clear-white/AP665269_meridian-longboard_9ft1in_clear-white_bottom-03.jpg","../assets/products/meridian/clear-white/AP665269_meridian-longboard_9ft1in_clear-white_side-04.jpg","../assets/products/meridian/clear-white/AP665269_meridian-longboard_9ft1in_clear-white_three-quarter-05.jpg"],
    beige:["../assets/products/meridian/beige/AP875178_meridian-longboard_9ft1in_beige_hero-01.jpg","../assets/products/meridian/beige/AP875178_meridian-longboard_9ft1in_beige_deck-02.jpg","../assets/products/meridian/beige/AP875178_meridian-longboard_9ft1in_beige_bottom-03.jpg","../assets/products/meridian/beige/AP875178_meridian-longboard_9ft1in_beige_side-04.jpg","../assets/products/meridian/beige/AP875178_meridian-longboard_9ft1in_beige_three-quarter-05.jpg"],
    lightblue:["../assets/products/meridian/lt-blue/AP038101_meridian-longboard_9ft1in_lt-blue_hero-01.jpg","../assets/products/meridian/lt-blue/AP038101_meridian-longboard_9ft1in_lt-blue_deck-02.jpg","../assets/products/meridian/lt-blue/AP038101_meridian-longboard_9ft1in_lt-blue_bottom-03.jpg","../assets/products/meridian/lt-blue/AP038101_meridian-longboard_9ft1in_lt-blue_side-04.jpg","../assets/products/meridian/lt-blue/AP038101_meridian-longboard_9ft1in_lt-blue_three-quarter-05.jpg"]
  },
  photoNeed:"Five studio views are available for Clear White, Beige and Light Blue. Trim, cross-stepping and on-wave photography can be added when available.",
  sizes:["9'0\"","9'3\"","9'6\""],catalogueSizeAliases:{"9'0\"":"9'1\""},
  sizeGuide:[
    {size:"9'0\"",width:"22 1/2\"",thickness:"2 3/4\"",volume:"65.49 L"},
    {size:"9'3\"",width:"23\"",thickness:"2 15/16\"",volume:"72.59 L"},
    {size:"9'6\"",width:"23 3/8\"",thickness:"3 1/2\"",volume:"91.14 L"}
  ],
  specs:[["Size range","9'0\"–9'6\""],["Size options","3"],["Colour options","3"],["Core","Premium EPS"],["Deck glass","6 oz + 4 oz + tail patch"],["Bottom glass","6 oz + tail patch"],["Fin setup","2+1"]]
});
Object.assign(products.find(product=>product.slug==="wayfinder"),{images:{
  olivewhite:["../assets/products/wayfinder/olive-white/AP500687_wayfinder-softboard_6ft6in_olive-white_hero-01.jpg","../assets/products/wayfinder/olive-white/AP500687_wayfinder-softboard_6ft6in_olive-white_deck-02.jpg","../assets/products/wayfinder/olive-white/AP500687_wayfinder-softboard_6ft6in_olive-white_bottom-03.jpg","../assets/products/wayfinder/olive-white/AP500687_wayfinder-softboard_6ft6in_olive-white_side-04.jpg","../assets/products/wayfinder/olive-white/AP500687_wayfinder-softboard_6ft6in_olive-white_three-quarter-05.jpg","../assets/products/wayfinder/olive-white/AP500687_wayfinder-softboard_6ft6in_olive-white_fleet-lineup-08.jpg","../assets/products/wayfinder/wayfinder-cross-section.jpg"],
  mintwhite:["../assets/products/wayfinder/mint-white/AP606496_wayfinder-softboard_6ft6in_mint-white_hero-01.jpg","../assets/products/wayfinder/mint-white/AP606496_wayfinder-softboard_6ft6in_mint-white_deck-02.jpg","../assets/products/wayfinder/mint-white/AP606496_wayfinder-softboard_6ft6in_mint-white_bottom-03.jpg","../assets/products/wayfinder/mint-white/AP606496_wayfinder-softboard_6ft6in_mint-white_side-04.jpg","../assets/products/wayfinder/mint-white/AP606496_wayfinder-softboard_6ft6in_mint-white_three-quarter-05.jpg","../assets/products/wayfinder/mint-white/AP606496_wayfinder-softboard_6ft6in_mint-white_fleet-lineup-08.jpg","../assets/products/wayfinder/wayfinder-cross-section.jpg"],
  beigewhite:["../assets/products/wayfinder/beige-white/AP366317_wayfinder-softboard_6ft6in_beige-white_hero-01.jpg","../assets/products/wayfinder/beige-white/AP366317_wayfinder-softboard_6ft6in_beige-white_deck-02.jpg","../assets/products/wayfinder/beige-white/AP366317_wayfinder-softboard_6ft6in_beige-white_bottom-03.jpg","../assets/products/wayfinder/beige-white/AP366317_wayfinder-softboard_6ft6in_beige-white_side-04.jpg","../assets/products/wayfinder/beige-white/AP366317_wayfinder-softboard_6ft6in_beige-white_three-quarter-05.jpg","../assets/products/wayfinder/beige-white/AP366317_wayfinder-softboard_6ft6in_beige-white_fleet-lineup-08.jpg","../assets/products/wayfinder/wayfinder-cross-section.jpg"]
},photoNeed:"Complete studio and fleet-lineup image sets are available for Olive / White, Mint / White and Beige / White. Lesson, fleet-rack and safety-detail photography can be added when available.",sizeGuide:[
  {size:"6'6\"",width:"22\"",thickness:"2 13/16\"",volume:"46.06 L"},
  {size:"7'0\"",width:"22\"",thickness:"2 13/16\"",volume:"50.06 L"},
  {size:"7'6\"",width:"22 5/8\"",thickness:"2 7/8\"",volume:"56.13 L"},
  {size:"8'0\"",width:"22 7/8\"",thickness:"2 7/8\"",volume:"60.54 L"},
  {size:"8'6\"",width:"24\"",thickness:"3 1/2\"",volume:"87.72 L"},
  {size:"9'0\"",width:"24\"",thickness:"3 7/16\"",volume:"91.29 L"}
],specs:[["Size range","6'6\"–9'0\""],["Size options","6"],["Colour options","3"],["Core","25 kg/m³ EPS"],["Reinforcement","Two T-stringers + bamboo support"],["Bottom","HDPE slick bottom"],["Deck","Croc-textured EVA"],["Rail protection","EVA rail bumpers"],["Handling","Integrated rescue handles"],["Instruction","Foot-placement cues"],["Fins","Durable plastic fins"]]});
Object.assign(products.find(product=>product.slug==="vela-wakeboard"),{
  status:"Pre-launch",sizes:["55\" / 139.7 cm"],
  images:{carbon:["../assets/products/vela-wakeboard/carbon-green/AP829251_vela-wakeboard_55in_carbon-green_hero-01.jpg","../assets/products/vela-wakeboard/carbon-green/AP829251_vela-wakeboard_55in_carbon-green_front-02.jpg","../assets/products/vela-wakeboard/carbon-green/AP829251_vela-wakeboard_55in_carbon-green_back-03.jpg","../assets/products/vela-wakeboard/carbon-green/AP829251_vela-wakeboard_55in_carbon-green_side-04.jpg","../assets/products/vela-wakeboard/carbon-green/AP829251_vela-wakeboard_55in_carbon-green_three-quarter-05.jpg"]},
  photoNeed:"Five studio views are available in Carbon / Green, including hero, front, back, side and three-quarter views. Branded on-water wake photography can be added when available.",
  specs:[["Length","55\" / 139.7 cm"],["Width","17.6\" / 44.7 cm"],["Thickness","1.15\" / 2.9 cm"],["Construction","Carbon hybrid"],["Fin setup","4 removable fins"],["Package","Bindings and 18 m tow rope"]]
});
Object.assign(products.find(product=>product.slug==="angler-fishing"),{accessories:[{sku:"AP667703",name:"Fishing Rack",description:"A removable fishing rack for organising rods and essential gear on the Angler Fishing board.",image:"../assets/products/angler-fishing/accessories/AP667703_fishing-rack.png",cartImage:"assets/products/angler-fishing/accessories/AP667703_fishing-rack-cart.png",retailAUD:129,bundleAUD:69,bundleWith:"angler-fishing",discountAUD:0}]});

Object.assign(products.find(product=>product.slug==="yoga-cruiser"),{status:"Glacier Blue stock arriving next week · 3 colours join shared 50",stock:"Glacier Blue incoming · 50% due today"});
Object.assign(products.find(product=>product.slug==="coast-go"),{status:"All 3 colours on confirmed pre-order",stock:"Pre-order · 50% due today"});
Object.assign(products.find(product=>product.slug==="yoga-cruiser").images,{
  sandstone:[
    "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_hero-01.jpg",
    "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_deck-02.webp",
    "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_bottom-03.webp",
    "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_side-04.webp",
    "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_three-quarter-05.webp",
    "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_deck-detail-06.webp",
    "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_full-kit-07.jpg",
    "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_yoga-lifestyle-08.webp",
    "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_colour-lineup-09.webp"
  ],
  eucalyptus:[
    "../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_hero-01.jpg",
    "../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_deck-02.webp",
    "../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_bottom-03.webp",
    "../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_side-04.webp",
    "../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_three-quarter-05.webp",
    "../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_deck-detail-06.webp",
    "../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_full-kit-07.jpg",
    "../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_yoga-lifestyle-08.webp",
    "../assets/products/yoga-cruiser/eucalyptus-green/AP233694_yoga-cruiser_11ft_eucalyptus-green_colour-lineup-09.webp"
  ],
  coral:[
    "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_hero-01.jpg",
    "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_deck-02.webp",
    "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_bottom-03.webp",
    "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_side-04.webp",
    "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_three-quarter-05.webp",
    "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_deck-detail-06.webp",
    "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_full-kit-07.jpg",
    "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_yoga-lifestyle-08.webp",
    "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_colour-lineup-09.webp"
  ]
});
Object.assign(products.find(product=>product.slug==="angler-fishing"),{images:{
  glacier:["../assets/products/angler-fishing/glacier-blue/AP550986_angler-fishing_12ft_glacier-blue_hero-01.webp","../assets/products/angler-fishing/glacier-blue/AP550986_angler-fishing_12ft_glacier-blue_deck-02.webp","../assets/products/angler-fishing/glacier-blue/AP550986_angler-fishing_12ft_glacier-blue_bottom-03.webp","../assets/products/angler-fishing/glacier-blue/AP550986_angler-fishing_12ft_glacier-blue_side-04.webp","../assets/products/angler-fishing/glacier-blue/AP550986_angler-fishing_12ft_glacier-blue_three-quarter-05.webp","../assets/products/angler-fishing/glacier-blue/AP550986_angler-fishing_12ft_glacier-blue_mount-detail-06.webp","../assets/products/angler-fishing/glacier-blue/AP550986_angler-fishing_12ft_glacier-blue_full-kit-08.jpg","../assets/products/angler-fishing/glacier-blue/AP550986_angler-fishing_12ft_glacier-blue_fishing-lifestyle-09.webp"],
  sandstone:["../assets/products/angler-fishing/matte-sandstone/AP246179_angler-fishing_12ft_matte-sandstone_hero-01.webp","../assets/products/angler-fishing/matte-sandstone/AP246179_angler-fishing_12ft_matte-sandstone_deck-02.webp","../assets/products/angler-fishing/matte-sandstone/AP246179_angler-fishing_12ft_matte-sandstone_bottom-03.webp","../assets/products/angler-fishing/matte-sandstone/AP246179_angler-fishing_12ft_matte-sandstone_side-04.webp","../assets/products/angler-fishing/matte-sandstone/AP246179_angler-fishing_12ft_matte-sandstone_three-quarter-05.webp","../assets/products/angler-fishing/matte-sandstone/AP246179_angler-fishing_12ft_matte-sandstone_mount-detail-06.webp","../assets/products/angler-fishing/matte-sandstone/AP246179_angler-fishing_12ft_matte-sandstone_full-kit-08.jpg","../assets/products/angler-fishing/matte-sandstone/AP550986_angler-fishing_12ft_glacier-blue_fishing-lifestyle-09.webp"],
  eucalyptus:["../assets/products/angler-fishing/eucalyptus-green/AP560103_angler-fishing_12ft_eucalyptus-green_hero-01.webp","../assets/products/angler-fishing/eucalyptus-green/AP560103_angler-fishing_12ft_eucalyptus-green_deck-02.webp","../assets/products/angler-fishing/eucalyptus-green/AP560103_angler-fishing_12ft_eucalyptus-green_bottom-03.webp","../assets/products/angler-fishing/eucalyptus-green/AP560103_angler-fishing_12ft_eucalyptus-green_side-04.webp","../assets/products/angler-fishing/eucalyptus-green/AP560103_angler-fishing_12ft_eucalyptus-green_three-quarter-05.webp","../assets/products/angler-fishing/eucalyptus-green/AP560103_angler-fishing_12ft_eucalyptus-green_mount-detail-06.webp","../assets/products/angler-fishing/eucalyptus-green/AP560103_angler-fishing_12ft_eucalyptus-green_full-kit-08.jpg","../assets/products/angler-fishing/eucalyptus-green/AP550986_angler-fishing_12ft_glacier-blue_fishing-lifestyle-09.webp"],
  coral:["../assets/products/angler-fishing/coral-white/AP912342_angler-fishing_12ft_coral-white_hero-01.webp","../assets/products/angler-fishing/coral-white/AP912342_angler-fishing_12ft_coral-white_deck-02.webp","../assets/products/angler-fishing/coral-white/AP912342_angler-fishing_12ft_coral-white_bottom-03.webp","../assets/products/angler-fishing/coral-white/AP912342_angler-fishing_12ft_coral-white_side-04.webp","../assets/products/angler-fishing/coral-white/AP912342_angler-fishing_12ft_coral-white_three-quarter-05.webp","../assets/products/angler-fishing/coral-white/AP912342_angler-fishing_12ft_coral-white_mount-detail-06.webp","../assets/products/angler-fishing/coral-white/AP912342_angler-fishing_12ft_coral-white_full-kit-08.jpg","../assets/products/angler-fishing/coral-white/AP550986_angler-fishing_12ft_glacier-blue_fishing-lifestyle-09.webp"]
},photoNeed:"Detailed studio imagery is available for all four catalogue colours; supplied shared accessory and lifestyle views are used where provided."});
Object.assign(products.find(product=>product.slug==="coast-go"),{images:{
  blueorange:["../assets/products/coast-go/blue-orange/AP081165_coast-go-isup_10ft6in_blue-orange_hero-01.webp","../assets/products/coast-go/blue-orange/AP081165_coast-go-isup_10ft6in_blue-orange_deck-02.webp","../assets/products/coast-go/blue-orange/AP081165_coast-go-isup_10ft6in_blue-orange_bottom-03.webp","../assets/products/coast-go/blue-orange/AP081165_coast-go-isup_10ft6in_blue-orange_side-04.webp","../assets/products/coast-go/blue-orange/AP081165_coast-go-isup_10ft6in_blue-orange_three-quarter-05.webp","../assets/products/coast-go/blue-orange/AP081165_coast-go-isup_10ft6in_blue-orange_feature-detail-06.webp","../assets/products/coast-go/blue-orange/AP081165_coast-go-isup_10ft6in_blue-orange_full-kit-07.jpg"],
  mintgrey:["../assets/products/coast-go/mint-grey/AP730047_coast-go-isup_10ft6in_mint-grey_hero-01.webp","../assets/products/coast-go/mint-grey/AP730047_coast-go-isup_10ft6in_mint-grey_deck-02.webp","../assets/products/coast-go/mint-grey/AP730047_coast-go-isup_10ft6in_mint-grey_bottom-03.webp","../assets/products/coast-go/mint-grey/AP730047_coast-go-isup_10ft6in_mint-grey_side-04.webp","../assets/products/coast-go/mint-grey/AP730047_coast-go-isup_10ft6in_mint-grey_three-quarter-05.webp","../assets/products/coast-go/mint-grey/AP730047_coast-go-isup_10ft6in_mint-grey_feature-detail-06.webp","../assets/products/coast-go/mint-grey/AP730047_coast-go-isup_10ft6in_mint-grey_full-kit-07.jpg"],
  bluecoral:["../assets/products/coast-go/blue-coral/AP388238_coast-go-isup_10ft6in_blue-coral_hero-01.webp","../assets/products/coast-go/blue-coral/AP388238_coast-go-isup_10ft6in_blue-coral_deck-02.webp","../assets/products/coast-go/blue-coral/AP388238_coast-go-isup_10ft6in_blue-coral_bottom-03.webp","../assets/products/coast-go/blue-coral/AP388238_coast-go-isup_10ft6in_blue-coral_side-04.webp","../assets/products/coast-go/blue-coral/AP388238_coast-go-isup_10ft6in_blue-coral_three-quarter-05.webp","../assets/products/coast-go/blue-coral/AP388238_coast-go-isup_10ft6in_blue-coral_feature-detail-06.webp","../assets/products/coast-go/blue-coral/AP388238_coast-go-isup_10ft6in_blue-coral_full-kit-07.jpg"]
},photoNeed:"Detailed studio imagery and a full-kit accessory view are available for all three CoastGo colours. On-water lifestyle photography can be added when available."});
Object.assign(products.find(product=>product.slug==="touring-performance"),{images:{
  glacier:["../assets/products/touring-performance/glacier-blue/AP881762_touring-performance_14ft_glacier-blue_hero-01.webp","../assets/products/touring-performance/glacier-blue/AP881762_touring-performance_14ft_glacier-blue_deck-02.webp","../assets/products/touring-performance/glacier-blue/AP881762_touring-performance_14ft_glacier-blue_bottom-03.webp","../assets/products/touring-performance/glacier-blue/AP881762_touring-performance_14ft_glacier-blue_side-04.webp","../assets/products/touring-performance/glacier-blue/AP881762_touring-performance_14ft_glacier-blue_three-quarter-05.webp","../assets/products/touring-performance/glacier-blue/AP881762_touring-performance_14ft_glacier-blue_nose-hull-detail-06.webp","../assets/products/touring-performance/glacier-blue/AP881762_touring-performance_14ft_glacier-blue_full-kit-08.jpg","../assets/products/touring-performance/glacier-blue/AP881762_touring-performance_14ft_glacier-blue_touring-lineup-09.webp"],
  sandstone:["../assets/products/touring-performance/matte-sandstone/AP804412_touring-performance_14ft_matte-sandstone_hero-01.webp","../assets/products/touring-performance/matte-sandstone/AP804412_touring-performance_14ft_matte-sandstone_deck-02.webp","../assets/products/touring-performance/matte-sandstone/AP804412_touring-performance_14ft_matte-sandstone_bottom-03.webp","../assets/products/touring-performance/matte-sandstone/AP804412_touring-performance_14ft_matte-sandstone_side-04.webp","../assets/products/touring-performance/matte-sandstone/AP804412_touring-performance_14ft_matte-sandstone_three-quarter-05.webp","../assets/products/touring-performance/matte-sandstone/AP804412_touring-performance_14ft_matte-sandstone_nose-hull-detail-06.webp","../assets/products/touring-performance/matte-sandstone/AP804412_touring-performance_14ft_matte-sandstone_full-kit-08.jpg","../assets/products/touring-performance/matte-sandstone/AP804412_touring-performance_14ft_matte-sandstone_touring-lineup-09.webp"],
  eucalyptus:["../assets/products/touring-performance/eucalyptus-green/AP511450_touring-performance_14ft_eucalyptus-green_hero-01.webp","../assets/products/touring-performance/eucalyptus-green/AP511450_touring-performance_14ft_eucalyptus-green_deck-02.webp","../assets/products/touring-performance/eucalyptus-green/AP511450_touring-performance_14ft_eucalyptus-green_bottom-03.webp","../assets/products/touring-performance/eucalyptus-green/AP511450_touring-performance_14ft_eucalyptus-green_side-04.webp","../assets/products/touring-performance/eucalyptus-green/AP511450_touring-performance_14ft_eucalyptus-green_three-quarter-05.webp","../assets/products/touring-performance/eucalyptus-green/AP511450_touring-performance_14ft_eucalyptus-green_nose-hull-detail-06.webp","../assets/products/touring-performance/eucalyptus-green/AP511450_touring-performance_14ft_eucalyptus-green_full-kit-08.jpg","../assets/products/touring-performance/eucalyptus-green/AP511450_touring-performance_14ft_eucalyptus-green_touring-lineup-09.webp"],
  coral:["../assets/products/touring-performance/coral-white/AP168023_touring-performance_14ft_coral-white_hero-01.webp","../assets/products/touring-performance/coral-white/AP168023_touring-performance_14ft_coral-white_deck-02.webp","../assets/products/touring-performance/coral-white/AP168023_touring-performance_14ft_coral-white_bottom-03.webp","../assets/products/touring-performance/coral-white/AP168023_touring-performance_14ft_coral-white_side-04.webp","../assets/products/touring-performance/coral-white/AP168023_touring-performance_14ft_coral-white_three-quarter-05.webp","../assets/products/touring-performance/coral-white/AP168023_touring-performance_14ft_coral-white_nose-hull-detail-06.webp","../assets/products/touring-performance/coral-white/AP168023_touring-performance_14ft_coral-white_full-kit-08.jpg","../assets/products/touring-performance/coral-white/AP168023_touring-performance_14ft_coral-white_touring-lineup-09.webp"]
},photoNeed:"Detailed studio imagery, full-kit and range-lineup views are available for all four catalogue colours. On-water touring photography can be added when available."});
products.find(product=>product.slug==="coast-go").images.mintgrey[0]="../assets/products/coast-go/mint-grey/AP730047_coast-go-isup_10ft6in_mint-grey_hero-01.jpg";
Object.assign(products.find(product=>product.slug==="inflatable-hydrofoil"),{images:{
  foil:["../assets/products/inflatable-hydrofoil/carbon-and-teal/AP428330_inflatable-hydrofoil_5ft8in_carbon-and-teal_hero-01.webp","../assets/products/inflatable-hydrofoil/carbon-and-teal/AP428330_inflatable-hydrofoil_5ft8in_carbon-and-teal_deck-02.webp","../assets/products/inflatable-hydrofoil/carbon-and-teal/AP428330_inflatable-hydrofoil_5ft8in_carbon-and-teal_bottom-03.webp","../assets/products/inflatable-hydrofoil/carbon-and-teal/AP428330_inflatable-hydrofoil_5ft8in_carbon-and-teal_side-04.webp","../assets/products/inflatable-hydrofoil/carbon-and-teal/AP428330_inflatable-hydrofoil_5ft8in_carbon-and-teal_foil-connection-detail-05.webp"]
},photoNeed:"Detailed board studio imagery and foil-connection detail are available. Complete assembled-system, verified kit flat lay, packed-bag and on-water action photography are still required."});
Object.assign(products.find(product=>product.slug==="hydrofoil-set"),{images:{
  standard:["../assets/products/hydrofoil-kit-set/standard/AP246531_hydrofoil-kit-set_foil-01.jpg","../assets/products/hydrofoil-kit-set/standard/AP246531_hydrofoil-kit-set_all-parts-02.jpg","../assets/products/hydrofoil-kit-set/standard/AP246531_hydrofoil-kit-set_detail-03.jpg","../assets/products/hydrofoil-kit-set/standard/AP246531_hydrofoil-kit-set_detail-04.jpg","../assets/products/hydrofoil-kit-set/standard/AP246531_hydrofoil-kit-set_detail-05.jpg","../assets/products/hydrofoil-kit-set/standard/AP246531_hydrofoil-kit-set_bag-06.jpg","../assets/products/hydrofoil-kit-set/standard/AP246531_hydrofoil-kit-set_foil-07.jpg"]
},photoNeed:"Complete product, component, detail and carry-bag photography is available."});
Object.assign(products.find(product=>product.slug==="gannet"),{images:{
  clear:[
    "../assets/products/gannet/clear-white/AP579723_gannet-shortboard_5ft8in_clear-white_hero-01.jpg",
    "../assets/products/gannet/clear-white/AP579723_gannet-shortboard_5ft8in_clear-white_deck-02.jpg",
    "../assets/products/gannet/clear-white/AP579723_gannet-shortboard_5ft8in_clear-white_bottom-03.jpg",
    "../assets/products/gannet/clear-white/AP579723_gannet-shortboard_5ft8in_clear-white_side-04.jpg",
    "../assets/products/gannet/clear-white/AP579723_gannet-shortboard_5ft8in_clear-white_three-quarter-05.jpg",
    "../assets/products/gannet/clear-white/AP579723_gannet-shortboard_5ft8in_clear-white_size-lineup-09.jpg"
  ],
  beigewhite:[
    "../assets/products/gannet/beige-white/AP074024_gannet-shortboard_5ft8in_beige-white_hero-01.jpg",
    "../assets/products/gannet/beige-white/AP074024_gannet-shortboard_5ft8in_beige-white_deck-02.jpg",
    "../assets/products/gannet/beige-white/AP074024_gannet-shortboard_5ft8in_beige-white_bottom-03.jpg",
    "../assets/products/gannet/beige-white/AP074024_gannet-shortboard_5ft8in_beige-white_side-04.jpg",
    "../assets/products/gannet/beige-white/AP074024_gannet-shortboard_5ft8in_beige-white_three-quarter-05.jpg",
    "../assets/products/gannet/beige-white/AP074024_gannet-shortboard_5ft8in_beige-white_size-lineup-09.jpg"
  ],
  purplewhite:[
    "../assets/products/gannet/purple-white/AP023909_gannet-shortboard_5ft8in_purple-white_hero-01.jpg",
    "../assets/products/gannet/purple-white/AP023909_gannet-shortboard_5ft8in_purple-white_deck-02.jpg",
    "../assets/products/gannet/purple-white/AP023909_gannet-shortboard_5ft8in_purple-white_bottom-03.jpg",
    "../assets/products/gannet/purple-white/AP023909_gannet-shortboard_5ft8in_purple-white_side-04.jpg",
    "../assets/products/gannet/purple-white/AP023909_gannet-shortboard_5ft8in_purple-white_three-quarter-05.jpg",
    "../assets/products/gannet/purple-white/AP023909_gannet-shortboard_5ft8in_purple-white_size-lineup-09.jpg"
  ]
},photoNeed:"Complete 1600 × 1600 studio image sets are available for Clear White, Beige / White and Purple / White, including hero, deck, bottom, side, three-quarter and full size-lineup views."});

function esc(value){return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
function sizeSpecFor(product,size){return product.sizeGuide?.find(item=>item.size===size)}
function getVariants(product){
  if(product.manualVariants)return product.manualVariants.map(variant=>{
    const colour=colours[variant.colourKey];
    if(!colour)throw new Error(`Missing colour configuration for ${product.slug} / ${variant.colourKey}`);
    return {...variant,colour:colour.name,purchaseUSD:null,available:false,orderMode:"preorder",preorder:campaignFor(product)};
  });
  const matches=rows.filter(row=>String(row[4]||"").startsWith(product.prefix));
  return product.sizes.flatMap(size=>product.colourKeys.map(key=>{
    const colour=colours[key];
    const catalogueSize=product.catalogueSizeAliases?.[size]||size;
    const row=matches.find(candidate=>{
      const name=String(candidate[4]||"");
      if(product.sizes.length>1)return name.includes(`— ${catalogueSize} — ${colour.catalogue}`);
      if(matches.length===1)return true;
      return name.endsWith(`— ${colour.catalogue}`);
    });
    if(!row)throw new Error(`Missing SKU for ${product.slug} / ${size} / ${colour.catalogue}`);
    const available=false;
    const preorder=(product.slug==="yoga-cruiser"&&key==="glacier")||product.slug==="coast-go"?confirmedPreorderFor(product):campaignFor(product);
    const sizeSpec=sizeSpecFor(product,size);
    return {
      size,
      colourKey:key,
      colour:colour.name,
      sku:row[2],
      specification:sizeSpec?`${sizeSpec.size} × ${sizeSpec.width} × ${sizeSpec.thickness}; ${sizeSpec.volume}; ${colour.catalogueDisplay||colour.catalogue}`:row[6],
      purchaseUSD:row[7],
      retailAUD:rrpOverrides[row[2]]??row[8],
      available,
      orderMode:available?"available":"preorder",
      preorder
    };
  }));
}

function schemaFor(product,variants){
  const canonical=`https://www.aurapaddle.com/products/${product.slug}.html`;
  const hasVariant=variants.map(v=>{
    const node={"@type":"Product","name":`${product.name} — ${v.size} — ${v.colour}`,"sku":v.sku,"color":v.colour,"size":v.size,"url":`${canonical}?size=${encodeURIComponent(v.size)}&colour=${v.colourKey}`,"brand":{"@type":"Brand","name":"AURA PADDLE"}};
    const images=product.images[v.colourKey]||[];
    if(images.length)node.image=images.map(src=>src.replace("../","https://www.aurapaddle.com/"));
    const sizeSpec=sizeSpecFor(product,v.size);
    if(sizeSpec)node.additionalProperty=[{"@type":"PropertyValue","name":"Width","value":sizeSpec.width},{"@type":"PropertyValue","name":"Thickness","value":sizeSpec.thickness},{"@type":"PropertyValue","name":"Volume","value":sizeSpec.volume}];
    if(v.retailAUD){node.offers={"@type":"Offer","price":sellingPrice(v),"priceCurrency":"AUD","availability":v.available?"https://schema.org/InStock":"https://schema.org/PreOrder","url":node.url,"seller":{"@id":"https://www.aurapaddle.com/#organization"},hasMerchantReturnPolicy:merchantPolicy};if(!v.available&&v.preorder.deadlineISO)node.offers.priceValidUntil=v.preorder.deadlineISO}
    return node;
  });
  return {"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"https://www.aurapaddle.com/#organization","name":"AURA PADDLE","legalName":"Aura Paddle Pty Ltd","url":"https://www.aurapaddle.com/","email":"admin@aurapaddle.com","identifier":[{"@type":"PropertyValue","propertyID":"ABN","value":"46 697 865 759"},{"@type":"PropertyValue","propertyID":"ACN","value":"697 865 759"}],"hasMerchantReturnPolicy":merchantPolicy},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://www.aurapaddle.com/"},{"@type":"ListItem","position":2,"name":"Shop","item":"https://www.aurapaddle.com/shop/"},{"@type":"ListItem","position":3,"name":product.short,"item":canonical}]},{"@type":"ProductGroup","@id":`${canonical}#product`,"name":product.name,"description":product.description,"url":canonical,"brand":{"@type":"Brand","name":"AURA PADDLE"},"productGroupID":`AURA-${product.slug.toUpperCase()}`,"variesBy":["https://schema.org/size","https://schema.org/color"],"hasVariant":hasVariant}]};
}

function htmlFor(product){
  const variants=getVariants(product),first=variants[0],colourList=product.colourKeys.map(key=>({...colours[key],key,images:product.images[key]||[]}));
  const firstSizeSpec=sizeSpecFor(product,first.size);
  const firstIsPreorder=first.orderMode==="preorder",hasPreorder=variants.some(v=>v.orderMode==="preorder"),defaultCampaign=variants.find(v=>v.orderMode==="preorder")?.preorder||{name:"Pre-order",title:"",target:0,deadline:"",estimatedDelivery:"",discountAUD:0,payment:"",description:""};
  const firstItemLabel=defaultCampaign.itemLabel||"board";
  const firstPrice=first.retailAUD?`AUD $${sellingPrice(first)}`:product.price;
  const canonical=`https://www.aurapaddle.com/products/${product.slug}.html`;
  const ogImage=(colourList.find(c=>c.images.length)?.images[0]||"../WEBSITE_HERO_IMAGE_1600_900.png").replace("../","https://www.aurapaddle.com/");
  const title=`${product.short} | ${product.category} | AURA PADDLE Australia`;
  const sizeGuideMarkup=product.sizeGuide?.length?`<div class="size-guide-wrap"><p class="size-guide-note">Catalogue dimensions and volume by size</p><div class="size-guide-scroll"><table class="size-guide-table"><thead><tr><th>Length</th><th>Width</th><th>Thickness</th><th>Volume</th></tr></thead><tbody>${product.sizeGuide.map(item=>`<tr data-guide-size="${esc(item.size)}"><td>${esc(item.size)}</td><td>${esc(item.width)}</td><td>${esc(item.thickness)}</td><td>${esc(item.volume)}</td></tr>`).join("")}</tbody></table></div></div>`:"";
  const accessoryMarkup=(product.accessories||[]).map(item=>`<section class="accessory-offer">${item.image?`<img class="accessory-image" src="${esc(item.image)}" alt="${esc(item.name)} — ${esc(item.sku)}">`:""}<div><p class="section-label">Pre-order accessory · SKU ${esc(item.sku)}</p><h2>${esc(item.name)}</h2><p>${esc(item.description)}</p><div class="accessory-prices"><span><b>AUD $${item.retailAUD}</b> separately</span><span><b>AUD $${item.bundleAUD}</b> with an Angler Fishing board</span></div><small>50% due when ordered and 50% before dispatch. This accessory does not receive the AUD $50 pre-order incentive.</small></div><button class="btn btn-outline" type="button" data-add-accessory="${esc(item.sku)}">Add Fishing Rack</button></section>`).join("");
  const publicVariants=variants.map(({purchaseUSD,...variant})=>variant);
  const pageData={...product,colours:colourList,variants:publicVariants};delete pageData.images;delete pageData.colourKeys;delete pageData.prefix;delete pageData.catalogueSizeAliases;delete pageData.manualVariants;
  return `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(product.metaDescription||product.description)}"><meta name="robots" content="index,follow,max-image-preview:large"><meta name="theme-color" content="#071f2d"><link rel="canonical" href="${canonical}">
<meta property="og:type" content="product"><meta property="og:site_name" content="AURA PADDLE"><meta property="og:title" content="${esc(product.name)}"><meta property="og:description" content="${esc(product.description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${ogImage}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../logo.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&amp;family=Manrope:wght@400;500;600;700&amp;display=swap" rel="stylesheet"><link rel="stylesheet" href="../product-page.css?v=20260830-conversion"><link rel="stylesheet" href="../cookie-consent.css">
<script type="application/ld+json">${JSON.stringify(schemaFor(product,variants))}</script></head>
<body><header class="site-header"><div class="wrap nav"><a class="brand" href="../redesign-preview.html" aria-label="AURA PADDLE home">AURA PADDLE</a><nav class="nav-links" aria-label="Primary navigation"><a href="../redesign-preview.html">Home</a><a class="active" href="../shop-preview.html">Shop</a><a href="../redesign-preview.html#finder">Find your board</a><a href="../our-story.html">Our story</a><a href="../support.html">Support</a><a class="cart-link" data-cart-label href="../cart-preview.html">Cart <span class="cart-count" data-cart-count hidden>0</span></a></nav><a class="btn btn-coral" href="../contact.html">Talk to AURA PADDLE</a><button class="menu-button" id="menuButton" aria-expanded="false" aria-controls="mobileMenu" aria-label="Open menu">☰</button></div></header>
<nav class="mobile-menu" id="mobileMenu" aria-label="Mobile navigation"><a href="../redesign-preview.html">Home</a><a href="../shop-preview.html">Shop</a><a href="../redesign-preview.html#finder">Find your board</a><a href="../our-story.html">Our story</a><a href="../support.html">Support</a><a data-cart-label href="../cart-preview.html">Cart <span class="cart-count" data-cart-count hidden>0</span></a></nav>
<main><section class="product-page"><div class="wrap product-layout"><div class="product-stage"><div class="thumb-strip" id="thumbStrip" aria-label="Product images"><button class="thumb active" type="button"><span class="thumb-placeholder">Loading</span></button></div><div class="main-image" id="mainImage"><div class="image-placeholder"><div class="placeholder-board"></div><strong>${esc(first.colour)}</strong></div></div></div>
<div class="product-info"><div class="breadcrumb"><a href="../shop-preview.html#products">Shop</a><span>›</span><span>${esc(product.short)}</span></div><p class="eyebrow">${esc(product.series)}</p><h1>${esc(product.name)}</h1><p class="subtitle">${esc(product.description)}</p><div class="availability" id="availability"><i class="status-dot${firstIsPreorder?" preorder":""}"></i><span id="availabilityText">${firstIsPreorder?`Pre-order · ${esc(preorderStatus(first.preorder))}`:"Available now"}</span></div><div class="price-row"><span class="price" id="productPrice">${esc(firstPrice)}</span><del class="original-price" id="originalPrice"${firstIsPreorder&&first.retailAUD?"":" hidden"}>${first.retailAUD?`AUD $${first.retailAUD}`:""}</del><span class="badge">${esc(product.badge)}</span></div><p class="price-note" id="priceNote">${firstIsPreorder?`Eligible ${esc(firstItemLabel)} offer · AUD $50 incentive included · 50% due today`:"Australia-only range · Shipping calculated separately · See policy terms"}</p>
<div class="selector"><p class="section-label">Size — <strong id="selectedSize">${esc(product.sizes[0])}</strong></p><div class="option-row">${product.sizes.map((size,index)=>`<button class="size-option${index===0?" active":""}" type="button" data-size="${esc(size)}" aria-pressed="${index===0}">${esc(size)}</button>`).join("")}</div></div>
<div class="selector"><p class="section-label">Colour — <strong id="selectedColour">${esc(first.colour)}</strong></p><div class="option-row">${colourList.map((colour,index)=>{const colourVariant=variants.find(v=>v.size===first.size&&v.colourKey===colour.key),campaign=colourVariant?.preorder||{},target=campaign.target||1,reserved=campaign.reserved||0,percent=Math.min(100,Math.round(reserved/target*100)),available=colourVariant?.available,threshold=campaign.thresholdRequired!==false;return `<button class="colour-option${index===0?" active":""}" type="button" data-colour="${colour.key}" aria-pressed="${index===0}"><span class="swatch" style="--swatch:${colour.swatch}"></span><span class="colour-name">${esc(colour.name)}</span><small class="colour-status">${available?"Available":threshold?`${esc(campaign.scopeLabel)} · ${reserved}/${target}`:"Confirmed pre-order · No minimum"}</small><span class="colour-progress"${available||!threshold?" hidden":""} role="progressbar" aria-label="${esc(campaign.name||colour.name)} paid pre-order progress" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${reserved}"><span style="width:${percent}%"></span></span></button>`}).join("")}</div></div>
<div class="sku-box${firstSizeSpec?" has-size-guide":""}"><div><b>Selected SKU</b><span id="selectedSku">${first.sku}</span></div><div><b>Variant</b><span id="selectedVariant">${esc(first.size)} · ${esc(first.colour)}</span></div>${firstSizeSpec?`<div><b>Dimensions</b><span id="selectedDimensions">${esc(firstSizeSpec.size)} × ${esc(firstSizeSpec.width)} × ${esc(firstSizeSpec.thickness)}</span></div><div><b>Volume</b><span id="selectedVolume">${esc(firstSizeSpec.volume)}</span></div>`:""}</div>
<section class="preorder-panel" id="preorderPanel"${firstIsPreorder?"":" hidden"} aria-labelledby="preorderTitle"><div class="preorder-top"><div><p class="section-label" id="preorderKicker">${esc(defaultCampaign.name)}</p><h2 id="preorderTitle">${esc(defaultCampaign.title)}</h2></div><strong id="preorderCount"${defaultCampaign.thresholdRequired===false?" hidden":""}>0 / ${defaultCampaign.target}</strong></div><div class="preorder-track"${defaultCampaign.thresholdRequired===false?" hidden":""} role="progressbar" aria-valuemin="0" aria-valuemax="${defaultCampaign.target||1}" aria-valuenow="0" aria-label="${esc(defaultCampaign.name)} paid pre-order progress"><span id="preorderProgress" style="width:0%"></span></div><div class="preorder-meta"><span><b id="preorderDeadlineLabel">${defaultCampaign.thresholdRequired===false?"Production condition":"Closing date"}</b><span id="preorderDeadline">${esc(defaultCampaign.thresholdRequired===false?"No minimum quantity":defaultCampaign.deadline)}</span></span><span><b>Estimated dispatch</b><span id="preorderDelivery">${esc(defaultCampaign.estimatedDelivery)}</span></span><span><b>Pre-order incentive</b><span id="preorderDiscount">AUD $${defaultCampaign.discountAUD} off each eligible ${esc(firstItemLabel)}</span></span><span><b>Payment</b><span id="preorderPayment">${esc(defaultCampaign.payment)}</span></span></div><p id="preorderCopy">${esc(defaultCampaign.description)}${defaultCampaign.thresholdRequired===false?"":" If the target is not reached by the closing date, all affected orders will be cancelled and fully refunded to their original payment method."}</p></section>
${accessoryMarkup}<div class="qty-row"><p class="section-label" style="margin:0">Quantity</p><div class="qty-control"><button id="qtyDown" type="button" aria-label="Decrease quantity">−</button><span id="quantity">1</span><button id="qtyUp" type="button" aria-label="Increase quantity">+</button></div><span class="stock-copy" id="stockCopy">${esc(product.stock)}</span></div><div class="cta-stack" id="purchaseActions"></div><div class="trust-strip"><div class="trust-item"><b>→</b>Australia-wide delivery</div><div class="trust-item"><b>↩</b>Returns guidance</div><div class="trust-item"><b>◇</b>${esc(product.warrantyCopy||"2-year recreational warranty")}</div><div class="trust-item"><b>◷</b>Australian support</div></div>
<div class="details"><div class="detail-item open"><button class="detail-head" type="button" aria-expanded="true">Product specifications <span>+</span></button><div class="detail-body">${sizeGuideMarkup}<table class="spec-table">${product.specs.map(row=>`<tr><td>${esc(row[0])}</td><td>${esc(row[1])}</td></tr>`).join("")}</table></div></div><div class="detail-item"><button class="detail-head" type="button" aria-expanded="false">What's included <span>+</span></button><div class="detail-body"><div class="included">${product.included.map(item=>`<div>✓ ${esc(item)}</div>`).join("")}</div></div></div>${hasPreorder?`<div class="detail-item"><button class="detail-head" type="button" aria-expanded="false">Pre-order terms <span>+</span></button><div class="detail-body" id="preorderTermsBody">${esc(preorderTermsCopy(defaultCampaign))}</div></div>`:""}<div class="detail-item"><button class="detail-head" type="button" aria-expanded="false">Shipping and support <span>+</span></button><div class="detail-body">Australia-wide shipping is confirmed and included with the remaining-balance request before dispatch. See the <a href="../policy-preview.html#shipping">Shipping Policy</a>, <a href="../policy-preview.html#returns">Returns &amp; Refunds</a> and warranty conditions.</div></div></div></div></div></section>
<section class="answer-grid"><div class="wrap"><p class="eyebrow">Product guidance</p><h2>Is ${esc(product.short)} right for you?</h2><div class="answer-cards"><article class="answer-card"><h3>Best for</h3><p>${esc(product.bestFor)}</p></article><article class="answer-card"><h3>Consider another option if</h3><p>${esc(product.notFor)}</p></article><article class="answer-card"><h3>Why this design</h3><p>${esc(product.why)}</p></article></div></div></section>
<section class="reviews" id="reviews"><div class="wrap"><div class="reviews-head"><div><p class="eyebrow">Customer reviews</p><h2>Share your experience with ${esc(product.short)}.</h2></div><p>Reviews are checked before publication so product feedback stays useful, relevant and respectful.</p></div><div class="reviews-grid"><article class="reviews-summary"><div class="reviews-stars" aria-hidden="true">☆☆☆☆☆</div><h3>No published reviews yet</h3><p>Have you used this product? Be the first to submit a review for the AURA PADDLE team to moderate.</p><small>Submitting a review does not guarantee publication. AURA PADDLE may contact you to verify your experience.</small></article><form class="review-form" id="reviewForm" action="https://formspree.io/f/xaqrowoy" method="post"><div class="review-field"><label for="reviewName">Your name</label><input id="reviewName" name="reviewer_name" autocomplete="name" required></div><div class="review-field"><label for="reviewEmail">Email <small>(not published)</small></label><input id="reviewEmail" name="reviewer_email" type="email" autocomplete="email" required></div><fieldset class="review-rating"><legend>Your rating</legend><div>${[1,2,3,4,5].map(rating=>`<label><input type="radio" name="rating" value="${rating}" required><span>${rating} ★</span></label>`).join("")}</div></fieldset><div class="review-field full"><label for="reviewTitle">Review title</label><input id="reviewTitle" name="review_title" maxlength="80" required></div><div class="review-field full"><label for="reviewBody">Your review</label><textarea id="reviewBody" name="review_body" minlength="20" maxlength="1500" required placeholder="What did you use it for, and how did it perform?"></textarea></div><label class="review-consent full"><input type="checkbox" name="publication_consent" value="yes" required><span>I confirm this is my own experience and agree that AURA PADDLE may publish this review after moderation.</span></label><input type="hidden" name="product" value="${esc(product.name)}"><input type="hidden" name="product_sku" value="${esc(first.sku)}"><input type="hidden" name="source" value="Product review — ${esc(product.short)}"><input type="hidden" name="_subject" value="AURA PADDLE product review — ${esc(product.short)}"><input class="review-honeypot" type="text" name="_gotcha" tabindex="-1" autocomplete="off"><button class="btn btn-dark" type="submit">Submit review</button><p class="review-privacy">Your email is used only to administer or verify this review. See our <a href="../policy-preview.html#privacy">Privacy Policy</a>.</p><p class="review-status full" id="reviewStatus" role="status" aria-live="polite"></p></form></div></div></section>
<section class="more-range"><div class="wrap"><p class="eyebrow">Keep exploring</p><h2>Find the right board for your water.</h2><div class="more-actions"><a class="btn btn-dark" href="../shop-preview.html#products">Back to all products</a><a class="btn btn-outline" href="../redesign-preview.html#finder">Use the board finder</a></div></div></section></main>
<footer><div class="wrap footer-row"><span>© 2026 AURA Paddle Pty Ltd · ABN 46 697 865 759 · ACN 697 865 759</span><span><a href="../shop-preview.html">Shop</a> · <a href="../contact.html">Contact</a> · <a href="../policy-preview.html#shipping">Shipping</a> · <a href="../policy-preview.html#returns">Returns</a> · Australia-only offline preview</span></div></footer>
<dialog id="stripeDialog"><div class="modal"><div class="modal-top"><div><p class="eyebrow" id="checkoutEyebrow">Secure Stripe checkout</p><h2 id="checkoutTitle">Review your order</h2></div><button class="modal-close" type="button" aria-label="Close">×</button></div><p id="checkoutSummary"></p><div class="checkout-status" id="checkoutStatus"><strong>Secure checkout:</strong> Your order and payment amount will be securely verified before continuing to Stripe.</div><button class="btn btn-dark" id="checkoutButton" type="button" style="width:100%;margin-top:1rem">Continue to secure checkout</button></div></dialog>
<script id="product-data" type="application/json">${JSON.stringify(pageData).replaceAll("<","\\u003c")}</script><script src="../cart.js?v=20260815-rack-image"></script><script src="../stripe-config.js"></script><script src="../product-page.js?v=20260830-conversion"></script><script src="../cookie-consent.js?v=20260902-consent-form-noise"></script><script src="../site-analytics.js?v=20260825-key-events"></script></body></html>`;
}

fs.mkdirSync(path.join(siteDir,"products"),{recursive:true});
fs.mkdirSync(path.join(siteDir,"payments"),{recursive:true});
const paymentCatalogue=products.flatMap(product=>getVariants(product).filter(variant=>Number(variant.retailAUD)>0).map(variant=>({
  sku:variant.sku,
  slug:product.slug,
  productName:product.name,
  shortName:product.short,
  description:product.description,
  size:variant.size,
  colour:variant.colour,
  colourKey:variant.colourKey,
  currency:"aud",
  retailAmount:Number(variant.retailAUD)*100,
  checkoutAmount:sellingPrice(variant)*100,
  depositAmount:variant.orderMode==="preorder"?sellingPrice(variant)*50:sellingPrice(variant)*100,
  orderMode:variant.orderMode,
  available:variant.available,
  productUrl:`https://www.aurapaddle.com/products/${product.slug}.html?size=${encodeURIComponent(variant.size)}&colour=${variant.colourKey}`,
  campaign:variant.preorder?{
    id:variant.preorder.id,
    name:variant.preorder.name,
    target:variant.preorder.target,
    thresholdRequired:variant.preorder.thresholdRequired,
    deadline:variant.preorder.deadline,
    deadlineISO:variant.preorder.deadlineISO,
    estimatedDelivery:variant.preorder.estimatedDelivery,
    discountAmount:variant.preorder.discountAUD*100
  }:null
}))).concat(products.flatMap(product=>(product.accessories||[]).map(accessory=>({sku:accessory.sku,slug:"fishing-rack",productName:`AURA PADDLE ${accessory.name}`,shortName:accessory.name,description:accessory.description,size:"Accessory",colour:"White",colourKey:"white",currency:"aud",retailAmount:accessory.retailAUD*100,checkoutAmount:accessory.retailAUD*100,depositAmount:accessory.retailAUD*50,orderMode:"preorder",available:false,kind:"accessory",bundle:{withSlug:accessory.bundleWith,unitAmount:accessory.bundleAUD*100},productUrl:"https://www.aurapaddle.com/products/angler-fishing.html",campaign:null}))));
if(paymentCatalogue.length<76)throw new Error(`Refusing to rebuild: only ${paymentCatalogue.length} priced SKUs were found; expected at least 76 confirmed website RRP values.`);
const requestedProductSlugs=new Set(String(process.env.AURA_PRODUCT_SLUGS||"").split(",").map(value=>value.trim()).filter(Boolean));
const productsToWrite=requestedProductSlugs.size?products.filter(product=>requestedProductSlugs.has(product.slug)):products;
if(requestedProductSlugs.size&&productsToWrite.length!==requestedProductSlugs.size)throw new Error("One or more requested product slugs were not found.");
function productionHtml(product){
  return htmlFor(product)
    .replaceAll("../redesign-preview.html","../")
    .replaceAll("../shop-preview.html","../shop/")
    .replaceAll("../cart-preview.html","../cart/")
    .replaceAll("../our-story.html","../our-story/")
    .replaceAll("../support.html","../support/")
    .replaceAll("../contact.html","../contact/")
    .replaceAll("../policy-preview.html","../policies/")
    .replace("Australia-only offline preview","Australia-wide online store");
}
for(const product of productsToWrite)fs.writeFileSync(path.join(siteDir,"products",`${product.slug}.html`),productionHtml(product));
fs.writeFileSync(path.join(siteDir,"payments","catalog.json"),`${JSON.stringify({generatedAt:new Date().toISOString(),currency:"aud",variants:paymentCatalogue},null,2)}\n`);
const xml=value=>esc(value).replaceAll("'","&apos;");
const merchantAvailabilityDate=value=>{
  const months={January:"01",February:"02",March:"03",April:"04",May:"05",June:"06",July:"07",August:"08",September:"09",October:"10",November:"11",December:"12"};
  const match=String(value||"").match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if(!match||!months[match[2]])throw new Error(`Invalid Merchant Center availability date: ${value}`);
  return `${match[3]}-${months[match[2]]}-${match[1].padStart(2,"0")}T00:00:00+10:00`;
};
const feedItems=paymentCatalogue.filter(item=>item.kind!=="accessory").map(item=>{
  const product=products.find(candidate=>candidate.slug===item.slug);
  const productImages=product?.images?.[item.colourKey]||[];
  const primaryImageIndex=item.sku==="AP734955"?4:0;
  const imageBase=(productImages[primaryImageIndex]||productImages[0])?.replace("../","https://www.aurapaddle.com/")||"https://www.aurapaddle.com/WEBSITE_HERO_IMAGE_1600_900.png";
  // A new, RFC-compliant URL makes Merchant Center fetch the corrected image
  // instead of retaining a previously failed crawl from the pre-launch host.
  const image=`${encodeURI(imageBase)}?gmc=20260830-conversion`;
  const additionalImages=productImages.filter((_,index)=>index!==primaryImageIndex).slice(0,10).map(src=>`<g:additional_image_link>${xml(`${encodeURI(src.replace("../","https://www.aurapaddle.com/"))}?gmc=20260830-conversion`)}</g:additional_image_link>`).join("");
  const availabilityDate=merchantAvailabilityDate(item.campaign?.estimatedDelivery);
  const isGlacierHero=item.sku==="AP734955";
  const title=isGlacierHero?"AURA PADDLE Yoga Cruiser 11ft Inflatable SUP — Glacier Blue — Stock Arriving Soon":`${item.productName} — ${item.size} — ${item.colour}`;
  const description=isGlacierHero?"Glacier Blue stock is arriving soon. Stable 36-inch deck for SUP yoga, beginners and family paddling. Complete kit, AUD $50 incentive, 50% due today and estimated dispatch 15 September 2026.":(product?.metaDescription||item.description);
  const labels=isGlacierHero?"<g:custom_label_0>Yoga Hero</g:custom_label_0><g:custom_label_1>Incoming Stock</g:custom_label_1>":"";
  return `<item><g:id>${xml(item.sku)}</g:id><title>${xml(title)}</title><description>${xml(description)}</description><link>${xml(item.productUrl)}</link><g:image_link>${xml(image)}</g:image_link>${additionalImages}<g:availability>preorder</g:availability><g:availability_date>${availabilityDate}</g:availability_date><g:price>${(item.retailAmount/100).toFixed(2)} AUD</g:price><g:sale_price>${(item.checkoutAmount/100).toFixed(2)} AUD</g:sale_price><g:sale_price_effective_date>2026-08-18T01:18:00+10:00/2026-09-30T23:59:59+10:00</g:sale_price_effective_date><g:brand>AURA PADDLE</g:brand><g:condition>new</g:condition><g:color>${xml(item.colour)}</g:color><g:size>${xml(item.size)}</g:size>${labels}<g:identifier_exists>yes</g:identifier_exists></item>`;
}).join("");
fs.writeFileSync(path.join(siteDir,"merchant-feed.xml"),`<?xml version="1.0" encoding="UTF-8"?><rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>AURA PADDLE Australia</title><link>https://www.aurapaddle.com/</link><description>AURA PADDLE product feed</description>${feedItems}</channel></rss>\n`);
console.log(`Built ${products.length} product pages, ${paymentCatalogue.length} Stripe-ready SKU records and Merchant Center feed from ${rows.length} catalogue rows.`);
