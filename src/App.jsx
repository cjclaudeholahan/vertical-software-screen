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
  const pricingPwr=Math.min((co.gm/100)*0.75,0.75);
  const mktLead=(Math.min(Math.max(co.cagr,0),25)/25)*0.40;
  const investGrade={"High":0.30,"Medium-High":0.225,"Medium":0.15,"Low-Medium":0.075,"Low":0}[co.peFit]||0.15;
  const qualScore=Math.min(mktPos+revMoat+pricingPwr+mktLead+investGrade,3);
  const aiBase={"Low":2.6,"Low-Medium":2.0,"Medium":1.4,"Medium-High":0.8,"High":0.1}[co.aiRisk]||1.4;
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
  {name:"Autodesk",vertical:"Construction & Design",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:50164,ntmRev:8019,growth:11,gm:92,ebitda:40,cagr:13,ntmRevX:6.3,peFit:"Medium",aiRisk:"Low-Medium",avoid:false,
   desc:"Cloud-based design, engineering, and construction software (AutoCAD, Revit, BIM 360) serving architects, engineers, and contractors globally. The system of record for building and infrastructure design workflows. Usage-based subscription model with revenue tied to project activity and cloud storage.",
   sd:{sharePrice:231.80,sharesOut:214,marketCap:49491,netDebt:2559-1886},
   thesis:["Dominant construction/design SoR with 92% GM and 40% EBITDA — best-in-class unit economics","Cloud transition largely complete — pure recurring revenue base provides high visibility","13% N3Y CAGR demonstrates consistent compounding; AEC market digitization still underpenetrated","AI is a tailwind — Autodesk AI tools enhance platform value rather than threaten it","Above $10B TEV — primarily a public market benchmark; take-private at this scale is extremely rare"],
   aiRationale:["SoR for construction, manufacturing, and design workflows — deeply embedded in professional pipelines","AI tools being embedded natively (Autodesk AI) as a product enhancement rather than competitive threat","92% gross margins reflect software-only value delivery — durable even in AI transition","Seat-based but professional design workflows are complex and AI cannot easily replicate full toolchain","Low-medium risk: AI enhances but does not replace the core design and simulation use case"]},
  {name:"Veeva Systems",vertical:"Healthcare",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:24150,ntmRev:3591,growth:12,gm:78,ebitda:46,cagr:13,ntmRevX:6.7,peFit:"Medium",aiRisk:"Low",avoid:false,
   desc:"Life sciences cloud platform providing CRM (Vault CRM), regulatory content management, and clinical data systems to pharmaceutical and biotech companies. The SoR for drug development, regulatory submissions, and commercial operations across global pharma. Seat-based subscription with deep multi-year contracts.",
   sd:{sharePrice:182.60,sharesOut:160,marketCap:29224,netDebt:76-5150},
   thesis:["Dominant healthcare life sciences SoR with 78% GM and 46% EBITDA — exceptional quality","Vault platform deeply embedded in clinical, regulatory, and commercial workflows across pharma","Transition away from Salesforce to proprietary Vault CRM reduces platform dependency risk","Net cash position of ~$5B provides significant financial flexibility and M&A optionality","Above $10B TEV — benchmark name; highly relevant for comparable analysis"],
   aiRationale:["SoR for life sciences regulatory, clinical, and commercial operations — mission critical","FDA and EMA regulatory requirements create structural demand independent of AI trends","AI enhances drug discovery workflows within Veeva's ecosystem rather than displacing the platform","Seat-based but clinical and regulatory workflows require human oversight — AI compresses admin not core usage","Low risk: regulated life sciences environment is among the slowest to adopt AI displacement"]},
  {name:"Tyler Technologies",vertical:"GovTech",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:14999,ntmRev:2571,growth:9,gm:51,ebitda:29,cagr:9,ntmRevX:5.8,peFit:"Medium",aiRisk:"Low",avoid:false,
   desc:"Dominant vertical software provider for US state and local governments, covering ERP, courts, tax administration, public safety, and utility billing. Near-monopoly across multiple GovTech verticals with thousands of municipal customers. Seat-based subscription with long-term government contracts.",
   sd:{sharePrice:356.32,sharesOut:43,marketCap:15453,netDebt:643-1097},
   thesis:["Dominant GovTech SoR serving US state and local governments — near-monopoly in many verticals","Government procurement cycles create extreme revenue visibility and switching cost protection","9% growth with stable margins — classic yield-oriented PE profile with durable cash flows","Net cash position provides additional financial flexibility post-acquisition","Above $10B TEV — benchmark; relevant as comps for sub-$10B GovTech names"],
   aiRationale:["SoR for government tax, courts, utilities, and ERP workflows — entrenched across thousands of municipalities","Government AI adoption is the slowest of any sector — procurement and security requirements create long lags","Seat-based but government workflows require human accountability — AI compresses support not core SoR usage","No credible AI-native competitor has government certification and relationship depth of Tyler","Low risk: government regulatory environment and procurement cycles provide structural protection"]},
  {name:"Toast",vertical:"Travel / Hospitality",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:14582,ntmRev:7609,growth:20,gm:28,ebitda:11,cagr:21,ntmRevX:1.9,peFit:"Low-Medium",aiRisk:"Medium",avoid:false,
   desc:"Restaurant management platform (POS, payroll, inventory, payments) serving 120,000+ restaurants across North America. Monetizes primarily through payment processing on restaurant transaction volumes rather than software seats. Usage-based model with revenue scaling as restaurant sales grow.",
   sd:{sharePrice:27.72,sharesOut:597,marketCap:16553,netDebt:20-1991},
   thesis:["High growth restaurant platform with usage-based payments — 20% NTM growth at 1.9x NTM Rev","Payments and fintech revenue creates durable usage-based flywheel as restaurant volumes scale","28% GM is the key concern — software margins are compressed by payments mix","Above $10B TEV and very low margins limit PE take-private feasibility","Best viewed as a public market growth story rather than a PE candidate at current scale"],
   aiRationale:["Restaurant POS platform — not a deep SoR but usage-based payments provide revenue durability","AI ordering and kitchen optimization tools are emerging but lack Toast's integrated payments ecosystem","28% gross margins suggest significant non-software revenue — less exposed to pure AI software disruption","Usage-based model means AI efficiency gains grow transaction volume rather than compress revenue","Medium risk: not a SoR but payments flywheel and restaurant industry's slow AI adoption provide protection"]},
  {name:"Bentley Systems",vertical:"Construction & Design",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:13166,ntmRev:1691,growth:11,gm:83,ebitda:36,cagr:11,ntmRevX:7.8,peFit:"Medium",aiRisk:"Low",avoid:false,
   desc:"Engineering software for large-scale infrastructure design (roads, bridges, rail, utilities) serving civil engineers and infrastructure owners globally. The dominant SoR for civil and industrial infrastructure workflows with no credible direct competitor. Seat-based E365 subscription with strong recurring revenue from cloud transition.",
   sd:{sharePrice:36.55,sharesOut:323,marketCap:11803,netDebt:1427-64},
   thesis:["Infrastructure engineering SoR with 83% GM and 36% EBITDA — high quality niche platform","Dominant in civil infrastructure (bridges, roads, utilities) with no credible direct competitor","Seat-based but infrastructure engineering workflows are highly specialized and AI-resistant","Above $10B TEV — borderline; worth monitoring for further dislocation given 38% off 52W high","Strong recurring revenue base from E365 subscription transition provides high visibility"],
   aiRationale:["SoR for infrastructure engineering — deeply embedded in civil design and simulation workflows","Infrastructure engineering is among the most complex technical domains — AI cannot replicate full workflow","83% gross margins reflect high software value delivery in a specialized professional market","Seat-based but civil engineering requires licensed professionals — seat compression from AI is very slow","Low risk: specialized infrastructure engineering workflows with regulatory sign-off requirements limit AI displacement"]},
  {name:"Guidewire Software",vertical:"Financial Services",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:12184,ntmRev:1540,growth:16,gm:66,ebitda:24,cagr:19,ntmRevX:7.9,peFit:"Medium-High",aiRisk:"Low",avoid:false,
   desc:"Core insurance platform (PolicyCenter, BillingCenter, ClaimCenter) for property & casualty insurers globally. Mission-critical SoR requiring decade-long implementation cycles with deep carrier integration across policy, billing, and claims. Seat-based subscription transitioning to cloud with improving recurring revenue visibility.",
   sd:{sharePrice:144.50,sharesOut:87,marketCap:12619,netDebt:716-1151},
   thesis:["Dominant P&C insurance core platform SoR — mission critical with decade-long implementation cycles","16% growth with 19% N3Y CAGR demonstrates consistent execution in a sticky, regulated niche","Cloud transition underway — recurring revenue mix growing, improving visibility and margin profile","45% off 52W high creates an interesting entry point despite being above our $10B TEV threshold","Low AI risk in a deeply regulated insurance core system makes this a durable compounder"],
   aiRationale:["Core insurance SoR — policy, billing, and claims administration deeply embedded across carriers","P&C insurance regulatory complexity makes replacement of core systems extremely rare and slow","AI enhances underwriting analytics within Guidewire's ecosystem rather than threatening the core platform","Seat-based but insurance regulatory workflows require human accountability — AI compresses back-office not SoR","Low risk: insurance regulatory requirements and implementation complexity protect the core platform durably"]},
  {name:"Nemetschek",vertical:"Construction & Design",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:9493,ntmRev:1626,growth:14,gm:97,ebitda:33,cagr:19,ntmRevX:5.8,peFit:"Medium-High",aiRisk:"Low",avoid:false,
   desc:"Portfolio of AEC software brands (Allplan, Vectorworks, Bluebeam, dRofus) covering architecture, engineering, and construction design workflows. Particularly dominant across European markets with near-100% gross margins reflecting pure software delivery. Usage-based subscription with revenue tied to project activity.",
   sd:{sharePrice:79.93,sharesOut:114,marketCap:9134,netDebt:570-211},
   thesis:["97% gross margin AEC software SoR — best gross margin in the entire screen by a wide margin","Usage-based model with 19% N3Y CAGR demonstrates consistent compounding in a defensible niche","Just below $10B TEV — relevant for our screening universe with strong financial characteristics","50% off 52W high creates a compelling entry point for a high-quality European construction software platform","Low AI risk given SoR status and specialized AEC workflows"],
   aiRationale:["SoR for architecture, engineering, and construction design workflows across Europe","97% gross margins reflect pure software delivery — AI enhances but does not displace core BIM workflows","Usage-based model means revenue tied to project activity, not headcount — insulated from AI compression","European regulatory environment for construction is highly prescriptive — slows AI adoption meaningfully","Low risk: AEC SoR status, usage-based pricing, and European regulatory protection combine for strong moat"]},
  {name:"Manhattan Associates",vertical:"Supply Chain",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:8082,ntmRev:1162,growth:6,gm:60,ebitda:35,cagr:6,ntmRevX:7.0,peFit:"Medium",aiRisk:"Low-Medium",avoid:false,
   desc:"Supply chain execution software covering warehouse management (WMS), order management (OMS), and inventory optimization for retail and logistics enterprises. The SoR for omnichannel fulfillment operations at major retailers globally with a cloud transition largely complete. Usage-based model tied to transaction volumes processed.",
   sd:{sharePrice:138.30,sharesOut:60,marketCap:8349,netDebt:61-329},
   thesis:["Dominant supply chain SoR with 60% GM and 35% EBITDA — mission critical for retail and logistics","Cloud transition largely complete with high recurring revenue mix and strong retention","Just below $10B TEV — within our screening universe; 39% off 52W high creates potential entry","6% growth is below peers but reflects a mature, highly penetrated install base","Usage-based model with net cash position provides additional financial flexibility"],
   aiRationale:["SoR for warehouse management, order management, and supply chain execution — deeply embedded","Supply chain complexity means AI optimizes within Manhattan's platform rather than replacing it","60% GM reflects meaningful services component — partially insulates from pure software AI disruption","Usage-based but tied to transaction volumes — AI efficiency gains increase throughput not compress revenue","Low-medium risk: SoR status strong but services mix and lower GM create some vulnerability"]},
  {name:"Procore Technologies",vertical:"Construction Tech",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:7617,ntmRev:1250,growth:10,gm:82,ebitda:20,cagr:15,ntmRevX:6.1,peFit:"Medium-High",aiRisk:"Medium",avoid:false,
   desc:"Cloud-based construction project management platform covering project financials, quality, safety, and field operations for general contractors, specialty contractors, and project owners. The dominant SoR for construction project execution globally, used across 16,000+ customer organizations on billion-dollar infrastructure and commercial projects. Seat-based subscription priced per user with strong net revenue retention as customers expand across projects.",
   sd:{sharePrice:55.29,sharesOut:150,marketCap:8306,netDebt:79-768},
   thesis:["Dominant construction SoR with 82% GM — mission-critical for billion-dollar project delivery where switching mid-project is not an option","10% NTM growth at 6.1x NTM Rev — deceleration from hypergrowth now priced in; story shifts to margin expansion from 20% toward 35%+ over hold","Clear PE margin expansion thesis: remove public market scrutiny and quarterly earnings pressure to accelerate profitability without growth sacrifice","International expansion (UK, Australia, EMEA) at early penetration — meaningful organic growth vector with no additional product investment required","Net cash position (~$690M) de-risks LBO leverage and provides optionality for bolt-on M&A within the construction tech ecosystem"],
   aiRationale:["SoR for construction project management — covers scheduling, RFIs, submittals, change orders, and financial management across the full project lifecycle","Seat-based creates compression risk but construction workflows require coordination across hundreds of stakeholders per project — AI cannot easily replace the coordination layer","Physical construction complexity limits AI displacement: site conditions, permitting, subcontractor dependencies, and regulatory inspections are highly variable and human-judgment-intensive","AI tools targeting construction (Buildots, OpenSpace) focus on site monitoring and progress tracking — adjacent to Procore's PM workflows, not substitutive","Medium risk: SoR status and construction workflow complexity provide meaningful protection; seat-based pricing in a moderately AI-exposed segment"]},
  {name:"Clearwater Analytics",vertical:"Financial Services",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:7133,ntmRev:973,growth:27,gm:79,ebitda:35,cagr:35,ntmRevX:7.3,peFit:"High",aiRisk:"Low",avoid:true,
   desc:"Cloud-native investment accounting and analytics platform for insurance companies, asset managers, and institutional investors. Deep SoR for portfolio reporting, regulatory compliance, and middle/back-office operations with migrations taking 2–3 years. AUM-based SaaS model where revenue compounds naturally as client portfolios grow.",
   sd:{sharePrice:23.50,sharesOut:271,marketCap:6364,netDebt:860-91},
   thesis:["Already taken private — no longer a public market opportunity","Exceptional business quality: 35% N3Y CAGR, 35% EBITDA, and cloud-native investment accounting SoR","AUM-based pricing model created durable compounding revenue decoupled from headcount","Strong financial SoR moat with 2–3 year implementation cycles and extreme switching costs","Shown for reference / comparable analysis only"],
   aiRationale:["Deep SoR for investment accounting — authoritative data source for portfolio analytics globally","Regulatory reporting requirements (SEC, IFRS) create structural demand independent of AI trends","AI augments analyst productivity within the platform rather than displacing the accounting SoR","Switching costs extreme — clients embed Clearwater into middle/back office; migrations take 2–3 years","Usage-based AUM model means revenue grows with markets and assets not headcount"]},
  {name:"ServiceTitan",vertical:"Field Services",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:6520,ntmRev:1108,growth:15,gm:74,ebitda:12,cagr:18,ntmRevX:5.9,peFit:"Medium",aiRisk:"Medium",avoid:false,
   desc:"Field service management platform for home services trades (HVAC, plumbing, electrical, roofing) covering scheduling, dispatch, invoicing, and financing. The dominant SoR for SMB field service businesses in North America with embedded payments revenue. Seat-based subscription charged per technician or office user.",
   sd:{sharePrice:73.50,sharesOut:92,marketCap:6797,netDebt:165-443},
   thesis:["Dominant field services SoR with 15% growth and 74% GM — high quality underlying business","43% off 52W high represents meaningful dislocation for a category-defining platform","Key PE challenge: only 12% EBITDA requires significant operational improvement for attractive returns","18% N3Y CAGR demonstrates consistent growth with significant runway in fragmented SMB market","Take-private could accelerate profitability improvement by removing growth-at-all-costs pressure"],
   aiRationale:["Field service SoR for HVAC, plumbing, electrical — deeply embedded in SMB operational workflows","Seat-based creates compression risk as AI scheduling and dispatch tools reduce headcount per business","SMB customers in field services are historically slow to adopt — limits near-term AI disruption","AI dispatching tools are emerging but lack ServiceTitan's workflow integration and ecosystem depth","Medium risk: SoR status provides protection but seat-based in an AI-targeted scheduling workflow"]},
  {name:"AppFolio",vertical:"Real Estate / PropTech",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:6132,ntmRev:1144,growth:17,gm:64,ebitda:29,cagr:18,ntmRevX:5.4,peFit:"High",aiRisk:"Low-Medium",avoid:false,
   desc:"Property management software for residential and commercial real estate operators covering leasing, maintenance, accounting, screening, and payments. The SoR for SMB property managers with a payments flywheel that grows as portfolios scale. Usage-based model with fees tied to units under management and payment volumes.",
   sd:{sharePrice:175.68,sharesOut:36,marketCap:6346,netDebt:38-251},
   thesis:["Dominant SMB property management SoR with usage-based payments revenue flywheel","Strong 18% N3Y CAGR with 17% NTM growth demonstrates consistent execution and durable demand","45% off 52W high — significant dislocation for a high-quality profitable compounder","Usage-based payments creates natural growth as property portfolios scale over time","Clear margin expansion from 29% toward 40% EBITDA as software mix grows vs. lower-margin services"],
   aiRationale:["SoR for SMB property management with deeply embedded lease, maintenance, and accounting workflows","Usage-based payments and inspection revenue decouples growth from pure seat expansion","AI tools for property management are emerging but lack the integrated workflow depth AppFolio has built","SMB customers are historically slower to adopt AI tools extending incumbent platform runway","Some risk that AI-native leasing and tenant communication tools erode peripheral feature value"]},
  {name:"Waystar",vertical:"Healthcare RCM",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:6129,ntmRev:1309,growth:16,gm:68,ebitda:41.7,cagr:15,ntmRevX:4.7,peFit:"High",aiRisk:"Low",avoid:false,
   desc:"Revenue cycle management (RCM) platform automating claims submission, eligibility verification, and payment posting for healthcare providers. Mission-critical workflow embedded across hospitals and physician groups with multi-year contracts and extreme switching costs. Usage-based fees on claims processed, creating revenue tied to patient visit volumes.",
   sd:{sharePrice:26.07,sharesOut:182,marketCap:4740,netDebt:1491-102},
   thesis:["Most attractive valuation in top tier — 4.7x NTM Rev with 42% EBITDA, best margin/multiple combination","Usage-based model tied to claims volume provides recurring revenue with healthcare inflation tailwind","Mission-critical RCM workflow with extreme switching costs and multi-year contract structures","16% NTM growth with 15% N3Y CAGR demonstrates consistent durable execution trajectory","Significant whitespace for margin expansion and cross-sell of adjacent RCM modules post-acquisition"],
   aiRationale:["Healthcare RCM highly regulated — HIPAA, payer contracts, CMS rules create structural barriers","AI likely to enhance claims processing automation within Waystar rather than replace the platform","Usage-based model means revenue is transaction-driven not seat-driven — insulated from compression","Payer-provider complexity in US healthcare creates durable dependency AI cannot easily replicate","No credible AI-native competitor has achieved meaningful enterprise RCM scale to date"]},
  {name:"CCC Intelligent Solutions",vertical:"Auto Insurance",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:5167,ntmRev:1169,growth:9,gm:77,ebitda:42,cagr:10,ntmRevX:4.4,peFit:"High",aiRisk:"Low",avoid:false,
   desc:"AI-native platform connecting the entire auto insurance claims ecosystem — insurers, repairers, OEMs, and parts suppliers — across 35,000+ connected businesses. The SoR for collision repair estimates and claims processing with deep network effects that took decades to build. Usage-based transaction fees scaling with auto claims volume.",
   sd:{sharePrice:5.90,sharesOut:660,marketCap:3892,netDebt:1386-111},
   thesis:["Best AI resilience and valuation combo — SoR, usage-based, 42% EBITDA at only 4.4x NTM Rev","AI-native platform already monetizing ML — positioned to benefit from AI adoption not be disrupted","42% EBITDA with path to 45%+ provides strong debt service capacity and margin expansion runway","Network effects between 35,000+ connected businesses create near-impossible switching costs","Low growth (9%) understates earnings power — capital-light high-FCF model ideal for PE yield strategy"],
   aiRationale:["Already AI-native — ML embedded in claims processing, damage estimation, and workflow automation","SoR for the entire auto insurance claims ecosystem; AI is a product tailwind not a competitive threat","Usage-based model means AI efficiency gains grow volume rather than shrink revenue","Network effects between 35,000+ insurers, repairers, and OEMs create a moat AI cannot replicate","Regulatory complexity in auto insurance claims slows displacement of deeply embedded incumbent platforms"]},
  {name:"Doximity",vertical:"Healthcare",sor:false,seat:true,pricing:"Seat-Based",peOwned:false,tev:4254,ntmRev:696,growth:9,gm:90,ebitda:54,cagr:10,ntmRevX:6.1,peFit:"Low-Medium",aiRisk:"High",avoid:true,
   desc:"Professional network and communication platform for U.S. physicians covering secure messaging, telehealth, and continuing medical education. Monetizes primarily through pharmaceutical digital marketing to the physician network rather than physician subscriptions. Seat-based revenue charged to pharma advertisers per physician reached.",
   sd:{sharePrice:25.23,sharesOut:204,marketCap:5157,netDebt:12-916},
   thesis:["Exceptional margins (90% GM, 54% EBITDA) are the only compelling financial characteristic","Not a SoR and seat-based in a category directly in AI's crosshairs","66% off 52W high but multiple still elevated — not cheap enough to compensate for AI risk","AI disruption risk is existential not gradual — physician workflow automation is AI's highest priority","Avoid: high AI risk, elevated valuation, and seat-based model makes this uninvestable for take-private PE"],
   aiRationale:["Physician communications platform — not a SoR, core workflows highly exposed to AI agents","AI clinical communication and ambient documentation tools directly target Doximity's core use case","Seat-based in a category where AI explicitly reduces physician administrative burden","Multiple well-funded AI competitors (Nuance DAX, Suki, Nabla) targeting physician workflow at scale","High risk: not a SoR, seat-based pricing, and direct AI competition makes this very difficult to underwrite"]},
  {name:"Q2 Holdings",vertical:"Financial Services",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:3049,ntmRev:890,growth:10,gm:60,ebitda:26,cagr:11,ntmRevX:3.4,peFit:"Medium",aiRisk:"Medium",avoid:false,
   desc:"Digital banking platform providing online and mobile banking experiences for community banks and credit unions. Covers retail banking, business banking, and lending workflows that sit above the core banking system. Usage-based model with fees tied to registered digital banking users and transaction volumes.",
   sd:{sharePrice:48.71,sharesOut:64,marketCap:3137,netDebt:346-434},
   thesis:["Reasonable digital banking platform at 3.4x NTM with improving profitability trajectory","Usage-based model and community bank focus provide durable revenue with low churn","49% off 52W high creates an attractive entry relative to historical trading range","10% growth with 11% N3Y CAGR demonstrates consistent execution in a regulated niche","Primary concern is not being a SoR — mitigated by deep core banking workflow integration"],
   aiRationale:["Digital banking platform for community banks — regulated environment slows AI disruption near-term","Not a core SoR — sits above core banking making it more replaceable than a true system of record","AI could enable larger banks to offer competing white-label solutions to community institutions","Usage-based model provides resilience but 60% GM is below software peers in this screen","Medium risk — regulatory complexity protects near-term but AI-native fintech alternatives are scaling"]},
  {name:"Blackbaud",vertical:"Education / Nonprofit",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:2622,ntmRev:1180,growth:4,gm:62,ebitda:37,cagr:2,ntmRevX:2.2,peFit:"Medium",aiRisk:"Medium",avoid:false,
   desc:"Nonprofit software suite covering fundraising (Raiser's Edge), donor management, and financial management for nonprofits, universities, and faith organizations. The SoR for large enterprise nonprofit operations with deeply embedded multi-year contracts. Seat-based subscription across a broad product portfolio serving 45,000+ organizations.",
   sd:{sharePrice:48.60,sharesOut:47,marketCap:2265,netDebt:1116-759},
   thesis:["Very low multiple at 2.2x NTM with 37% EBITDA — one of cheapest quality businesses in screen","Nonprofit SoR with high switching costs in large enterprise clients — durable revenue despite slow growth","Take-private rationale: remove public overhang, execute cost optimization without quarterly scrutiny","32% off 52W high with stable cash flows — strong yield/dividend recapitalization candidate","Primary risk is 2% N3Y CAGR and seat-based model in an AI-disrupted fundraising market"],
   aiRationale:["Nonprofit SoR with embedded donor management and fundraising workflows in large enterprise clients","Seat-based creates compression risk as AI fundraising tools proliferate","AI-native fundraising platforms are gaining traction in mid-market nonprofits","Low N3Y CAGR of 2% suggests competitive pressure already manifesting","Mitigant: large enterprise nonprofit clients have high switching costs and multi-year contracts"]},
  {name:"nCino",vertical:"Financial Services",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:2083,ntmRev:644,growth:8,gm:67,ebitda:26,cagr:9,ntmRevX:3.2,peFit:"Medium",aiRisk:"Low-Medium",avoid:false,
   desc:"Bank operating system built on the Salesforce platform for loan origination, account opening, and relationship management at commercial banks and credit unions. The SoR for commercial lending workflows at community and regional banks globally. Usage-based model tied to loan origination volumes and active banker seats.",
   sd:{sharePrice:16.52,sharesOut:119,marketCap:1967,netDebt:237-121},
   thesis:["Bank operating system SoR with usage-based model at an attractive 3.2x NTM — good value in defensible niche","Regulatory protective moat in banking IT makes this a durable high-switching-cost business","49% off 52W high despite stable fundamentals — sector dislocation creating an entry opportunity","Growth decelerating to 8% is a concern but margin expansion from 26% provides earnings upside","Smaller scale ($2.1B TEV) limits competition from largest PE funds — less competitive auction likely"],
   aiRationale:["Bank operating SoR built on Salesforce — regulatory environment highly protective of incumbent vendors","AI augments loan underwriting within nCino's platform rather than displacing the SoR itself","Usage-based with no seat compression risk — revenue tied to loan origination volume","Financial regulatory complexity makes bank IT replacement decisions extremely slow and costly","Some risk that Salesforce AI tools erode nCino's differentiation over time"]},
  {name:"Agilysys",vertical:"Travel / Hospitality",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:2020,ntmRev:359,growth:14,gm:64,ebitda:22,cagr:15,ntmRevX:5.6,peFit:"Medium",aiRisk:"Low-Medium",avoid:false,
   desc:"Hospitality management software (PMS, POS) for hotels, resorts, casinos, and cruise lines covering reservations, room management, F&B, and payment processing. The SoR for upscale and resort hospitality operations with usage-based payments revenue growing alongside transaction volumes. Usage-based model with fees tied to property transactions and bookings.",
   sd:{sharePrice:73.68,sharesOut:28,marketCap:2046,netDebt:47-73},
   thesis:["Niche hospitality SoR with usage-based payments providing a durable compounding revenue stream","Strong 14% growth and 15% N3Y CAGR with significant margin expansion runway from 22% EBITDA","48% off 52W high creates an attractive entry point for a high-quality niche platform","Key limitation: small scale ($359M NTM revenue) may not justify standalone large-cap PE attention","Most attractive as a bolt-on to a broader hospitality or travel software platform"],
   aiRationale:["Hospitality SoR (PMS/POS) with usage-based payments — embedded in hotel and resort operations","AI enhances guest experience features but unlikely to displace core property management infrastructure","Physical hospitality operations create strong dependency on integrated SoR with local support","Usage-based payments revenue grows with transaction volume insulating from headcount compression","Some risk from AI-native hospitality startups targeting independent hotels at the margin"]},
  {name:"Alkami Technology",vertical:"Financial Services",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:1869,ntmRev:543,growth:19,gm:65,ebitda:19,cagr:23,ntmRevX:3.4,peFit:"Medium",aiRisk:"Medium",avoid:false,
   desc:"Cloud-native digital banking platform (retail and business banking) for credit unions and community banks. Competes directly with Q2 in the community financial institution segment with a modern, API-first architecture. Usage-based model with fees tied to registered digital banking users across the client base.",
   sd:{sharePrice:15.40,sharesOut:104,marketCap:1600,netDebt:369-99},
   thesis:["High organic growth at 19% NTM / 23% N3Y CAGR — compelling growth story at only 3.4x NTM","Usage-based model provides revenue resilience without headcount compression risk","51% off 52W high creates attractive growth-at-reasonable-price entry with asymmetric upside","Clear path to significantly higher EBITDA margins from current 19% as scale accrues","Key risk: not a SoR in a competitive digital banking market — must underwrite growth sustainability"],
   aiRationale:["Digital banking for credit unions and community banks — regulated environment provides near-term protection","Not a core SoR — sits in the digital experience layer above core banking","AI could enable community banks to build better experiences in-house using LLM tooling","23% N3Y CAGR is strong but AI-native fintech competition is an emerging headwind","Medium risk: regulatory complexity protects near term but digital banking UX is disruption-prone"]},
  {name:"Intapp",vertical:"Financial Services / Legal",sor:true,seat:true,pricing:"Seat-Based",peOwned:false,tev:1621,ntmRev:624,growth:14,gm:78,ebitda:22,cagr:15,ntmRevX:2.6,peFit:"Medium",aiRisk:"Medium-High",avoid:false,
   desc:"Professional services platform covering conflict checking, time tracking, billing, and compliance for law firms, accounting firms, and investment banks. The SoR for professional services risk and compliance workflows in regulated industries with embedded multi-year enterprise contracts. Seat-based subscription charged per professional.",
   sd:{sharePrice:22.50,sharesOut:85,marketCap:1912,netDebt:23-313},
   thesis:["Deep discount at 66% of 52W high — most dislocated SoR at only 2.6x NTM Revenue","SoR status in compliance-heavy professional services workflows provides near-term switching cost protection","14% growth and 78% GM demonstrate solid underlying business quality despite valuation dislocation","Contrarian value opportunity if AI risk can be managed through continued product investment","Key question: can compliance workflow stickiness outlast AI-driven headcount compression in legal/PE clients?"],
   aiRationale:["SoR for professional services compliance — embedded in conflict checking and time/billing workflows","Seat-based in the sector with highest AI disruption exposure — legal and PS headcount is AI's primary target","AI legal tools (Harvey, Clio) are gaining significant traction and directly pressuring seat counts","Professional services firms are actively reducing headcount with AI — seat compression risk is near-term","Mitigant: compliance and conflict management workflows have regulatory requirements slowing AI displacement"]},
  {name:"Alfa Financial Software",vertical:"Financial Services",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:751,ntmRev:186,growth:8,gm:64,ebitda:33,cagr:12,ntmRevX:4.0,peFit:"Medium",aiRisk:"Low",avoid:false,
   desc:"Asset finance origination and servicing platform for auto, equipment, and real estate lenders at global banks and captive finance companies. The SoR for asset finance portfolio management with multi-year implementation cycles and deep regulatory integration. Usage-based model tied to portfolio activity and loan counts.",
   sd:{sharePrice:2.59,sharesOut:294,marketCap:762,netDebt:9-21},
   thesis:["Niche asset finance SoR with 64% GM and 33% EBITDA at 4.0x NTM — attractive value","Deeply embedded in auto, equipment, and asset finance workflows across global banks","23% off 52W high with stable fundamentals — limited dislocation but solid value","Small scale ($751M TEV) limits standalone PE interest — most attractive as a bolt-on","Usage-based model and SoR status provide strong revenue durability in a specialized niche"],
   aiRationale:["SoR for asset finance origination and servicing — deeply embedded in bank workflows globally","Asset finance regulatory complexity and audit requirements create structural barriers to AI displacement","Usage-based model tied to portfolio activity rather than headcount — insulated from seat compression","No credible AI-native competitor has penetrated the specialized asset finance SoR market","Low risk: specialized regulated financial services niche with high switching costs and usage-based model"]},
  {name:"SiteMinder",vertical:"Travel / Hospitality",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:655,ntmRev:228,growth:27,gm:66,ebitda:14,cagr:24,ntmRevX:2.9,peFit:"Low-Medium",aiRisk:"Medium",avoid:true,
   desc:"Hotel channel management and distribution platform connecting independent hotels and chains to OTAs, GDS, and direct booking channels. Sits above the core PMS as a distribution layer rather than a deep SoR for hotel operations. Usage-based model tied to bookings and reservations processed.",
   sd:{sharePrice:2.48,sharesOut:274,marketCap:679,netDebt:9-33},
   thesis:["High growth (27% NTM, 24% N3Y CAGR) and usage-based at 2.9x NTM is superficially attractive","Too small ($655M TEV) — fails minimum scale threshold for most large-cap PE funds","51% off 52W high but 14% EBITDA leaves insufficient margin for significant LBO debt service","Most appropriate as a bolt-on to a broader travel technology platform","Avoid as standalone: insufficient scale and not a SoR in a competitive hospitality niche"],
   aiRationale:["Hotel channel management — usage-based and high growth but not a deep SoR","AI-native booking optimization and channel management tools proliferating globally","Disintermediation risk from AI-powered direct booking platforms could erode demand","Usage-based model provides resilience but the use case is more replicable than a true SoR","Medium risk: high growth provides near-term resilience but long-term defensibility is uncertain"]},
  {name:"Blend Labs",vertical:"Financial Services",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:544,ntmRev:152,growth:20,gm:77,ebitda:22,cagr:3,ntmRevX:3.6,peFit:"Low",aiRisk:"High",avoid:true,
   desc:"Digital lending platform for mortgage origination and consumer banking covering application, verification, and closing workflows. Targets banks and credit unions to digitize the mortgage loan process end-to-end. Usage-based model with fees tied to loan application volumes processed.",
   sd:{sharePrice:1.74,sharesOut:290,marketCap:502,netDebt:145-103},
   thesis:["Too small ($544M TEV), not a SoR, facing direct AI disruption in mortgage origination","3% N3Y CAGR vs 20% NTM growth implies highly back-weighted forecast — credibility concern","Usage-based is the only positive but insufficient to offset existential platform risk","AI-native mortgage platforms scaling rapidly and targeting Blend's core workflow","Avoid: fails minimum scale, not a SoR, and high AI risk — fails multiple criteria simultaneously"],
   aiRationale:["Mortgage origination workflow tool — not a SoR, directly in AI's crosshairs for automation","AI-native mortgage platforms explicitly targeting this workflow with well-funded alternatives","3% N3Y CAGR confirms organic stagnation despite the 20% NTM figure — credibility concern","Usage-based is a positive but cannot offset the fundamental AI disruption risk","High risk: mortgage origination automation is one of the most advanced AI applications in financial services"]},
  // ── DATA & ANALYTICS ──
  {name:"Fair Isaac (FICO)",vertical:"Financial Services",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:36380,ntmRev:2665,growth:21,gm:85,ebitda:62,cagr:19,ntmRevX:13.7,peFit:"Low",aiRisk:"Medium",avoid:false,
   desc:"Predictive analytics company best known for the FICO Score — the de facto regulatory standard in US consumer credit decisioning used by virtually all lenders. Also provides software for fraud detection, customer management, and decision optimization across financial services. Usage-based fees on score inquiries and decision analytics volumes.",
   sd:{sharePrice:1398.32,sharesOut:24,marketCap:33422,netDebt:3092-134},
   thesis:["Exceptional business quality — 85% GM and 62% EBITDA with 21% growth at scale","FICO Score is a near-monopoly in US credit decisioning — durable regulatory moat","Way above $10B TEV — not a PE take-private candidate; pure public market benchmark","Usage-based model tied to credit transactions provides durable compounding revenue","Included for benchmark purposes — comparable for financial services software quality metrics"],
   aiRationale:["FICO Score is a regulatory standard in US lending — AI cannot easily displace a regulatory mandate","Usage-based model means AI efficiency in credit decisioning grows transaction volume not compresses revenue","Platform analytics layer faces more AI competition than the core score — bifurcated risk profile","Medium risk on platform analytics; low risk on core FICO score which is regulatory infrastructure","Overall medium risk: core score is protected but analytics platform faces AI-native competition"]},
  {name:"Broadridge Financial",vertical:"Financial Services",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:24699,ntmRev:7574,growth:5,gm:31,ebitda:25,cagr:6,ntmRevX:3.3,peFit:"Low",aiRisk:"Medium",avoid:false,
   desc:"Financial services infrastructure for proxy voting, investor communications, and capital markets post-trade processing. Covers corporate actions, trade settlement, and regulatory communications for broker-dealers and asset managers globally. Usage-based model with revenue tied to trade and shareholder communication volumes.",
   sd:{sharePrice:184.43,sharesOut:118,marketCap:21802,netDebt:3459-562},
   thesis:["Large financial services infrastructure business — proxy clearing and investor communications","Low GM (31%) reflects significant services component — not a pure software business","Above $10B TEV with 5% growth — limited PE take-private appeal at this scale and profile","Usage-based model tied to trade volumes provides durable infrastructure-like revenue","Benchmark for financial services infrastructure — relevant for comparable analysis"],
   aiRationale:["Proxy voting and investor communications infrastructure — not a SoR but critical market infrastructure","Regulatory requirements around proxy voting create durable demand independent of AI trends","31% gross margins reflect services-heavy model — less exposed to pure AI software disruption","Usage-based model tied to trade and communication volumes rather than headcount","Medium risk: infrastructure nature protects but services layer faces AI efficiency pressure"]},
  {name:"FactSet Research Systems",vertical:"Financial Data",sor:false,seat:true,pricing:"Seat-Based",peOwned:false,tev:9247,ntmRev:2513,growth:5,gm:52,ebitda:39,cagr:5,ntmRevX:3.7,peFit:"Low-Medium",aiRisk:"High",avoid:true,
   desc:"Financial data and analytics terminal aggregating market data, company financials, estimates, and research for investment professionals. Competes with Bloomberg and Refinitiv in the financial data terminal market. Seat-based subscription charged per analyst or portfolio manager.",
   sd:{sharePrice:214.81,sharesOut:37,marketCap:8050,netDebt:1559-362},
   thesis:["Low multiple at 3.7x NTM with 39% EBITDA but growth at 5% with no acceleration catalyst","Seat-based in the category AI most directly targets — financial research synthesis is a core LLM capability","55% off 52W high but insufficient discount to compensate for structural AI disruption risk","Declining growth reflects early-stage demand destruction from AI — likely to accelerate not stabilize","Avoid: seat-based financial data terminal facing existential AI competition is not a defensible PE underwrite"],
   aiRationale:["Financial data terminal — seat-based, directly in the crosshairs of AI-powered financial research tools","LLMs replicate financial data synthesis and research workflows that FactSet charges per seat to access","Bloomberg, Refinitiv, and AI-native startups (Tegus, AlphaSense) investing heavily to displace legacy terminals","Seat-based in an environment where AI explicitly reduces analysts needed per portfolio","High risk: financial research synthesis is exactly what LLMs are best at — structural demand destruction"]},
  {name:"Sportradar",vertical:"Sports Tech",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:5331,ntmRev:1908,growth:21,gm:75,ebitda:26,cagr:21,ntmRevX:2.8,peFit:"Medium",aiRisk:"Medium",avoid:false,
   desc:"Sports data and analytics company providing real-time data feeds, odds compiling, and integrity services to sports leagues, broadcasters, and betting operators globally. Holds exclusive data rights with major sports leagues creating a structural moat that AI cannot easily replicate. Usage-based data licensing model tied to content consumption and betting volumes.",
   sd:{sharePrice:18.32,sharesOut:308,marketCap:5643,netDebt:48-361},
   thesis:["High growth sports data platform at 2.8x NTM — compelling value for 21% growth","Usage-based model tied to sports data licensing and live odds — durable sports betting tailwind","42% off 52W high creates an attractive entry point for a high-growth niche platform","Not a SoR but exclusive sports data rights create significant competitive moat","PE take-private candidate — sports betting tailwind, improving margins, reasonable entry valuation"],
   aiRationale:["Sports data and odds platform — usage-based with exclusive data rights creating competitive moat","AI enhances real-time sports analytics within Sportradar's platform rather than threatening it","Exclusive data rights from sports leagues create a structural barrier AI cannot easily replicate","Usage-based model tied to data licensing and betting volumes — not exposed to headcount compression","Medium risk: not a SoR but exclusive data rights and usage-based model provide meaningful protection"]},
  // ── HYBRID VSaaS ──
  {name:"Synopsys",vertical:"Construction & Design",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:90364,ntmRev:9960,growth:26,gm:83,ebitda:41,cagr:20,ntmRevX:9.1,peFit:"Low",aiRisk:"Low-Medium",avoid:false,
   desc:"Electronic design automation (EDA) software for semiconductor chip design covering synthesis, simulation, verification, and IP alongside Cadence as the two dominant platforms globally. AI chip design is built on top of Synopsys tools, making AI a demand driver rather than a threat. Usage-based model tied to design activity and chip complexity.",
   sd:{sharePrice:428,sharesOut:185,marketCap:79036,netDebt:14293-2966},
   thesis:["EDA software leader — mission critical for semiconductor design with near-monopoly market position","26% growth with 83% GM and 41% EBITDA — exceptional quality at scale","Way above $10B TEV — not a PE take-private candidate; pure public market benchmark","AI chip design tools being developed on top of Synopsys platform — AI is a tailwind","Included for benchmark purposes — best-in-class EDA software quality and moat"],
   aiRationale:["EDA software — not a traditional SoR but mission critical for semiconductor design workflows","AI chip design requires EDA tools — AI is a demand driver not a displacement threat for Synopsys","Usage-based model tied to design complexity and chip volume — grows with AI semiconductor demand","83% gross margins reflect high software value delivery in an extremely specialized technical domain","Low-medium risk: AI is a tailwind for EDA demand but some risk from AI-native design tools emerging"]},
  {name:"Axon Enterprise",vertical:"GovTech",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:45179,ntmRev:3753,growth:29,gm:63,ebitda:26,cagr:31,ntmRevX:12.0,peFit:"Low",aiRisk:"Low",avoid:false,
   desc:"Public safety technology platform combining Taser devices, body cameras, and cloud software (Evidence.com) for law enforcement agencies globally. AI tools for evidence management, body cam analysis, and dispatch are embedded as premium add-ons driving ARPU expansion. Usage-based hardware/software/cloud model tied to officer counts and evidence storage.",
   sd:{sharePrice:547,sharesOut:82,marketCap:45015,netDebt:1910-1746},
   thesis:["Public safety platform with 29% growth and 31% N3Y CAGR — exceptional compounding","Usage-based hardware/software/cloud model tied to law enforcement adoption","Way above $10B TEV — not a PE take-private candidate; included for benchmark purposes","AI is an explicit product tailwind — Axon AI tools for evidence management command premium pricing","37% off 52W high but TEV way too large for PE take-private consideration"],
   aiRationale:["Public safety platform — usage-based with government contracts creating extreme revenue durability","AI enhances evidence management, body cam analysis, and dispatch optimization within Axon's platform","Government procurement creates structural moat — no AI-native competitor has law enforcement relationships","Usage-based model tied to device and software adoption rather than headcount","Low risk: government relationships, regulatory approvals, and usage-based model create strong protection"]},
  {name:"Constellation Software",vertical:"Diversified VSaaS",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:43200,ntmRev:13813,growth:16,gm:29,ebitda:29,cagr:16,ntmRevX:3.1,peFit:"Low",aiRisk:"Low-Medium",avoid:false,
   desc:"Decentralized acquirer of vertical market software (VMS) businesses across public sector, healthcare, and industrial niches. Owns 800+ niche software companies managed through autonomous business units with a disciplined buy-and-hold acquisition philosophy. Diverse usage-based and subscription revenue across a highly fragmented portfolio.",
   sd:{sharePrice:1897,sharesOut:21,marketCap:40661,netDebt:4533-1994},
   thesis:["Diversified vertical software acquirer — 16% growth through disciplined M&A compounding","Decentralized operating model creates durable returns through portfolio of niche VMS businesses","Way above $10B TEV — not a PE take-private candidate; benchmark for diversified VMS strategy","29% EBITDA across a diversified portfolio of >800 vertical software businesses","Included as benchmark — most relevant comp for PE roll-up strategies in vertical software"],
   aiRationale:["Diversified VMS acquirer — SoR status varies by subsidiary but overall portfolio is deeply embedded","Decentralized model means AI risk is distributed across hundreds of niche verticals","Usage-based mix across portfolio provides partial insulation from headcount compression","16% growth through M&A means organic AI disruption risk is partially offset by acquisition pace","Low-medium risk: portfolio diversification limits single-point AI disruption but some subs are exposed"]},
  {name:"Dassault Systemes",vertical:"Construction & Design",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:27027,ntmRev:7599,growth:2,gm:85,ebitda:35,cagr:7,ntmRevX:3.6,peFit:"Low",aiRisk:"Low",avoid:false,
   desc:"3D design and PLM software platform (3DEXPERIENCE) for manufacturing, life sciences, and aerospace companies with products including CATIA, SIMULIA, and ENOVIA. The global SoR for product lifecycle management from design through manufacturing and regulatory submission. Usage-based subscription tied to module adoption and user activity.",
   sd:{sharePrice:22,sharesOut:1323,marketCap:28824,netDebt:3048-4845},
   thesis:["3DEXPERIENCE platform SoR for manufacturing and life sciences — deeply embedded globally","85% GM with 35% EBITDA at 3.6x NTM — attractive quality at a reasonable multiple","Above $10B TEV — not a PE take-private candidate; benchmark for industrial software quality","2% growth is the key concern — cloud transition and macro headwinds weighing on near-term","Net cash position of ~$1.8B provides financial flexibility for M&A and capital returns"],
   aiRationale:["SoR for product lifecycle management and simulation across manufacturing and pharma globally","AI tools embedded natively (Dassault AI) as platform enhancements rather than competitive threats","Usage-based model tied to user activity and module adoption — partially insulated from headcount","Regulatory requirements in pharma (FDA 21 CFR) create structural demand for validated PLM workflows","Low risk: SoR status, usage-based model, and regulatory protection combine for strong moat"]},
  {name:"HealthEquity",vertical:"Healthcare / Benefits",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:7436,ntmRev:1419,growth:8,gm:72,ebitda:44,cagr:8,ntmRevX:5.2,peFit:"Medium-High",aiRisk:"Low",avoid:false,
   desc:"Technology-driven health benefits administrator managing HSAs, FSAs, HRAs, and COBRA for employers and insurance carriers. AUM-based revenue model where fees grow naturally as HSA balances compound over time, creating a durable flywheel. The SoR for employer health savings benefit administration with a strong regulatory moat.",
   sd:{sharePrice:77,sharesOut:86,marketCap:6624,netDebt:1109-296},
   thesis:["Highly regulated HSA SoR with 44% EBITDA and durable AUM-based revenue — exceptional cash generation","Usage-based model tied to AUM creates natural compounding growth with market appreciation","Low AI risk in a trust-regulated financial account business provides defensible downside protection","32% off 52W high offers attractive entry relative to earnings power and long-term cash generation","Platform for adjacent benefits acquisitions — HSA, FSA, HRA, COBRA administration all addressable"],
   aiRationale:["HSA/benefits administration SoR with AUM-based revenue — structurally protected by financial regulation","Regulatory framework around HSA accounts creates durable demand independent of AI adoption trends","Financial account custody is a trust-based regulated relationship AI cannot displace without regulatory overhaul","Usage-based AUM model means revenue grows with market appreciation and contributions not headcount","AI tools for benefits optimization operate on top of — not instead of — custodial platforms"]},
  {name:"Cellebrite DI",vertical:"GovTech",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:3002,ntmRev:584,growth:19,gm:85,ebitda:27,cagr:18,ntmRevX:5.1,peFit:"High",aiRisk:"Low",avoid:false,
   desc:"Digital intelligence platform for law enforcement and government agencies to extract, analyze, and manage digital evidence from mobile devices and cloud sources. The SoR for digital forensics workflows globally with government contract revenue providing multi-year visibility. Usage-based model with AI-enhanced investigation tools driving premium pricing.",
   sd:{sharePrice:14,sharesOut:250,marketCap:3416,netDebt:23-437},
   thesis:["Unique GovTech SoR with 85% gross margins and 19% growth in a highly defensible regulated niche","Government law enforcement contracts provide extreme revenue visibility and multi-year pricing stability","AI is an explicit product tailwind — AI-enhanced investigation tools command premium pricing","Usage-based model and regulatory moat create compounding revenue with minimal historical churn","Smaller scale ($3B TEV) offers attractive entry with significant multiple expansion potential post-acquisition"],
   aiRationale:["Digital intelligence SoR for law enforcement — mission-critical in a highly regulated environment","AI enhances Cellebrite's capabilities rather than threatening the platform — faster extraction, smarter analysis","Government procurement cycles and security certifications create multi-year lock-in extremely difficult to break","No credible AI-native competitor has the regulatory approvals and law enforcement relationships Cellebrite has built","Usage-based model tied to investigation volume rather than seat count"]},
  {name:"Flywire",vertical:"Education / Healthcare",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:1297,ntmRev:729,growth:18,gm:61,ebitda:22,cagr:20,ntmRevX:1.8,peFit:"Medium",aiRisk:"Medium",avoid:false,
   desc:"Global payment platform handling complex cross-border and domestic payments for education, healthcare, and travel verticals. Processes tuition payments, medical bills, and travel invoices with currency conversion and reconciliation built in. Usage-based transaction fees on payment volumes with strong institutional relationships at universities and hospitals.",
   sd:{sharePrice:13,sharesOut:128,marketCap:1651,netDebt:1-355},
   thesis:["Very attractive at 1.8x NTM with 18% growth — significant undervaluation relative to payment peers","Usage-based model with 20% N3Y CAGR demonstrates consistent compounding growth","13% off 52W high — limited dislocation but very cheap multiple relative to growth profile","Clear margin expansion from 22% toward 40% EBITDA as international scale and mix shift builds","Key risk: not a SoR in competitive global payments — must underwrite institutional relationship durability"],
   aiRationale:["Global payments for education and healthcare — usage-based transaction-driven revenue model","Not a deep SoR — payment routing could be replicated by AI-native fintech platforms","AI-powered payment optimization tools are proliferating globally","Mitigant: strong institutional relationships with universities and hospitals create some switching costs","Medium risk: the payments layer is inherently more commoditizable than deep workflow software"]},
  {name:"GPI SpA",vertical:"Healthcare IT",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:982,ntmRev:717,growth:8,gm:96,ebitda:21,cagr:11,ntmRevX:1.4,peFit:"Medium",aiRisk:"Low",avoid:false,
   desc:"Italian healthcare IT company providing clinical information systems (CIS), digital health infrastructure, and administrative software to Italian public hospitals and regional health authorities. The SoR for Italian NHS digital health workflows in a highly regulated EU public health system. Usage-based model with GDPR and EU AI Act tailwinds protecting incumbents.",
   sd:{sharePrice:21,sharesOut:33,marketCap:690,netDebt:340-47},
   thesis:["Extraordinary 96% GM at only 1.4x NTM — exceptional unit economics at a deep value entry","Italian healthcare IT SoR with strong regulatory protection and EU AI Act tailwinds for incumbents","6% below 52W high — market has not yet identified this as a dislocated opportunity","Usage-based model with 11% N3Y CAGR provides durable compounding revenue in a protected market","Key limitations: small scale ($982M TEV), Italian concentration, 21% EBITDA leaves room for improvement"],
   aiRationale:["Italian healthcare IT SoR in a highly regulated EU public health system","AI adoption in European public healthcare is extremely slow due to regulatory and data sovereignty constraints","GDPR and EU AI Act create additional barriers to displacement of established healthcare IT vendors","Usage-based model insulates from headcount compression","Geographic concentration in Italy limits exposure to US and global AI platforms"]},
  {name:"Phreesia",vertical:"Healthcare",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:651,ntmRev:556,growth:15,gm:70,ebitda:24,cagr:13,ntmRevX:1.2,peFit:"Low-Medium",aiRisk:"Medium-High",avoid:true,
   desc:"Patient intake and engagement platform automating check-in, insurance verification, consent forms, and patient communications at the point of care. Sits at the front-desk workflow layer rather than core clinical systems, making it more replicable than a true SoR. Usage-based model with fees tied to patient visit volumes at provider clients.",
   sd:{sharePrice:12,sharesOut:58,marketCap:717,netDebt:18-84},
   thesis:["Extremely cheap at 1.2x NTM — one of the lowest multiples in the entire screen","62% off 52W high reflects deep investor concern about AI disruption to patient intake","Usage-based with 15% growth and 70% GM — business continues to grow despite AI headwinds","Distressed valuation could attract special situations or strategic buyer with adjacent workflows","Avoid for traditional PE: medium-high AI risk in an explicitly AI-targeted workflow at insufficient scale"],
   aiRationale:["Patient intake and engagement — usage-based but not a core clinical SoR","AI patient intake tools proliferating rapidly targeting this exact workflow","Patient intake is one of the most targeted healthcare AI automation use cases","Usage-based provides resilience but the core workflow is highly replicable by AI tools","Medium-high risk: not a SoR in a workflow AI is explicitly designed to automate away"]},
  // ── LOW GROWTH / OTHER ──
  {name:"SS&C Technologies",vertical:"Financial Services",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:26432,ntmRev:6771,growth:7,gm:58,ebitda:40,cagr:6,ntmRevX:3.9,peFit:"Low",aiRisk:"Low-Medium",avoid:false,
   desc:"Financial services technology and outsourcing company providing fund administration, transfer agency, and wealth management software and services to hedge funds, private equity, and asset managers. Processes $40T+ in fund assets as a mission-critical SoR for back-office operations. Usage-based model tied to AUM and transaction volumes.",
   sd:{sharePrice:75.85,sharesOut:254,marketCap:19252,netDebt:7647-467},
   thesis:["Large financial services processing SoR with 40% EBITDA and usage-based model","7% growth with stable margins — infrastructure-like cash generation profile","Above $10B TEV — not a primary PE take-private target at this scale; benchmark name","High leverage already in place (net debt ~$7.2B) limits incremental LBO capacity","Included for benchmark purposes — relevant for financial services software comparables"],
   aiRationale:["Financial services processing SoR — fund administration, transfer agency, and wealth management workflows","AI enhances processing efficiency within SS&C's platform rather than displacing the underlying SoR","58% GM reflects significant services component — partially insulates from pure AI software disruption","Usage-based model tied to AUM and transaction volumes — grows with financial markets not headcount","Low-medium risk: SoR status strong but services mix and existing leverage limit PE flexibility"]},
  {name:"PTC",vertical:"Construction & Design",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:19831,ntmRev:2901,growth:5,gm:85,ebitda:48,cagr:9,ntmRevX:6.8,peFit:"Low",aiRisk:"Low",avoid:false,
   desc:"Industrial IoT and PLM software for manufacturing companies covering product design (Creo), lifecycle management (Windchill), and connected device management (ThingWorx). The SoR for industrial product development and connected factory operations across discrete manufacturing. Usage-based subscription tied to engineering activity and device counts.",
   sd:{sharePrice:157.13,sharesOut:119,marketCap:18647,netDebt:1370-185},
   thesis:["Industrial IoT and PLM SoR with 85% GM and 48% EBITDA — exceptional profitability","5% growth reflects mature installed base but highly durable recurring revenue","Above $10B TEV — not a PE take-private candidate; benchmark for industrial software quality","Usage-based model with SoR status in manufacturing creates durable moat","Included for benchmark purposes — high-quality industrial software with strong margins"],
   aiRationale:["PLM and industrial IoT SoR — deeply embedded in manufacturing and product development workflows","AI tools embedded natively (PTC AI) as platform enhancements rather than competitive threats","85% GM and 48% EBITDA reflect high software value delivery in specialized industrial domain","Usage-based model tied to device and engineering activity rather than headcount","Low risk: industrial SoR status, usage-based model, and regulatory requirements provide strong protection"]},
  {name:"Trimble",vertical:"Construction & Design",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:17688,ntmRev:3910,growth:8,gm:72,ebitda:30,cagr:4,ntmRevX:4.5,peFit:"Low",aiRisk:"Low-Medium",avoid:false,
   desc:"Positioning and workflow software combining GPS/sensor hardware with cloud software for construction, geospatial, and agriculture applications. Portfolio transformation toward pure software subscription ongoing with hardware providing field data capture. Usage-based subscription tied to field device activity and project management workflows.",
   sd:{sharePrice:67.79,sharesOut:242,marketCap:16371,netDebt:1561-244},
   thesis:["Construction and geospatial technology platform with 72% GM and 30% EBITDA","Portfolio transformation toward pure software subscription ongoing — improving margin profile","Above $10B TEV — not a PE take-private candidate; benchmark for construction tech quality","8% growth with 4% N3Y CAGR reflects mixed portfolio of software and hardware businesses","Included for benchmark purposes — relevant comp for construction software companies"],
   aiRationale:["Construction and geospatial platform — not a single SoR but embedded across construction workflows","AI enhances positioning and workflow optimization within Trimble's platform rather than displacing it","72% GM reflects improving software mix — less exposed to pure AI software disruption than pure plays","Usage-based model tied to field activity and subscription adoption rather than headcount","Low-medium risk: not a core SoR but embedded in physical construction workflows limits near-term AI risk"]},
  {name:"Temenos",vertical:"Financial Services",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:7009,ntmRev:1155,growth:7,gm:84,ebitda:40,cagr:5,ntmRevX:6.1,peFit:"Medium",aiRisk:"Low",avoid:false,
   desc:"Core banking software platform for retail, corporate, and private banks globally covering deposits, lending, payments, and wealth management. One of two dominant global core banking SoR platforms (alongside Finastra) with extreme switching costs and decade-long implementation cycles. Usage-based model tied to banking transaction volumes and customer accounts.",
   sd:{sharePrice:91.44,sharesOut:71,marketCap:6454,netDebt:659-103},
   thesis:["Global core banking SoR with 84% GM and 40% EBITDA — high quality financial infrastructure","7% growth in a highly regulated, sticky market with extreme switching costs","14% off 52W high — limited dislocation but solid value at 6.1x NTM for a core banking SoR","Usage-based model with SoR status in banking creates extremely durable revenue","PE take-private candidate — core banking SoR with margin expansion potential under private ownership"],
   aiRationale:["Core banking SoR — mission critical for retail and commercial banking operations globally","Banking regulatory complexity (Basel, IFRS 9) makes replacement of core systems extremely rare","AI enhances banking analytics and decisioning within Temenos' ecosystem rather than displacing the core","Usage-based model tied to transaction volumes and banking activity rather than headcount","Low risk: core banking SoR status and regulatory protection provide one of the strongest moats in tech"]},
  {name:"Sabre Corporation",vertical:"Travel / Hospitality",sor:true,seat:false,pricing:"Usage-Based",peOwned:false,tev:3948,ntmRev:2938,growth:5,gm:56,ebitda:20,cagr:0,ntmRevX:1.3,peFit:"Low",aiRisk:"Medium-High",avoid:true,
   desc:"Global distribution system (GDS) connecting airlines, hotels, and travel agencies for inventory management and booking. Faces structural disruption from NDC (airline direct distribution) and AI-native travel booking platforms eroding GDS volumes. Usage-based model tied to booking and reservation volumes under secular pressure.",
   sd:{sharePrice:1.08,sharesOut:416,marketCap:450,netDebt:4410-911},
   thesis:["Deeply leveraged travel technology infrastructure company — $3.5B net debt is the key constraint","5% growth with 0% N3Y CAGR and 20% EBITDA limits PE take-private feasibility","GDS market facing structural disruption from AI-native travel booking and NDC transition","74% off 52W high reflects structural business model challenges not just market dislocation","Avoid: excess leverage, near-zero growth, and medium-high AI risk from GDS disruption"],
   aiRationale:["GDS (global distribution system) SoR for airline inventory — facing structural NDC disruption","AI-native travel booking platforms and airline direct channels are systematically bypassing GDS","Medium-high risk: NDC transition and AI direct booking are existential threats to GDS revenue model","Usage-based model provides some resilience but volumes under secular pressure from direct booking shift","Combined leverage and AI disruption risk make this uninvestable for traditional PE"]},
  {name:"Diebold Nixdorf",vertical:"Financial Services",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:3778,ntmRev:3901,growth:2,gm:27,ebitda:14,cagr:2,ntmRevX:1.0,peFit:"Low",aiRisk:"Medium",avoid:true,
   desc:"ATM hardware manufacturer and banking software provider serving financial institutions globally with physical ATM infrastructure and retail banking software. ATM market faces secular decline from digital banking adoption accelerated by AI-powered mobile banking. Usage-based model tied to ATM transaction volumes and device service contracts.",
   sd:{sharePrice:83.52,sharesOut:37,marketCap:3112,netDebt:1082-416},
   thesis:["ATM and banking hardware/software company — not a software business at 27% GM","2% growth with minimal N3Y CAGR — limited organic momentum in a declining ATM market","Despite low 1.0x NTM multiple, 14% EBITDA limits debt service capacity for LBO","Digital banking trends are secularly reducing ATM demand over the long term","Avoid: hardware-heavy business model with secular headwinds and insufficient software margins"],
   aiRationale:["Banking hardware and software — ATM market faces secular decline from digital banking adoption","AI-powered digital banking is accelerating the shift away from physical ATM infrastructure","27% gross margins reflect significant hardware component — limited software moat protection","Medium risk: not AI-disrupted in the traditional sense but faces secular hardware demand decline","Combined secular and AI risk from digital banking makes near-term revenue growth challenging"]},
  {name:"Verra Mobility",vertical:"Auto / GovTech",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:3726,ntmRev:1037,growth:5,gm:84,ebitda:40,cagr:8,ntmRevX:3.6,peFit:"Medium-High",aiRisk:"Low-Medium",avoid:false,
   desc:"Government-contracted tolling and photo enforcement platform serving municipalities, rental car companies, and toll authorities. Long-term municipal contracts (5–10 years) provide infrastructure-like revenue predictability with very high gross margins. Usage-based model tied to vehicle transactions and toll processing volumes.",
   sd:{sharePrice:16.92,sharesOut:161,marketCap:2728,netDebt:1066-68},
   thesis:["Stable government-contracted tolling with 84% GM and 40% EBITDA at only 3.6x NTM — attractive entry","Long-term municipal contracts provide exceptional visibility and predictable FCF for debt service","Usage-based with infrastructure characteristics — more akin to a toll road than a software business","35% off 52W high despite no fundamental deterioration — pure technical selloff in software sector","Limited AI risk given physical infrastructure nature; EV/AV complexity creates additional runway"],
   aiRationale:["Government-contracted tolling and photo enforcement — physical infrastructure with durable demand","AI enhances enforcement accuracy but cannot displace underlying government contracts and infrastructure","Long-term municipal contracts (5–10 years) provide extreme revenue visibility across the hold period","Usage-based model tied to vehicle transactions rather than software seats","Low risk: regulatory and physical nature creates barriers no AI tool can replicate"]},
  {name:"EverCommerce",vertical:"Field Services",sor:false,seat:false,pricing:"Usage-Based",peOwned:false,tev:2473,ntmRev:627,growth:6,gm:78,ebitda:31,cagr:-2,ntmRevX:3.9,peFit:"Low-Medium",aiRisk:"Medium-High",avoid:true,
   desc:"SMB software roll-up across field services, fitness, and home services verticals covering scheduling, payments, marketing, and CRM. Aggregates ~600,000 SMB customers across fragmented niche verticals via acquisition with no deep SoR anchor in any single vertical. Usage-based model across a diverse portfolio of point solutions.",
   sd:{sharePrice:11.49,sharesOut:180,marketCap:2064,netDebt:545-136},
   thesis:["Roll-up with -2% N3Y CAGR reveals organic revenue deterioration beneath acquisition-driven headlines","Not a SoR in any vertical — lacks deep workflow integration that protects against AI displacement","14% off 52W high — insufficient discount given fundamental growth concerns and AI risk","78% GM is attractive but 31% EBITDA with declining organic growth limits margin expansion confidence","Avoid: negative organic growth, not a SoR, and medium-high AI risk across fragmented SMB verticals"],
   aiRationale:["Fragmented SMB software roll-up — not a SoR in any vertical, creating broad AI exposure","AI-native SMB tools (Jobber AI, ServiceM8) proliferating and directly targeting this customer segment","Negative N3Y CAGR of -2% suggests organic deterioration already underway — AI may be accelerating this","Usage-based is a positive but does not offset fundamental lack of SoR depth","Medium-high risk: roll-up without SoR depth is structurally vulnerable to AI-native alternatives"]},
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
      "4.7x NTM Revenue with 41.7% EBITDA is the best margin/multiple combination in the top tier — entry TEV ~$8B at 30% premium is strong absolute value for the quality",
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
    headline:"Italian healthcare IT SoR with 96% gross margins — EU AI Act and PNRR tailwinds protect the incumbent in a structurally insulated public health market at only 1.4x NTM Revenue",
    business:[
      "Provides clinical information systems (CIS), digital health infrastructure, and administrative software to Italian public hospitals and regional health authorities",
      "SoR for Italian NHS digital workflows — used by the majority of Italian public hospitals for clinical records, scheduling, billing, and regulatory reporting",
      "96% gross margin reflects pure software delivery on a fixed-cost platform; EBITDA of 21% has a clear path to 30%+ as recurring SaaS mix grows vs legacy implementation revenue",
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
      "96% GM with a clear path to 30%+ EBITDA as recurring SaaS mix grows — operating leverage is exceptional on a fixed-cost software platform in a protected market",
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
        "Consistent with 11% N3Y CAGR; Italian NHS procurement is deliberate and multi-year by nature with no sudden acceleration expected",
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
    headline:"Global sports data monopoly with exclusive league rights — AI-enhanced live odds platform at 2.8x NTM Revenue riding the structural US sports betting expansion",
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
      "2.8x NTM Revenue at $5.3B TEV for a 21% growth business is anomalously cheap — US sports betting market expansion is a secular structural tailwind not a cyclical story",
      "42% off 52W high following growth equity selloff creates entry dislocation; business fundamentals (21% CAGR, margin expansion) are unchanged",
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
    headline:"Specialist global payments platform for education and healthcare at 1.8x NTM — deep institutional relationships and FX complexity create durable moat that generalist processors cannot replicate",
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
      "1.8x NTM Revenue for 18% growth with a clear path to 32%+ terminal margin — among the best growth/value combinations in the screen and deeply undervalued vs payment sector peers",
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
  "Autodesk":2846,"Veeva Systems":1450,"Tyler Technologies":665,"Toast":659,
  "Bentley Systems":538,"Guidewire Software":271,"Nemetschek":452,
  "Manhattan Associates":395,"Procore Technologies":294,"Clearwater Analytics":261,"ServiceTitan":140,
  "AppFolio":257,"Waystar":474,"CCC Intelligent Solutions":443,"Doximity":352,
  "Q2 Holdings":193,"Blackbaud":410,"nCino":135,"Agilysys":63,
  "Alkami Technology":65,"Intapp":107,"Alfa Financial Software":60,
  "SiteMinder":17,"Blend Labs":18,"Fair Isaac (FICO)":1264,
  "Broadridge Financial":1771,"FactSet Research Systems":946,"Sportradar":363,
  "Synopsys":3134,"Axon Enterprise":742,"Constellation Software":3374,
  "Dassault Systemes":2558,"HealthEquity":568,"Cellebrite DI":131,
  "Flywire":126,"GPI SpA":143,"Phreesia":102,"SS&C Technologies":2499,
  "PTC":1354,"Trimble":1056,"Temenos":428,"Sabre Corporation":515,
  "Diebold Nixdorf":491,"Verra Mobility":415,"EverCommerce":179
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt  = n=>Math.abs(n)>=1000?`$${(n/1000).toFixed(1)}B`:`$${Math.round(Math.abs(n))}M`;
const fmtN = n=>Math.abs(n)>=1000?`${(n/1000).toFixed(1)}B`:`${Math.round(Math.abs(n))}M`;
const riskColor=r=>({"Low":"bg-green-100 text-green-800","Low-Medium":"bg-lime-100 text-lime-800","Medium":"bg-yellow-100 text-yellow-800","Medium-High":"bg-orange-100 text-orange-800","High":"bg-red-100 text-red-800"})[r]||"bg-gray-100";
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
  if(dim==="qual"){const mp=co.sor?1.0:0.35;const rm=(co.pricing==="Usage-Based"?0.35:0.10)+(!co.seat?0.20:0);const pp=Math.min((co.gm/100)*0.75,0.75);const ml=(Math.min(Math.max(co.cagr,0),25)/25)*0.40;const ig={"High":0.30,"Medium-High":0.225,"Medium":0.15,"Low-Medium":0.075,"Low":0}[co.peFit]||0.15;return`Mkt Pos ${mp.toFixed(2)}/1.0 (${co.sor?"SoR":"non-SoR"}). Rev Moat ${rm.toFixed(2)}/0.55 (${co.pricing}${!co.seat?", non-seat":""} ). Pricing Pwr ${pp.toFixed(2)}/0.75 (GM ${co.gm}%). Mkt Lead ${ml.toFixed(2)}/0.40 (N3Y CAGR ${co.cagr}%). Grade ${ig.toFixed(3)}/0.30 (PE Fit: ${co.peFit}). Score: ${s.qualScore}/3.0`;}
  if(dim==="ai")return`Base "${co.aiRisk}" → ${{"Low":2.6,"Low-Medium":2.0,"Medium":1.4,"Medium-High":0.8,"High":0.1}[co.aiRisk]} pts. SoR: ${co.sor?"+0.2":"+0"}. Pricing: ${co.pricing==="Usage-Based"?"+0.2 (usage)":"-0.2 (seat)"}. Score: ${s.aiScore}/3.0`;
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
            {[["AI Risk","3.0pts","Highest weight"],["Biz Quality","3.0pts","SoR, moat, GM, CAGR"],["Valuation","3.0pts","EV/EBITDA primary"],["LBO Returns","3.0pts","IRR thresholds"],["DCF Upside","2.0pts","DCF/share vs price"],["PE Fit","1.0pt","FCF, levers, scale"]].map(([d,p,n])=>(
              <div key={d} className="bg-gray-50 border border-gray-200 rounded p-2"><div className="font-semibold text-gray-800">{d}</div><div className="text-green-700 font-bold">{p}</div><div className="text-gray-400">{n}</div></div>
            ))}
          </div>
          {[["Valuation (3pts)","EV/EBITDA primary (max 2pts): <10x ≈ maximum; >20x ≈ near zero. EV/Revenue secondary (max 1pt): <3x maximum; >12x minimum.","bg-blue-50 border-blue-200"],
            ["Business Quality (3pts)","Market Positioning: SoR=1.0, non-SoR=0.35 (max 1.0pt). Revenue Moat: usage-based+0.35/seat-based+0.10, non-seat-locked+0.20 (max 0.55pt). Pricing Power: GM%×0.75 as competitive moat proxy (max 0.75pt). Market Leadership: N3Y CAGR capped at 25% (max 0.40pt). Investment Grade: PE Fit signal (max 0.30pt).","bg-purple-50 border-purple-200"],
            ["AI Risk (3pts)","Base: Low=2.6, Low-Medium=2.0, Medium=1.4, Medium-High=0.8, High=0.1. Bonuses: SoR +0.2, Usage-Based +0.2, Seat-Based −0.2, PE-Owned +0.2.","bg-red-50 border-red-200"],
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
          <div className="space-y-2">
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
                  <div className="p-3 cursor-pointer hover:bg-gray-50 select-none" onClick={()=>setExpanded(isOpen?null:co.name)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">{rank}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-gray-900">{co.name}</span>
                          {co.avoid&&<span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">AVOID</span>}
                          {co.tev>=10000&&<span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">&gt;$10B</span>}
                          {hasOv&&<span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">custom</span>}
                          <span className="text-xs text-gray-400">{co.vertical}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <div className="text-center"><div className="text-gray-400">TEV</div><div className="font-semibold">{fmt(co.tev)}</div></div>
                        <div className="text-center"><div className="text-gray-400">EV/EBITDA</div><div className="font-semibold">{co.ntmEBITDAX}x</div></div>
                        <div className="text-center"><div className="text-gray-400">EV/Rev</div><div className="font-semibold">{co.ntmRevX}x</div></div>
                        <div className="text-center"><div className="text-gray-400">EBITDA%</div><div className="font-semibold">{co.ebitda}%</div></div>
                        <div className="text-center"><div className="text-gray-400">Gr%</div><div className="font-semibold">{co.growth}%</div></div>
                        <div className="text-center"><div className="text-gray-400">IRR</div><div className={irrColor(co.lbo.irr)}>{co.lbo.irr}% {irrLabel(co.lbo.irr)}</div></div>
                        <div className="text-center"><div className="text-gray-400">DCF/share</div><div className={co.sharePct!==null?(co.sharePct>0?"text-green-700 font-semibold":"text-red-500 font-semibold"):"text-gray-300"}>
                          {co.sd?co.dcfShare!==null?`$${co.dcfShare} (${co.sharePct>0?"+":""}${co.sharePct}%)`:"—":"pending"}</div></div>
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${riskColor(co.aiRisk)}`}>AI:{co.aiRisk}</span>
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${co.pricing==="Usage-Based"?"bg-blue-100 text-blue-800":"bg-purple-100 text-purple-800"}`}>{co.pricing==="Usage-Based"?"Usage":"Seat"}</span>
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${co.sor?"bg-indigo-100 text-indigo-800":"bg-gray-100 text-gray-500"}`}>{co.sor?"SoR✓":"~SoR"}</span>
                        <div className="text-center ml-1"><div className="text-gray-400">Score</div><div className={`text-lg font-bold ${scColor(co.total)}`}>{co.total}</div></div>
                      </div>
                      <span className="text-gray-400 text-xs">{isOpen?"▲":"▼"}</span>
                    </div>
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
