import { useState } from "react";
const DEFAULT_WACC=10,DEFAULT_PGR=5,DCF_YEARS=10,LBO_HOLD=5,LBO_LEV=7,LBO_INT_RATE=0.09,LBO_PREM=1.30,LBO_MAX_EXIT=20,TAX_RATE=0.22;
const IRR_GREAT=25,IRR_GOOD=20,IRR_OK=15;
function growthAtYear(base,yr){
  const g=base/100,f=0.10;
  if(g<=f)return g;
  return g+(f-g)*((yr-1)/(DCF_YEARS-1));
}
function runDCF(ntmRev,growthPct,ebitdaPct,endMarginPct,wacc,pgr){
  const startM=ebitdaPct/100,endM=endMarginPct/100,wD=wacc/100,pD=pgr/100;
  let rows=[],pvSum=0,rev=ntmRev;
  for(let yr=1;yr<=DCF_YEARS;yr++){
    const g=growthAtYear(growthPct,yr);
    rev=yr===1?ntmRev:rev*(1+g);
    const margin=yr===1?startM:startM+(endM-startM)*((yr-1)/(DCF_YEARS-1));
    const ebitda=rev*margin,fcf=ebitda*0.85,fcfM=(fcf/rev)*100,pv=fcf/Math.pow(1+wD,yr-0.5);
    pvSum+=pv;
    rows.push({yr,rev:Math.round(rev),growth:Math.round(growthAtYear(growthPct,yr)*1000)/10,margin:Math.round(margin*1000)/10,ebitda:Math.round(ebitda),fcf:Math.round(fcf),fcfM:Math.round(fcfM*10)/10,pv:Math.round(pv)});
  }
  const last=rows[DCF_YEARS-1],tvFCF=last.fcf*(1+pD),tv=tvFCF/(wD-pD),pvTV=tv/Math.pow(1+wD,DCF_YEARS-0.5);
  return{rows,pvSum:Math.round(pvSum),pvTV:Math.round(pvTV),intrinsic:Math.round(pvSum+pvTV),lastEBITDA:last.ebitda,lastFCF:last.fcf};
}
function runLBO(ntmRev,ntmRevX,ebitdaPct,growthPct,endMarginPct,exitMultOverride,entryTEVOverride,ltmEBITDAOv){
  const startM=ebitdaPct/100,endM=endMarginPct/100;
  const entryEBITDA=ntmRev*startM;
  const levEBITDA=ltmEBITDAOv??entryEBITDA; // LTM for debt sizing; NTM for entry multiple & projections
  const entryTEV=entryTEVOverride??(ntmRev*ntmRevX*LBO_PREM);
  const entryEBITDAMult=entryTEV/entryEBITDA;
  const grossDebt=Math.min(levEBITDA*LBO_LEV,entryTEV*0.75);
  const equityIn=Math.max(entryTEV-grossDebt,1);
  let rev=ntmRev,cumCash=0,lboRows=[];
  for(let yr=1;yr<=LBO_HOLD;yr++){
    const g=growthAtYear(growthPct,yr);
    rev=yr===1?ntmRev:rev*(1+g);
    const margin=yr===1?startM:startM+(endM-startM)*((yr-1)/(DCF_YEARS-1));
    const ebitda=rev*margin,ufcf=ebitda*0.85,interest=grossDebt*LBO_INT_RATE;
    const ebt=Math.max(ufcf-interest,0),tax=ebt*TAX_RATE,lfcf=ufcf-interest-tax;
    cumCash+=Math.max(lfcf,0);
    lboRows.push({yr,rev:Math.round(rev),margin:Math.round(margin*1000)/10,ebitda:Math.round(ebitda),ufcf:Math.round(ufcf),interest:Math.round(interest),tax:Math.round(tax),lfcf:Math.round(lfcf),cumCash:Math.round(cumCash)});
  }
  // Yr 6 = NTM at exit — exit multiple applied to forward EBITDA per NTM convention; hold is still 5 yrs for IRR
  const g6=growthAtYear(growthPct,6),yr6Rev=rev*(1+g6),yr6Margin=startM+(endM-startM)*(5/(DCF_YEARS-1)),yr6EBITDA=yr6Rev*yr6Margin;
  lboRows.push({yr:6,rev:Math.round(yr6Rev),margin:Math.round(yr6Margin*1000)/10,ebitda:Math.round(yr6EBITDA),isNTM:true});
  const exitEBITDA=Math.round(yr6EBITDA);
  const exitEBITDAMult=Math.min(exitMultOverride??Math.min(entryEBITDAMult,LBO_MAX_EXIT),LBO_MAX_EXIT);
  const exitTEV=exitEBITDA*exitEBITDAMult,exitEquity=Math.max(exitTEV-grossDebt+cumCash,0);
  const moic=exitEquity/equityIn,irr=(Math.pow(Math.max(moic,0),1/LBO_HOLD)-1)*100;
  return{entryTEV:Math.round(entryTEV),entryEBITDA:Math.round(entryEBITDA),levEBITDA:Math.round(levEBITDA),entryEBITDAMult:Math.round(entryEBITDAMult*10)/10,grossDebt:Math.round(grossDebt),equityIn:Math.round(equityIn),exitTEV:Math.round(exitTEV),exitEBITDA,exitEBITDAMult:Math.round(exitEBITDAMult*10)/10,cumCash:Math.round(cumCash),exitEquity:Math.round(exitEquity),moic:Math.round(moic*10)/10,irr:Math.round(irr*10)/10,lboRows};
}
function scoreCompany(co,dcf,lbo){
  const evE=co.tev/(co.ntmRev*co.ebitda/100),evR=co.ntmRevX;
  const valScore=Math.min(Math.max(0,2*(1-(evE-5)/25))+Math.max(0,1*(1-(evR-2)/12)),3);
  const mktPos=co.sor?1.0:0.35;
  const revMoat=(co.pricing==="Usage-Based"?0.35:0.10)+(!co.seat?0.20:0);
  const pricingPwr=Math.min((Math.min(co.ebitda,50)/50)*0.75,0.75);
  const mktLead=(Math.min(Math.max(co.cagr,0),25)/25)*0.40;
  const investGrade={"High":0.30,"Medium-High":0.225,"Medium":0.15,"Low-Medium":0.075,"Low":0}[co.peFit]||0.15;
  const qualScore=Math.min(mktPos+revMoat+pricingPwr+mktLead+investGrade,3);
  const aiBase={"Low":2.6,"Medium":1.4,"High":0.1}[co.aiRisk]||1.4;
  const aiScore=Math.min(Math.max(aiBase+(co.sor?0.2:0)+(co.pricing==="Usage-Based"?0.2:-0.2)+(co.peOwned?0.2:0),0),3);
  const lboScore=lbo.irr>=IRR_GREAT?3:lbo.irr>=IRR_GOOD?2.2:lbo.irr>=IRR_OK?1.4:Math.max(0,lbo.irr/IRR_OK*1.4);
  const dcfScore=Math.min(Math.max(1+(dcf.intrinsic-co.tev)/co.tev*1.5,0),2);
  const peScore={"High":1,"Medium-High":0.75,"Medium":0.5,"Low-Medium":0.25,"Low":0.1}[co.peFit]||0.5;
  const raw=valScore+qualScore+aiScore+lboScore+dcfScore+peScore;
  const total=Math.round((raw/15)*10*10)/10;
  return{total:co.avoid?Math.min(total,5.5):total,valScore:Math.round(valScore*10)/10,qualScore:Math.round(qualScore*10)/10,aiScore:Math.round(aiScore*10)/10,lboScore:Math.round(lboScore*10)/10,dcfScore:Math.round(dcfScore*10)/10,peScore:Math.round(peScore*10)/10,evEbitda:Math.round(evE*10)/10,evRev:evR};
}
// ─── DATA ─────────────────────────────────────────────────────────────────────
const RAW=[
  // ── PURE-PLAY VSaaS ──
  {name:"Autodesk",vertical:"Construction & Design SW",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:52999,ntmRev:8154,growth:12,gm:93,ebitda:40,cagr:13,ntmRevX:6.5,peFit:"Medium",aiRisk:"Low",avoid:false,ltmEbitda:2867,pct52w:0.75,
   desc:"Cloud-based design, engineering, and construction software (AutoCAD, Revit, BIM 360) serving architects, engineers, and contractors globally. The system of record for building and infrastructure design workflows. Usage-based subscription model with revenue tied to project activity and cloud storage.",
   sd:{sharePrice:245.87,sharesOut:215,marketCap:52862,netDebt:137},
   thesis:["$53B TEV makes this a public-market benchmark only — no PE fund can underwrite the equity cheque, but it sets the ceiling multiple for every AEC software comp","True moat isn't the SoR label — it's the BIM file format lock-in (RVT/DWG) that makes switching to Bentley/Trimble a 2-year re-training cycle across entire engineering firms","93% GM masks a real risk: Autodesk has chronically under-invested in customer success and R&D velocity, creating an opening for Nemetschek brands in Europe and Procore in construction","Margin expansion story is largely played out at 40% EBITDA — incremental gains require pricing power that AI-native tools may erode if generative design disrupts the core CAD workflow","Key watch: if AI-generated building designs become code-compliant without CAD tools, the entire BIM workflow compresses — Autodesk's moat becomes its file format, not its software"],
   aiRationale:["Generative design tools (e.g. Hypar, TestFit, emerging LLM-based design agents) threaten the architect's workflow — if an AI can produce code-compliant building layouts, the human hours in Revit decline materially","Counter-argument: regulatory complexity (structural engineering stamps, fire code compliance, seismic analysis) requires simulation fidelity that AI cannot yet deliver — protects the engineering workflow even if design is disrupted","File format lock-in (DWG/RVT) is the real moat, not the software features — but this is a depreciating asset as open standards (IFC) gain regulatory traction in EU and UK","Second-order risk: AI doesn't need to replace Autodesk directly — if AI makes junior architects 3x more productive, firms need fewer seats, compressing Autodesk's per-seat revenue regardless of whether they adopt Autodesk AI","Low risk overall but with a tail scenario: regulatory-driven BIM mandates protect the installed base for 5-7 years, but the 10-year trajectory depends on whether open formats or proprietary formats win"]},
  {name:"Veeva Systems",vertical:"Healthcare",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:24200,ntmRev:3612,growth:12,gm:78,ebitda:46,cagr:13,ntmRevX:6.7,peFit:"Medium",aiRisk:"Low",avoid:false,ltmEbitda:1450,pct52w:0.59,
   desc:"Life sciences cloud platform providing CRM (Vault CRM), regulatory content management, and clinical data systems to pharmaceutical and biotech companies. The SoR for drug development, regulatory submissions, and commercial operations across global pharma. Seat-based subscription with deep multi-year contracts.",
   sd:{sharePrice:182.01,sharesOut:161,marketCap:29275,netDebt:-5074},
   thesis:["$24B TEV / public benchmark only — but sets the comp multiple for every healthcare SoR; 46% EBITDA at this scale is the quality ceiling for the sector","The Vault CRM migration off Salesforce is a once-in-a-decade re-platforming event — if executed cleanly, it eliminates the only structural risk (platform dependency) and locks in another decade of pharma switching costs","Veeva's real moat isn't the software — it's the validated data environment; pharma companies cannot move regulatory submission data to an unvalidated platform without a 2-3 year re-validation cycle with the FDA","Growth ceiling risk: Veeva already serves 95%+ of top-50 pharma; incremental growth depends on mid-market penetration and adjacent modules (QMS, RIM) where competition from MasterControl and others is real","Watch the Vault CRM adoption curve — if large pharma delays migration from legacy Salesforce CRM, the transition becomes a drag on both growth and margin expansion for 2-3 years"],
   aiRationale:["FDA 21 CFR Part 11 compliance creates a regulatory moat that no AI tool can bypass — any system touching clinical or regulatory data must be validated, making AI-native disruption structurally slow","The real AI risk is at the commercial layer, not the regulatory layer — Veeva CRM seats could compress if AI-powered commercial analytics reduce the need for in-field pharma sales reps","Counter-argument: pharma sales force sizing is driven by physician access regulations, not productivity — even if AI makes reps more effective, headcount is dictated by territory coverage requirements","Second-order risk: AI-driven drug discovery (AlphaFold, etc.) could accelerate clinical timelines, which would increase Veeva's per-trial revenue but might reduce the total number of parallel trials a pharma company runs","Low risk: the regulatory validation requirement is the strongest AI-proof moat in this entire screen — it literally requires government approval to change systems"]},
  {name:"Tyler Technologies",vertical:"GovTech",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:15085,ntmRev:2557,growth:9,gm:51,ebitda:29,cagr:9,ntmRevX:5.9,peFit:"Medium",aiRisk:"Low",avoid:false,ltmEbitda:665,pct52w:0.57,
   desc:"Dominant vertical software provider for US state and local governments, covering ERP, courts, tax administration, public safety, and utility billing. Near-monopoly across multiple GovTech verticals with thousands of municipal customers. Seat-based subscription with long-term government contracts.",
   sd:{sharePrice:354.69,sharesOut:44,marketCap:15540,netDebt:-454},
   thesis:["$15B TEV / public benchmark — but the key comp data point: Tyler trades at 5.9x revenue for a 9% grower, setting the floor for what government-embedded SoR assets are worth even at low growth","Tyler's moat isn't the software — it's the 7-15 year procurement cycle and the political risk of switching; a county clerk cannot explain to constituents why tax records were migrated to an unproven vendor","51% GM is deceptively low — reflects legacy on-prem services revenue still converting to cloud; the pure SaaS business runs at 70%+ GM and is growing faster than the blended average suggests","Growth ceiling risk: 9% is structural, not cyclical — Tyler already owns 60-70% of addressable US municipalities, and government budgets don't expand; growth requires either federal penetration or international expansion, both hard","The real PE question is whether a buyer at this scale can re-accelerate growth through federal/state agency upsell or whether this is a 7-9% grower forever priced at premium-SaaS multiples"],
   aiRationale:["Government AI adoption is gated by procurement law (FAR, state-level equivalents) and CJIS/FedRAMP security requirements — any AI tool must be certified before it touches government data, creating a 3-5 year adoption lag","The deeper protection is political: no elected official will approve an AI system that makes autonomous decisions about tax assessments, court scheduling, or public safety dispatch — human accountability is legally mandated","Risk area: back-office government workflows (accounts payable, HR, payroll) are genuinely AI-vulnerable and represent a meaningful share of Tyler's ERP revenue — here, AI could compress both seat count and willingness to pay","Counter-argument: government unions actively resist AI-driven headcount reduction, creating a political barrier to AI adoption that extends beyond the technology adoption curve","Low risk with a long tail: the 5-year view is very protected; the 10-year view depends on whether a future administration mandates AI modernization across state/local government, which would benefit Tyler as the incumbent integrator"]},
  {name:"Toast",vertical:"Travel / Hospitality",bucket:"Pure-Play VSaaS",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:14606,ntmRev:7687,growth:20,gm:28,ebitda:11,cagr:21,ntmRevX:1.9,peFit:"Low-Medium",aiRisk:"Medium",avoid:false,ltmEbitda:660,pct52w:0.55,
   desc:"Restaurant management platform (POS, payroll, inventory, payments) serving 120,000+ restaurants across North America. Monetizes primarily through payment processing on restaurant transaction volumes rather than software seats. Usage-based model with revenue scaling as restaurant sales grow.",
   sd:{sharePrice:27.31,sharesOut:607,marketCap:16577,netDebt:-1971},
   thesis:["1.9x NTM Rev for 20% growth is optically cheap but the 28% blended GM means the software economics are buried under a payments pass-through business — strip out payments and the core software is ~$1.5B rev at 65%+ GM, valued at ~10x, which is fair not cheap","Toast's strategic value is not the POS — it's the payments lock-in; once a restaurant processes $2M+/year through Toast Payments, the cost of switching POS vendors includes re-negotiating payment processing, which creates genuine stickiness","Scale math problem: at $14.6B TEV, a take-private requires ~$4B equity for ~$35M of levered free cash flow in year 1 — this is a growth equity deal, not a buyout, and the margin expansion from 11% to 20%+ EBITDA is unproven at this scale","Competitive risk from Square (Block) and Clover is real but overstated — Toast's strength is the mid-market (20-200 location chains) where neither Square nor Clover has meaningful penetration","Pass — at current TEV this is a public market growth + payments arbitrage story; PE involvement only makes sense sub-$8B in a severe dislocation"],
   aiRationale:["Restaurant workflows are human-labor-intensive (cooking, serving) — AI cannot replace the core activity, so Toast's usage-based model on transactions is structurally protected from AI displacement of the end-customer","The real AI risk is to Toast's software add-ons (marketing, scheduling, inventory) not the payments core — AI-native tools from companies like Lightspeed and Olo could unbundle these higher-margin modules","28% blended GM actually protects against AI disruption — most of Toast's revenue is payments processing, which AI cannot disintermediate because it requires acquiring bank relationships and PCI compliance, not just software","Risk area: AI-powered kiosk ordering (already deployed at McDonald's, Wingstop) reduces front-of-house headcount, which could reduce the number of Toast POS terminals per restaurant over time","Medium risk: payments core is AI-proof; software add-ons are vulnerable to unbundling by AI-native competitors targeting specific restaurant workflows"]},
  {name:"Bentley Systems",vertical:"Construction & Design SW",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:13336,ntmRev:1710,growth:12,gm:82,ebitda:36,cagr:11,ntmRevX:7.8,peFit:"Medium",aiRisk:"Low",avoid:false,ltmEbitda:538,pct52w:0.62,
   desc:"Engineering software for large-scale infrastructure design (roads, bridges, rail, utilities) serving civil engineers and infrastructure owners globally. The dominant SoR for civil and industrial infrastructure workflows with no credible direct competitor. Seat-based E365 subscription with strong recurring revenue from cloud transition.",
   sd:{sharePrice:36.55,sharesOut:333,marketCap:12174,netDebt:1162},
   thesis:["Moat is not just 'infrastructure SoR' — it is the accumulated library of engineering standards, simulation templates, and project data inside each client's Bentley environment; switching means re-certifying years of design models against AASHTO/Eurocode standards","Bentley family controls ~55% of voting power via dual-class structure, making hostile take-private impossible — any negotiated deal pays a governance premium on top of 7.8x NTM Rev, and the family has shown no urgency to sell","Real competitive risk is Hexagon acquiring Bricsys + Iesve to build a vertically-integrated civil/energy design stack; Autodesk Infraworks remains subscale but could bundle aggressively against Bentley's standalone pricing","At $13B TEV the realistic exit is strategic to Siemens, Dassault, or Hexagon — financial sponsor returns depend on multiple expansion from current trough, not operational improvement on already-36% EBITDA margins","Weakness: E365 subscription transition flatters NRR metrics; underlying seat growth in civil infrastructure is mid-single-digit at best, and the customer base (DOTs, utilities, public agencies) is inherently cyclical with government budget exposure"],
   aiRationale:["Protected workflows: finite element analysis, hydraulic simulation, geotechnical modeling — these require physics engines and regulatory certification (e.g., PE stamp requirements) that generative AI does not address","Threatened workflow: 2D drafting and basic alignment design within OpenRoads/OpenRail could see 40-60% productivity gains from AI copilots, compressing seats at smaller engineering firms within 3-5 years","Second-order risk: if AI makes a 10-person civil engineering team as productive as 15, Bentley's seat-based pricing directly loses 33% of revenue per firm — usage-based repricing on iTwin is the obvious hedge but adoption is nascent","Specific AI competitors: Autodesk's AI-assisted InfraWorks, Trimble's AI-enabled Tekla for structural, and startups like Cala (generative building design) and TestFit (generative site planning) are encroaching on adjacent workflows","3-year view: minimal impact on core simulation/analysis revenue; 10-year view: material seat compression risk in design-phase workflows, partially offset only if Bentley successfully shifts to consumption-based iTwin pricing at scale"]},
  {name:"Guidewire Software",vertical:"Financial Services",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:12255,ntmRev:1532,growth:16,gm:66,ebitda:24,cagr:19,ntmRevX:8,peFit:"Medium-High",aiRisk:"Low",avoid:false,ltmEbitda:271,pct52w:0.55,
   desc:"Core insurance platform (PolicyCenter, BillingCenter, ClaimCenter) for property & casualty insurers globally. Mission-critical SoR requiring decade-long implementation cycles with deep carrier integration across policy, billing, and claims. Seat-based subscription transitioning to cloud with improving recurring revenue visibility.",
   sd:{sharePrice:145.32,sharesOut:87,marketCap:12690,netDebt:-435},
   thesis:["Switching cost is not just 'decade-long implementations' — it is that PolicyCenter/ClaimCenter hold the carrier's entire product catalog, rating algorithms, and regulatory filing logic; ripping out Guidewire means re-filing policy forms with state DOIs, which no CIO will risk","66% GM is the glaring weakness — well below vertical software peers, driven by heavy professional services required for implementations; a PE buyer needs conviction that cloud migration (Guidewire Cloud) structurally shifts GM toward 75%+ as services shrink","At 8.0x NTM Rev and $12.3B TEV, the realistic bidder pool is narrow: Thoma Bravo (which looked before), Vista, or a strategic like SAP; 45% off highs is optically attractive but the multiple is still rich for 24% EBITDA margins","The InsuranceSuite-to-Cloud migration creates a one-time upsell cycle — carriers moving from on-prem pay 2-3x the original ACV; this tailwind inflates near-term growth and will normalize, making 16% growth misleading as a steady-state indicator","Competitive moat is real but narrowing: Duck Creek (Apax-backed) is winning mid-market P&C carriers with faster cloud-native implementations, and Socotra/Insurity are targeting niche lines where Guidewire is overbuilt and overpriced"],
   aiRationale:["Protected workflows: statutory reporting, policy form filing with state regulators, claims adjudication audit trails — these are compliance-driven processes where AI augments human reviewers but cannot replace the regulatory accountability chain","Threatened workflow: first notice of loss (FNOL) triage and claims routing are prime targets for AI automation — Shift Technology and Tractable already sell AI claims tools that reduce adjuster headcount, compressing Guidewire's per-seat economics in ClaimCenter","Second-order effect: if AI makes claims adjusters 3x faster at processing, carriers need fewer ClaimCenter seats — but Guidewire's cloud pricing is shifting toward premium volume, partially hedging this; the transition speed matters enormously","Duck Creek is embedding AI-native features (predictive underwriting, automated policy checking) directly into its core platform — if Guidewire's AI roadmap lags, younger carriers will default to Duck Creek as the 'modern' option","3-year view: negligible impact on core policy admin; AI mostly helps within Guidewire's ecosystem. 10-year view: claims processing automation could compress adjuster seats 30-40%, but core policy/billing SoR remains protected by regulatory inertia"]},
  {name:"Nemetschek",vertical:"Construction & Design SW",bucket:"Pure-Play VSaaS",hq:"DE",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:9507,ntmRev:1639,growth:14,gm:97,ebitda:33,cagr:19,ntmRevX:5.8,peFit:"Medium-High",aiRisk:"Low",avoid:false,ltmEbitda:452,pct52w:0.5,
   desc:"Portfolio of AEC software brands (Allplan, Vectorworks, Bluebeam, dRofus) covering architecture, engineering, and construction design workflows. Particularly dominant across European markets with near-100% gross margins reflecting pure software delivery. Usage-based subscription with revenue tied to project activity.",
   sd:{sharePrice:80.05,sharesOut:114,marketCap:9147,netDebt:359},
   thesis:["97% GM is real but misleading — Nemetschek is a holding company of semi-autonomous brands (Allplan, Vectorworks, Bluebeam, Graphisoft) with separate codebases, sales teams, and product roadmaps; a PE buyer's operational thesis must center on consolidating this fragmented portfolio, which prior management has resisted","The actual moat varies dramatically by brand: Bluebeam owns PDF markup for construction (near-monopoly), Graphisoft's ArchiCAD is the #2 BIM tool behind Revit, but Allplan is a distant third in structural — a buyer is really underwriting Bluebeam's dominance and ArchiCAD's European installed base","5.8x NTM Rev at 50% off highs is the most attractive entry multiple for a 97% GM business in the screen — but Nemetschek is German-listed with a concentrated shareholder base (Nemetschek family foundation holds ~52%), making take-private governance complex and requiring German takeover law compliance","Consolidation upside is the real prize: unifying Allplan, Vectorworks, and Graphisoft onto a shared platform could unlock 500-800bps of EBITDA improvement from eliminating duplicate R&D and go-to-market — but execution risk is high given brand loyalty and cultural resistance across subsidiaries","Weakness: Autodesk's AEC Collection bundles Revit + Civil 3D + Navisworks at aggressive pricing; Nemetschek's individual brands cannot match this bundling power, and Autodesk's 2024 Forma launch directly targets the generative design space where Nemetschek is underinvested"],
   aiRationale:["Protected workflows: BIM model authoring in ArchiCAD/Allplan requires deep parametric modeling expertise tied to local building codes (Eurocode, DIN standards) — generative AI cannot produce code-compliant structural models without human validation","Threatened workflow: Bluebeam's PDF markup and document review is directly exposed to AI-powered document analysis tools — Procore's AI document management, PlanGrid (Autodesk), and startups like Pypestream could automate 60%+ of punch list and RFI review within 5 years","Second-order effect: usage-based pricing actually cuts both ways — if AI makes architects complete BIM models 2x faster, project-based usage billing captures the same project value, but if AI reduces total project count by enabling faster iteration, usage volume drops","Specific AI competitors: Autodesk Forma (generative site design), Spacemaker (now Autodesk), Hypar (parametric building design), and TestFit are all targeting the early-stage design workflows where Nemetschek brands have historically upsold from concept to detailed design","3-year view: core BIM authoring safe; Bluebeam's document workflow faces near-term AI pressure. 10-year view: if generative design tools can produce code-compliant BIM models, the value shifts from model authoring to model validation — Nemetschek must own the validation layer or risk commoditization"]},
  {name:"Manhattan Associates",vertical:"Supply Chain",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:8001,ntmRev:1160,growth:6,gm:60,ebitda:35,cagr:6,ntmRevX:6.9,peFit:"Medium",aiRisk:"Low",avoid:false,ltmEbitda:395,pct52w:0.59,
   desc:"Supply chain execution software covering warehouse management (WMS), order management (OMS), and inventory optimization for retail and logistics enterprises. The SoR for omnichannel fulfillment operations at major retailers globally with a cloud transition largely complete. Usage-based model tied to transaction volumes processed.",
   sd:{sharePrice:135.43,sharesOut:61,marketCap:8269,netDebt:-268},
   thesis:["Switching cost is not generic 'SoR stickiness' — Manhattan's WMS is hardwired into physical warehouse layouts, pick-path algorithms, and conveyor/robotics integrations at facilities like Target, Home Depot, and PVH; replacing Manhattan means re-commissioning the entire physical fulfillment operation, a $10-50M+ undertaking per DC","60% GM is the central tension: ~25% of revenue is implementation/optimization services with structurally lower margins; a PE buyer must believe Manhattan Active (cloud-native) reduces services intensity over time, but the largest WMS deployments still require extensive custom configuration","6% growth at 7.0x NTM Rev prices this as a mature compounder, not a growth story — the bull case is that Manhattan Active's unified cloud platform (WMS + OMS + TMS on one codebase) enables cross-sell into transportation and point-of-sale, expanding TAM from $3B WMS to $8B+ unified commerce","Bidder dynamics: Blue Yonder (Panasonic-backed) just went public; a Manhattan take-private would face antitrust scrutiny if Blue Yonder or Korber bid, leaving Thoma Bravo, Hellman & Friedman, or a strategic like Oracle/SAP as realistic buyers — Oracle's WMS is subscale and Manhattan would plug that gap","Weakness: Amazon's internal fulfillment technology (Robin, Sparrow robotics, custom WMS) is now being offered to 3PL customers via Supply Chain by Amazon — if Amazon aggressively prices WMS for mid-market logistics, Manhattan loses its expansion pipeline even if enterprise accounts stay locked in"],
   aiRationale:["Protected workflows: real-time warehouse execution (wave planning, labor allocation, slotting optimization) operates in millisecond decision loops tightly coupled to physical automation — this is control-system software, not a workflow AI can abstract away","Threatened workflow: demand forecasting and inventory planning layers above WMS are directly targeted by AI-native tools — Blue Yonder Luminate, o9 Solutions, and Anaplan are all embedding ML-driven demand sensing that could commoditize Manhattan's planning modules","Second-order effect: AI-powered robotics (Locus, 6 River/Shopify, Berkshire Grey) actually increase transaction volumes through Manhattan's WMS — more automated picks means more WMS-processed transactions, so AI in the warehouse is revenue-positive for usage-based pricing","Specific competitive risk: Shopify's acquisition of 6 River Systems and Flexport's tech stack investments could create vertically-integrated fulfillment platforms that bypass standalone WMS for mid-market e-commerce — Manhattan's moat holds for Tier 1 retail but the mid-market is contested","3-year view: core WMS execution is AI-proof; planning/forecasting modules face competitive pressure. 10-year view: the risk is not AI replacing Manhattan but autonomous warehouses (Ocado, AutoStore) bundling their own execution software, making standalone WMS less relevant for greenfield facilities"]},
  {name:"Procore Technologies",vertical:"Construction & Design SW",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:7580,ntmRev:1516,growth:13,gm:84,ebitda:25,cagr:14,ntmRevX:5,peFit:"Medium-High",aiRisk:"Medium",avoid:false,ltmEbitda:294,pct52w:0.69,
   desc:"Cloud-based construction project management platform covering project financials, quality, safety, and field operations for general contractors, specialty contractors, and project owners. The dominant SoR for construction project execution globally, used across 16,000+ customer organizations on billion-dollar infrastructure and commercial projects. Seat-based subscription priced per user with strong net revenue retention as customers expand across projects.",
   sd:{sharePrice:55.04,sharesOut:150,marketCap:8270,netDebt:-689},
   thesis:["The real moat is network density: on a large commercial project, the GC, 30+ subcontractors, architect, owner, and inspectors all operate inside the same Procore instance — switching means convincing every counterparty to migrate simultaneously, which is a coordination problem no competitor has solved","25% EBITDA on 84% GM means Procore is spending ~59% of revenue on S&M and R&D; the specific PE thesis is that S&M as % of revenue can compress from ~35% to ~22% by shifting from outbound enterprise sales to product-led growth within the existing 16,000-customer network — this is a proven playbook (see Qualtrics, Anaplan take-privates)","5.0x NTM Rev is the cheapest entry in the construction SoR category since Procore's 2021 IPO — the market is pricing in growth deceleration to 10%, but the installed base monetization (financial tools, insurance, payments) is only ~15% penetrated and represents a second S-curve that public investors are ignoring","Bidder dynamics favor PE: Trimble sold its construction portfolio to Roper, Autodesk is focused on design not field ops, and Oracle Aconex has stalled — the natural acquirers are PE firms (Thoma Bravo, Vista, Permira) because no strategic buyer owns the field execution layer at scale","Weakness: Procore's per-seat pricing on subcontractors creates friction — subs working across multiple GCs resent paying Procore on each project; if Procore cannot shift to a GC-pays-all model or project-based pricing, seat economics get squeezed as subs consolidate their tool spend"],
   aiRationale:["Protected workflows: RFI routing, submittal review, and change order negotiation are multi-party legal processes with liability implications — AI can draft responses but the approval chain across GC/owner/architect requires human sign-off mandated by contract and insurance requirements","Threatened workflow: daily logs, progress photo documentation, and punch list generation are directly exposed — OpenSpace (AI-powered 360 site capture), Buildots (automated progress tracking), and Procore's own AI features could reduce field superintendent data entry by 70% within 3 years","Second-order seat compression: if AI eliminates the need for dedicated project coordinators who primarily manage RFI/submittal paperwork, Procore loses 2-4 seats per project; across 16,000 customers this is material — but Procore can offset by charging for AI features as premium SKUs","The real AI risk is not displacement but unbundling: if OpenAI or Google offer a general-purpose project coordination tool that handles scheduling + document management + communication for $50/user/month, Procore's $600+/user/month pricing becomes hard to justify for smaller GCs and specialty contractors","3-year view: AI enhances Procore's platform (auto-generated daily logs, smart RFI routing) and is net positive for the product. 10-year view: seat compression of 20-30% in project coordination roles is likely, but Procore's shift toward financial tools (lien waivers, payments, insurance) creates per-transaction revenue that is AI-immune"]},
  {name:"ServiceTitan",vertical:"Field Services",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:6417,ntmRev:1107,growth:15,gm:74,ebitda:12,cagr:18,ntmRevX:5.8,peFit:"Medium",aiRisk:"Medium",avoid:false,ltmEbitda:140,pct52w:0.56,
   desc:"Field service management platform for home services trades (HVAC, plumbing, electrical, roofing) covering scheduling, dispatch, invoicing, and financing. The dominant SoR for SMB field service businesses in North America with embedded payments revenue. Seat-based subscription charged per technician or office user.",
   sd:{sharePrice:72.39,sharesOut:92,marketCap:6694,netDebt:-278},
   thesis:["The 12% EBITDA is the thesis, not the problem — ServiceTitan has been spending 40%+ of revenue on S&M to land new customers in an extremely fragmented market (1M+ home services businesses in NA); a PE owner could cut S&M to 25% and immediately unlock 15%+ EBITDA, but the question is whether you sacrifice the land-grab","The embedded payments/financing flywheel is the real asset — ServiceTitan processes ~$6B in consumer payments for HVAC/plumbing jobs; this revenue is invisible to seat-compression risk and grows with ticket prices, not headcount","IPO at $9B (Dec 2024) followed by 44% decline creates an unusual dynamic: early IPO investors are underwater and Thoma Bravo (pre-IPO backer) may be open to a recap or secondary that effectively re-prices the business at a more realistic 5-6x NTM","Competitive moat is narrower than it appears — Housecall Pro, Jobber, and FieldEdge serve the same SMB segment; ServiceTitan wins on depth of feature set but SMBs are price-sensitive and rarely use >30% of features, creating vulnerability to simpler, cheaper tools","Exit path is clear: strategic acquirer (Intuit, ServiceNow, or a payments platform like Fiserv) would pay 8-10x for the embedded payments + SMB distribution channel"],
   aiRationale:["The AI risk is bifurcated: scheduling/dispatch (20% of value prop) is directly AI-threatened by tools like Jobber AI, Google's AI scheduling, and emerging LLM-powered dispatch; but invoicing/payments (50%+ of revenue) is AI-proof because it requires bank integrations, not intelligence","Second-order effect: if AI makes a single dispatcher manage 3x more technicians, SMB plumbing companies need fewer office staff seats — but ServiceTitan's per-seat pricing means revenue declines even if the business thrives","Counter-argument: SMB adoption of AI tools in blue-collar trades is the slowest segment in tech — the median HVAC company owner is 52 years old, uses the tool on a tablet in a truck, and will not adopt AI scheduling voluntarily for 5-7 years","The financing/payments moat is genuinely AI-immune: AI cannot displace the plumbing-to-consumer lending workflow because it requires lending licenses, bank partnerships, and compliance infrastructure that no AI startup can replicate","Medium risk: the 3-year view is very protected by SMB adoption lag; the 7-year view depends on whether Google or Intuit embeds free AI scheduling into their SMB platforms and commoditizes the dispatch layer"]},
  {name:"AppFolio",vertical:"Real Estate / Prop Tech",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:6244,ntmRev:1135,growth:17,gm:64,ebitda:29,cagr:18,ntmRevX:5.5,peFit:"High",aiRisk:"Low",avoid:false,ltmEbitda:258,pct52w:0.55,
   desc:"Property management software for residential and commercial real estate operators covering leasing, maintenance, accounting, screening, and payments. The SoR for SMB property managers with a payments flywheel that grows as portfolios scale. Usage-based model with fees tied to units under management and payment volumes.",
   sd:{sharePrice:177.76,sharesOut:36,marketCap:6457,netDebt:-213},
   thesis:["AppFolio's real business is a payments company dressed as software — tenant rent payments, screening fees, and insurance premiums flow through AppFolio's ledger, creating ~$400M of payments revenue growing 25%+ that is completely decoupled from property manager headcount or AI productivity","The screening fee monopoly is underappreciated: AppFolio charges tenants $40-50 per application (not the property manager); this is a per-transaction tax on America's rental market that grows with rent prices and application volume, not software seats","At $6.2B TEV, the real question is whether this is a 15x payments multiple or a 5.5x software multiple — if you value the payments stream at payments-company multiples (8-12x revenue) and back into the software for free, the upside is significant","Competitive risk from Yardi, RealPage (now Thoma Bravo-owned), and Entrata is concentrated in mid-market/enterprise; AppFolio owns the sub-500 unit SMB segment where implementation simplicity matters more than configurability — this segment is hard to attack from above","Key risk: regulatory scrutiny of tenant screening fees (several state bills proposed) could cap the highest-margin revenue line; also, RealPage's antitrust issues around algorithmic rent-setting create headline risk for the entire PropTech sector"],
   aiRationale:["Payments-as-revenue is the AI-proof core: tenants paying rent through AppFolio generates transaction fees regardless of how many property managers are needed or how productive AI makes them — this is a toll booth, not a productivity tool","The AI-vulnerable surface area is narrow but real: AI-powered leasing assistants (ShowMojo, Elise AI) could reduce the need for leasing agents, compressing AppFolio's per-unit-managed pricing if property managers push back on fees as headcount declines","Counter-argument: AppFolio is already building AI leasing into the platform (AI-powered showing scheduling, tenant communications); the incumbency advantage means AppFolio captures the AI upside rather than being disrupted by it","Second-order benefit: if AI enables a single property manager to manage 200 units instead of 100, AppFolio's revenue per customer doubles (more units = more payments, screening fees, and insurance premiums per account) — AI is actually a growth driver","Low risk: the payments toll-booth model is structurally the most AI-resilient business model in this screen; the only risk is regulatory, not technological"]},
  {name:"Waystar",vertical:"Healthcare",bucket:"Pure-Play VSaaS",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:6129,ntmRev:1304,growth:16,gm:68,ebitda:42,cagr:15,ntmRevX:4.7,peFit:"High",aiRisk:"Low",avoid:false,ltmEbitda:474,pct52w:0.59,
   desc:"Revenue cycle management (RCM) platform automating claims submission, eligibility verification, and payment posting for healthcare providers. Mission-critical workflow embedded across hospitals and physician groups with multi-year contracts and extreme switching costs. Usage-based fees on claims processed, creating revenue tied to patient visit volumes.",
   sd:{sharePrice:25.65,sharesOut:185,marketCap:4740,netDebt:1389},
   thesis:["Post-EQT/CPPIB take-private at $22.75 and re-IPO at $21.50, Waystar trades at 4.7x NTM with 42% EBITDA — a secondary buyout repricing the same asset EQT bought from Bain","Real moat is payer connectivity: Waystar processes claims across 1,500+ payers with individually negotiated EDI connections — recreating this integration layer is a 5-7 year effort, not a technology problem","Usage-based on claims volume means revenue scales with healthcare utilization inflation (~5-6% annually) independent of customer headcount decisions","Kill-the-deal risk: R1 RCM (now private under TowerBrook/CD&R) is consolidating end-to-end RCM with physician staffing, creating a bundled competitor Waystar cannot match as pure software","Exit path narrows post-EQT: strategic buyers (UHG/Optum, Change Healthcare) face antitrust issues, leaving you selling to another sponsor at cycle-peak healthcare multiples"],
   aiRationale:["AI actually strengthens Waystar near-term: automated prior authorization, denial prediction, and coding suggestions are features Waystar sells, not threats to its position","Real AI risk is indirect — if AI coding tools (Codify, Nym Health) achieve >95% first-pass clean claim rates, Waystar's denial management and appeals workflow becomes less critical","The payer-provider data exchange layer is regulatory infrastructure, not intelligence — AI cannot displace the EDI/X12 transaction backbone Waystar operates on","Ambient clinical documentation (Nuance DAX, Abridge) could reduce coding errors upstream, shrinking the denial-and-rework volume that drives ~30% of RCM platform value","Net assessment: AI is a product tailwind for 3-5 years but the long-term risk is that cleaner upstream data reduces the complexity that justifies RCM platform pricing"]},
  {name:"CCC Intelligent Solutions",vertical:"Financial Services",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:5121,ntmRev:1164,growth:9,gm:77,ebitda:42,cagr:10,ntmRevX:4.4,peFit:"High",aiRisk:"Low",avoid:false,ltmEbitda:443,pct52w:0.57,
   desc:"AI-native platform connecting the entire auto insurance claims ecosystem — insurers, repairers, OEMs, and parts suppliers — across 35,000+ connected businesses. The SoR for collision repair estimates and claims processing with deep network effects that took decades to build. Usage-based transaction fees scaling with auto claims volume.",
   sd:{sharePrice:5.83,sharesOut:660,marketCap:3845,netDebt:1275},
   thesis:["The network is the moat: CCC connects insurers, body shops, OEMs, and parts suppliers in a single data exchange — switching any one node requires coordinating all counterparties, which never happens","9% topline growth masks the real story: ARPU expansion via Casualty (injury claims), Emerging Solutions (subrogation, total loss), and AI upsell modules drive revenue per claim higher each year","$1.4B net debt from Advent's 2017 LBO still on the balance sheet — a secondary buyout must underwrite deleveraging from ~5x, which constrains entry price and return math","Kill-the-deal risk: Tractable (AI photo-based damage estimation) has signed Tokio Marine, Covea, and US insurers — if Tractable cracks the network effect by going insurer-first, CCC's body shop lock-in weakens","Exit buyer universe is narrow: Verisk and Guidewire are logical strategics but both have antitrust overlap in P&C claims; likely another sponsor exit at 12-14x EBITDA"],
   aiRationale:["CCC already monetizes AI — its AI gateway for damage estimation and claims triage is a revenue driver, not a cost center, making it one of few companies where AI directly accretes to topline","Tractable is the real AI threat: computer vision-based damage estimation that bypasses body shop involvement entirely — if insurers adopt AI photo-first workflows, CCC's repair-network-centric model loses leverage","The FNOL-to-settlement workflow involves regulatory, legal, and multi-party coordination that pure AI cannot automate — CCC's value is in orchestrating counterparties, not just estimating damage","AI could compress the number of human touches per claim (adjusters, estimators), but CCC's usage-based pricing is per-claim not per-touch, so efficiency gains do not directly erode revenue","Net: CCC is the rare case where AI is already in the P&L as revenue; the risk is a paradigm shift to insurer-direct AI estimation that disintermediates the body shop network CCC controls"]},
  {name:"Doximity",vertical:"Healthcare",bucket:"Pure-Play VSaaS",hq:"US",sor:false,seat:true,pricing:"Seat-Based",peOwned:false,tev:4163,ntmRev:694,growth:9,gm:90,ebitda:54,cagr:10,ntmRevX:6,peFit:"Low-Medium",aiRisk:"High",avoid:true,ltmEbitda:352,pct52w:0.33,
   desc:"Professional network and communication platform for U.S. physicians covering secure messaging, telehealth, and continuing medical education. Monetizes primarily through pharmaceutical digital marketing to the physician network rather than physician subscriptions. Seat-based revenue charged to pharma advertisers per physician reached.",
   sd:{sharePrice:24.53,sharesOut:207,marketCap:5066,netDebt:-904},
   thesis:["Doximity is a pharma ad network disguised as a physician platform — 85%+ of revenue comes from pharma/health system marketing budgets, not physician subscriptions, making it a digital advertising business","90% GM and 54% EBITDA margins reflect near-zero marginal cost of ad impressions, but this also means revenue is discretionary pharma marketing spend that gets cut in downturns or policy shifts","The 80%+ physician verification rate is the real asset — but LinkedIn, Epic's Haiku, and EHR-embedded messaging are fragmenting physician attention away from Doximity's walled garden","At 6.0x NTM, you are paying a SaaS multiple for an ad-supported business with no SoR characteristics — pharma clients can reallocate budgets to programmatic, point-of-care, or EHR-native channels overnight","Avoid: this is not a take-private candidate — no operational levers to pull, revenue concentration in pharma ad budgets, and the physician network effect is weaker than it appears"],
   aiRationale:["The existential risk is not AI replacing Doximity — it is AI making Doximity irrelevant as a physician engagement channel as workflows move inside EHRs and ambient AI tools","Nuance DAX, Abridge, and Suki are embedding AI directly into the clinical workflow — physicians engaging with AI scribes inside Epic have less reason to open Doximity for messaging or CME","Pharma marketing is shifting to point-of-care delivery via EHR integrations (Veeva CRM, OptimizeRx) that reach physicians in the clinical moment, not on a separate social network","AI-generated CME content and personalized medical education could commoditize one of Doximity's stickiest engagement features","High risk: Doximity's value depends on physician attention and engagement — AI is pulling that attention into clinical workflow tools where pharma can also reach physicians directly"]},
  {name:"Q2 Holdings",vertical:"Financial Services",bucket:"Pure-Play VSaaS",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:3045,ntmRev:896,growth:10,gm:60,ebitda:26,cagr:11,ntmRevX:3.4,peFit:"Medium",aiRisk:"Medium",avoid:false,ltmEbitda:193,pct52w:0.51,
   desc:"Digital banking platform providing online and mobile banking experiences for community banks and credit unions. Covers retail banking, business banking, and lending workflows that sit above the core banking system. Usage-based model with fees tied to registered digital banking users and transaction volumes.",
   sd:{sharePrice:48.12,sharesOut:65,marketCap:3133,netDebt:-88},
   thesis:["Q2 sits in the digital experience layer above core banking (FIS, Fiserv, Jack Henry) — it is the UI not the ledger, making it replaceable if core vendors build competitive front-ends","The real competitive dynamic: Jack Henry's Banno platform is winning digital banking RFPs at community banks with a tighter core-to-digital integration Q2 cannot match as a third-party overlay","60% GM is structurally lower than software peers because Q2 bundles managed services and hosting — a PE buyer could lift margins by shifting clients to self-service, but that risks churn","At 3.4x NTM with $896M revenue, Q2 is interesting as a take-private if you believe the digital banking layer consolidates — combine with Alkami for scale and core vendor negotiating leverage","Kill-the-deal risk: Narmi, Lumin Digital (fintech-native), and core vendors' own digital suites are compressing Q2's win rates in new logo acquisition — growth could decelerate below 10%"],
   aiRationale:["AI risk is indirect but real: if LLM-powered interfaces become the primary banking interaction (conversational banking), the traditional mobile/web UI Q2 provides becomes a commodity","Community banks are unlikely to build AI in-house, which protects Q2 if it embeds AI features (chatbots, fraud alerts, personalization) into its platform faster than alternatives","The deeper risk is that AI enables core banking vendors (FIS, Fiserv) to generate competitive front-ends at near-zero marginal cost, collapsing the market for standalone digital banking layers","Q2's Helix (BaaS for fintechs) could benefit from AI-driven fintech proliferation, but Helix is under 10% of revenue and faces competition from Unit, Treasury Prime, and Synapse successors","Medium risk: Q2 is protected by bank IT procurement inertia near-term, but the digital banking UI layer is exactly the kind of presentation-tier software AI commoditizes fastest"]},
  {name:"Blackbaud",vertical:"Education",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:2655,ntmRev:1154,growth:4,gm:62,ebitda:37,cagr:2,ntmRevX:2.3,peFit:"Medium",aiRisk:"High",avoid:false,ltmEbitda:410,pct52w:0.68,
   desc:"Nonprofit software suite covering fundraising (Raiser's Edge), donor management, and financial management for nonprofits, universities, and faith organizations. The SoR for large enterprise nonprofit operations with deeply embedded multi-year contracts. Seat-based subscription across a broad product portfolio serving 45,000+ organizations.",
   sd:{sharePrice:48.54,sharesOut:47,marketCap:2298,netDebt:357},
   thesis:["Raiser's Edge NXT is the undisputed SoR for enterprise fundraising — universities, hospitals, and large nonprofits have 10-20 years of donor history embedded that cannot migrate without losing relationship intelligence","2.3x NTM is cheap but reflects reality: 2% N3Y CAGR means this is a harvest-and-optimize story — PE math works only if you can cut $100M+ in costs (bloated 5K+ headcount) without accelerating churn","Cleborne/Vista already ran this playbook (2016-2024) extracting value through price increases — the question is whether a second cost-optimization cycle has enough remaining juice","The nonprofit vertical is structurally donation-cycle-dependent: giving correlates with stock market performance and tax policy — a recession during hold could compress both revenue and exit multiple","Attractive as a dividend recap: $1.2B revenue at 37% EBITDA generates ~$430M EBITDA supporting 5-6x leverage for a meaningful day-one distribution even at modest growth"],
   aiRationale:["AI fundraising copilots (Fundraise Up, Gravyty/Community Brands, Bonterra) are capturing new mid-market nonprofit logos that Blackbaud legacy pricing and implementation complexity cannot serve","Seat-based risk is acute: AI tools that auto-generate donor outreach, gift solicitations, and stewardship reports reduce development officers per $1M raised — directly compressing seat counts","Blackbaud donor database moat is real but narrowing — AI can synthesize donor propensity scores from public data (DonorSearch, iWave) without needing Raiser's Edge historical data","The 2% CAGR is partly an AI story already: mid-market nonprofits choosing Bonterra (NEO/EveryAction merger) or Bloomerang + AI tools over Blackbaud's expensive enterprise suite","Mitigant: the largest 5,000 nonprofits (universities, health systems, federated orgs) have compliance, audit, and board reporting requirements locking them into Raiser's Edge for the foreseeable future"]},
  {name:"nCino",vertical:"Financial Services",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:2064,ntmRev:645,growth:8,gm:67,ebitda:26,cagr:9,ntmRevX:3.2,peFit:"Medium",aiRisk:"Medium",avoid:false,ltmEbitda:135,pct52w:0.49,
   desc:"Bank operating system built on the Salesforce platform for loan origination, account opening, and relationship management at commercial banks and credit unions. The SoR for commercial lending workflows at community and regional banks globally. Usage-based model tied to loan origination volumes and active banker seats.",
   sd:{sharePrice:16.14,sharesOut:121,marketCap:1948,netDebt:116},
   thesis:["nCino is a Salesforce ISV overlay for bank lending — the core IP is workflow configuration and bank-specific data models on Salesforce infrastructure nCino does not own","The Salesforce dependency is the deal question: nCino pays ~15-20% of revenue as platform fees, Salesforce controls the roadmap, and Financial Services Cloud competes directly with nCino's relationship management","8% growth reflects saturation in US community banking — international expansion (APAC, EMEA) is the growth vector but adds implementation complexity and longer sales cycles compressing near-term margins","At 3.2x NTM and $2.1B TEV this is right-sized for mid-market PE — Thoma Bravo, Vista, or Insight could execute a take-private without club deal complexity","Kill-the-deal risk: if Salesforce launches a native lending origination module (as it has with insurance and wealth management), nCino's entire platform becomes redundant overnight"],
   aiRationale:["The real AI risk is Salesforce Einstein/Agentforce not external competitors — Salesforce is embedding AI directly into Financial Services Cloud potentially making nCino's workflow layer unnecessary","AI-powered credit decisioning tools (Zest AI, Upstart bank partnerships) could bypass nCino's origination workflow entirely if banks adopt AI-first underwriting pipelines","Bank regulators require explainable AI in lending decisions which actually protects nCino's structured workflow approach over black-box AI alternatives near term","Usage-based pricing tied to loan origination volume means if AI accelerates loan processing speed nCino could see more throughput per bank — a potential tailwind","Upgraded to Medium risk: the Salesforce platform dependency means nCino's AI future is largely controlled by Salesforce's strategic decisions not its own product roadmap"]},
  {name:"Agilysys",vertical:"Travel / Hospitality",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:1991,ntmRev:362,growth:14,gm:64,ebitda:22,cagr:15,ntmRevX:5.5,peFit:"Medium",aiRisk:"Low",avoid:false,ltmEbitda:63,pct52w:0.51,
   desc:"Hospitality management software (PMS, POS) for hotels, resorts, casinos, and cruise lines covering reservations, room management, F&B, and payment processing. The SoR for upscale and resort hospitality operations with usage-based payments revenue growing alongside transaction volumes. Usage-based model with fees tied to property transactions and bookings.",
   sd:{sharePrice:72.17,sharesOut:28,marketCap:2017,netDebt:-26},
   thesis:["Agilysys owns the PMS/POS at high-complexity properties (casinos, resorts, cruise lines) where Oracle Hospitality OPERA is the only real alternative — a two-player market in the upscale segment","The payments flywheel is the thesis: as Agilysys migrates installed base from third-party processors to integrated payments (rGuest Pay) revenue per property compounds without new logo wins","22% EBITDA at $362M revenue means significant operating leverage — peer Oracle Hospitality runs 40%+ margins suggesting Agilysys could double EBITDA at scale with minimal incremental investment","At $2B TEV and 28M shares with ~73% institutional ownership this is a clean single-bidder take-private — no dual-class no founder control no activism overhang","Kill-the-deal risk: 5.5x NTM is expensive for a $362M revenue business — must underwrite continued 14%+ growth and payments penetration to avoid paying full price for a small asset"],
   aiRationale:["Hospitality PMS is physical-operations software: room inventory housekeeping dispatch F&B kitchen management and payment terminals cannot be replaced by an AI model","AI drives upsell opportunity for Agilysys: dynamic pricing guest preference prediction and automated upsell at check-in are features it can embed and charge for","The competitive moat against AI disruption is hardware integration — Agilysys POS terminals kiosks and payment devices are physically installed and connected to the PMS","Mews Cloudbeds and Stayntouch are cloud-native PMS competitors but target independent/midscale hotels not the casino/resort segment where Agilysys has deep integration","Low risk: hospitality operations software is among the most AI-resilient categories — it orchestrates physical processes (room turns kitchen tickets check-in) requiring real-world execution"]},
  {name:"Alkami Technology",vertical:"Financial Services",bucket:"Pure-Play VSaaS",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:1988,ntmRev:537,growth:19,gm:65,ebitda:19,cagr:23,ntmRevX:3.7,peFit:"Medium",aiRisk:"Medium",avoid:false,ltmEbitda:65,pct52w:0.53,
   desc:"Cloud-native digital banking platform (retail and business banking) for credit unions and community banks. Competes directly with Q2 in the community financial institution segment with a modern, API-first architecture. Usage-based model with fees tied to registered digital banking users across the client base.",
   sd:{sharePrice:16.55,sharesOut:104,marketCap:1719,netDebt:270},
   thesis:["Alkami is the cloud-native challenger to Q2 in community banking — API-first architecture and modern UX win new logos but 19% growth is partly a smaller-base effect not superior PMF","The Q2-vs-Alkami dynamic is the key question: if digital banking consolidates the acquirer buys both and merges — Alkami standalone value depends on remaining independent to reach scale","19% EBITDA at $543M revenue is the PE opportunity: heavy R&D and sales spend that a take-private could rationalize to pull margins to 30%+ within 3 years","47% off 52W high at 3.7x NTM makes this the cheapest high-growth name in the screen — but growth deceleration risk is real as the credit union TAM saturates (~5000 institutions)","Kill-the-deal risk: Jack Henry Banno and FIS Digital One bundle digital banking with core processing at near-zero incremental cost — Alkami must win on UX alone against free alternatives"],
   aiRationale:["Same structural risk as Q2: if AI enables conversational banking the traditional mobile/web UI Alkami builds becomes a commodity presentation layer","Alkami API-first architecture is better positioned than Q2 to integrate AI — the modern tech stack makes it easier to embed LLM-powered experiences than Q2 legacy codebase","Second-order AI risk: credit unions become less relevant as AI-powered neobanks (Chime Mercury) offer superior digital experiences without branch networks shrinking the TAM","Credit union IT budgets are tiny ($500K-$2M annually) limiting willingness to pay for AI-enhanced digital banking — Alkami cannot price AI features aggressively","Medium risk: protected by regulatory inertia and credit union conservatism near-term but the digital banking presentation layer is commoditizing via AI and core vendor bundling"]},
  {name:"Intapp",vertical:"Financial Services",bucket:"Pure-Play VSaaS",hq:"US",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:1648,ntmRev:634,growth:14,gm:78,ebitda:22,cagr:15,ntmRevX:2.6,peFit:"Medium",aiRisk:"High",avoid:false,ltmEbitda:107,pct52w:0.34,
   desc:"Professional services platform covering conflict checking, time tracking, billing, and compliance for law firms, accounting firms, and investment banks. The SoR for professional services risk and compliance workflows in regulated industries with embedded multi-year enterprise contracts. Seat-based subscription charged per professional.",
   sd:{sharePrice:22.43,sharesOut:86,marketCap:1939,netDebt:-290},
   thesis:["2.6x NTM for a 78% GM SoR with 14% growth looks like a screaming buy — but the market is pricing real AI-driven seat compression at law firms and PE firms which are Intapp core clients","Intapp conflict checking (Wallbuilder) and compliance workflows are genuinely sticky — a law firm cannot close a merger without running conflicts through Intapp and this is non-discretionary","The bear case is math not technology: if AI tools (Harvey Clio Ironclad) reduce associate headcount at AmLaw 100 firms by 20-30% over 5 years Intapp loses 20-30% of seat revenue mechanically","Contrarian bull case: AI actually increases compliance complexity (AI-generated work products need review trails and AI ethics audits) which could grow Intapp compliance TAM","Kill-the-deal risk: Thomson Reuters (owner of Practical Law HighQ) could bundle compliance and conflicts into its legal workflow suite making Intapp standalone value proposition redundant"],
   aiRationale:["Intapp is seat-based in the single sector most exposed to AI headcount reduction — BigLaw and Big Four are the earliest enterprise adopters of AI drafting tools","Harvey AI raised $300M+ and is deployed at Allen & Overy and PwC — every associate replaced is one fewer Intapp seat for time tracking conflict checking and billing","The conflict-checking workflow is the most defensible piece: ethical walls and matter conflicts are regulatory requirements that cannot be automated away even if humans behind them shrink","Time and billing modules face existential AI risk: if AI auto-generates time entries from work product (as Harvey and Clio suggest) the per-lawyer billing seat becomes unnecessary","High risk confirmed: the question is not whether AI reduces professional services headcount but how fast — Intapp needs to pivot from per-seat to per-matter pricing to survive"]},
  {name:"Alfa Financial Software",vertical:"Financial Services",bucket:"Pure-Play VSaaS",hq:"UK",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:751,ntmRev:183,growth:8,gm:64,ebitda:33,cagr:11,ntmRevX:4.1,peFit:"Medium",aiRisk:"Low",avoid:false,ltmEbitda:60,pct52w:0.77,
   desc:"Asset finance origination and servicing platform for auto, equipment, and real estate lenders at global banks and captive finance companies. The SoR for asset finance portfolio management with multi-year implementation cycles and deep regulatory integration. Usage-based model tied to portfolio activity and loan counts.",
   sd:{sharePrice:2.59,sharesOut:294,marketCap:763,netDebt:-12},
   thesis:["Alfa is the SoR for asset finance lifecycle management (origination through servicing through collections) at global banks like Santander BMW Financial and Investec — implementations take 12-24 months creating near-permanent lock-in","The competitive landscape is Alfa vs FIS Asset Finance vs lineage of in-house builds — this is a 2-3 player oligopoly in a market too small for new entrants to justify the regulatory investment","LSE-listed at GBP 2.59/share ($751M TEV) — UK-listed vertical software trades at a persistent discount to US-listed peers creating an arbitrage opportunity for a PE buyer who re-lists or sells to a US strategic","Revenue lumpiness is the real issue: Alfa books large implementation projects that create quarter-to-quarter volatility — this masks underlying recurring revenue quality and depresses the public market multiple","Kill-the-deal risk: at $183M NTM revenue this is too small for flagship PE funds — attractive only as a bolt-on to a broader financial software platform (FIS Finastra SS&C) or for a specialist fund"],
   aiRationale:["Asset finance is deeply regulatory: IFRS 16 lease accounting Basel III/IV capital adequacy and local consumer lending rules require auditable calculation engines AI cannot replace","AI could enhance credit decisioning within Alfa (faster auto loan approvals better residual value predictions) but this augments the SoR rather than displacing it","Usage-based model tied to portfolio volume (contracts serviced) means AI efficiency gains in loan processing increase throughput without reducing Alfa revenue per contract","No AI-native competitor exists in asset finance origination/servicing — the regulatory barrier to entry (multi-jurisdiction compliance testing takes years) makes this structurally AI-resistant","Low risk confirmed: asset finance SoR is among the most AI-insulated categories in this screen — regulatory complexity usage-based pricing and zero credible AI alternatives make disruption a non-issue over any PE hold period"]},
  {name:"SiteMinder",vertical:"Travel / Hospitality",bucket:"Pure-Play VSaaS",hq:"AU",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:679,ntmRev:226,growth:27,gm:66,ebitda:14,cagr:23,ntmRevX:3,peFit:"Low-Medium",aiRisk:"Medium",avoid:true,ltmEbitda:17,pct52w:0.5,
   desc:"Hotel channel management and distribution platform connecting independent hotels and chains to OTAs, GDS, and direct booking channels. Sits above the core PMS as a distribution layer rather than a deep SoR for hotel operations. Usage-based model tied to bookings and reservations processed.",
   sd:{sharePrice:2.57,sharesOut:274,marketCap:703,netDebt:-24},
   thesis:["$679M TEV is sub-scale for large-cap PE — this is a bolt-on for an Amadeus, Sabre, or a hospitality platform roll-up, not a standalone LBO","Channel management sits above the PMS (Mews, Cloudbeds, Oracle Hospitality) — SiteMinder doesn't own the guest record or rate logic, so switching cost is low","14% EBITDA means debt service capacity is negligible; you're underwriting 27% top-line growth continuing while Booking.com and Expedia invest in direct-connect APIs that bypass channel managers entirely","Cloudbeds, RateGain, and D-EDGE all compete in this layer — no pricing power when OTAs can vertically integrate the same function","Best case is a take-private at 3-4x by a travel tech sponsor who already owns a PMS and wants the distribution pipe — but standalone, this is avoid"],
   aiRationale:["Channel management is a routing and optimization layer — exactly the type of decision-making AI agents will handle natively within PMS or OTA platforms","Booking.com's AI-powered connectivity tools and Expedia's partner APIs are moving to direct PMS integration, structurally disintermediating standalone channel managers","Hotels adopting AI revenue management tools (Duetto, IDeaS, Atomize) increasingly want native channel distribution, not a separate vendor","Usage-based model tied to bookings processed provides near-term resilience, but per-booking fees compress as OTAs consolidate connectivity in-house","Medium risk near-term, but long-term the standalone channel manager category likely collapses into PMS platforms or OTA-owned connectivity layers"]},
  {name:"Blend Labs",vertical:"Financial Services",bucket:"Pure-Play VSaaS",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:526,ntmRev:150,growth:20,gm:77,ebitda:22,cagr:3,ntmRevX:3.5,peFit:"Low",aiRisk:"High",avoid:true,ltmEbitda:18,pct52w:0.38,
   desc:"Digital lending platform for mortgage origination and consumer banking covering application, verification, and closing workflows. Targets banks and credit unions to digitize the mortgage loan process end-to-end. Usage-based model with fees tied to loan application volumes processed.",
   sd:{sharePrice:1.68,sharesOut:288,marketCap:484,netDebt:42},
   thesis:["$526M TEV, 3% N3Y CAGR, not a SoR — fails on scale, growth durability, and defensibility simultaneously","20% NTM vs 3% N3Y is a red flag: Blend is likely riding a rate-driven mortgage refi wave that normalizes, not a structural growth inflection","Blend sits in the application-to-close workflow layer, but the core data (credit pulls, title, appraisal) lives in Encompass (ICE/Ellie Mae) and Black Knight — Blend is middleware, not infrastructure","Banks are Blend's customers and are simultaneously investing in their own digital origination (JPM, Wells) or buying ICE's end-to-end stack — squeezed from both ends","Avoid: even at 3.5x NTM, you are paying for a middleware layer where dominant LOS vendors (ICE, nCino) are adding the same digital origination features natively"],
   aiRationale:["Mortgage origination workflow — document collection, income verification, disclosure generation — is a textbook LLM automation use case","Specific threats: Ocrolus for document intelligence, Tavant's FinGPT for underwriting automation, and ICE's own AI features within Encompass all target Blend's exact workflow","3% N3Y CAGR likely already reflects early AI-driven demand destruction as banks realize they can automate intake without a separate vendor","Usage-based per-loan pricing is structurally exposed: if AI halves origination time, banks question why they pay Blend per application when value-add shrinks","High risk: thin workflow layer with no proprietary data, no regulatory mandate, and direct exposure to the most mature AI automation use case in financial services"]},
  // ── DATA & ANALYTICS ──
  {name:"Fair Isaac (FICO)",vertical:"Financial Services",bucket:"Data & Analytics",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:36818,ntmRev:2668,growth:21,gm:85,ebitda:62,cagr:19,ntmRevX:13.8,peFit:"Low",aiRisk:"Low",avoid:false,ltmEbitda:1265,pct52w:0.64,
   desc:"Predictive analytics company best known for the FICO Score — the de facto regulatory standard in US consumer credit decisioning used by virtually all lenders. Also provides software for fraud detection, customer management, and decision optimization across financial services. Usage-based fees on score inquiries and decision analytics volumes.",
   sd:{sharePrice:1409.36,sharesOut:24,marketCap:33861,netDebt:2958},
   thesis:["The FICO Score is the closest thing to a legal monopoly in software — embedded in Fannie/Freddie requirements, Basel III calculations, and virtually every US lending workflow","21% growth at 62% EBITDA is driven by aggressive score price increases (~30% since 2023) — the real question is whether regulators or the CFPB eventually cap pricing power","$36B TEV at 13.8x NTM is a public markets compounder, not a PE candidate — no sponsor can lever this enough to generate alpha over simply owning the equity","The FICO Platform (decision management, fraud) is the weaker leg: competes with SAS, Experian PowerCurve, and NICE Actimize, and lacks the regulatory moat of the Score","Key risk most investors miss: FHFA's push for alternative credit models (VantageScore, UltraFICO, cash-flow underwriting) is slow but directionally threatens the monopoly at the margin"],
   aiRationale:["The FICO Score itself has near-zero AI risk — it is a regulatory standard, not a product that competes on features or user experience","But the FICO Platform (fraud, customer management, decision analytics) is directly threatened by AI-native alternatives: Featurespace, Feedzai, and Sardine all do real-time fraud better with ML-first architectures","AI-driven alternative credit scoring (Upstart, Zest AI, Prism Data) is gaining traction with fintechs and could pressure FICO if regulators accept ML-based models for conforming loans","Usage-based pricing on score pulls actually benefits from AI: more automated lending decisions means more score inquiries, not fewer — volume is a tailwind","Low risk on the Score (regulatory infrastructure), medium risk on the Platform (competitive AI-native alternatives) — blended to low-medium overall"]},
  {name:"Broadridge Financial",vertical:"Financial Services",bucket:"Data & Analytics",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:24868,ntmRev:7536,growth:5,gm:31,ebitda:25,cagr:6,ntmRevX:3.3,peFit:"Low",aiRisk:"Low",avoid:false,ltmEbitda:1771,pct52w:0.7,
   desc:"Financial services infrastructure for proxy voting, investor communications, and capital markets post-trade processing. Covers corporate actions, trade settlement, and regulatory communications for broker-dealers and asset managers globally. Usage-based model with revenue tied to trade and shareholder communication volumes.",
   sd:{sharePrice:185.87,sharesOut:118,marketCap:21972,netDebt:2897},
   thesis:["Broadridge is financial plumbing, not software — 31% GM reflects a services-heavy business (print/mail, proxy fulfillment) that is structurally lower quality than pure software","The proxy distribution monopoly is real (processes ~80% of US proxy statements) but growth is GDP-like at 5% — this is a bond, not an equity story","$25B TEV is way too large for PE, and 5% growth / 25% EBITDA does not justify a take-private premium — no operational improvement thesis not already priced in","Itiviti acquisition (capital markets tech) was the growth catalyst, but post-trade processing competes with DTCC, FIS, and SS&C who all have deeper hooks","Benchmark only: useful as a comp for financial infrastructure durability, but not actionable for PE at any price point"],
   aiRationale:["Proxy voting and shareholder communications are SEC-mandated — AI cannot eliminate the regulatory requirement to distribute and tabulate proxies","But the communications layer (formatting, distribution, translation of investor documents) is highly automatable — AI reduces the labor intensity that drives Broadridge's services revenue","31% GM is where AI risk concentrates: services margin compresses as AI automates document processing, while the regulatory infrastructure layer survives","Post-trade processing via Itiviti faces AI-native competition from Torstone (LSE Group) and cloud-native settlement platforms that reduce middleware needs","Low-medium risk overall: regulatory mandate protects proxy volumes, but services-heavy revenue mix means AI efficiency gains compress margins rather than grow them"]},
  {name:"FactSet Research",vertical:"Financial Services",bucket:"Data & Analytics",hq:"US",sor:false,seat:false,pricing:"Seat-Based",peOwned:false,tev:9418,ntmRev:2545,growth:5,gm:52,ebitda:39,cagr:5,ntmRevX:3.7,peFit:"Low-Medium",aiRisk:"High",avoid:true,ltmEbitda:946,pct52w:0.46,
   desc:"Financial data and analytics terminal aggregating market data, company financials, estimates, and research for investment professionals. Competes with Bloomberg and Refinitiv in the financial data terminal market. Seat-based subscription charged per analyst or portfolio manager.",
   sd:{sharePrice:216.81,sharesOut:38,marketCap:8221,netDebt:1197},
   thesis:["3.7x NTM looks cheap but is a value trap — 5% growth in a seat-based terminal business means you are buying a melting ice cube with no organic acceleration catalyst","FactSet core value prop (aggregated financials, estimates, screening) is exactly what ChatGPT, Perplexity, and Bloomberg AI tools replicate for free or at a fraction of cost","The buy-side is cutting terminal spend: large quant funds all build proprietary data stacks — FactSet mid-market clients are next to rationalize seats","54% off 52W high reflects the market correctly pricing structural decline, not a dislocation — the discount deepens from here","Avoid: a PE sponsor buying this is betting they can accelerate a 5% grower while financial research shifts to AI — no credible path to value creation"],
   aiRationale:["Financial research synthesis is the single most direct LLM use case — FactSet charges $20K+/seat for what Claude, GPT-4, and Gemini do with a PDF upload and API call","AlphaSense, Tegus, and Visible Alpha are AI-native competitors purpose-built to replace the legacy terminal with natural language search over financial data","Bloomberg is embedding AI directly into the Terminal — if Bloomberg offers AI-native research at the same price, FactSet loses its only differentiation (cost)","Seat-based pricing where AI lets one analyst do the work of three is mathematically certain revenue compression — fewer seats per fund, lower ARPU","High risk: arguably the single highest-AI-risk business in the entire screen — the product is information retrieval and synthesis, which is literally what LLMs are built to do"]},
  {name:"Sportradar",vertical:"Sports Tech",bucket:"Data & Analytics",hq:"CH",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:5481,ntmRev:1890,growth:21,gm:75,ebitda:26,cagr:21,ntmRevX:2.9,peFit:"Medium",aiRisk:"Low",avoid:false,ltmEbitda:364,pct52w:0.57,
   desc:"Sports data and analytics company providing real-time data feeds, odds compiling, and integrity services to sports leagues, broadcasters, and betting operators globally. Holds exclusive data rights with major sports leagues creating a structural moat that AI cannot easily replicate. Usage-based data licensing model tied to content consumption and betting volumes.",
   sd:{sharePrice:18.26,sharesOut:317,marketCap:5793,netDebt:-313},
   thesis:["2.9x NTM for 21% growth with exclusive league data rights is genuinely cheap — the moat is data supply agreements (NBA, NFL, UEFA), not the software layer","Bull case is sports betting legalization expansion (only ~38 US states live) driving structural volume growth through Sportradar pipes for 5+ more years","Key weakness: Genius Sports holds competing NFL and Premier League rights — moat is narrower than it appears, and league contract renewals (2026-2028) carry real re-pricing risk","At $5.5B TEV, take-private-able but 26% EBITDA and capital intensity of data rights acquisition makes LBO math tight — need margin expansion to 35%+ for returns to work","Exit buyer universe is strong (Flutter/FanDuel, DraftKings, ESPN/Disney for media rights) but bidder overlap with Genius Sports means exit multiple compression is possible"],
   aiRationale:["The moat is exclusive data supply agreements with leagues, not proprietary AI — odds compilation and data feeds are defensible only as long as league contracts hold","AI actually helps Sportradar: real-time computer vision for live data capture, automated odds adjustment, and micro-market generation are AI-enhanced features that increase product value","Risk: if leagues decide to sell data directly or build in-house data operations (NBA and MLB have explored this), the middleman layer gets disintermediated regardless of AI","Genius Sports is investing heavily in AI-powered data collection that could undercut Sportradar pricing at contract renewal — the competitive dynamic is intensifying","Low-medium risk: data rights are the real moat and AI enhances the product, but contract renewal risk and league direct-to-consumer data trends are the underappreciated threats"]},
  {name:"Claritev",vertical:"Healthcare",bucket:"Data & Analytics",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:true,tev:4816,ntmRev:1003,growth:3,gm:76,ebitda:62,cagr:4,ntmRevX:4.8,peFit:"Low",aiRisk:"Medium",avoid:true,ltmEbitda:604,pct52w:0.19,
   desc:"Healthcare claims integrity and payment accuracy analytics for health plans, processing billions of claims annually to identify overpayments, fraud, and coding errors. Formerly Cotiviti, renamed Claritev after Veritas Capital-backed restructuring. Usage-based transaction fees on claims processed with extremely high EBITDA margins from automated analytics.",
   sd:{sharePrice:13.47,sharesOut:17,marketCap:228,netDebt:4588},
   thesis:["7.6x net leverage on $604M EBITDA is the defining feature — this is a Veritas Capital financial engineering outcome where the 2022 take-private loaded maximum debt, renamed the asset, and IPO'd into a market that has since rejected the leverage profile, explaining the 81% drawdown from 52W high","The underlying business is genuinely high-quality: healthcare claims integrity analytics sits between payers and providers as an independent arbiter of payment accuracy — health plans cannot self-audit claims without third-party validation, and Claritev processes ~$1T in claims annually across the top 25 US health plans","3% growth at 62% EBITDA margins is the classic PE harvesting profile — but the minimal growth reflects TAM saturation in retrospective claims editing (the legacy Cotiviti business), and the pivot to prospective payment integrity (pre-pay analytics) is where incremental growth must come from","19% of 52W high creates an optically distressed situation that is really a capital structure problem not a business quality problem — if you could acquire the equity at the current $228M market cap and refinance the $4.6B debt stack, the underlying cash flow engine is worth multiples of the equity value","Kill-the-deal risk is real: Optum (UHG), Cotiviti's former sister company Change Healthcare, and Gainwell Technologies all compete in payment integrity — and UHG's vertical integration of payer + payment integrity + PBM creates a bundling threat that standalone Claritev cannot match"],
   aiRationale:["Claims integrity analytics is fundamentally a pattern-recognition business — identifying overpayments, billing errors, and fraud across billions of claims — which is exactly what ML and LLMs excel at; Claritev's advantage is 20+ years of labeled claims data that no AI startup can replicate, but the question is whether health plans build internal AI capabilities using their own claims data","The structural protection is regulatory: CMS requires independent third-party audits for Medicare Advantage and Medicaid managed care claims — health plans legally cannot rely solely on internal AI tools for payment accuracy, preserving demand for independent validators like Claritev","Specific AI threat: Apixio (New Mountain Capital-backed), Aetion, and Inovalon are building AI-native clinical analytics platforms that compete directly with Claritev's prospective payment integrity — these are well-capitalized competitors with modern tech stacks targeting the same CTO buyers","The 62% EBITDA margin actually reflects heavy AI/ML investment already embedded — Claritev's analytics engine uses proprietary algorithms trained on decades of claims data; the question is whether this IP depreciates as foundation models match domain-specific accuracy on structured claims data","Medium risk: the retrospective audit business is protected by regulatory mandate and data moats for 5+ years; the prospective analytics business faces genuine AI competition from well-funded startups and from health plans' own data science teams building in-house capabilities"]},
  // ── HYBRID VSaaS ──
  {name:"Synopsys",vertical:"Construction & Design SW",bucket:"Hybrid VSaaS",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:87636,ntmRev:9959,growth:26,gm:83,ebitda:41,cagr:20,ntmRevX:8.8,peFit:"Low",aiRisk:"Low",avoid:false,ltmEbitda:3137,pct52w:0.64,
   desc:"Electronic design automation (EDA) software for semiconductor chip design covering synthesis, simulation, verification, and IP alongside Cadence as the two dominant platforms globally. AI chip design is built on top of Synopsys tools, making AI a demand driver rather than a threat. Usage-based model tied to design activity and chip complexity.",
   sd:{sharePrice:414,sharesOut:184,marketCap:76308,netDebt:11327},
   thesis:["Synopsys + Cadence is the closest duopoly in enterprise software — every advanced chip (sub-7nm) requires their tools, TSMC/Samsung fab processes are co-optimized with Synopsys","26% growth inflated by Ansys acquisition; organic EDA growth closer to 12-15% — still excellent but headline overstates underlying momentum","$88B TEV at 8.8x NTM is a public markets compounder, not PE — even mega-funds cannot underwrite a take-private at this scale","Ansys deal creates simulation-to-silicon platform that is genuinely differentiated, but integration risk is real with 2-3 years of execution complexity","Benchmark: gold standard for mission-critical AI-tailwind software — use as the quality ceiling when evaluating other screen names"],
   aiRationale:["AI is a massive demand driver — every new AI chip (NVIDIA H100/B200, Google TPU, custom ASICs) requires Synopsys EDA tools to design and verify","Synopsys DSO.ai is the leading example of AI enhancing an incumbent — it uses reinforcement learning to reduce chip design cycles from months to weeks","The risk is not AI disruption but AI concentration: if only 3-4 hyperscalers design custom chips, customer base narrows even as per-customer spend increases","No credible AI-native EDA competitor exists — physics simulation and process design kit integration required is a multi-decade moat that ML alone cannot replicate","Low risk: rare case where AI simultaneously drives demand for the product and is embedded within the product to increase value — a genuine AI beneficiary"]},
  {name:"Axon Enterprise",vertical:"GovTech",bucket:"Hybrid VSaaS",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:44841,ntmRev:3768,growth:29,gm:63,ebitda:26,cagr:31,ntmRevX:11.9,peFit:"Low",aiRisk:"Low",avoid:false,ltmEbitda:742,pct52w:0.62,
   desc:"Public safety technology platform combining Taser devices, body cameras, and cloud software (Evidence.com) for law enforcement agencies globally. AI tools for evidence management, body cam analysis, and dispatch are embedded as premium add-ons driving ARPU expansion. Usage-based hardware/software/cloud model tied to officer counts and evidence storage.",
   sd:{sharePrice:542,sharesOut:82,marketCap:44677,netDebt:164},
   thesis:["29% growth with 31% N3Y CAGR is the best compounding profile in the screen — hardware+software+cloud makes it stickier than pure SaaS","The real story is Taser-to-Evidence.com land-and-expand: gets in the door with devices then upsells cloud storage, AI analytics, and Draft One (AI report writing) at 80%+ margins","$45B TEV at 12x NTM is untouchable for PE — included because it shows what an AI-tailwind GovTech business looks like at maturity","63% blended GM (dragged by Taser hardware) masks a software segment at 75%+ margins — margin mix improves every year as cloud/AI grows faster than devices","Key risk investors underestimate: municipal budget cycles and defund-the-police political headwinds create lumpy procurement, and Axon has near-zero non-US law enforcement diversification"],
   aiRationale:["Axon is the textbook case of AI as a revenue driver: Draft One (AI-generated police reports from body cam footage) launched in 2024 and is already driving measurable ARPU uplift per officer","Evidence.com is the SoR for digital evidence in US law enforcement — AI features (auto-redaction, transcript search, case linking) are upsell layers on a locked-in platform, not competitive threats","FedRAMP and CJIS compliance certifications create a 2-3 year barrier to entry that no AI startup can shortcut — government security requirements are the moat, not the software itself","The second-order AI risk is actually positive: if AI makes officers more productive at report writing and evidence processing, departments can handle more cases without hiring — Axon charges per device, not per case","Low risk: this is the single best example in the screen of AI being a pure product tailwind with zero cannibalization risk — the customer base cannot switch and AI features drive pricing power"]},
  {name:"Constellation Software",vertical:"Diversified",bucket:"Hybrid VSaaS",hq:"CA",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:42139,ntmRev:14046,growth:16,gm:29,ebitda:29,cagr:16,ntmRevX:3,peFit:"Low",aiRisk:"Medium",avoid:false,ltmEbitda:3376,pct52w:0.5,
   desc:"Decentralized acquirer of vertical market software (VMS) businesses across public sector, healthcare, and industrial niches. Owns 800+ niche software companies managed through autonomous business units with a disciplined buy-and-hold acquisition philosophy. Diverse usage-based and subscription revenue across a highly fragmented portfolio.",
   sd:{sharePrice:1865,sharesOut:21,marketCap:39600,netDebt:2539},
   thesis:["The bull case (disciplined VMS acquirer compounding at 16%) is well-understood — the bear is that many of 800+ portfolio cos are exactly the small niche workflow tools AI disrupts first","29% GM means many subs are services-heavy, not pure software — legacy on-prem tools with aging codebases where AI-native alternatives have the largest quality gap to exploit","Organic growth ex-M&A is likely low-single-digits across the portfolio — the acquisition machine masks what may be structural decline in many individual business units","$42B TEV at 3.0x NTM is not PE-actionable, but the real question is whether CSU can sustain acquisition returns when every PE fund now competes for the same VMS targets","Benchmark with a caveat: diversification is not insulation — if 30% of subs face serious AI disruption, portfolio ROIC degrades even if the M&A flywheel continues"],
   aiRationale:["Diversification does not mean AI-proof — many CSU subs are small niche workflow tools (scheduling, billing, forms) in verticals where AI automation is most immediately applicable","The decentralized model that creates operational discipline also prevents coordinated AI adoption — each sub must independently figure out how to embed AI, and most lack the engineering talent to do so","CSU acquires at 1-2x revenue precisely because these are low-growth, often legacy tools — but AI now offers buyers of these same tools the option to build rather than buy, compressing acquisition multiples","Specific vulnerable categories within CSU: municipal permitting software, property management tools, small healthcare scheduling systems — all face direct AI-native competition from well-funded startups","Medium risk (upgraded from low): portfolio diversification provides some cushion but the tail risk is that AI simultaneously degrades organic growth AND compresses acquisition multiples across the VMS category"]},
  {name:"Dassault Systemes",vertical:"Construction & Design SW",bucket:"Hybrid VSaaS",hq:"FR",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:27306,ntmRev:7585,growth:2,gm:85,ebitda:35,cagr:7,ntmRevX:3.6,peFit:"Low",aiRisk:"Low",avoid:false,ltmEbitda:2558,pct52w:0.5,
   desc:"3D design and PLM software platform (3DEXPERIENCE) for manufacturing, life sciences, and aerospace companies with products including CATIA, SIMULIA, and ENOVIA. The global SoR for product lifecycle management from design through manufacturing and regulatory submission. Usage-based subscription tied to module adoption and user activity.",
   sd:{sharePrice:22,sharesOut:1329,marketCap:29103,netDebt:-1797},
   thesis:["CATIA and ENOVIA are the global SoR for aerospace (Airbus, Boeing, Dassault Aviation) and pharma (validated PLM for FDA 21 CFR Part 11) — switching costs are measured in decades, not years","2% growth is the real story: the 3DEXPERIENCE cloud transition has been painfully slow, and Dassault is losing share in mid-market CAD/PLM to PTC Onshape and Autodesk Fusion360","$27B TEV is too large for PE, but 3.6x NTM for an 85% GM / 35% EBITDA business with ~$1.8B net cash shows how severely the market is discounting growth stagnation","The Medidata acquisition (clinical trials) was supposed to diversify into life sciences SaaS — execution has been mixed and Veeva remains the dominant clinical platform","Benchmark for industrial PLM quality but a cautionary tale: even the deepest SoR gets punished when the cloud transition stalls and organic growth flatlines"],
   aiRationale:["PLM for aerospace and pharma is regulation-adjacent: FDA validated systems (21 CFR Part 11) and aerospace traceability (AS9100) require PLM — AI cannot bypass the regulatory mandate to maintain these records","AI generative design (topology optimization, generative CAD) is additive to Dassault, not competitive — CATIA is the canvas these tools paint on, and Dassault is embedding its own generative tools","The risk is in mid-market CAD where AI-native tools (PTC Onshape + AI, nTopology, Autodesk AI) lower the barrier to 3D design — but Dassault's enterprise PLM customers are not mid-market","SIMULIA simulation faces competition from Ansys (now Synopsys) which has deeper AI-driven simulation capabilities — the Ansys-Synopsys merger creates a formidable competitor to Dassault in simulation","Low risk: the enterprise PLM SoR for regulated industries is among the most AI-resilient categories in software — the threat is more about growth stagnation than AI displacement"]},
  {name:"HealthEquity",vertical:"Healthcare",bucket:"Hybrid VSaaS",hq:"US",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:7371,ntmRev:1418,growth:8,gm:72,ebitda:44,cagr:8,ntmRevX:5.2,peFit:"Medium-High",aiRisk:"Low",avoid:false,ltmEbitda:568,pct52w:0.68,
   desc:"Technology-driven health benefits administrator managing HSAs, FSAs, HRAs, and COBRA for employers and insurance carriers. AUM-based revenue model where fees grow naturally as HSA balances compound over time, creating a durable flywheel. The SoR for employer health savings benefit administration with a strong regulatory moat.",
   sd:{sharePrice:76,sharesOut:86,marketCap:6559,netDebt:813},
   thesis:["HealthEquity is a trust-regulated custodian disguised as a tech company — 44% EBITDA is driven by net interest income on $26B+ HSA assets, not software margins","The AUM flywheel is the real moat: HSA balances compound (contributions + investment returns), creating natural revenue growth even with zero new accounts — this is a financial services business with software multiples","$7.4B TEV at 5.2x NTM is PE-actionable in theory, but the trust/custody regulatory requirements (state banking licenses, IRS compliance) create complex diligence — not a clean software LBO","Fidelity, Vanguard, and Lively (now part of Choose) are competing for HSA market share with lower fees — HealthEquity wins on employer distribution but is vulnerable if large employers switch custodians","The honest bull case: this is a toll booth on a structurally growing market (HSA-eligible plans expanding as employers shift healthcare costs) with near-zero churn on existing accounts — boring but durable"],
   aiRationale:["HSA custody is a trust-regulated financial relationship — AI cannot displace a custodian any more than it can displace a bank; the regulatory moat is structural and permanent","The only AI risk is on the benefits administration layer (enrollment, eligibility, COBRA management) where AI chatbots and automated benefits advisors could reduce HealthEquity's services revenue","But the real revenue driver is net interest income and AUM-based fees on custodied assets — this revenue stream has literally zero AI exposure since it grows with market returns and contributions","AI-powered benefits optimization tools (Navia, DataPath) compete on the administration layer but cannot touch the custodial relationship without obtaining their own trust licenses","Low risk: one of the most AI-insulated businesses in the screen — the revenue model is fundamentally a financial custody business, not a software business that AI can disrupt"]},
  {name:"Cellebrite",vertical:"GovTech",bucket:"Hybrid VSaaS",hq:"IL",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:2919,ntmRev:584,growth:19,gm:85,ebitda:27,cagr:18,ntmRevX:5,peFit:"High",aiRisk:"Low",avoid:false,ltmEbitda:131,pct52w:0.65,
   desc:"Digital intelligence platform for law enforcement and government agencies to extract, analyze, and manage digital evidence from mobile devices and cloud sources. The SoR for digital forensics workflows globally with government contract revenue providing multi-year visibility. Usage-based model with AI-enhanced investigation tools driving premium pricing.",
   sd:{sharePrice:13,sharesOut:250,marketCap:3334,netDebt:-414},
   thesis:["$3B TEV is the right size for PE, 85% GM / 19% growth / 18% N3Y CAGR is elite quality, and the GovTech moat (CJIS, FedRAMP, Five Eyes certifications) is genuinely hard to replicate","Cellebrite owns both sides of the digital forensics workflow: UFED for extraction and Physical Analyzer/Pathfinder for analysis — competitors like MSAB and Grayshift only compete on extraction","The AI upsell story is real and already working: Cellebrite Guardian (AI case management) and AI-powered analytics are driving 30%+ net revenue retention as agencies expand from extraction to full investigation workflow","Key risk: Cellebrite's brand carries reputational baggage (NSO Group associations, surveillance state concerns) which limits TAM expansion into private enterprise and creates ESG friction for some LPs","Exit path is clear: strategic buyers include Axon, Motorola Solutions, Palantir, or L3Harris — all have adjacent GovTech platforms and would pay 8-12x for the digital forensics SoR with AI growth"],
   aiRationale:["AI is the single biggest product catalyst for Cellebrite: AI-powered evidence search (natural language queries over extracted data), auto-categorization of images/videos, and pattern detection across devices are all premium features","The extraction layer (UFED) requires zero-day exploit research and hardware engineering that AI startups cannot replicate — this is cybersecurity R&D, not software features","Grayshift (now Magnet Forensics/Thermo Fisher) is the only real competitor, and the market is effectively a duopoly with high barriers from security certifications and law enforcement trust","Second-order AI effect is positive: as criminals use AI to generate deepfakes, encrypted comms, and synthetic identities, demand for advanced digital forensics tools increases — AI creates the problem Cellebrite solves","Low risk: digital forensics is one of the clearest AI-as-tailwind categories — AI makes the product better, makes the market larger, and the certification moat prevents AI-native disruption"]},
  {name:"Xometry",vertical:"Construction & Design SW",bucket:"Hybrid VSaaS",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:2205,ntmRev:848,growth:21,gm:39,ebitda:6,cagr:22,ntmRevX:2.6,peFit:"Low",aiRisk:"Medium",avoid:true,ltmEbitda:23,pct52w:0.57,
   desc:"AI-powered manufacturing marketplace connecting engineers and procurement teams with a global network of CNC machining, 3D printing, injection molding, and sheet metal suppliers. Provides instant quoting, lead time optimization, and quality assurance through a software platform. Usage-based marketplace fees on transaction volumes.",
   sd:{sharePrice:41.0,sharesOut:51,marketCap:2085,netDebt:120},
   thesis:["Xometry is a marketplace with a software wrapper, not a software company with a marketplace — 39% GM at $848M NTM revenue confirms that unit economics are driven by the manufacturing supplier take rate (~15-20% of order value), not software subscription revenue; the 'AI-powered quoting' is the differentiation layer but the P&L is a brokerage business","6% EBITDA at $857M LTM revenue is the central problem: Xometry has been public since 2021 and has not demonstrated that marketplace scale drives operating leverage — S&M remains ~25% of revenue because buyer acquisition in custom manufacturing is inherently high-touch (engineers spec parts individually, not self-serve)","The AI instant-quoting engine is a genuine competitive moat: Xometry has priced 60M+ parts across CNC, 3D printing, injection molding, and sheet metal, generating a proprietary cost model that new entrants (Fictiv, Hubs/Protolabs, Carpenter Additive) cannot replicate without comparable volume — but this moat accrues to the marketplace, not to SaaS-like recurring revenue","Competitive positioning vs Protolabs is the key dynamic: Protolabs owns manufacturing capacity (capital-intensive, 45% GM) while Xometry is asset-light (supplier network, 39% GM) — in theory Xometry should have structurally higher margins, but supplier acquisition costs and quality control overhead consume the asset-light advantage","At $2.2B TEV and 57% of 52W high, the take-private math is challenging: 6% EBITDA means ~$51M EBITDA, which cannot support meaningful leverage — this is a growth equity investment requiring 3-5 years of margin expansion to 15-20% before exit leverage math works, and the path to those margins is unproven"],
   aiRationale:["AI is the product, not the threat — Xometry's entire value proposition is its ML-driven instant quoting engine that prices custom parts in seconds vs. the traditional 2-5 day manual RFQ process; if a competitor builds a superior quoting model, Xometry's marketplace liquidity advantage is the secondary defense","Generative AI design tools (Autodesk Fusion, nTopology, Siemens NX with AI) could actually expand Xometry's TAM: if engineers can design more complex parts faster using AI-assisted CAD, the volume of custom parts needing manufacturing increases — Xometry benefits as the marketplace where those parts get quoted and produced","The real AI risk is supplier-side disintermediation: if AI tools enable small CNC shops to build their own instant-quoting websites (using open-source ML models trained on public manufacturing data), the supplier network fragments and Xometry's aggregation value diminishes","Protolabs' in-house manufacturing capacity is actually more AI-vulnerable than Xometry's marketplace model — AI-driven process optimization (toolpath generation, machine scheduling) benefits owned facilities directly, but Xometry captures AI benefits on the demand side through better pricing and matching without capex","Medium risk with unusual polarity: AI is simultaneously Xometry's core product (quoting engine) and its existential risk (commoditization of that quoting engine) — the 5-year moat depends on whether the proprietary pricing dataset from 60M+ quoted parts remains a durable advantage or whether foundation models trained on open manufacturing data converge to comparable accuracy"]},
  {name:"Proto Labs",vertical:"Construction & Design SW",bucket:"Hybrid VSaaS",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:1380,ntmRev:575,growth:7,gm:45,ebitda:15,cagr:7,ntmRevX:2.4,peFit:"Low-Medium",aiRisk:"Medium",avoid:false,ltmEbitda:79,pct52w:0.92,
   desc:"Digital manufacturing services platform offering rapid prototyping and on-demand production through CNC machining, 3D printing, injection molding, and sheet metal fabrication. Owns manufacturing capacity enabling faster turnaround than traditional job shops. Usage-based per-part pricing with software-driven quoting and design-for-manufacturability feedback.",
   sd:{sharePrice:62.0,sharesOut:24,marketCap:1505,netDebt:-125},
   thesis:["Protolabs' owned manufacturing capacity is the thesis and the trap: 45% GM reflects real margin on CNC/3D printing/injection molding work done in-house, but the asset base (factories, CNC mills, 3D printers) means a PE buyer inherits a manufacturing business, not a software business — capex is surprisingly light (~$9M in FY2024, sub-2% of revenue) because scaling just means adding mills to existing facilities, which actually makes the FCF profile ($69M in FY2024) more attractive than the 'manufacturer' label suggests","92% of 52W high means this is priced for execution, not distress — at $1.4B TEV / 2.4x NTM revenue, the market is already giving credit for the Hubs acquisition (2021, $300M) and the pivot toward a hybrid digital-manufacturing-plus-network model, leaving limited multiple expansion upside","7% growth is the structural ceiling concern: Protolabs serves prototyping and low-volume production runs where order sizes are inherently small ($500-$5K per order) — scaling revenue requires either massive order volume growth or moving into production-scale manufacturing where Protolabs competes against Jabil, Flex, and contract manufacturers with 10x the capacity","The Xometry comparison is inescapable: Xometry grows 21% vs Protolabs' 7%, has 3x the revenue, and is asset-light — the market has chosen the marketplace model, and Protolabs' owned-capacity differentiation (faster turnaround, quality control) is being eroded as Xometry's vetted supplier network delivers comparable quality at competitive pricing","PE fit is low-medium: $1.4B TEV is right-sized for mid-market sponsors but the manufacturing asset base makes this a specialty industrials deal, not a software deal — the buyer profile is more Platinum Equity or American Industrial Partners than Thoma Bravo or Vista, and the return math depends on operational improvement of physical facilities, not software margin expansion"],
   aiRationale:["AI-driven generative design (topology optimization, lattice structures) from Autodesk Fusion, nTopology, and Siemens NX is expanding the volume of complex parts that require digital manufacturing — Protolabs benefits as one of few manufacturers with automated quoting and production capabilities for these geometries","The direct AI threat is to Protolabs' quoting and DFM (design-for-manufacturability) analysis — its automated instant-quoting system was an industry innovation in 2010 but Xometry's ML-based quoting, Fictiv's platform, and open-source manufacturing cost estimators are converging on comparable accuracy, eroding Protolabs' digital differentiation","AI-powered process optimization (adaptive toolpath generation, predictive machine maintenance, real-time quality inspection via computer vision) could actually improve Protolabs' owned-facility margins — unlike the marketplace model, Protolabs captures 100% of in-house efficiency gains from AI-optimized manufacturing","Second-order risk: if AI dramatically lowers the barrier to CNC programming and machine operation, the supply of small job shops capable of handling prototype work increases — this expands the supplier pool for marketplace competitors like Xometry while doing nothing for Protolabs' owned-capacity model","Medium risk: Protolabs' manufacturing moat is physical infrastructure not software, which makes it less directly AI-disruptable than a pure-software business — but the digital interface layer (quoting, DFM, ordering) that differentiated Protolabs from traditional machine shops is being commoditized by AI-powered alternatives at competitors"]},
  {name:"Flywire",vertical:"Education / Healthcare",bucket:"Hybrid VSaaS",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:1219,ntmRev:717,growth:18,gm:61,ebitda:22,cagr:20,ntmRevX:1.7,peFit:"Medium",aiRisk:"Medium",avoid:false,ltmEbitda:126,pct52w:0.83,
   desc:"Global payment platform handling complex cross-border and domestic payments for education, healthcare, and travel verticals. Processes tuition payments, medical bills, and travel invoices with currency conversion and reconciliation built in. Usage-based transaction fees on payment volumes with strong institutional relationships at universities and hospitals.",
   sd:{sharePrice:12,sharesOut:128,marketCap:1573,netDebt:-354},
   thesis:["1.7x NTM for 18% growth is mispriced vs. Adyen (30x) and Stripe (private ~20x) — vertical-embedded payment processors trade at massive premiums once investors recognize durable institutional lock-in","Real moat is not payments but FX reconciliation + SIS/HMS integration depth: switching requires re-certifying 50+ currency corridors and re-integrating with PeopleSoft, Ellucian, or Epic billing — a 6-12 month project no CFO will undertake","Immigration policy is the single biggest risk: ~50% of revenue is education, and F-1 visa restrictions under a protectionist administration could crater international enrollment at partner universities overnight","Exit path is compelling — Fiserv, Global Payments, or Worldline would pay 5-7x revenue to acquire vertical-specific institutional payment rails they cannot build organically given decade-long university procurement cycles","Margin expansion from 22% to 32%+ is real but depends on geographic mix: South Asia corridors carry 3-4x the FX take rate of domestic US — execution on international expansion is the margin story, not just operating leverage"],
   aiRationale:["AI fraud detection and smart routing are already table-stakes features Flywire has shipped — these enhance rather than displace the core value proposition of institutional-grade FX reconciliation","The actual AI risk is indirect: AI enrollment advisors and automated credentialing could reduce international student mobility by enabling remote study — fewer cross-border students means fewer cross-border payments","Stripe's AI-powered adaptive acceptance and Adyen's AI routing improvements narrow the gap on payment optimization, but neither has invested in vertical integrations (SIS, HMS, PMS) that drive institutional lock-in","ChatGPT-style interfaces for healthcare billing could disintermediate patient payment portals — but Flywire's value is upstream in payer-to-provider reconciliation, not patient-facing UI","Medium risk overall: AI more likely a tailwind (better FX pricing, fraud reduction) than headwind, but indirect effects on international student mobility and remote credentialing warrant monitoring"]},
  {name:"GPI SpA",vertical:"Healthcare",bucket:"Hybrid VSaaS",hq:"IT",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:981,ntmRev:701,growth:6,gm:98,ebitda:21,cagr:10,ntmRevX:1.4,peFit:"Medium",aiRisk:"Low",avoid:false,ltmEbitda:141,pct52w:0.93,
   desc:"Italian healthcare IT company providing clinical information systems (CIS), digital health infrastructure, and administrative software to Italian public hospitals and regional health authorities. The SoR for Italian NHS digital health workflows in a highly regulated EU public health system. Usage-based model with GDPR and EU AI Act tailwinds protecting incumbents.",
   sd:{sharePrice:20,sharesOut:34,marketCap:688,netDebt:293},
   thesis:["98% GM at 1.4x NTM is optically stunning but 21% EBITDA exposes heavy professional services labor below the gross margin line — path to 30%+ EBITDA requires cutting headcount that currently delivers NHS implementation projects","Dedalus (Ardian-backed) is the real competitive threat: stronger in acute hospital ERP with a PE sponsor actively consolidating Italian healthcare IT — a bidding war for GPI is plausible but Dedalus could also squeeze GPI out of adjacent workflows","PNRR tailwind is real but time-limited: Italy's EU-funded digitization mandate front-loads spend through 2026, creating a revenue cliff risk in 2027-2028 if follow-on procurement does not materialize at comparable run-rate","Single-country concentration is the existential risk — Italian fiscal austerity, government instability, or NHS IT procurement policy changes could alter demand with no geographic diversification to buffer","Best exit is a sale to Dedalus or another PE-backed European healthcare IT consolidator — strategic buyers like Oracle Health have no Italian NHS distribution and face 3-5 year localization timelines"],
   aiRationale:["Italian public healthcare is among the slowest AI adopters globally — regional ASL governance, GDPR data residency rules, and multi-layer procurement bureaucracy create multi-year adoption delays for any AI clinical tool","EU AI Act Annex III classification of clinical decision support as high-risk creates a genuine certification moat — GPI has existing approval pathways that would take a new entrant 2-3 years to replicate","Offensive AI opportunity: GPI can embed AI scheduling, triage, and diagnostic support as premium modules within its CIS platform — these are new revenue lines, not cannibalization","Risk is Dedalus or a well-funded EU competitor deploys AI-enhanced clinical workflows faster, using PE backing to outspend on R&D where GPI's 21% EBITDA leaves limited reinvestment capacity","Low risk: geographic isolation, regulatory barriers, and glacial Italian public sector IT adoption make AI disruption a 10+ year story, well beyond any PE hold period"]},
  {name:"Phreesia",vertical:"Healthcare",bucket:"Hybrid VSaaS",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:663,ntmRev:553,growth:15,gm:70,ebitda:24,cagr:13,ntmRevX:1.2,peFit:"Low-Medium",aiRisk:"High",avoid:true,ltmEbitda:102,pct52w:0.38,
   desc:"Patient intake and engagement platform automating check-in, insurance verification, consent forms, and patient communications at the point of care. Sits at the front-desk workflow layer rather than core clinical systems, making it more replicable than a true SoR. Usage-based model with fees tied to patient visit volumes at provider clients.",
   sd:{sharePrice:12,sharesOut:59,marketCap:730,netDebt:-66},
   thesis:["1.2x NTM is cheap for a reason: patient intake is the most AI-automatable workflow in healthcare — Epic MyChart self-service check-in, Hyro AI voice agents, and Qventus automated scheduling all target exactly this layer","62% drawdown from 52W high is not technical — it reflects the market correctly pricing that front-desk automation (insurance verification, consent, check-in) is precisely what LLMs do well: structured form completion and data validation","Bull case requires believing Phreesia pivots from intake to broader patient lifecycle orchestration — but Waystar, Kyruus (Healtheon), and Relatient already own adjacent pieces of that map","Usage-based on visit volumes is positive vs. per-seat: revenue does not compress if AI makes staff efficient since fees track visits not FTEs — but the product itself could be displaced entirely","Special situations play at $663M TEV: athenahealth (Bain/Hellman and Friedman) or Waystar could absorb 100K+ provider relationships cheaply — but that is merger arb, not a PE take-private thesis"],
   aiRationale:["Patient intake is ground zero for healthcare AI: Hyro, Notable Health, and Qventus specifically target check-in, insurance verification, and consent workflows with AI agents that directly compete with Phreesia's core product","Epic's MyChart self-service intake creates a second-order risk: as Epic-installed health systems activate native intake modules, Phreesia loses its strongest customer segment without competitive response","Usage-based pricing on visit volumes provides partial insulation — if AI handles intake but visits stay constant, the per-visit fee survives only if providers still need the platform for AI-augmented workflow","Phreesia is a workflow layer, not a data asset — it owns no clinical records, claims data, or payer relationships that make it irreplaceable; it orchestrates a process AI can replicate from scratch","High risk: among the most directly AI-threatened businesses in the screen — the core product is structured data collection and form routing, which is precisely what foundation models excel at"]},
  // ── LOW GROWTH / OTHER ──
  {name:"SS&C Technologies",vertical:"Financial Services",bucket:"Low Growth / Other",hq:"US",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:23183,ntmRev:6819,growth:7,gm:58,ebitda:40,cagr:6,ntmRevX:3.4,peFit:"Low",aiRisk:"Medium",avoid:false,ltmEbitda:2499,pct52w:0.83,
   desc:"Financial services technology and outsourcing company providing fund administration, transfer agency, and wealth management software and services to hedge funds, private equity, and asset managers. Processes $40T+ in fund assets as a mission-critical SoR for back-office operations. Usage-based model tied to AUM and transaction volumes.",
   sd:{sharePrice:75.29,sharesOut:254,marketCap:19110,netDebt:4073},
   thesis:["$23B TEV is too large for single-sponsor but Bill Stone has done PE deals before (Silver Lake 2005) — a club deal with Thoma Bravo or Vista at 4-5x NTM is conceivable given the recurring revenue base","58% GM masks that ~40% of revenue is BPO fund admin services with human labor delivering NAV calculations, transfer agency, and reconciliation — AI could automate these but SS&C captures the margin uplift as incumbent operator","Real question is whether AI converts fund admin from services to software: if LLMs handle NAV calc, investor reporting, and regulatory filing, SS&C's services revenue converts to higher-margin software — but Arcesium (D.E. Shaw spinout) and Allvue are building exactly that","$4.1B net debt already on the balance sheet limits incremental leverage for an LBO — any PE bid requires refinancing existing debt at potentially higher rates","Best used as benchmark comp: fund admin SoR processing $40T+ in assets demonstrates captive financial infrastructure at scale, with AUM-linked revenue that compounds with market appreciation"],
   aiRationale:["AI is double-edged: fund admin involves highly structured rule-based workflows (NAV calc, reconciliation, regulatory reporting) that LLMs and automation can accelerate — but SS&C as incumbent operator captures efficiency gains rather than being displaced","Arcesium (D.E. Shaw spinout) and Allvue Systems are building AI-native fund admin platforms specifically targeting SS&C clients — these are credible competitors with deep domain expertise, not generic AI startups","58% GM with ~40% services revenue is the vulnerability: if AI automates human labor in fund admin, margin improves dramatically — but only if SS&C invests in AI fast enough to prevent clients moving to pure-software alternatives","Usage-based AUM-linked pricing is genuinely protective — revenue tracks financial market appreciation not headcount, so AI-driven efficiency at fund managers does not directly compress SS&C fees","Medium risk — services-heavy model means AI has clear paths to automate core workflows, and well-funded competitors like Arcesium are specifically targeting this opportunity"]},
  {name:"PTC",vertical:"Construction & Design SW",bucket:"Low Growth / Other",hq:"US",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:19960,ntmRev:2893,growth:5,gm:85,ebitda:48,cagr:9,ntmRevX:6.9,peFit:"Low",aiRisk:"Low",avoid:false,ltmEbitda:1354,pct52w:0.72,
   desc:"Industrial IoT and PLM software for manufacturing companies covering product design (Creo), lifecycle management (Windchill), and connected device management (ThingWorx). The SoR for industrial product development and connected factory operations across discrete manufacturing. Usage-based subscription tied to engineering activity and device counts.",
   sd:{sharePrice:156.59,sharesOut:120,marketCap:18775,netDebt:1185},
   thesis:["$20B TEV at 6.9x NTM is too expensive and too large for take-private — but it is the gold standard benchmark for a PLM SoR: 85% GM, 48% EBITDA, and effectively zero churn in the installed base","5% growth is deceptive: Creo and Windchill are mature but ThingWorx (IoT) and ServiceMax (acquired 2023) add cross-sell vectors that could re-accelerate to 8-10% — market is pricing PTC as ex-growth which may understate IoT optionality","Dassault (CATIA/ENOVIA) and Siemens Teamcenter are the only real competitors — but PLM migrations are 2-3 year, $50M+ programs that aerospace and defense customers almost never undertake, making installed base essentially permanent","Hidden risk is Autodesk Fusion platform moving upmarket into manufacturing PLM from its design/AEC base — Autodesk has distribution and is aggressively targeting mid-market manufacturers PTC has underserved","Benchmark for industrial SoR quality — any PLM or manufacturing software acquisition should be measured against PTC's margin structure and retention metrics"],
   aiRationale:["AI generative design (Creo Generative Design Extension) is already a PTC product — AI in manufacturing CAD optimizes topology and material usage within PTC's platform, creating upsell revenue not competitive displacement","The theoretical AI risk is foundation models generating CAD geometry from natural language — but manufacturing CAD requires ITAR/EAR compliance, GD&T tolerancing, and FEA validation that no general-purpose AI can certify today","Siemens is investing heavily in industrial AI through Xcelerator platform integration — the most credible competitive AI threat as Siemens combines PLM with factory automation data PTC lacks","Usage-based pricing tied to engineering seats and IoT device counts means AI productivity that lets engineers do more with fewer tools could compress seat counts — but switching cost math still favors retention","Low risk: PLM data is the single source of truth for product DNA in regulated manufacturing (aerospace, medical devices, auto) — regulatory traceability requirements make replacement nearly impossible regardless of AI"]},
  {name:"Trimble",vertical:"Construction & Design SW",bucket:"Low Growth / Other",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:17466,ntmRev:3881,growth:8,gm:72,ebitda:30,cagr:4,ntmRevX:4.5,peFit:"Low",aiRisk:"Low",avoid:false,ltmEbitda:1056,pct52w:0.78,
   desc:"Positioning and workflow software combining GPS/sensor hardware with cloud software for construction, geospatial, and agriculture applications. Portfolio transformation toward pure software subscription ongoing with hardware providing field data capture. Usage-based subscription tied to field device activity and project management workflows.",
   sd:{sharePrice:66.87,sharesOut:242,marketCap:16149,netDebt:1317},
   thesis:["$18B TEV too large for take-private but Trimble is the construction tech benchmark: the hardware-to-software transformation (divesting Ag to AGCO, focusing on Viewpoint/e-Builder/Tekla cloud) is exactly the playbook a PE buyer would run on a smaller target","72% GM understates the pure-software business: legacy hardware (GPS receivers, total stations) drags blended margin — the cloud construction platform alone likely runs 85%+ GM, comparable to Procore","Procore is the direct competitor in construction PM but lacks Trimble's positioning/geospatial data integration — moat is connecting field sensor data to office BIM workflows in ways Procore and Autodesk Construction Cloud cannot fully replicate","4% N3Y CAGR is the red flag: despite the software transformation narrative, organic growth has decelerated as construction spending normalizes — PE would need conviction the software transition re-accelerates topline","Benchmark for construction tech — Viewpoint, Tekla, and e-Builder are the exact type of vertical construction SaaS PE buyers target at smaller scale; Trimble demonstrates the margin ceiling for this category"],
   aiRationale:["AI in construction focuses on BIM clash detection, schedule optimization, and safety monitoring — all workflows where Trimble's sensor data (GPS, LiDAR, imaging) is a required input, making AI an enhancer not a displacer","OpenAI and Autodesk's partnership on AI-powered design is the most credible competitive threat — Autodesk Construction Cloud with AI could commoditize project management workflows where Trimble competes via Viewpoint and e-Builder","Hardware moat is underappreciated: construction AI models require field-collected geospatial data that only Trimble and a handful of competitors (Topcon, Leica/Hexagon) can generate at scale — this data flywheel strengthens with AI adoption","Risk that AI-generated construction plans and automated quantity takeoff reduce workflow complexity Trimble charges for — but this likely increases overall construction tech adoption rather than displacing incumbent platforms","Low risk: physical-world data collection creates a natural barrier pure software AI cannot replicate, and construction industry AI adoption runs 5-10 years behind other verticals"]},
  {name:"Temenos",vertical:"Financial Services",bucket:"Low Growth / Other",hq:"CH",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:7115,ntmRev:1166,growth:8,gm:85,ebitda:40,cagr:6,ntmRevX:6.1,peFit:"Medium",aiRisk:"Low",avoid:false,ltmEbitda:426,pct52w:0.87,
   desc:"Core banking software platform for retail, corporate, and private banks globally covering deposits, lending, payments, and wealth management. One of two dominant global core banking SoR platforms (alongside Finastra) with extreme switching costs and decade-long implementation cycles. Usage-based model tied to banking transaction volumes and customer accounts.",
   sd:{sharePrice:92.97,sharesOut:71,marketCap:6560,netDebt:556},
   thesis:["$7B TEV at 6.1x NTM is rich for 8% growth — but core banking SoRs trade at a scarcity premium because only 3-4 viable platforms exist globally (Temenos, Finastra, Thought Machine, Mambu) and switching costs make the installed base quasi-permanent","2022 short-seller report (Hindenburg-adjacent channel stuffing allegations) depressed the stock and created reputational overhang PE could exploit — if accounting is clean, buying at a governance discount is classic PE playbook","Finastra (Vista-backed) is the direct comp and has been rumored for IPO or secondary — if Finastra exits at 8-10x NTM, it re-rates Temenos upward and creates exit multiple visibility for a take-private","Real risk is Thought Machine and Mambu: cloud-native core banking challengers winning greenfield deployments at neobanks — Temenos dominates legacy migration but marginal new customers increasingly choose born-in-cloud alternatives","Permira knows financial software intimately — diligence question is whether Temenos defends its 600+ bank installed base against cloud-native challengers while migrating its own platform to SaaS"],
   aiRationale:["Core banking is the most AI-resistant SoR in enterprise software: Basel III/IV, IFRS 9, and local regulatory reporting create compliance layers so deep that no bank will rip out its core based on AI capabilities alone","AI threat is peripheral: AI-powered lending decisioning (Zest AI, Upstart), fraud detection (Featurespace), and customer service (Kasisto) all operate as modules around the core — they enhance Temenos rather than replace it","Thought Machine's cloud-native architecture is the credible long-term AI competitor: purpose-built on Kubernetes with API-first design, it appeals to CTOs who want to embed AI natively rather than bolt onto legacy Temenos","Usage-based pricing tied to transaction volumes and customer accounts is inherently AI-proof — banks cannot reduce account count or transaction volume through AI efficiency gains","Low risk: core banking replacement cycles are 5-10 years requiring regulatory approval in most jurisdictions — even if a superior AI-native core existed today, migration would not begin at scale within any PE hold period"]},
  {name:"Sabre Corporation",vertical:"Travel / Hospitality",bucket:"Low Growth / Other",hq:"US",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:3988,ntmRev:2849,growth:5,gm:56,ebitda:20,cagr:0,ntmRevX:1.4,peFit:"Low",aiRisk:"High",avoid:true,ltmEbitda:515,pct52w:0.28,
   desc:"Global distribution system (GDS) connecting airlines, hotels, and travel agencies for inventory management and booking. Faces structural disruption from NDC (airline direct distribution) and AI-native travel booking platforms eroding GDS volumes. Usage-based model tied to booking and reservation volumes under secular pressure.",
   sd:{sharePrice:1.18,sharesOut:414,marketCap:489,netDebt:3499},
   thesis:["$3.5B net debt on $489M market cap is both a capital structure and business problem: IATA NDC enables airlines to distribute directly, disintermediating the GDS layer Sabre operates","Amadeus (larger, better-capitalized) and Travelport (Elliott/Siris-backed) are direct GDS competitors — Amadeus invested aggressively in NDC compatibility while Sabre lagged, losing share","SynXis hospitality platform is the most valuable asset: hotel PMS is stickier than airline GDS and less NDC-exposed — a breakup separating SynXis from GDS could unlock hidden value","0% N3Y CAGR tells the story: even with post-COVID travel recovery Sabre cannot grow because NDC adoption structurally reduces GDS volumes faster than travel demand grows","Uninvestable for PE: $500M+ annual interest service, secularly declining GDS, and restructuring needs bondholder negotiation making clean take-private impossible"],
   aiRationale:["AI travel agents (Google Gemini travel, Kayak AI, Hopper price prediction) are the existential threat: if consumers book through AI assistants connecting directly to airline NDC APIs, the GDS middleman layer becomes redundant","Not hypothetical — Lufthansa, BA/IAG, and American Airlines have implemented NDC surcharges penalizing GDS bookings $10-25 per segment, economically forcing agencies toward direct connections bypassing Sabre","AI-powered dynamic pricing and revenue management (PROS Holdings, Duetto) enable airlines to optimize fares without GDS — the more sophisticated airline pricing becomes, the less they need GDS distribution","SynXis hospitality platform has lower AI risk because hotel distribution involves rate parity management, channel optimization, and property customization that AI enhances not displaces","High risk: GDS is a classic intermediary layer AI and NDC are jointly disintermediating — bull case requires believing airlines pay GDS fees indefinitely despite viable direct alternatives"]},
  {name:"Diebold Nixdorf",vertical:"Financial Services",bucket:"Low Growth / Other",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:3647,ntmRev:4052,growth:2,gm:27,ebitda:14,cagr:2,ntmRevX:0.9,peFit:"Low",aiRisk:"High",avoid:true,ltmEbitda:491,pct52w:0.96,
   desc:"ATM hardware manufacturer and banking software provider serving financial institutions globally with physical ATM infrastructure and retail banking software. ATM market faces secular decline from digital banking adoption accelerated by AI-powered mobile banking. Usage-based model tied to ATM transaction volumes and device service contracts.",
   sd:{sharePrice:80,sharesOut:37,marketCap:2981,netDebt:666},
   thesis:["Post-2023 Chapter 11 cleaned the balance sheet but not the secular problem: bank branch closures accelerated by AI-powered mobile banking (Chime, Revolut, Nubank) structurally reduce ATM deployment and transaction volumes","27% GM is a hardware business — NCR Atleos (spun from NCR Voyix) is the direct competitor facing identical secular headwinds, confirming this is an industry problem not Diebold-specific","DN Series ATM platform and Vynamic software are technically competitive — but when ATM installed base globally shrinks 3-5% annually, even a market share winner loses on absolute volume","0.9x NTM looks cheap but 14% EBITDA generates ~$546M on $4.1B revenue — after maintenance capex on physical hardware fleet, LFCF is minimal and cannot service meaningful LBO debt","Avoid: secularly declining hardware business — no PE value creation lever (pricing, cross-sell, margin expansion) can offset the structural decline in physical cash infrastructure"],
   aiRationale:["AI does not directly compete with ATMs — but AI-powered neobanks (Chime, Revolut, Nubank) and AI-enhanced mobile banking make physical cash access less relevant, accelerating ATM volume decline","AI chatbots handling branch-level banking queries (account issues, card disputes, loan inquiries) eliminate the secondary reason people visit ATM-adjacent branches — reducing foot traffic and ATM utilization","Vynamic software for ATM fleet management could benefit from AI-powered predictive maintenance and cash optimization — but this is cost-reduction on a shrinking asset base, not a growth driver","Emerging-market bull case (India, Africa, SE Asia still growing ATM networks) is real but Diebold's strength is in developed markets where secular decline is steepest — rebalancing takes years","High risk: convergence of AI-powered digital banking, declining cash usage, and bank branch rationalization creates a secular headwind no product innovation can offset within a PE hold period"]},
  {name:"Verra Mobility",vertical:"Auto",bucket:"Low Growth / Other",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:3693,ntmRev:1026,growth:5,gm:84,ebitda:40,cagr:8,ntmRevX:3.6,peFit:"Medium-High",aiRisk:"Low",avoid:false,ltmEbitda:415,pct52w:0.65,
   desc:"Government-contracted tolling and photo enforcement platform serving municipalities, rental car companies, and toll authorities. Long-term municipal contracts (5–10 years) provide infrastructure-like revenue predictability with very high gross margins. Usage-based model tied to vehicle transactions and toll processing volumes.",
   sd:{sharePrice:16.71,sharesOut:161,marketCap:2695,netDebt:998},
   thesis:["84% GM and 40% EBITDA at 3.6x NTM is genuinely attractive — infrastructure-grade cash flow with government contract backing, and 35% drawdown from 52W high is a sector selloff with no fundamental deterioration in Verra's business","Platinum Equity (former PE owner) took Verra public in 2018 — PE knows how to own this asset; playbook is lever up against predictable government-contracted cash flows and compound through toll volume growth and contract renewals","Hidden risk is autonomous vehicles: if AVs reduce traffic violations and accidents, photo enforcement (red light cameras, speed cameras) structurally declines — 5-10 years out but real concern for a 5-year hold","Redflex (acquired 2021) integration added international photo enforcement but brought execution risk — Australian and European municipal contracts have different margin profiles and regulatory dynamics than US tolling","Exit buyer universe is strong: Conduent, Cubic (Veritas-backed), or infrastructure PE (Macquarie, Brookfield) would bid for 40% EBITDA and government-backed revenue — multiple paths to exit at 12-15x EBITDA"],
   aiRationale:["AI is a tailwind: computer vision and ML improve license plate recognition accuracy, reduce false positives in photo enforcement, and enable more violations processed per camera — this is margin-enhancing technology for Verra","AV/ADAS risk is the real second-order AI concern: if autonomous driving reduces speeding, red-light running, and toll evasion, photo enforcement revenue declines — but this is 2030+ and tolling volumes are AV-agnostic","Municipal procurement is inherently AI-proof: cities award 5-10 year contracts through RFP processes valuing incumbent relationships, installed camera infrastructure, and proven track record — no AI startup wins a municipal tolling RFP","Smart city AI initiatives (traffic optimization, congestion pricing) could expand Verra's TAM: as cities deploy AI-managed congestion zones, they need enforcement infrastructure Verra already operates","Low risk: government contracts, physical infrastructure requirements, and municipal procurement bureaucracy create barriers orthogonal to AI disruption — one of the most AI-insulated businesses in the screen"]},
  {name:"EverCommerce",vertical:"Field Services",bucket:"Low Growth / Other",hq:"US",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:2541,ntmRev:620,growth:6,gm:78,ebitda:31,cagr:-2,ntmRevX:4.1,peFit:"Low-Medium",aiRisk:"High",avoid:true,ltmEbitda:179,pct52w:0.86,
   desc:"SMB software roll-up across field services, fitness, and home services verticals covering scheduling, payments, marketing, and CRM. Aggregates ~600,000 SMB customers across fragmented niche verticals via acquisition with no deep SoR anchor in any single vertical. Usage-based model across a diverse portfolio of point solutions.",
   sd:{sharePrice:11.48,sharesOut:186,marketCap:2132,netDebt:409},
   thesis:["-2% N3Y CAGR is the kill shot: beneath roll-up headline growth organic revenue is declining — Silver Lake and Providence (pre-IPO sponsors) extracted value via acquisition-driven multiple arbitrage leaving public investors a decelerating portfolio","Not a SoR in any vertical: owns scheduling in fitness (Mindbody), marketing in home services, payments in wellness — but in each a dedicated competitor (Jobber, Housecall Pro, Vagaro) goes deeper on workflow","Roll-up playbook is broken: SMB SaaS M&A targets getting expensive while EverCommerce multiple compresses — accretive acquisition math only works at a premium to targets which EverCommerce no longer trades at","600K SMB customers sounds impressive but ARPU is ~$1,050/year and SMB churn structurally 15-20% annually — a leaky bucket requiring constant sales investment just to maintain revenue","Avoid: archetype of AI-vulnerable SMB roll-up — fragmented point solutions with no SoR, declining organic growth, and a customer base (plumbers, trainers, cleaners) that AI-native tools target first"],
   aiRationale:["AI-native SMB platforms are the direct threat: Jobber (field services), Housecall Pro (home services), and Vagaro (wellness) ship AI scheduling, AI marketing copy, and AI customer communication that directly replaces EverCommerce point solutions","SMB customer segment is the most AI-vulnerable in enterprise software: small business owners adopt the cheapest simplest tool — AI-native platforms offer more functionality at lower price points than EverCommerce legacy acquired products","Negative organic growth (-2% N3Y CAGR) is circumstantial evidence AI displacement is already happening: when SMB scheduling and marketing become AI-native, switching cost from EverCommerce legacy products approaches zero","Payments layer is partially protected — embedded payments have real switching costs around bank connections, recurring billing, and customer payment preferences — but this is a minority of total revenue","High risk: no moat AI cannot erode — no proprietary data, no regulatory protection, no network effects, no deep workflow integration; the portfolio is a collection of features AI-native platforms replicate as modules"]},
];

// ─── TOP 5 DEEP DIVE DATA ─────────────────────────────────────────────────────
const TOP5_DATA={
  "Waystar":{
    headline:"Healthcare RCM platform with best margin/multiple in the screen — usage-based transaction model with structurally durable payer-provider complexity moat",
    business:[
      "Processes $5T+ in healthcare claims annually across 1,000+ health systems — mission-critical revenue operations infrastructure for hospitals and physician groups",
      "Usage-based fees on every claim compound with healthcare utilization, inflation, and coding complexity — revenue tied to patient volumes not headcount",
      "Multi-year enterprise contracts with hospital CFOs create extreme switching costs; RCM migrations are 12–18 month projects with meaningful implementation risk",
      "Adjacent whitespace in prior authorization, patient pay, and analytics creates clear organic cross-sell runway within the existing account base"
    ],
    competition:[
      "Change Healthcare (Optum/UHG) was the dominant player but suffered a catastrophic 2024 cyberattack causing significant customer attrition — Waystar is the primary beneficiary",
      "Ensemble Health Partners (KKR-backed) and nThrive are primarily services-led operators; Waystar's software-first model has superior scalability and margin structure",
      "Epic MyWay presents integration risk for Epic-installed health systems but lacks standalone RCM breadth and is typically deployed alongside clearinghouses like Waystar",
      "Availity and Experian Health are smaller point-solution competitors without Waystar's end-to-end automation across eligibility, claims, and remittance"
    ],
    aiRisk:[
      "HIPAA, CMS, and payer-specific rule engines require decades of proprietary data relationships — generalist AI cannot replicate without the underlying payer agreements",
      "AI automation of claims processing and denial prevention is already a Waystar product line — AI is a monetizable capability enhancing the platform, not a competitive threat",
      "Usage-based transaction model means AI-driven efficiency improves throughput within Waystar — revenue scales with claim volume, not headcount",
      "No AI-native competitor has achieved meaningful enterprise RCM scale — the barrier is payer relationships and regulatory compliance, not technology alone"
    ],
    thesis:[
      "4.7x NTM Revenue with 42% EBITDA is the best margin/multiple combination in the top tier — entry TEV ~$8B at 30% premium is strong absolute value for the quality",
      "7× leverage at 9% generates strong LFCF from Year 1; cumulative cash on balance sheet meaningfully enhances exit equity beyond organic EBITDA value creation",
      "Operating leverage on fixed-cost SaaS infrastructure drives margin expansion — incremental revenue above the fixed cost base drops through at ~70% margin",
      "Post-acquisition M&A of smaller RCM modules (prior auth, patient pay) accelerates cross-sell and deepens platform completeness without significant integration complexity"
    ],
    scenarios:[
      {growthDelta:-4,marginDelta:-3,exitFactor:0.8,reasons:[
        "UHG/Optum rebuilds Change Healthcare within 18 months, recapturing lost clients and removing the demand tailwind from competitor disruption",
        "CMS claims processing rule changes require costly platform updates, compressing margins as compliance spend rises across the hold period",
        "Healthcare system IT budgets freeze under Medicaid funding pressure — enterprise sales cycles extend from 9 to 18+ months"
      ]},
      {growthDelta:0,marginDelta:0,exitFactor:1.0,reasons:[
        "Consistent with 15% N3Y CAGR and management guidance; healthcare utilization normalization continues as post-COVID visit volumes stabilize",
        "Margin stays flat as platform investment in AI prior auth and adjacent modules absorbs incremental revenue from new logo wins",
        "Change Healthcare attrition provides modest demand tailwind offset by competitive re-pricing in RCM RFP processes"
      ]},
      {growthDelta:5,marginDelta:3,exitFactor:1.0,reasons:[
        "Change Healthcare attrition pool (~$400M estimated ARR) accelerates enterprise wins — Waystar captures disproportionate share of displaced clients",
        "AI-enhanced prior authorization commands 15–20% price premium over standard claims processing — mix shift toward premium AI tier improves blended ASP",
        "Healthcare utilization inflation raises per-claim values without requiring incremental volume growth — organic revenue expands beyond growth rate"
      ]}
    ]
  },
  "GPI SpA":{
    headline:"Italian healthcare IT SoR with 98% gross margins — EU AI Act and PNRR tailwinds protect the incumbent in a structurally insulated public health market at only 1.4x NTM Revenue",
    business:[
      "Provides clinical information systems (CIS), digital health infrastructure, and administrative software to Italian public hospitals and regional health authorities",
      "SoR for Italian NHS digital workflows — used by the majority of Italian public hospitals for clinical records, scheduling, billing, and regulatory reporting",
      "98% gross margin reflects pure software delivery on a fixed-cost platform; EBITDA of 21% has a clear path to 30%+ as recurring SaaS mix grows vs legacy implementation revenue",
      "Italy's €15B PNRR health digitization mandate creates a structural demand pipeline through 2026 that benefits the established NHS incumbent above all others"
    ],
    competition:[
      "Dedalus Group (Ardian PE-backed) is the primary competitor but holds stronger positions in acute hospital ERP while GPI dominates CIS and regional health authority workflows",
      "No US or global vendor has meaningful Italian NHS penetration — language requirements, GDPR data residency rules, and decade-long NHS procurement relationships are near-impossible to bypass",
      "EU AI Act Article 22 requires rigorous certification for clinical AI tools — established vendors with existing certifications benefit; new entrants face 2–3 year certification cycles",
      "Italian public sector procurement requires local presence, Italian-language support, and regional relationship investment that creates inherent barriers to international competition"
    ],
    aiRisk:[
      "Italian NHS is among the slowest AI adopters in Europe — regional health authority governance, data sovereignty rules, and GDPR create multi-year adoption delays for any AI tool",
      "EU AI Act classifies clinical decision support and diagnostic AI as high-risk under Annex III — certification burden protects GPI as the incumbent with existing approval pathways",
      "AI tools are being deployed within GPI's platform as workflow enhancements not replacements — AI scheduling and triage tools generate new revenue lines, not competition",
      "Geographic concentration in Italy limits exposure to faster-moving US AI platforms that lack the regulatory approvals, data residency compliance, and NHS relationship history"
    ],
    thesis:[
      "1.4x NTM Revenue is the deepest value in the screen for a profitable healthcare SoR — entry TEV of ~$1.3B is at the lower end of Permira's typical transaction size but highly strategic",
      "98% GM with a clear path to 30%+ EBITDA as recurring SaaS mix grows — operating leverage is exceptional on a fixed-cost software platform in a protected market",
      "Italian NHS contracts are 5–10 year tenure by nature; revenue visibility across the hold period is among the highest in the screen",
      "EU regulatory environment and PNRR mandate create a government-backed demand tailwind that makes this a compounding business with low growth underwriting risk"
    ],
    scenarios:[
      {growthDelta:-3,marginDelta:-2,exitFactor:0.8,reasons:[
        "Italian public sector austerity — post-PNRR budget consolidation delays NHS IT procurement cycles by 1–2 years beyond the mandate window",
        "EUR/USD depreciation compresses the exit multiple for a EUR-denominated business being marked at exit by a USD-denominated buyer",
        "Small scale limits ability to absorb cost inflation — Italian labor and energy cost increases compress software margins in the near term"
      ]},
      {growthDelta:0,marginDelta:0,exitFactor:1.0,reasons:[
        "Consistent with 10% N3Y CAGR; Italian NHS procurement is deliberate and multi-year by nature with no sudden acceleration expected",
        "Margin expansion from 21% toward 31% as recurring SaaS mix grows vs one-time PNRR implementation revenue over the hold period",
        "No competitive disruption expected in the hold period — regulatory barriers and NHS relationships insulate GPI from new entrants"
      ]},
      {growthDelta:4,marginDelta:5,exitFactor:1.0,reasons:[
        "Italy's PNRR €15B health digitization mandate front-loads NHS IT spending through 2026, accelerating GPI's contracted upgrade pipeline by 12–18 months",
        "EU AI Act Article 22 compliance engagements add a new high-margin consulting and certification revenue stream for GPI as the certified NHS incumbent",
        "Organic pricing power on contract renewals improves as hospitals recognize the cost of switching in a PNRR-constrained environment with no viable alternative"
      ]}
    ]
  },
  "CCC Intelligent Solutions":{
    headline:"De facto monopoly connecting 35,000+ auto insurance ecosystem participants — 40-year network moat and AI-native claims platform at only 4.4x NTM Revenue",
    business:[
      "Processes $100B+ in auto insurance claims annually across 35,000+ connected businesses — every major US P&C insurer, 27,000+ collision repair shops, OEMs, and parts suppliers",
      "Network effects compound over 40 years: insurers joining benefit all repairers (faster approvals), repairers joining benefit all insurers (more options) — self-reinforcing flywheel",
      "EV and ADAS complexity is a multiyear tailwind — modern vehicles require sensors, cameras, and software calibration creating more complex estimates and higher per-claim fees",
      "Usage-based transaction fees scale with US auto claims volume — inflation, accident rates, and vehicle complexity all drive organic transaction value growth"
    ],
    competition:[
      "Mitchell (Aurora Capital PE-owned) serves ~35% of the US repairer market vs CCC's ~65% — lacks CCC's OEM integration network and nationwide insurer coverage depth",
      "Solera (Vista Equity PE-owned) focuses primarily on European markets and fleet management — minimal direct US collision claims competition in CCC's core segments",
      "No credible new entrant can replicate 40 years of network building — would require simultaneously onboarding 35,000+ businesses while offering feature parity with an AI-native platform",
      "Network flywheel accelerates at scale: larger networks attract more participants, making it increasingly difficult for any competitor to reach critical density"
    ],
    aiRisk:[
      "CCC is AI-native by design — ML embedded in damage estimation, total loss prediction, and parts pricing for over a decade; AI is the core product, not a future threat",
      "AI-enhanced photo damage assessment (Direct Repair) is already a premium product — insurers pay higher per-transaction fees for AI-automated straight-through-processing",
      "EV battery damage and ADAS sensor calibration require sophisticated AI — CCC's early EV claims methodology positions it as default for the most complex, highest-value repairs",
      "Usage-based model: AI processing improvements grow claim throughput — insurer efficiency savings from AI become CCC's revenue growth as volume scales"
    ],
    thesis:[
      "4.4x NTM Revenue with 42% EBITDA is the deepest value among high-quality, low-AI-risk SoRs — PE equity creation from multiple expansion alone is highly compelling",
      "Dividend recapitalization in Year 2–3 is achievable given consistent 40%+ EBITDA and predictable FCF — partial capital return meaningfully enhances LP-level IRR",
      "EV and ADAS claims complexity is a 5–10 year tailwind requiring no incremental R&D — CCC's network and AI infrastructure handles increasing complexity as a natural extension",
      "AI-native platform and impregnable network effects create the ideal buy-and-compound PE profile: stable/expanding margins, reliable FCF, and organic growth optionality"
    ],
    scenarios:[
      {growthDelta:-2,marginDelta:-2,exitFactor:0.8,reasons:[
        "Autonomous vehicle ADAS safety features reduce accident frequency in the outer hold years — progressive decline in claims volume offsets per-claim value growth",
        "Insurance carrier consolidation (e.g., Allstate/Farmers merger scenario) strengthens buyer power in CCC contract negotiations, compressing per-transaction pricing",
        "Broader software multiple compression at exit — PE-to-PE secondary transaction at a lower EV/EBITDA than entry as macro rates stay elevated"
      ]},
      {growthDelta:0,marginDelta:0,exitFactor:1.0,reasons:[
        "Consistent with 10% N3Y CAGR; auto claims frequency stable as ADAS reduces accidents but increasing vehicle complexity raises severity per claim",
        "Margins stable at ~42% as EV complexity tailwinds offset any competitive pricing adjustments — AI investments already embedded in cost structure",
        "Network effects continue to compound — no competitive disruption expected during the hold period given 40-year network moat"
      ]},
      {growthDelta:3,marginDelta:3,exitFactor:1.0,reasons:[
        "EV and ADAS repair complexity grows at 20%+ annually — higher-value claims generate higher per-transaction fees with no incremental platform cost",
        "AI Direct Repair premium tier commands 30–40% higher fees for straight-through processing — mix shift toward premium AI products improves blended ASP",
        "OEM data monetization adds a licensing revenue stream as automakers pay for claims pattern analytics to improve vehicle design and warranty cost management"
      ]}
    ]
  },
  "Sportradar":{
    headline:"Global sports data monopoly with exclusive league rights — AI-enhanced live odds platform at 2.9x NTM Revenue riding the structural US sports betting expansion",
    business:[
      "Provides real-time sports data feeds, odds compiling, and integrity services to 900+ sports league, broadcaster, and betting operator clients across 120 countries",
      "Holds exclusive official data rights with major global sports leagues (NFL, NBA, UEFA, ATP) — these rights create a structural moat that cannot be replicated without league buy-in",
      "Usage-based licensing model tied to data consumption and live betting volumes — revenue compounds naturally as sports betting market penetration grows in the US and globally",
      "AI-native platform (Sportradar AI) generates automated insights, in-play betting odds, and player tracking analytics that command premium licensing fees from tier-1 operators"
    ],
    competition:[
      "Genius Sports (LSE-listed) is the closest comparable with NFL data rights but lacks Sportradar's breadth across soccer, basketball, tennis, and cricket globally",
      "Stats Perform (Statsco/private) competes in sports AI analytics but does not hold exclusive rights to the major global leagues Sportradar partners with",
      "IMG Arena (Endeavor subsidiary) focuses on streaming and visual rights rather than data feeds — partial overlap but operates in an adjacent segment",
      "No competitor has Sportradar's combination of exclusive rights, global coverage, and AI-native analytics platform — new entrants must negotiate league rights which leagues price very aggressively"
    ],
    aiRisk:[
      "AI enhances Sportradar's core product rather than threatening it — AI-generated live odds, automated match commentary, and predictive analytics are premium revenue drivers",
      "Exclusive data rights from sports leagues create a structural barrier AI cannot bypass — you cannot train an AI odds model without the underlying data that only Sportradar licenses",
      "Usage-based licensing means AI-driven operator efficiency gains grow betting volumes — higher handle = more data consumed = higher Sportradar fees",
      "Medium risk: not a workflow SoR in the traditional sense, but exclusive data rights and AI-native product architecture create durable competitive advantages"
    ],
    thesis:[
      "2.9x NTM Revenue at $5.5B TEV for a 21% growth business is anomalously cheap — US sports betting market expansion is a secular structural tailwind not a cyclical story",
      "43% off 52W high following growth equity selloff creates entry dislocation; business fundamentals (21% CAGR, margin expansion) are unchanged",
      "AI investment is paying off — automated in-play betting content and Sportradar AI tools are winning premium contracts with Tier 1 global operators",
      "Exclusive league data rights are a renewable infrastructure asset — as leagues renew, pricing reflects fair value of the moat rather than incumbent discount"
    ],
    scenarios:[
      {growthDelta:-7,marginDelta:-3,exitFactor:0.8,reasons:[
        "US online sports betting market concentration — if DraftKings/FanDuel merge or consolidate, a single dominant buyer significantly strengthens pricing pressure on data feed contracts",
        "Sports league data rights renewal costs inflate faster than expected as leagues realize the monetization potential — COGS growth outpaces revenue, compressing margins",
        "Regulatory crackdown in key European markets (Germany, Netherlands, Belgium) limits international expansion and compresses addressable market for live betting products"
      ]},
      {growthDelta:0,marginDelta:0,exitFactor:1.0,reasons:[
        "Consistent with 21% N3Y CAGR; US market continues expanding at current pace with ~12 states still unlicensed providing additional TAM runway",
        "Margin expansion from 26% to 36% as fixed-cost platform scales and high-margin AI analytics products grow as a percentage of the revenue mix",
        "Exclusive league rights renewals complete at reasonable cost — league negotiations remain disciplined as Sportradar has no alternative buyer at scale"
      ]},
      {growthDelta:6,marginDelta:4,exitFactor:1.0,reasons:[
        "US sports betting market accelerates as additional states legalize — addressable betting handle growing 25%+ annually with another 10–15 states in legislative pipeline",
        "AI-enhanced live odds and streaming analytics win premium Tier 1 contracts at 20–30% higher ASPs vs. legacy feed licensing — high-margin AI product mix expands rapidly",
        "New long-term league data rights agreements (NFL, NBA) locked in below market with growth protection provisions, creating a stable cost base while revenues compound"
      ]}
    ]
  },
  "Flywire":{
    headline:"Specialist global payments platform for education and healthcare at 1.7x NTM — deep institutional relationships and FX complexity create durable moat that generalist processors cannot replicate",
    business:[
      "Processes complex cross-border and domestic payments for 3,000+ institutions across education (tuition), healthcare (medical bills), and travel — verticals where standard payment rails fail",
      "Deep integrations into university SIS, hospital billing systems, and travel ERP create switching costs that typical payment processors do not have — payment rails embedded in vertical workflows",
      "Usage-based transaction fees on payment volumes compound with institutional growth — as universities grow enrollment and hospitals grow patient volumes, Flywire fees grow proportionally",
      "20% N3Y CAGR with improving unit economics — EBITDA margin expansion from 22% toward 32% as higher-margin software processing grows vs infrastructure cost base"
    ],
    competition:[
      "Stripe and Adyen dominate general-purpose payment processing but lack Flywire's vertical-specific integrations, FX reconciliation tools, and institutional sales relationships",
      "TouchNet (Heartland subsidiary) competes in US campus payments but lacks Flywire's international FX capability and healthcare vertical depth",
      "Convera (formerly Western Union Business Solutions) focuses on FX for corporates rather than institutional payments — different buyer, different sales motion",
      "Vertical depth is Flywire's moat: a payments competitor would need to rebuild all institutional integrations (SIS, HMS, PMS) and pass institutional security/compliance reviews at 3,000+ clients"
    ],
    aiRisk:[
      "AI payment routing and fraud detection are already embedded in Flywire's platform — AI is a product efficiency driver not a disruptive threat to the business model",
      "Institutional relationships are the core asset — a university's decision to use Flywire for tuition payments is made by finance and IT leadership based on integration depth, not UI",
      "Usage-based transaction model decouples revenue from headcount — AI efficiency gains in payment processing operations increase throughput without compressing per-transaction revenue",
      "Medium risk: the underlying payment rail is commoditizable in theory, but vertical-specific integrations and institutional lock-in create practical switching barriers at 3,000+ clients"
    ],
    thesis:[
      "1.7x NTM Revenue for 18% growth with a clear path to 32%+ terminal margin — among the best growth/value combinations in the screen and deeply undervalued vs payment sector peers",
      "Institutional relationships at 3,000+ universities and hospitals create compounding growth with zero churn incentive — integration cost of switching is prohibitively high for finance teams",
      "Clear margin expansion path: high-margin software processing and FX analytics growing faster than lower-margin payment infrastructure costs — mix shift drives EBITDA improvement",
      "Geographic expansion into South Asia and Southeast Asia adds new high-FX-margin payment corridors that no generalist processor has built institutional relationships to serve"
    ],
    scenarios:[
      {growthDelta:-6,marginDelta:-3,exitFactor:0.8,reasons:[
        "US student visa restrictions reduce international enrollment at partner universities — education represents ~50% of revenue and visa policy creates binary downside risk",
        "Stripe and Adyen invest in vertical-specific integrations targeting Flywire's institutional clients — competitive pressure compresses pricing on domestic payment volumes",
        "FX volatility increases cost of currency hedging and expands payment corridor economics risks — margin pressure on international transactions where FX is a meaningful cost"
      ]},
      {growthDelta:0,marginDelta:0,exitFactor:1.0,reasons:[
        "Consistent with 20% N3Y CAGR; institutional relationships at universities and hospitals provide durable payment volumes with minimal churn",
        "Margin expansion from 22% to 32% as higher-margin software processing grows vs payment infrastructure costs — in line with management target",
        "International expansion continues at a measured pace — South Asia and Southeast Asia corridors developing as planned with no acceleration or setback"
      ]},
      {growthDelta:5,marginDelta:5,exitFactor:1.0,reasons:[
        "International student recovery post-pandemic accelerates — US F-1 visa issuance growing 15%+ YoY drives education payment volumes at partner universities",
        "Healthcare OOP payment volumes compound as high-deductible plan adoption accelerates — hospital partner volumes grow 20%+ annually as patients pay larger shares of bills",
        "South Asia and Southeast Asia expansion adds new payment corridors with superior FX take rates — higher-margin international mix improves blended economics significantly"
      ]}
    ]
  }
};

// LTM EBITDA ($M) — used for debt sizing in LBO (industry convention: leverage on trailing EBITDA)
const LTM_EBITDA={
  "Autodesk":2867,
  "Veeva Systems":1450,
  "Tyler Technologies":665,
  "Toast":660,
  "Bentley Systems":538,
  "Guidewire Software":271,
  "Nemetschek":452,
  "Manhattan Associates":395,
  "Procore Technologies":294,
  "ServiceTitan":140,
  "AppFolio":258,
  "Waystar":474,
  "CCC Intelligent Solutions":443,
  "Doximity":352,
  "Q2 Holdings":193,
  "Blackbaud":410,
  "nCino":135,
  "Agilysys":63,
  "Alkami Technology":65,
  "Intapp":107,
  "Alfa Financial Software":60,
  "SiteMinder":17,
  "Blend Labs":18,
  "Fair Isaac (FICO)":1265,
  "Broadridge Financial":1771,
  "FactSet Research":946,
  "Sportradar":364,
  "Synopsys":3137,
  "Axon Enterprise":742,
  "Constellation Software":3376,
  "Dassault Systemes":2558,
  "HealthEquity":568,
  "Cellebrite":131,
  "Flywire":126,
  "GPI SpA":141,
  "Phreesia":102,
  "SS&C Technologies":2499,
  "PTC":1354,
  "Trimble":1056,
  "Temenos":426,
  "Sabre Corporation":515,
  "Verra Mobility":415,
  "Diebold Nixdorf":491,
  "EverCommerce":179,
  "Claritev":604,
  "Xometry":23,
  "Proto Labs":79
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt  = n=>Math.abs(n)>=1000?`$${(n/1000).toFixed(1)}B`:`$${Math.round(Math.abs(n))}M`;
const fmtN = n=>Math.abs(n)>=1000?`${(n/1000).toFixed(1)}B`:`${Math.round(Math.abs(n))}M`;
const riskColor=r=>({"Low":"bg-green-100 text-green-800","Medium":"bg-yellow-100 text-yellow-800","High":"bg-red-100 text-red-800"})[r]||"bg-gray-100";
const irrColor=v=>v>=IRR_GREAT?"text-green-700 font-bold":v>=IRR_GOOD?"text-lime-700 font-bold":v>=IRR_OK?"text-yellow-600":"text-red-500";
const irrLabel=v=>v>=IRR_GREAT?"★ Great":v>=IRR_GOOD?"✓ Good":v>=IRR_OK?"~ OK":"✗ Weak";
const scColor=s=>s>=7.5?"text-green-700":s>=6.0?"text-lime-700":s>=4.5?"text-yellow-600":"text-red-500";
function dcfPerShare(intrinsic,sd){
  if(!sd?.sharesOut)return null;
  return Math.round(((intrinsic-sd.netDebt)/sd.sharesOut)*100)/100;
}
function lboEntryTEV(sd,ntmRev,ntmRevX){
  if(!sd?.sharePrice)return ntmRev*ntmRevX*LBO_PREM;
  return Math.round((sd.sharePrice*LBO_PREM*sd.sharesOut)+sd.netDebt);
}
function getDimExpl(co,dim,s){
  if(dim==="val")return`EV/EBITDA ${s.evEbitda}x (primary, max 2pts): ${s.evEbitda<10?"<10x — attractive":s.evEbitda<15?"10–15x — moderate":s.evEbitda<20?"15–20x — elevated":">20x — premium"}. EV/Rev ${s.evRev}x (secondary, max 1pt): ${s.evRev<3?"<3x deep value":s.evRev<6?"3–6x reasonable":s.evRev<10?"6–10x above avg":">10x premium"}. Score: ${s.valScore}/3.0`;
  if(dim==="qual"){const mp=co.sor?1.0:0.35;const rm=(co.pricing==="Usage-Based"?0.35:0.10)+(!co.seat?0.20:0);const pp=Math.min((Math.min(co.ebitda,50)/50)*0.75,0.75);const ml=(Math.min(Math.max(co.cagr,0),25)/25)*0.40;const ig={"High":0.30,"Medium-High":0.225,"Medium":0.15,"Low-Medium":0.075,"Low":0}[co.peFit]||0.15;return`Mkt Pos ${mp.toFixed(2)}/1.0 (${co.sor?"SoR":"non-SoR"}). Rev Moat ${rm.toFixed(2)}/0.55 (${co.pricing}${!co.seat?", non-seat":""} ). Pricing Pwr ${pp.toFixed(2)}/0.75. Mkt Lead ${ml.toFixed(2)}/0.40 (N3Y CAGR ${co.cagr}%). Grade ${ig.toFixed(3)}/0.30 (PE Fit: ${co.peFit}). Score: ${s.qualScore}/3.0`;}
  if(dim==="ai")return`Base "${co.aiRisk}" → ${{"Low":2.6,"Medium":1.4,"High":0.1}[co.aiRisk]} pts. SoR: ${co.sor?"+0.2":"+0"}. Pricing: ${co.pricing==="Usage-Based"?"+0.2 (usage)":"-0.2 (seat)"}. Score: ${s.aiScore}/3.0`;
  if(dim==="lbo")return`IRR ${s._lbo?.irr}% → ${irrLabel(s._lbo?.irr||0)}. Entry ${fmt(s._lbo?.entryTEV)} at ${s._lbo?.entryEBITDAMult}x EV/EBITDA. Exit ${fmt(s._lbo?.exitTEV)} at ${s._lbo?.exitEBITDAMult}x. MOIC ${s._lbo?.moic}x. Score: ${s.lboScore}/3.0`;
  if(dim==="dcf")return`DCF/share: $${s._dcfShare??'N/A'} vs current $${co.sd?.sharePrice??'N/A'}. Intrinsic TEV ${fmt(s._dcf?.intrinsic)} vs TEV ${fmt(co.tev)}. PV FCFs: ${fmt(s._dcf?.pvSum)}, PV TV: ${fmt(s._dcf?.pvTV)}. Score: ${s.dcfScore}/2.0`;
  if(dim==="pe")return`PE Fit "${co.peFit}": FCF predictability, margin levers, scale, mgmt alignment. Score: ${s.peScore}/1.0`;
  return"";
}
function SliderInput({label,value,min,max,step=1,unit="",onChange}){
  return(
    <div className="flex items-center gap-2" onClick={e=>e.stopPropagation()}>
      <span className="text-gray-500 w-44 flex-shrink-0 text-xs">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} className="flex-1 accent-gray-700 h-1.5" style={{minWidth:80}}/>
      <input type="number" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} className="w-16 border border-gray-300 rounded px-1.5 py-0.5 text-xs text-right"/>
      <span className="text-gray-400 text-xs w-4">{unit}</span>
    </div>
  );
}
export default function App(){
  const [tab,setTab]=useState("screen");
  const [avoidFilter,setAvoidFilter]=useState("All");
  const [searchQuery,setSearchQuery]=useState("");
  const [aiRiskFilter,setAiRiskFilter]=useState("All");
  const [sorFilter,setSorFilter]=useState("All");
  const [sortBy,setSortBy]=useState("Score");
  const [expanded,setExpanded]=useState(null);
  const [openDim,setOpenDim]=useState({});
  const [openSec,setOpenSec]=useState({});
  const [gWacc,setGWacc]=useState(DEFAULT_WACC);
  const [gPgr,setGPgr]=useState(DEFAULT_PGR);
  const [overrides,setOverrides]=useState({});
  const getOv=n=>overrides[n]||{};
  const setOv=(n,k,v)=>setOverrides(p=>({...p,[n]:{...p[n],[k]:v}}));
  const resetOv=n=>setOverrides(p=>{const x={...p};delete x[n];return x;});
  const companies=RAW.map(co=>{
    const ov=getOv(co.name);
    const defEndM=Math.max(co.ebitda,Math.min(co.ebitda+10,40));
    const g=ov.growth??co.growth;
    const eM=ov.endMargin??defEndM;
    const xM=ov.exitMult??null;
    const entryTEV=lboEntryTEV(co.sd,co.ntmRev,co.ntmRevX);
    const dcf=runDCF(co.ntmRev,g,co.ebitda,eM,gWacc,gPgr);
    const lbo=runLBO(co.ntmRev,co.ntmRevX,co.ebitda,g,eM,xM,entryTEV,LTM_EBITDA[co.name]??null);
    const sc=scoreCompany(co,dcf,lbo);
    const ntmEBITDAX=Math.round((co.tev/(co.ntmRev*co.ebitda/100))*10)/10;
    const dcfShare=dcfPerShare(dcf.intrinsic,co.sd);
    const sharePct=co.sd&&dcfShare?Math.round((dcfShare/co.sd.sharePrice-1)*100):null;
    return{...co,dcf,lbo,ntmEBITDAX,...sc,_dcf:dcf,_lbo:lbo,dcfShare,sharePct,
      _scores:{...sc,_dcf:dcf,_lbo:lbo,_dcfShare:dcfShare,evEbitda:ntmEBITDAX,evRev:co.ntmRevX}};
  }).sort((a,b)=>b.total-a.total);
  const filtered=(()=>{
    const f=companies.filter(c=>{
      if(avoidFilter==="Top Picks"&&(c.avoid||c.total<7.0))return false;
      if(avoidFilter==="Avoid"&&!c.avoid)return false;
      if(searchQuery){const q=searchQuery.toLowerCase();if(!c.name.toLowerCase().includes(q)&&!c.vertical.toLowerCase().includes(q))return false;}
      if(aiRiskFilter!=="All"&&c.aiRisk!==aiRiskFilter)return false;
      if(sorFilter==="SoR Only"&&!c.sor)return false;
      return true;
    });
    if(sortBy==="IRR ↓")return [...f].sort((a,b)=>b.lbo.irr-a.lbo.irr);
    if(sortBy==="DCF % ↓")return [...f].sort((a,b)=>(b.sharePct??-9999)-(a.sharePct??-9999));
    if(sortBy==="TEV ↓")return [...f].sort((a,b)=>b.tev-a.tev);
    return f;
  })();
  const dimCfg=[["val","Valuation","/3.0"],["qual","Biz Quality","/3.0"],["ai","AI Risk","/3.0"],["lbo","LBO","/3.0"],["dcf","DCF","/2.0"],["pe","PE Fit","/1.0"]];
  return(
    <div className="bg-gray-50 min-h-screen font-sans text-sm">
    <div className="max-w-6xl mx-auto p-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Vertical Software Take-Private Screen</h1>
        <p className="text-xs text-gray-500 mt-0.5">Permira · {companies.length} companies · Data as of 2/27/2026</p>
      </div>
      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[["screen","📊 Screen"],["methodology","📐 Methodology"],["assumptions","⚙️ Assumptions"],["top5","🏆 Top 5"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${tab===k?"border-gray-900 text-gray-900":"border-transparent text-gray-500 hover:text-gray-700"}`}>{l}</button>
        ))}
      </div>
      {/* ASSUMPTIONS */}
      {tab==="assumptions"&&(
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-blue-200 p-5">
            <h2 className="font-bold text-blue-900 mb-3">🌐 Global DCF Toggles</h2>
            <div className="space-y-3 max-w-xl">
              <SliderInput label="WACC" value={gWacc} min={6} max={20} step={0.5} unit="%" onChange={setGWacc}/>
              <SliderInput label="Terminal Growth (PGR)" value={gPgr} min={1} max={8} step={0.5} unit="%" onChange={setGPgr}/>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-blue-100 p-4 text-xs space-y-1.5">
              <p className="font-bold text-blue-900 mb-2">📈 DCF Assumptions</p>
              {[["Period","10 years"],["Yr 1","NTM actuals (locked — revenue and EBITDA margin)"],["Growth","Yr 1 = NTM rate; if >10%, linearly converges to 10% by Yr 10"],["Margin expansion","Linear Yr 2→Yr 10 from NTM margin to end-state (no contraction)"],["End-state margin","NTM+10% up to 40% cap (per-company override available)"],["FCF conversion","EBITDA × 85%"],["WACC",`${gWacc}% (global toggle)`],["PGR",`${gPgr}% (global toggle)`],["Terminal value","Gordon Growth on terminal FCF"],["DCF vs share price","Equity value = Intrinsic TEV − Net Debt ÷ Shares Out"]].map(([k,v])=>(
                <div key={k} className="flex gap-2 pb-1 border-b border-gray-100"><span className="text-gray-400 w-40 flex-shrink-0">{k}</span><span className="font-medium text-gray-800">{v}</span></div>
              ))}
            </div>
            <div className="bg-white rounded-lg border border-orange-100 p-4 text-xs space-y-1.5">
              <p className="font-bold text-orange-900 mb-2">💰 LBO Assumptions</p>
              {[["Entry price","Share price × 1.30 × shares out + net debt"],["Entry EV/EBITDA","Derived: Entry TEV ÷ NTM EBITDA"],["Leverage","7.0× NTM EBITDA, capped at 75% TEV"],["Interest","9.0% on gross debt (fixed — no paydown)"],["Debt","Fixed throughout hold"],["LFCF","(EBITDA×85%) − Interest − Tax(22% on EBT)"],["Cash","LFCF accumulates on balance sheet"],["Hold","5 years"],["Revenue/margins","Same as DCF Yrs 1–5; Yr 6 projected for NTM exit EBITDA"],["Exit multiple","Applied to NTM EBITDA (Yr 6); defaults to entry EV/EBITDA, hard cap 20×"],["Exit equity","Exit TEV − Gross Debt + Accumulated Cash"],["IRR","≥25% Great | ≥20% Good | ≥15% OK | <15% Weak"]].map(([k,v])=>(
                <div key={k} className="flex gap-2 pb-1 border-b border-gray-100"><span className="text-gray-400 w-36 flex-shrink-0">{k}</span><span className="font-medium text-gray-800">{v}</span></div>
              ))}
            </div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
            <strong>⚠️ Disclaimer:</strong> Illustrative screening tool only. Not a substitute for full financial modelling and due diligence.
          </div>
        </div>
      )}
      {/* METHODOLOGY */}
      {tab==="methodology"&&(
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3 text-xs">
          <h2 className="font-bold text-gray-900 text-sm mb-1">Composite Score (0–10 · max 15 raw pts → normalized)</h2>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[["AI Risk","3.0pts","Highest weight"],["Biz Quality","3.0pts","SoR, moat, CAGR"],["Valuation","3.0pts","EV/EBITDA primary"],["LBO Returns","3.0pts","IRR thresholds"],["DCF Upside","2.0pts","DCF/share vs price"],["PE Fit","1.0pt","FCF, levers, scale"]].map(([d,p,n])=>(
              <div key={d} className="bg-gray-50 border border-gray-200 rounded p-2"><div className="font-semibold text-gray-800">{d}</div><div className="text-green-700 font-bold">{p}</div><div className="text-gray-400">{n}</div></div>
            ))}
          </div>
          {[["Valuation (3pts)","EV/EBITDA primary (max 2pts): <10x ≈ maximum; >20x ≈ near zero. EV/Revenue secondary (max 1pt): <3x maximum; >12x minimum.","bg-blue-50 border-blue-200"],
            ["Business Quality (3pts)","Market Positioning: SoR=1.0, non-SoR=0.35 (max 1.0pt). Revenue Moat: usage-based+0.35/seat-based+0.10, non-seat-locked+0.20 (max 0.55pt). Pricing Power: EBITDA margin proxy, capped at 50% (max 0.75pt). Market Leadership: N3Y CAGR capped at 25% (max 0.40pt). Investment Grade: PE Fit signal (max 0.30pt).","bg-purple-50 border-purple-200"],
            ["AI Risk (3pts)","Base: Low=2.6, Medium=1.4, High=0.1. Bonuses: SoR +0.2, Usage-Based +0.2, Seat-Based −0.2, PE-Owned +0.2.","bg-red-50 border-red-200"],
            ["LBO Returns (3pts)","≥25% = 3.0 | ≥20% = 2.2 | ≥15% = 1.4 | <15% = scaled to 0. Entry at 30% premium to share price, 7× leverage at 9% fixed, 5-year hold, exit multiple applied to NTM (Yr 6) EBITDA capped 20×.","bg-orange-50 border-orange-200"],
            ["DCF Upside (2pts)","Centred at 1.0. Compares DCF equity value per share vs current share price. Rises to 2.0 if significant upside; falls to 0 if significant downside.","bg-yellow-50 border-yellow-200"],
            ["PE Fit (1pt)","High=1.0, Medium-High=0.75, Medium=0.5, Low-Medium=0.25, Low=0.1.","bg-green-50 border-green-200"],
          ].map(([t,b,c])=>(
            <div key={t} className={`rounded-lg border p-3 ${c}`}><p className="font-semibold text-gray-800 mb-1">{t}</p><p className="text-gray-600">{b}</p></div>
          ))}
        </div>
      )}
      {/* TOP 5 */}
      {tab==="top5"&&(
        <div className="space-y-6">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h2 className="font-bold text-purple-900 mb-1">🏆 Top 5 Take-Private Candidates — Deep Dive</h2>
            <p className="text-xs text-purple-700">Ranked by composite score (excluding avoided names). Three scenarios per company with company-specific revenue CAGR and terminal margin assumptions — <strong>Downside</strong> (left), <strong>Base Case</strong> (centre), <strong>Upside</strong> (right) — each with the reasoning behind the operating case. Qualitative analysis covers business model, competitive dynamics, AI risk, and PE thesis.</p>
          </div>
          {companies.filter(c=>!c.avoid).slice(0,5).map((co,idx)=>{
            const d=TOP5_DATA[co.name]||{};
            const defEndM=Math.max(co.ebitda,Math.min(co.ebitda+10,40));
            const entryTEV=lboEntryTEV(co.sd,co.ntmRev,co.ntmRevX);
            const entryMult=Math.min(entryTEV/(co.ntmRev*co.ebitda/100),LBO_MAX_EXIT);
            const scenarioCfgs=d.scenarios||[
              {growthDelta:-5,marginDelta:-3,exitFactor:0.8,reasons:[]},
              {growthDelta:0,marginDelta:0,exitFactor:1.0,reasons:[]},
              {growthDelta:5,marginDelta:5,exitFactor:1.0,reasons:[]}
            ];
            const scenarioMeta=[
              {label:"⬇ Downside",bg:"bg-red-50",border:"border-red-200",hd:"text-red-800",sub:"text-red-600",tag:"bg-red-100 text-red-700"},
              {label:"◆ Base Case",bg:"bg-blue-50",border:"border-blue-200",hd:"text-blue-800",sub:"text-blue-600",tag:"bg-blue-100 text-blue-700"},
              {label:"⬆ Upside",bg:"bg-green-50",border:"border-green-200",hd:"text-green-800",sub:"text-green-600",tag:"bg-green-100 text-green-700"}
            ];
            const scenarios=scenarioCfgs.map((s,si)=>{
              const gUsed=co.growth+s.growthDelta;
              const mUsed=Math.max(defEndM+s.marginDelta,co.ebitda);
              const exitMult=s.exitFactor<1?Math.round(entryMult*s.exitFactor*10)/10:null;
              const lbo=si===1?co.lbo:runLBO(co.ntmRev,co.ntmRevX,co.ebitda,gUsed,mUsed,exitMult,entryTEV,co.lbo.levEBITDA);
              const dcf=si===1?co.dcf:runDCF(co.ntmRev,gUsed,co.ebitda,mUsed,gWacc,gPgr);
              const dcfShare=si===1?co.dcfShare:dcfPerShare(dcf.intrinsic,co.sd);
              return{...scenarioMeta[si],gUsed,mUsed,lbo,dcf,dcfShare,reasons:s.reasons||[]};
            });
            const sections=[
              {title:"🏢 Business & Market",key:"business",bg:"bg-blue-50",border:"border-blue-100",hd:"text-blue-900",bullet:"text-blue-400"},
              {title:"⚔️ Competitive Landscape",key:"competition",bg:"bg-purple-50",border:"border-purple-100",hd:"text-purple-900",bullet:"text-purple-400"},
              {title:"🤖 AI Risk Assessment",key:"aiRisk",bg:"bg-orange-50",border:"border-orange-100",hd:"text-orange-900",bullet:"text-orange-400"},
              {title:"🎯 PE Take-Private Thesis",key:"thesis",bg:"bg-green-50",border:"border-green-100",hd:"text-green-900",bullet:"text-green-500"}
            ];
            return(
              <div key={co.name} className="bg-white rounded-xl border border-purple-200 overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-purple-900 to-indigo-800 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-purple-900 font-black text-sm flex-shrink-0">#{idx+1}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-bold text-base">{co.name}</span>
                        <span className="text-purple-200 text-xs border border-purple-400 px-1.5 py-0.5 rounded">{co.vertical}</span>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-purple-200 flex-wrap">
                        <span>TEV {fmt(co.tev)}</span>
                        <span>{co.ntmRevX}× NTM Rev</span>
                        <span>{co.ebitda}% EBITDA</span>
                        <span>{co.growth}% growth</span>
                        <span>{co.gm}% GM</span>
                        <span className="text-yellow-300 font-bold">Score {co.total}/10</span>
                      </div>
                      {d.headline&&<p className="text-purple-100 text-xs mt-1.5 italic">{d.headline}</p>}
                    </div>
                  </div>
                </div>
                <div className="p-5 space-y-5">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">📊 3-Scenario Returns Analysis</p>
                    <div className="grid grid-cols-3 gap-3">
                      {scenarios.map(s=>(
                        <div key={s.label} className={`${s.bg} border ${s.border} rounded-lg p-3 flex flex-col gap-2`}>
                          <div>
                            <p className={`font-bold text-xs mb-1 ${s.hd}`}>{s.label}</p>
                            <div className="flex gap-1.5 flex-wrap">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${s.tag}`}>Rev CAGR {s.gUsed}%</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${s.tag}`}>Term. Margin {Math.round(s.mUsed*10)/10}%</span>
                            </div>
                          </div>
                          {s.reasons.length>0&&(
                            <ul className="space-y-1">
                              {s.reasons.map((r,i)=>(
                                <li key={i} className={`text-xs leading-snug flex gap-1 ${s.sub}`}>
                                  <span className="flex-shrink-0 mt-0.5">•</span>
                                  <span>{r}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className={`border-t ${s.border} pt-2 space-y-1`}>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-gray-400">IRR</span>
                              <span className={irrColor(s.lbo.irr)}>{s.lbo.irr}%</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-gray-400">MOIC</span>
                              <span className="font-semibold text-gray-800">{s.lbo.moic}×</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-gray-400">DCF TEV</span>
                              <span className="font-semibold text-gray-700">{fmt(s.dcf.intrinsic)}</span>
                            </div>
                            {s.dcfShare&&co.sd&&(
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-400">DCF/share</span>
                                <span className={`font-semibold ${s.dcfShare>co.sd.sharePrice?"text-green-700":"text-red-600"}`}>${s.dcfShare} vs ${co.sd.sharePrice}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {sections.map(sec=>(
                      <div key={sec.key} className={`rounded-lg border ${sec.border} ${sec.bg} p-3`}>
                        <p className={`font-bold text-xs mb-2 ${sec.hd}`}>{sec.title}</p>
                        <ul className="space-y-1.5">
                          {(d[sec.key]||[]).map((b,i)=>(
                            <li key={i} className="flex gap-1.5 text-xs text-gray-700 leading-snug">
                              <span className={`mt-0.5 flex-shrink-0 ${sec.bullet}`}>▸</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-gray-400 text-center">Top 5 by composite score (non-avoided) · Revenue CAGR = Yr1 NTM growth rate per scenario · Terminal margin = Yr5 end-state EBITDA margin · Downside applies −20% to default exit multiple</p>
        </div>
      )}
            {/* SCREEN */}
      {tab==="screen"&&(
        <>
          {/* Filters */}
          {(()=>{
            const anyActive=searchQuery||avoidFilter!=="All"||aiRiskFilter!=="All"||sorFilter!=="All"||sortBy!=="Score";
            const PillRow=({label,opts,val,set})=>(
              <div className="flex flex-wrap gap-1 items-center">
                <span className="text-xs text-gray-400 font-medium w-16 flex-shrink-0">{label}</span>
                {opts.map(f=>(
                  <button key={f} onClick={()=>set(f)} className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${val===f?"bg-gray-900 text-white border-gray-900":"bg-white text-gray-600 border-gray-300 hover:border-gray-500"}`}>{f}</button>
                ))}
              </div>
            );
            return(
              <div className="bg-white rounded-lg border border-gray-200 p-3 mb-3 space-y-2">
                <input
                  type="text"
                  placeholder="Search company or vertical…"
                  value={searchQuery}
                  onChange={e=>setSearchQuery(e.target.value)}
                  className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder-gray-400"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                  <PillRow label="Show" opts={["All","Top Picks","Avoid"]} val={avoidFilter} set={setAvoidFilter}/>
                  <PillRow label="AI Risk" opts={["All","Low","Medium","High"]} val={aiRiskFilter} set={setAiRiskFilter}/>
                  <PillRow label="SoR" opts={["All","SoR Only"]} val={sorFilter} set={setSorFilter}/>
                  <PillRow label="Sort" opts={["Score","IRR ↓","DCF % ↓","TEV ↓"]} val={sortBy} set={setSortBy}/>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-xs text-gray-400">{filtered.length} of {companies.length} companies</span>
                  {anyActive&&<button onClick={()=>{setSearchQuery("");setAvoidFilter("All");setAiRiskFilter("All");setSorFilter("All");setSortBy("Score");}} className="text-xs text-blue-600 hover:text-blue-800 underline">Clear all filters</button>}
                </div>
              </div>
            );
          })()}
          {/* Column header */}
          <div className="bg-white border border-gray-200 rounded-lg mb-1 px-3 py-1.5 text-xs text-gray-400 font-medium" style={{display:"grid",gridTemplateColumns:"28px 1fr 68px 76px 54px 60px 44px 96px 128px 78px 50px 46px 56px 16px",gap:"0 8px",alignItems:"center"}}>
            <div></div><div>Company</div>
            <div className="text-right">TEV</div>
            <div className="text-right">EV/EBITDA</div>
            <div className="text-right">EV/Rev</div>
            <div className="text-right">EBITDA%</div>
            <div className="text-right">Gr%</div>
            <div className="text-right">IRR</div>
            <div className="text-right">DCF/Share</div>
            <div className="text-center">AI Risk</div>
            <div className="text-center">Model</div>
            <div className="text-center">SoR</div>
            <div className="text-right">Score</div>
            <div></div>
          </div>
          <div className="space-y-1">
            {filtered.map(co=>{
              const rank=companies.indexOf(co)+1;
              const isOpen=expanded===co.name;
              const ov=getOv(co.name);
              const defEndM=Math.max(co.ebitda,Math.min(co.ebitda+10,40));
              const g=ov.growth??co.growth;
              const eM=ov.endMargin??defEndM;
              const xM=ov.exitMult??Math.round(Math.min(co.ntmEBITDAX,LBO_MAX_EXIT)*10)/10;
              const hasOv=ov.growth!==undefined||ov.endMargin!==undefined||ov.exitMult!==undefined;
              return(
                <div key={co.name} className={`bg-white rounded-lg border ${co.avoid?"border-red-200":co.tev>=10000?"border-blue-100":"border-gray-200"} overflow-hidden`}>
                  {/* Summary row */}
                  <div className="px-3 py-2 cursor-pointer hover:bg-gray-50 select-none text-xs" onClick={()=>setExpanded(isOpen?null:co.name)}
                    style={{display:"grid",gridTemplateColumns:"28px 1fr 68px 76px 54px 60px 44px 96px 128px 78px 50px 46px 56px 16px",gap:"0 8px",alignItems:"center"}}>
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600 flex-shrink-0">{rank}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-semibold text-gray-900 text-xs">{co.name}</span>
                        {co.avoid&&<span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">AVOID</span>}
                        {co.tev>=10000&&<span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">&gt;$10B</span>}
                        {hasOv&&<span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">custom</span>}
                      </div>
                      <div className="text-gray-400 truncate">{co.vertical}</div>
                    </div>
                    <div className="text-right font-semibold">{fmt(co.tev)}</div>
                    <div className="text-right font-semibold">{co.ntmEBITDAX}x</div>
                    <div className="text-right font-semibold">{co.ntmRevX}x</div>
                    <div className="text-right font-semibold">{co.ebitda}%</div>
                    <div className="text-right font-semibold">{co.growth}%</div>
                    <div className={`text-right font-semibold ${irrColor(co.lbo.irr)}`}>{co.lbo.irr}%</div>
                    <div className={`text-right font-semibold ${co.sharePct!==null?(co.sharePct>0?"text-green-700":"text-red-500"):"text-gray-300"}`}>
                      {co.sd?co.dcfShare!==null?`$${co.dcfShare} (${co.sharePct>0?"+":""}${co.sharePct}%)`:"—":"—"}</div>
                    <div className="flex justify-center"><span className={`px-1.5 py-0.5 rounded-full font-medium ${riskColor(co.aiRisk)}`}>{co.aiRisk}</span></div>
                    <div className="flex justify-center"><span className={`px-1.5 py-0.5 rounded-full font-medium ${co.pricing==="Usage-Based"?"bg-blue-100 text-blue-800":"bg-purple-100 text-purple-800"}`}>{co.pricing==="Usage-Based"?"Usage":"Seat"}</span></div>
                    <div className="flex justify-center"><span className={`px-1.5 py-0.5 rounded-full font-medium ${co.sor?"bg-indigo-100 text-indigo-800":"bg-gray-100 text-gray-500"}`}>{co.sor?"SoR":"~SoR"}</span></div>
                    <div className={`text-right text-base font-bold ${scColor(co.total)}`}>{co.total}</div>
                    <div className="text-gray-400 text-center">{isOpen?"▲":"▼"}</div>
                  </div>
                  {/* Expanded */}
                  {isOpen&&(
                    <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4" onClick={e=>e.stopPropagation()}>
                      {/* Description */}
                      {co.desc&&<div className="bg-white border border-gray-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-700 mb-1">Business Overview</p>
                        <p className="text-xs text-gray-600 leading-relaxed">{co.desc}</p>
                      </div>}
                      {/* Thesis + AI */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><p className="font-semibold text-gray-700 text-xs mb-1">Investment Thesis</p>
                          <ol className="space-y-1">{co.thesis.map((t,i)=><li key={i} className="text-xs text-gray-600 flex gap-1.5"><span className="text-gray-400 flex-shrink-0">{i+1}.</span><span>{t}</span></li>)}</ol>
                        </div>
                        <div><p className="font-semibold text-gray-700 text-xs mb-1">AI Risk Analysis</p>
                          <ol className="space-y-1">{co.aiRationale.map((r,i)=><li key={i} className="text-xs text-gray-600 flex gap-1.5"><span className="text-gray-400 flex-shrink-0">{i+1}.</span><span>{r}</span></li>)}</ol>
                        </div>
                      </div>
                      {/* Score badges */}
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-2">Score Breakdown — click any badge for rationale</p>
                        <div className="flex flex-wrap gap-2">
                          {dimCfg.map(([key,label,max])=>{
                            const val=key==="dcf"?co.dcfScore:key==="pe"?co.peScore:co[`${key}Score`];
                            const dk=`${co.name}_${key}`;
                            return(
                              <div key={key}>
                                <button onClick={()=>setOpenDim(p=>({...p,[dk]:!p[dk]}))} className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${openDim[dk]?"bg-gray-800 text-white border-gray-800":"bg-white text-gray-700 border-gray-300 hover:border-gray-500"}`}>
                                  {label}: <span className="font-bold">{val}</span>{max} {openDim[dk]?"▲":"▼"}
                                </button>
                                {openDim[dk]&&<div className="mt-1 p-3 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 max-w-lg leading-relaxed">{getDimExpl(co,key,co._scores)}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* Overrides */}
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold text-gray-700">🎛️ Per-Company Overrides <span className="text-gray-400 font-normal">(updates DCF + LBO live)</span></p>
                          {hasOv&&<button onClick={()=>resetOv(co.name)} className="text-xs text-red-500 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50">Reset defaults</button>}
                        </div>
                        <div className="space-y-3 max-w-xl">
                          <SliderInput label="Starting Rev Growth (Yr 1)" value={g} min={-5} max={50} step={0.5} unit="%" onChange={v=>setOv(co.name,"growth",v)}/>
                          <SliderInput label="End-State EBITDA Margin" value={eM} min={Math.min(co.ebitda,5)} max={65} step={0.5} unit="%" onChange={v=>setOv(co.name,"endMargin",v)}/>
                          <SliderInput label="LBO Exit EV/EBITDA" value={xM} min={3} max={25} step={0.5} unit="x" onChange={v=>setOv(co.name,"exitMult",v)}/>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          {[["Default Growth",`${co.growth}%`],["Default End-Margin",`${defEndM}%`],["Default Exit Mult",`${Math.round(Math.min(co.ntmEBITDAX,LBO_MAX_EXIT)*10)/10}x`]].map(([k,v])=>(
                            <div key={k} className="bg-gray-50 rounded p-1.5 border border-gray-100"><div className="text-gray-400">{k}</div><div className="font-medium text-gray-600">{v}</div></div>
                          ))}
                        </div>
                      </div>
                      {/* DCF */}
                      <div>
                        <button onClick={()=>setOpenSec(p=>({...p,[`${co.name}_dcf`]:!p[`${co.name}_dcf`]}))} className="w-full text-left font-semibold text-blue-900 text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-100">
                          📈 DCF — Intrinsic: {fmt(co.dcf.intrinsic)} vs TEV {fmt(co.tev)} · DCF/share: {co.dcfShare?`$${co.dcfShare} (${co.sharePct>0?"+":""}${co.sharePct}%) vs $${co.sd?.sharePrice}`:"pending share data"} {openSec[`${co.name}_dcf`]?"▲":"▼"}
                        </button>
                        {openSec[`${co.name}_dcf`]&&(
                          <div className="mt-2 bg-white border border-blue-100 rounded-lg p-3 overflow-x-auto">
                            <p className="text-xs text-gray-500 mb-3">Yr 1 = NTM actuals ({fmt(co.ntmRev)} rev, {co.ebitda}% EBITDA — locked). Yr 2+ growth: {g}%{g>10?` → converges to 10% by Yr 10 (implied CAGR ~${Math.round(((Math.pow(co.dcf.rows[DCF_YEARS-1].rev/co.ntmRev,1/DCF_YEARS)-1)*100)*10)/10}%)`:""}. EBITDA: {co.ebitda}%→{eM}%. WACC {gWacc}% · PGR {gPgr}%</p>
                            <table className="w-full text-xs border-collapse min-w-max">
                              <thead><tr className="bg-gray-50"><th className="border border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 w-36">Metric</th>{co.dcf.rows.map(r=><th key={r.yr} className="border border-gray-200 px-2 py-1.5 text-center font-semibold text-gray-600 whitespace-nowrap">Yr {r.yr}</th>)}</tr></thead>
                              <tbody>
                                {[["Revenue ($M)",r=>fmtN(r.rev),""],["Rev Growth",r=>`${r.growth}%`,"text-gray-400"],["EBITDA ($M)",r=>fmtN(r.ebitda),"font-medium"],["EBITDA Margin",r=>`${r.margin}%`,""],["FCF ($M)",r=>fmtN(r.fcf),""],["FCF Margin",r=>`${r.fcfM}%`,"text-gray-500"],["PV of FCF ($M)",r=>fmtN(r.pv),"text-blue-700 font-medium"]].map(([lbl,fn,cls],i)=>(
                                  <tr key={lbl} className={i%2===0?"bg-white":"bg-gray-50"}>
                                    <td className="border border-gray-200 px-2 py-1.5 font-medium text-gray-700 sticky left-0 bg-inherit whitespace-nowrap">{lbl}</td>
                                    {co.dcf.rows.map(r=><td key={r.yr} className={`border border-gray-200 px-2 py-1.5 text-center ${cls}`}>{fn(r)}</td>)}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              {[["PV of FCFs (Yrs 1–10)",fmt(co.dcf.pvSum),""],["PV of Terminal Value",fmt(co.dcf.pvTV),""],["DCF Intrinsic TEV",fmt(co.dcf.intrinsic),"font-bold"],["(–) Net Debt",fmt(co.sd?.netDebt??0),""],["DCF Equity Value",fmt(co.dcf.intrinsic-(co.sd?.netDebt??0)),"font-bold"],["÷ Shares Out",co.sd?`${co.sd.sharesOut}M`:"N/A",""],["DCF / Share",co.dcfShare?`$${co.dcfShare}`:"N/A","font-bold text-blue-800"],["Current Share Price",co.sd?`$${co.sd.sharePrice}`:"N/A",""],["Implied Upside",co.sharePct!==null?`${co.sharePct>0?"+":""}${co.sharePct}%`:"N/A",co.sharePct>0?"text-green-700 font-bold":"text-red-600 font-bold"]].map(([k,v,c])=>(
                                <div key={k} className="bg-blue-50 rounded p-2"><div className="text-gray-400">{k}</div><div className={`text-gray-800 ${c}`}>{v}</div></div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {/* LBO */}
                      <div>
                        <button onClick={()=>setOpenSec(p=>({...p,[`${co.name}_lbo`]:!p[`${co.name}_lbo`]}))} className="w-full text-left font-semibold text-orange-900 text-xs bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 hover:bg-orange-100">
                          💰 LBO — IRR: <span className={irrColor(co.lbo.irr)}>{co.lbo.irr}% {irrLabel(co.lbo.irr)}</span> · MOIC: {co.lbo.moic}x {openSec[`${co.name}_lbo`]?"▲":"▼"}
                        </button>
                        {openSec[`${co.name}_lbo`]&&(
                          <div className="mt-2 bg-white border border-orange-100 rounded-lg p-3 overflow-x-auto">
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div className="bg-orange-50 rounded p-3 text-xs space-y-1.5">
                                <p className="font-bold text-orange-900 mb-2">📥 Entry Bridge</p>
                                {[
                                  [co.sd?"Current Share Price":"Current TEV", co.sd?`$${co.sd.sharePrice}`:fmt(co.tev),""],
                                  [co.sd?`× Shares Out`:"",co.sd?`${co.sd.sharesOut}M`:"","text-gray-400"],
                                  [co.sd?"= Market Cap":"",co.sd?fmt(co.sd.marketCap):"","text-gray-400"],
                                  ["Take-Private Premium (30%)",co.sd?`+${fmt(Math.round(co.sd.marketCap*0.3))} on equity`:`+${fmt(Math.round(co.tev*0.3))}`,"text-orange-600"],
                                  [co.sd?"(+) Net Debt":"",co.sd?fmt(co.sd.netDebt):"","text-gray-400"],
                                  ["Entry TEV",fmt(co.lbo.entryTEV),"font-bold border-t border-orange-300 pt-1"],
                                  ["Entry EV/EBITDA",`${co.lbo.entryEBITDAMult}x`,""],
                                  ["Entry EBITDA",fmt(co.lbo.entryEBITDA),""],
                                  [`(–) Gross Debt (7× LTM¹)`,`(${fmt(co.lbo.grossDebt)})`,"text-red-600"],
                                  ["Equity In",fmt(co.lbo.equityIn),"font-bold text-orange-800"],
                                ].filter(([k])=>k!=="").map(([k,v,c])=>(
                                  <div key={k} className={`flex justify-between ${c}`}><span className="text-gray-500">{k}</span><span>{v}</span></div>
                                ))}
                              </div>
                              <div className="bg-green-50 rounded p-3 text-xs space-y-1.5">
                                <p className="font-bold text-green-900 mb-2">📤 Exit Bridge (5yr hold · NTM multiple)</p>
                                {[
                                  ["NTM EBITDA (Yr 6)",fmt(co.lbo.exitEBITDA),""],
                                  [`Exit EV/EBITDA (≤${LBO_MAX_EXIT}×)`,`${co.lbo.exitEBITDAMult}x`,""],
                                  ["Exit TEV",fmt(co.lbo.exitTEV),"font-bold border-t border-green-300 pt-1"],
                                  ["(–) Gross Debt",`(${fmt(co.lbo.grossDebt)})`,"text-red-600"],
                                  ["(+) Accumulated Cash",`+${fmt(co.lbo.cumCash)}`,"text-green-600"],
                                  ["Net Debt at Exit",fmt(co.lbo.grossDebt-co.lbo.cumCash),""],
                                  ["Equity Out",fmt(co.lbo.exitEquity),"font-bold text-green-800 border-t border-green-300 pt-1"],
                                  ["MOIC",`${co.lbo.moic}×`,"font-bold text-green-700"],
                                  ["IRR",`${co.lbo.irr}% ${irrLabel(co.lbo.irr)}`,"font-bold text-green-700"],
                                ].map(([k,v,c])=>(
                                  <div key={k} className={`flex justify-between ${c}`}><span className="text-gray-500">{k}</span><span>{v}</span></div>
                                ))}
                              </div>
                            </div>
                            <p className="text-xs font-semibold text-gray-700 mb-1">Annual Projection (Yrs 1–5 hold · Yr 6 = NTM EBITDA at exit)</p>
                            <table className="w-full text-xs border-collapse min-w-max">
                              <thead><tr className="bg-gray-50"><th className="border border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 w-40">Metric</th>{co.lbo.lboRows.map(r=><th key={r.yr} className={`border border-gray-200 px-2 py-1.5 text-center font-semibold ${r.isNTM?"text-orange-700 bg-orange-50":"text-gray-600"}`}>{r.isNTM?"Yr 6 (NTM)":`Yr ${r.yr}`}</th>)}</tr></thead>
                              <tbody>
                                {[["Revenue ($M)",r=>fmtN(r.rev),""],["EBITDA ($M)",r=>r.isNTM?<span className="font-bold text-orange-700">{fmtN(r.ebitda)}</span>:fmtN(r.ebitda),""],["EBITDA Margin",r=>`${r.margin}%`,""],["Unlev. FCF (×85%)",r=>r.isNTM?"—":fmtN(r.ufcf),"text-gray-500"],["Interest ($M)",r=>r.isNTM?"—":`(${fmtN(r.interest)})`,"text-red-500"],["Tax (22% on EBT)",r=>r.isNTM?"—":`(${fmtN(r.tax)})`,"text-red-400"],["Lev. FCF ($M)",r=>r.isNTM?"—":fmtN(r.lfcf),"text-green-700 font-medium"],["Cum. Cash ($M)",r=>r.isNTM?"—":fmtN(r.cumCash),"text-green-600 font-medium"]].map(([lbl,fn,cls],i)=>(
                                  <tr key={lbl} className={i%2===0?"bg-white":"bg-gray-50"}>
                                    <td className="border border-gray-200 px-2 py-1.5 font-medium text-gray-700 sticky left-0 bg-inherit whitespace-nowrap">{lbl}</td>
                                    {co.lbo.lboRows.map(r=><td key={r.yr} className={`border border-gray-200 px-2 py-1.5 text-center ${r.isNTM?"bg-orange-50 ":""}${cls}`}>{fn(r)}</td>)}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="text-xs text-gray-400 mt-2">Gross debt: {fmt(co.lbo.grossDebt)} fixed throughout hold. Interest: {fmt(co.lbo.grossDebt)} × 9.0% = {fmt(Math.round(co.lbo.grossDebt*LBO_INT_RATE))}/yr. Exit multiple applied to Yr 6 NTM EBITDA; 5-year hold for IRR.</p>
                            <p className="text-xs text-gray-400 mt-1">¹ Debt sized at 7× LTM EBITDA {fmt(co.lbo.levEBITDA)}{co.lbo.levEBITDA!==co.lbo.entryEBITDA?` vs NTM EBITDA ${fmt(co.lbo.entryEBITDA)} — LTM convention reflects actual trailing cash generation for lender underwriting`:` (LTM = NTM for this company)`}.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3 text-center">{filtered.length} companies shown · Click rows to expand · Score badges show rationale · Sliders update models live</p>
        </>
      )}
    </div>
    </div>
  );
}
