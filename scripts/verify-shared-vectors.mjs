import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {transformWithOxc} from 'vite';
class Node{
  children=[];parent=null;attrs=new Map();style={};dataset={};innerHTML='';
  setAttribute(k,v){this.attrs.set(k,v)}
  appendChild(node){node.remove();this.children.push(node);node.parent=this;return node}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null}}
}
const body=new Node();globalThis.document={body,createElementNS:()=>new Node()};
const transformed=await transformWithOxc(await fs.readFile(new URL('../src/perf/shared-vector.ts',import.meta.url),'utf8'),'shared-vector.ts');
const {sharedVector,releaseVectors,vectorOwner}=await import('data:text/javascript;base64,'+Buffer.from(transformed.code).toString('base64'));
const a=vectorOwner('desk'),b=vectorOwner('robot'),shape='<rect width="10" height="12" fill="var(--shell)"/>';
const first=sharedVector(shape,a),again=sharedVector(shape,a),secondOwner=sharedVector(shape,b);
assert.equal(first,again);assert.equal(first,secondOwner);assert.equal(body.children.length,1,'one library owns all shared geometry');
const definitions=body.children[0].children[0];assert.equal(definitions.children.length,1,'identical geometry is retained only once');
releaseVectors(a);assert.equal(definitions.children.length,1,'another live rig must retain its shared geometry');
releaseVectors(a);assert.equal(definitions.children.length,1,'releasing twice is safe');
sharedVector('<circle r="4"/>',b);assert.equal(definitions.children.length,2);
releaseVectors(b);assert.equal(body.children.length,0,'final release removes geometry and its zero-size library');
const next=sharedVector(shape,a);assert.notEqual(next,first,'recreated rigs cannot reference removed definitions');
releaseVectors(a);assert.equal(body.children.length,0);delete globalThis.document;
console.log('PASS: native geometry deduplication, stable ownership, cross-rig retention, idempotent release and no orphan definitions');
