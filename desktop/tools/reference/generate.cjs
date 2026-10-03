'use strict';
// Development only: node tools/reference/generate.cjs from desktop/.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const root = path.resolve(__dirname, '../../..');
const desktop = path.join(root, 'desktop');
const core = path.join(root, 'xhs_utils/xhs_core/js');
const pc = path.join(root, 'xhs_utils/xhs_pc/js');
const b1 = require(path.join(core, 'b1.js'));
const mns = require(path.join(core, 'mns.js'));
const sign = require(path.join(core, 'sign.js'));
const rap = require(path.join(pc, 'rap.js'));
const cipher = require(path.join(pc, 'rap_crypto.js'));
const deflate = require(path.join(pc, 'deflate.js'));
const reference = require(path.join(pc, 'reference_profile.json'));
const fingerprint = Buffer.from(require(path.join(pc, 'rap_fingerprint_template.json')).bodyUnmaskedHex, 'hex');
const now = 1791000000000;
const b1Reference = reference.b1Reference;
const pcB1Options = {now, x39:b1Reference.x39, x50:b1Reference.x50, secCanvas:b1Reference.secCanvas,
  windowKeys:b1Reference.selectedGlobalNames,
  telemetry:{profile:b1Reference.telemetryProfile,timeOrigin:now-2151+b1Reference.timeOriginOffsetMs,
    mouse:b1Reference.mouse,keyboard:b1Reference.keyboard,page:b1Reference.page,state:b1Reference.state,features:b1Reference.features},
  overrides:{...(b1Reference.overrides || {}),x36:String(b1Reference.frameCount)}};
for(const key of ['x37','x38','x82']) if(key in b1Reference) pcB1Options.overrides[key]=String(b1Reference[key]);
const sourceHashes = {};
for (const dir of ['xhs_utils/xhs_core', 'xhs_utils/xhs_pc']) {
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(root,rel), {withFileTypes:true})) {
      const child = rel + '/' + entry.name;
      if (entry.isDirectory() && entry.name !== '__pycache__') walk(child);
      else if (entry.isFile() && /\.(py|js|json)$/.test(entry.name))
        sourceHashes[child] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root,child))).digest('hex');
    }
  }; walk(dir);
}
const fixtures = {schemaVersion:1, sourceCommit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  nodeVersion:process.version, sourceHashes, headerOrders:{}, json:[], b1:[], mns:[], signs:[], compression:[], ciphers:[], rap:[]};
// Read the original Python constants as text; do not run a Python interpreter.
const paramsSource=fs.readFileSync(path.join(root,'xhs_utils/xhs_pc/params.py'),'utf8');
for(const name of ['PC_BUSINESS_SIGNED_POST_HEADER_ORDER','PC_BUSINESS_SIGNED_GET_HEADER_ORDER','PC_RAP_POST_HEADER_ORDER','PC_RAP_GET_HEADER_ORDER','PC_XY_RAP_POST_HEADER_ORDER']) {
  const match=paramsSource.match(new RegExp('^'+name+'\\s*=\\s*\\(([\\s\\S]*?)\\)','m'));
  if(!match)throw new Error('Missing header contract '+name);
  fixtures.headerOrders[name]=Array.from(match[1].replace(/#.*$/gm,'').matchAll(/'([^']+)'/g),m=>m[1]);
}
for (const value of [{z:'<>&\u2028\u2029', a:'\u6d4b\u8bd5\ud83d\ude00'},
  {'10':'ten','2':'two',b:-0,a:1e20,c:1e21,d:1e-7,e:1e-6}, [null,true,false,0,1.25,'quote"\\\n']])
  fixtures.json.push({input:JSON.stringify(value), expected:JSON.stringify(value)});
for(const input of ['{"z":1,"10":10,"2":2,"a":3}','{"x":"\\ud83d","y":"\\udc00"}'])
  fixtures.json.push({input,expected:JSON.stringify(JSON.parse(input))});
const b1Inputs = [
  {now}, {now,telemetry:{profile:'active'}}, pcB1Options,
  {now,frameCount:0,x39:0,x50:'',webdriver:true,canvasFingerprint:'\u753b\u5e03\ud83d\ude00<>&',overrides:{x49:'\"\\\n',x33:null}},
  {now,windowKeys:['a'.repeat(297)+'\ud83d\ude00'],telemetry:{profile:'active',mouse:{me:0,extra:2},keyboard:{k:1},features:{ae:null}}},
];
for (const input of b1Inputs) {
  const output = b1.generateB1(input), plain = JSON.stringify(b1.orderedMiniFields(output.mini));
  fixtures.b1.push({input, miniJSON:plain, cipherHex:Buffer.from(b1.rc4BinaryString(plain),'utf8').toString('hex'), b1:output.b1});
}
const stages = {'0101':'coldContent','0201':'security','0301':'steadyContent'};
for (const tier of Object.keys(stages)) for (const variant of [0,1,2,3]) {
  const stage = reference.mnsStages[stages[tier]];
  const input = {api:variant===1?'/api/test?q=%E6%B5%8B%E8%AF%95&z=1':'/api/sns/web/v1/feed',
    data:variant===0?{source_note_id:'demo'}:variant===1?'raw \u6d4b\u8bd5<>&':variant===2?'':{},
    cookie:'a1='+'0'.repeat(52)+'; webBuild=6.47.2', now,xt:now+1,loadts:now-2151,
    version:variant===1?0xffffffff:123,seq:variant===2?0xffffffff:1,
    envConst:stage.envConst,envFpTail:Array.from(Buffer.from(stage.envFpTailHex,'hex')),tier,
    deviceTag:variant===2?'nop':'a3',b1:variant===2?'':fixtures.b1[2].b1,
    dslPair:(now-2151)+';1790999998000',webBuild:reference.release.webBuild,signCount:variant};
  if(variant===3) Object.assign(input,{webSsk:{'xhs-pc-web':Buffer.alloc(48,7).toString('base64')},sskRandom:0xffffffff,sskTimestamp:123});
  const data = typeof input.data==='object'?JSON.stringify(input.data):input.data;
  const p = {api:input.api,data,a1:'0'.repeat(52),ts:now,loadts:input.loadts,version:input.version,seq:input.seq,
    envConst:input.envConst,envFpTail:input.envFpTail,deviceTag:input.deviceTag};
  const packed = mns.packPlaintext(p);
  fixtures.mns.push({input:p,tier,packHex:Buffer.from(packed).toString('hex'),expected:mns.signTier(p,tier)});
  fixtures.signs.push({input,expected:sign.signFull(input)});
}
for(const input of [Buffer.alloc(0),Buffer.from('abc'),Buffer.from('a'.repeat(400)),fingerprint,
  Buffer.from(Array.from({length:512},(_,i)=>(i*73+19)%256)),Buffer.from('\u6d4b\u8bd5\ud83d\ude00'.repeat(25))])
  fixtures.compression.push({inputHex:input.toString('hex'),mtime:123,gzipHex:deflate.encodeGzip(input,123).toString('hex')});
for(const input of [Buffer.alloc(16),Buffer.from(Array.from({length:32},(_,i)=>i)),Buffer.alloc(64,255)])
  fixtures.ciphers.push({inputHex:input.toString('hex'),cipherHex:cipher.aesEcbEnc(input).toString('hex')});
for(const nonce of ['0123','01234','012345']) for(const api of ['/api/sns/web/v1/feed','https://edith.xiaohongshu.com/api/test','//so.xiaohongshu.com/api/test']) {
  const input={api,data:'{"z":"\u6d4b\u8bd5<>&","a":1}',ts:now,mask:51,xorKey:'abcdefghijklmnop',nonce,mtime:0,bodyEncryTime:3};
  const provisional=rap.buildRapPure({...input,fingerprint,returnLayers:true});
  const gz=deflate.encodeGzip(provisional.plaintext,0);
  const padBytes=Buffer.alloc(16-gz.length%16,112);
  const out=rap.buildRapPure({...input,fingerprint,padBytes,returnLayers:true});
  fixtures.rap.push({input:{...input,fingerprintHex:fingerprint.toString('hex'),padHex:padBytes.toString('hex')},
    expected:out.rap,plaintextHex:out.plaintext.toString('hex'),encRHex:out.encR.toString('hex'),bodyHex:out.body.toString('hex'),envelopeHex:out.envelope.toString('hex')});
}
const dataDir=path.join(desktop,'internal/xhs/testdata');fs.mkdirSync(dataDir,{recursive:true});
fs.writeFileSync(path.join(dataDir,'reference.json'),JSON.stringify(fixtures,null,2)+'\n');
const resourceDir=path.join(desktop,'internal/xhs/resources');fs.mkdirSync(resourceDir,{recursive:true});
for(const [dir,name] of [[core,'mns_keystreams.json'],[core,'mns_0101_keystream.json'],[pc,'reference_profile.json'],[pc,'rap_fingerprint_template.json']])
  fs.copyFileSync(path.join(dir,name),path.join(resourceDir,name));
console.log(JSON.stringify({b1:fixtures.b1.length,mns:fixtures.mns.length,signs:fixtures.signs.length,rap:fixtures.rap.length,sourceFiles:Object.keys(sourceHashes).length}));
