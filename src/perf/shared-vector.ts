// Native SVG instances share original vector geometry across desks and robots.
// There is no image resampling or alternate path tessellation at fractional zoom.
const NS="http://www.w3.org/2000/svg";
type Entry={id:string;node:SVGGElement;owners:Set<string>};
const entries=new Map<string,Entry>(),owned=new Map<string,Set<string>>();
let library:SVGSVGElement|null=null,defs:SVGDefsElement|null=null,serial=0;
export function vectorOwner(prefix="vector"){return `${prefix}-${++serial}`}
export function sharedVector(fragment:string,owner:string,cls=""){
  if(!library){
    library=document.createElementNS(NS,"svg");library.setAttribute("width","0");library.setAttribute("height","0");library.setAttribute("aria-hidden","true");
    library.dataset.lucidVectors="1";
    library.style.cssText="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    defs=document.createElementNS(NS,"defs");library.appendChild(defs);document.body.appendChild(library);
  }
  let entry=entries.get(fragment);
  if(!entry){
    const node=document.createElementNS(NS,"g"),id=`lucid-static-${++serial}`;node.id=id;node.innerHTML=fragment;defs!.appendChild(node);
    entry={id,node,owners:new Set()};entries.set(fragment,entry);
  }
  entry.owners.add(owner);let set=owned.get(owner);if(!set)owned.set(owner,set=new Set());set.add(fragment);
  return `<use${cls?` class="${cls}"`:""} href="#${entry.id}"/>`;
}
export function releaseVectors(owner:string){
  for(const fragment of owned.get(owner)??[]){const entry=entries.get(fragment);if(entry){entry.owners.delete(owner);if(!entry.owners.size){entry.node.remove();entries.delete(fragment)}}}
  owned.delete(owner);
  if(!entries.size){library?.remove();library=null;defs=null}
}
