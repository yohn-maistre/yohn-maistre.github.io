import{j as e}from"./jsx-runtime.D_zvdyIk.js";import{r as l}from"./index.B3OaH_ah.js";import{a as f}from"./index.Cf06EEJ5.js";import{S as i}from"./skeleton.D_dt10Yz.js";/**
 * @license lucide-react v0.545.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=t=>t.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),j=t=>t.replace(/^([A-Z])|[\s-_]+(\w)/g,(s,r,a)=>a?a.toUpperCase():r.toLowerCase()),h=t=>{const s=j(t);return s.charAt(0).toUpperCase()+s.slice(1)},u=(...t)=>t.filter((s,r,a)=>!!s&&s.trim()!==""&&a.indexOf(s)===r).join(" ").trim(),w=t=>{for(const s in t)if(s.startsWith("aria-")||s==="role"||s==="title")return!0};/**
 * @license lucide-react v0.545.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var b={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.545.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=l.forwardRef(({color:t="currentColor",size:s=24,strokeWidth:r=2,absoluteStrokeWidth:a,className:c="",children:o,iconNode:m,...d},x)=>l.createElement("svg",{ref:x,...b,width:s,height:s,stroke:t,strokeWidth:a?Number(r)*24/Number(s):r,className:u("lucide",c),...!o&&!w(d)&&{"aria-hidden":"true"},...d},[...m.map(([n,p])=>l.createElement(n,p)),...Array.isArray(o)?o:[o]]));/**
 * @license lucide-react v0.545.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=(t,s)=>{const r=l.forwardRef(({className:a,...c},o)=>l.createElement(y,{ref:o,iconNode:s,className:u(`lucide-${g(h(t))}`,`lucide-${t}`,a),...c}));return r.displayName=h(t),r};/**
 * @license lucide-react v0.545.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const v=[["path",{d:"M13 5H19V11",key:"1n1gyv"}],["path",{d:"M19 5L5 19",key:"72u4yj"}]],C=N("move-up-right",v),S=()=>{const[t,s]=l.useState(null),[r,a]=l.useState(!0);if(l.useEffect(()=>{fetch("https://lastfm-last-played.biancarosa.com.br/giyaibo/latest-song").then(n=>n.json()).then(n=>{s(n.track),a(!1)}).catch(n=>{console.error("Error fetching latest song:",n),a(!1)})},[]),r)return e.jsxs("div",{className:"relative flex h-full w-full flex-col justify-between rounded-3xl p-6",children:[e.jsx(i,{className:"mb-2 h-[55%] w-[55%] rounded-xl"}),e.jsx("div",{className:"flex min-w-0 flex-1 flex-col justify-end overflow-hidden",children:e.jsxs("div",{className:"flex flex-col gap-2",children:[e.jsx(i,{className:"h-4 w-36"}),e.jsx(i,{className:"h-5 w-3/4"}),e.jsx(i,{className:"h-3 w-1/2"}),e.jsx(i,{className:"h-3 w-2/3"})]})}),e.jsx("div",{className:"absolute right-0 top-0 m-3 text-primary",children:e.jsx(f,{size:56})}),e.jsx(i,{className:"absolute bottom-0 right-0 m-3 h-10 w-10 rounded-full"})]});if(!t)return e.jsx("p",{children:"Something absolutely horrible has gone wrong"});const{name:c,artist:o,album:m,image:d,url:x}=t;return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"relative flex h-full w-full flex-col justify-between p-6",children:[e.jsx("img",{src:d[3]["#text"],alt:"Album art",width:128,height:128,className:"mb-2 w-[55%] rounded-xl border border-border grayscale"}),e.jsx("div",{className:"flex min-w-0 flex-1 flex-col justify-end overflow-hidden",children:e.jsxs("div",{className:"flex flex-col",children:[e.jsxs("span",{className:"mb-2 flex gap-2",children:[e.jsx("img",{src:"/bento/bento-now-playing.svg",alt:"Now playing",width:16,height:16}),e.jsx("span",{className:"text-sm text-primary",children:t["@attr"]?.nowplaying==="true"?"Now playing...":"Last played..."})]}),e.jsx("span",{className:"text-md mb-2 truncate font-bold leading-none",children:c}),e.jsxs("span",{className:"w-[85%] truncate text-xs text-muted-foreground",children:[e.jsx("span",{className:"font-semibold text-secondary-foreground",children:"by"})," ",o["#text"]]}),e.jsxs("span",{className:"w-[85%] truncate text-xs text-muted-foreground",children:[e.jsx("span",{className:"font-semibold text-secondary-foreground",children:"on"})," ",m["#text"]]})]})})]}),e.jsx("div",{className:"absolute right-0 top-0 m-3 text-primary",children:e.jsx(f,{size:56})}),e.jsx("a",{href:x,"aria-label":"View on last.fm",title:"View on last.fm",target:"_blank",rel:"noopener noreferrer",className:"absolute bottom-0 right-0 m-3 flex w-fit items-end rounded-full border bg-secondary/50 p-3 text-primary transition-all duration-300 hover:rotate-12 hover:ring-1 hover:ring-primary",children:e.jsx(C,{size:16})})]})};export{S as default};
