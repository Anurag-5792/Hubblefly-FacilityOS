/** Synthetic HFT media bytes only; no real media source, database or upload. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assertHftEncodedImage,parseScopedItemGallery,readApprovedHftPhoto}
 from '../../lib/hft/masters/p3-item-gallery.ts';
const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const mediaId='0188e184-13d2-4e23-a18d-888888888888';
const key='hft-item-media/HFT/ITEM1/V1/photo-001.png';
function crc32(data:Buffer):number{
 let c=0xffffffff;
 for(const byte of data){
  c^=byte;
  for(let i=0;i<8;i++)c=c&1?((c>>>1)^0xedb88320):c>>>1;
 }
 return (c^0xffffffff)>>>0;
}
function chunk(name:string,payload:Buffer):Buffer{
 const nameBytes=Buffer.from(name,'ascii');
 const len=Buffer.alloc(4);len.writeUInt32BE(payload.length);
 const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([nameBytes,payload])));
 return Buffer.concat([len,nameBytes,payload,crc]);
}
/** 128×128 transparent PNG with real compressed IDAT and valid CRCs. */
function png128():Buffer{
 const width=128,height=128;
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
 ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
 const raw=Buffer.alloc(height*(width*4+1));
 return Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),
  chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))
 ]);
}
function gallery(bytes:Buffer){
 const photo={mediaId,versionCode:'V1',role:'PRIMARY',sha256:
  createHash('sha256').update(bytes).digest('hex'),
  rightsEvidenceSha256:'a'.repeat(64),mimeType:'image/png',byteSize:bytes.length,
  width:128,height:128,storageKey:key,source:'HFT_CAPTURE',verification:'APPROVED'};
 return parseScopedItemGallery({state:'AVAILABLE',records:[{
  legal_entity_id:'HFT',site_id:'',warehouse_id:'',kind:'ITEM',record_id:'ITEM1',
  versions:[{versionCode:'V1',state:'ACTIVE',linkedCount:1,primaryLinkedCount:1,
   approvedCount:1,approvedPrimaryCount:1,photos:[photo]}]
 }]},scope,'ITEM1');
}
test('real encoded PNG dimensions are verified before approved HFT delivery',async()=>{
 const bytes=png128();
 assert.doesNotThrow(()=>assertHftEncodedImage(bytes,'image/png',128,128));
 assert.throws(()=>assertHftEncodedImage(bytes,'image/png',256,128),
  /P3_GALLERY_IMAGE_DIMENSIONS_MISMATCH/);
 assert.throws(()=>assertHftEncodedImage(Buffer.from('SVG <svg>'),'image/png',128,128),
  /P3_GALLERY_IMAGE_MAGIC_INVALID/);
});
test('approved SHA-bound HFT owned bytes read successfully; tampering is denied',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hft-p3-synthetic-media-'));
 const path=join(root,key);
 const bytes=png128();
 try{
  await mkdir(join(root,'hft-item-media/HFT/ITEM1/V1'),{recursive:true});
  await writeFile(path,bytes,{flag:'wx'});
  const approved=gallery(bytes);
  const observed=await readApprovedHftPhoto(approved,'V1',mediaId,root);
  assert.deepEqual(observed.bytes,bytes);
  assert.equal(observed.mimeType,'image/png');
  const tampered=Buffer.from(bytes);tampered[30]^=1;
  await writeFile(path,tampered);
  await assert.rejects(readApprovedHftPhoto(approved,'V1',mediaId,root),
   /P3_GALLERY_STORAGE_SHA256_MISMATCH/);
 }finally{await rm(root,{recursive:true,force:true});}
});
