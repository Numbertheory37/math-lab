var e=Object.create,t=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,i=Object.getPrototypeOf,a=Object.prototype.hasOwnProperty,o=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t),e=null),t.exports),s=(e,i,o,s)=>{if(i&&typeof i==`object`||typeof i==`function`)for(var c=r(i),l=0,u=c.length,d;l<u;l++)d=c[l],!a.call(e,d)&&d!==o&&t(e,d,{get:(e=>i[e]).bind(null,d),enumerable:!(s=n(i,d))||s.enumerable});return e},c=(n,r,o)=>(o=n==null?{}:e(i(n)),s(r||!n||!n.__esModule||!a.call(n,`default`)?t(o,`default`,{value:n,enumerable:!0}):o,n)),l=/* @__PURE__ */ (e=>typeof require<`u`?require:typeof Proxy<`u`?new Proxy(e,{get:(e,t)=>(typeof require<`u`?require:e)[t]}):e)(function(e){if(typeof require<`u`)return require.apply(this,arguments);throw Error('Calling `require` for "'+e+"\" in an environment that doesn't expose the `require` function. See https://rolldown.rs/in-depth/bundling-cjs#require-external-modules for more details.")}),u=Object.defineProperty,d=(e,t)=>u(e,`name`,{value:t,configurable:!0}),f=(e=>typeof l<`u`?l:typeof Proxy<`u`?new Proxy(e,{get:(e,t)=>(typeof l<`u`?l:e)[t]}):e)(function(e){if(typeof l<`u`)return l.apply(this,arguments);throw Error(`Dynamic require of "`+e+`" is not supported`)}),ee=(()=>{for(var e=/* @__PURE__ */ new Uint8Array(128),t=0;t<64;t++)e[t<26?t+65:t<52?t+71:t<62?t-4:t*4-205]=t;return t=>{for(var n=t.length,r=new Uint8Array((n-(t[n-1]==`=`)-(t[n-2]==`=`))*3/4|0),i=0,a=0;i<n;){var o=e[t.charCodeAt(i++)],s=e[t.charCodeAt(i++)],c=e[t.charCodeAt(i++)],l=e[t.charCodeAt(i++)];r[a++]=o<<2|s>>4,r[a++]=s<<4|c>>2,r[a++]=c<<6|l}return r}})();function te(e){return!isNaN(parseFloat(e))&&isFinite(e)}d(te,`_isNumber`);function p(e){return e.charAt(0).toUpperCase()+e.substring(1)}d(p,`_capitalize`);function m(e){return function(){return this[e]}}d(m,`_getter`);var h=[`isConstructor`,`isEval`,`isNative`,`isToplevel`],g=[`columnNumber`,`lineNumber`],_=[`fileName`,`functionName`,`source`],v=h.concat(g,_,[`args`],[`evalOrigin`]);function y(e){if(e)for(var t=0;t<v.length;t++)e[v[t]]!==void 0&&this[`set`+p(v[t])](e[v[t]])}for(d(y,`StackFrame`),y.prototype={getArgs:d(function(){return this.args},`getArgs`),setArgs:d(function(e){if(Object.prototype.toString.call(e)!==`[object Array]`)throw TypeError(`Args must be an Array`);this.args=e},`setArgs`),getEvalOrigin:d(function(){return this.evalOrigin},`getEvalOrigin`),setEvalOrigin:d(function(e){if(e instanceof y)this.evalOrigin=e;else if(e instanceof Object)this.evalOrigin=new y(e);else throw TypeError(`Eval Origin must be an Object or StackFrame`)},`setEvalOrigin`),toString:d(function(){var e=this.getFileName()||``,t=this.getLineNumber()||``,n=this.getColumnNumber()||``,r=this.getFunctionName()||``;return this.getIsEval()?e?`[eval] (`+e+`:`+t+`:`+n+`)`:`[eval]:`+t+`:`+n:r?r+` (`+e+`:`+t+`:`+n+`)`:e+`:`+t+`:`+n},`toString`)},y.fromString=d(function(e){var t=e.indexOf(`(`),n=e.lastIndexOf(`)`),r=e.substring(0,t),i=e.substring(t+1,n).split(`,`),a=e.substring(n+1);if(a.indexOf(`@`)===0)var o=/@(.+?)(?::(\d+))?(?::(\d+))?$/.exec(a,``),s=o[1],c=o[2],l=o[3];return new y({functionName:r,args:i||void 0,fileName:s,lineNumber:c||void 0,columnNumber:l||void 0})},`StackFrame$$fromString`),b=0;b<h.length;b++)y.prototype[`get`+p(h[b])]=m(h[b]),y.prototype[`set`+p(h[b])]=function(e){return function(t){this[e]=!!t}}(h[b]);var b;for(x=0;x<g.length;x++)y.prototype[`get`+p(g[x])]=m(g[x]),y.prototype[`set`+p(g[x])]=function(e){return function(t){if(!te(t))throw TypeError(e+` must be a Number`);this[e]=Number(t)}}(g[x]);var x;for(S=0;S<_.length;S++)y.prototype[`get`+p(_[S])]=m(_[S]),y.prototype[`set`+p(_[S])]=function(e){return function(t){this[e]=String(t)}}(_[S]);var S,C=y;function w(){var e=/^\s*at .*(\S+:\d+|\(native\))/m,t=/^(eval@)?(\[native code])?$/;return{parse:d(function(t){if(t.stack&&t.stack.match(e))return this.parseV8OrIE(t);if(t.stack)return this.parseFFOrSafari(t);throw Error(`Cannot parse given Error object`)},`ErrorStackParser$$parse`),extractLocation:d(function(e){if(e.indexOf(`:`)===-1)return[e];var t=/(.+?)(?::(\d+))?(?::(\d+))?$/.exec(e.replace(/[()]/g,``));return[t[1],t[2]||void 0,t[3]||void 0]},`ErrorStackParser$$extractLocation`),parseV8OrIE:d(function(t){return t.stack.split(`
`).filter(function(t){return!!t.match(e)},this).map(function(e){e.indexOf(`(eval `)>-1&&(e=e.replace(/eval code/g,`eval`).replace(/(\(eval at [^()]*)|(,.*$)/g,``));var t=e.replace(/^\s+/,``).replace(/\(eval code/g,`(`).replace(/^.*?\s+/,``),n=t.match(/ (\(.+\)$)/);t=n?t.replace(n[0],``):t;var r=this.extractLocation(n?n[1]:t);return new C({functionName:n&&t||void 0,fileName:[`eval`,`<anonymous>`].indexOf(r[0])>-1?void 0:r[0],lineNumber:r[1],columnNumber:r[2],source:e})},this)},`ErrorStackParser$$parseV8OrIE`),parseFFOrSafari:d(function(e){return e.stack.split(`
`).filter(function(e){return!e.match(t)},this).map(function(e){if(e.indexOf(` > eval`)>-1&&(e=e.replace(/ line (\d+)(?: > eval line \d+)* > eval:\d+:\d+/g,`:$1`)),e.indexOf(`@`)===-1&&e.indexOf(`:`)===-1)return new C({functionName:e});var t=/((.*".+"[^@]*)?[^@]*)(?:@)/,n=e.match(t),r=n&&n[1]?n[1]:void 0,i=this.extractLocation(e.replace(t,``));return new C({functionName:r,fileName:i[0],lineNumber:i[1],columnNumber:i[2],source:e})},this)},`ErrorStackParser$$parseFFOrSafari`)}}d(w,`ErrorStackParser`);var ne=new w;function re(){return typeof API<`u`&&API!==globalThis.API?API.runtimeEnv:ie({IN_BUN:typeof Bun<`u`,IN_DENO:typeof Deno<`u`,IN_NODE:typeof process==`object`&&typeof process.versions==`object`&&typeof process.versions.node==`string`&&!process.browser,IN_SAFARI:typeof navigator==`object`&&typeof navigator.userAgent==`string`&&navigator.userAgent.indexOf(`Chrome`)===-1&&navigator.userAgent.indexOf(`Safari`)>-1,IN_SHELL:typeof read==`function`&&typeof load==`function`,IN_WORKERD:typeof navigator==`object`&&navigator.userAgent?.includes(`Cloudflare-Workers`)})}d(re,`getGlobalRuntimeEnv`);var T=re();function ie(e){let t=e.IN_NODE&&typeof module<`u`&&module.exports&&typeof f==`function`&&typeof __dirname==`string`,n=e.IN_NODE&&!t,r=!e.IN_NODE&&!e.IN_DENO&&!e.IN_BUN,i=r&&typeof window<`u`&&typeof window.document<`u`&&typeof document.createElement==`function`&&`sessionStorage`in window&&typeof globalThis.importScripts!=`function`,a=r&&typeof globalThis.WorkerGlobalScope<`u`&&typeof globalThis.self<`u`&&globalThis.self instanceof globalThis.WorkerGlobalScope;if(a&&E())throw Error(`Classic web workers are not supported`);let o={...e,IN_BROWSER:r,IN_BROWSER_MAIN_THREAD:i,IN_BROWSER_WEB_WORKER:a,IN_NODE_COMMONJS:t,IN_NODE_ESM:n};if(!(o.IN_BROWSER_MAIN_THREAD||o.IN_BROWSER_WEB_WORKER||o.IN_NODE||o.IN_SHELL||o.IN_WORKERD))throw Error(`Cannot determine runtime environment: ${JSON.stringify(o)}`);return o}d(ie,`calculateDerivedFlags`);function E(){try{return globalThis.importScripts(`data:text/javascript,`),!0}catch{return!1}}d(E,`isClassicWorker`);var D,O,k,A;async function j(){if(!T.IN_NODE||(D=(await import(`./__vite-browser-external-DdNFmB74.js`).then(e=>/* @__PURE__ */ c(e.default,1))).default,k=await import(`./__vite-browser-external-DdNFmB74.js`).then(e=>/* @__PURE__ */ c(e.default,1)),A=await import(`./__vite-browser-external-DdNFmB74.js`).then(e=>/* @__PURE__ */ c(e.default,1)),(await import(`./__vite-browser-external-DdNFmB74.js`).then(e=>/* @__PURE__ */ c(e.default,1))).default,O=await import(`./__vite-browser-external-DdNFmB74.js`).then(e=>/* @__PURE__ */ c(e.default,1)),F=O.sep,typeof f<`u`))return;let e={fs:k,crypto:await import(`./__vite-browser-external-DdNFmB74.js`).then(e=>/* @__PURE__ */ c(e.default,1)),ws:await import(`./__vite-browser-external-DdNFmB74.js`).then(e=>/* @__PURE__ */ c(e.default,1)),child_process:await import(`./__vite-browser-external-DdNFmB74.js`).then(e=>/* @__PURE__ */ c(e.default,1))};globalThis.require=function(t){return e[t]}}d(j,`initNodeModules`);function M(e,t){return O.resolve(t||`.`,e)}d(M,`node_resolvePath`);function N(e,t){return t===void 0&&(t=location),new URL(e,t).toString()}d(N,`browser_resolvePath`);var P=T.IN_NODE?M:T.IN_SHELL?d(e=>e,`resolvePath`):N,F;T.IN_NODE||(F=`/`);function I(e,t){return e.startsWith(`file://`)&&(e=e.slice(7)),e.includes(`://`)?{response:fetch(e)}:{binary:A.readFile(e).then(e=>new Uint8Array(e.buffer,e.byteOffset,e.byteLength))}}d(I,`node_getBinaryResponse`);function L(e,t){if(e.startsWith(`file://`)&&(e=e.slice(7)),e.includes(`://`))throw Error(`Shell cannot fetch urls`);return{binary:Promise.resolve(new Uint8Array(readbuffer(e)))}}d(L,`shell_getBinaryResponse`);function R(e,t){let n=new URL(e,location);return{response:fetch(n,t?{integrity:t}:{})}}d(R,`browser_getBinaryResponse`);var z=T.IN_NODE?I:T.IN_SHELL?L:R;async function B(e,t){let{response:n,binary:r}=z(e,t);if(r)return r;let i=await n;if(!i.ok)throw Error(`Failed to load '${e}': request failed.`);return new Uint8Array(await i.arrayBuffer())}d(B,`loadBinaryFile`);var ae=T.IN_NODE?V:d(async e=>await import(e),`loadScript`);async function V(e){return e.startsWith(`file://`)&&(e=e.slice(7)),e.includes(`://`)?await import(e):await import(D.pathToFileURL(e).href)}d(V,`nodeLoadScript`);async function H(e){if(T.IN_NODE){await j();let t=await A.readFile(e,{encoding:`utf8`});return JSON.parse(t)}if(T.IN_SHELL){let t=read(e);return JSON.parse(t)}return await(await fetch(e)).json()}d(H,`loadLockFile`);async function U(){if(T.IN_NODE_COMMONJS)return __dirname;let e;try{throw Error()}catch(t){e=t}let t=ne.parse(e)[0].fileName;if(T.IN_NODE&&!t.startsWith(`file://`)&&(t=`file://${t}`),T.IN_NODE_ESM){let e=await import(`./__vite-browser-external-DdNFmB74.js`).then(e=>/* @__PURE__ */ c(e.default,1));return(await import(`./__vite-browser-external-DdNFmB74.js`).then(e=>/* @__PURE__ */ c(e.default,1))).fileURLToPath(e.dirname(t))}let n=t.lastIndexOf(F);if(n===-1)throw Error(`Could not extract indexURL path from pyodide module location. Please pass the indexURL explicitly to loadPyodide.`);return t.slice(0,n)}d(U,`calculateDirname`);function W(e){return e.substring(0,e.lastIndexOf(`/`)+1)||globalThis.location?.toString()||`.`}d(W,`calculateInstallBaseUrl`);function G(e){let t=e.FS,n=e.FS.filesystems.MEMFS,r=e.PATH,i={DIR_MODE:16895,FILE_MODE:33279,mount:d(function(e){if(!e.opts.fileSystemHandle)throw Error(`opts.fileSystemHandle is required`);return n.mount.apply(null,arguments)},`mount`),syncfs:d(async(e,t,n)=>{try{let r=i.getLocalSet(e),a=await i.getRemoteSet(e),o=t?a:r,s=t?r:a;await i.reconcile(e,o,s),n(null)}catch(e){n(e)}},`syncfs`),getLocalSet:d(e=>{let n=Object.create(null);function i(e){return e!==`.`&&e!==`..`}d(i,`isRealDir`);function a(e){return t=>r.join2(e,t)}d(a,`toAbsolute`);let o=t.readdir(e.mountpoint).filter(i).map(a(e.mountpoint));for(;o.length;){let e=o.pop(),r=t.stat(e);t.isDir(r.mode)&&o.push.apply(o,t.readdir(e).filter(i).map(a(e))),n[e]={timestamp:r.mtime,mode:r.mode}}return{type:`local`,entries:n}},`getLocalSet`),getRemoteSet:d(async e=>{let t=Object.create(null),n=await oe(e.opts.fileSystemHandle);for(let[a,o]of n)a!==`.`&&(t[r.join2(e.mountpoint,a)]={timestamp:o.kind===`file`?new Date((await o.getFile()).lastModified):/* @__PURE__ */ new Date,mode:o.kind===`file`?i.FILE_MODE:i.DIR_MODE});return{type:`remote`,entries:t,handles:n}},`getRemoteSet`),loadLocalEntry:d(e=>{let r=t.lookupPath(e,{}).node,i=t.stat(e);if(t.isDir(i.mode))return{timestamp:i.mtime,mode:i.mode};if(t.isFile(i.mode))return r.contents=n.getFileDataAsTypedArray(r),{timestamp:i.mtime,mode:i.mode,contents:r.contents};throw Error(`node type not supported`)},`loadLocalEntry`),storeLocalEntry:d((e,n)=>{if(t.isDir(n.mode))t.mkdirTree(e,n.mode);else if(t.isFile(n.mode))t.writeFile(e,n.contents,{canOwn:!0});else throw Error(`node type not supported`);t.chmod(e,n.mode),t.utime(e,n.timestamp,n.timestamp)},`storeLocalEntry`),removeLocalEntry:d(e=>{var n=t.stat(e);t.isDir(n.mode)?t.rmdir(e):t.isFile(n.mode)&&t.unlink(e)},`removeLocalEntry`),loadRemoteEntry:d(async e=>{if(e.kind===`file`){let t=await e.getFile();return{contents:new Uint8Array(await t.arrayBuffer()),mode:i.FILE_MODE,timestamp:new Date(t.lastModified)}}if(e.kind===`directory`)return{mode:i.DIR_MODE,timestamp:/* @__PURE__ */ new Date};throw Error(`unknown kind: `+e.kind)},`loadRemoteEntry`),storeRemoteEntry:d(async(e,n,i)=>{let a=e.get(r.dirname(n)),o=t.isFile(i.mode)?await a.getFileHandle(r.basename(n),{create:!0}):await a.getDirectoryHandle(r.basename(n),{create:!0});if(o.kind===`file`){let e=await o.createWritable();await e.write(i.contents),await e.close()}e.set(n,o)},`storeRemoteEntry`),removeRemoteEntry:d(async(e,t)=>{await e.get(r.dirname(t)).removeEntry(r.basename(t)),e.delete(t)},`removeRemoteEntry`),reconcile:d(async(e,n,a)=>{let o=0,s=[];Object.keys(n.entries).forEach(function(e){let r=n.entries[e],i=a.entries[e];(!i||t.isFile(r.mode)&&r.timestamp.getTime()>i.timestamp.getTime())&&(s.push(e),o++)}),s.sort();let c=[];if(Object.keys(a.entries).forEach(function(e){n.entries[e]||(c.push(e),o++)}),c.sort().reverse(),!o)return;let l=n.type===`remote`?n.handles:a.handles;for(let t of s){let n=r.normalize(t.replace(e.mountpoint,`/`)).substring(1);if(a.type===`local`){let e=l.get(n),r=await i.loadRemoteEntry(e);i.storeLocalEntry(t,r)}else{let e=i.loadLocalEntry(t);await i.storeRemoteEntry(l,n,e)}}for(let t of c)if(a.type===`local`)i.removeLocalEntry(t);else{let n=r.normalize(t.replace(e.mountpoint,`/`)).substring(1);await i.removeRemoteEntry(l,n)}},`reconcile`)};e.FS.filesystems.NATIVEFS_ASYNC=i}d(G,`initializeNativeFS`);var oe=d(async e=>{let t=[];async function n(e){for await(let r of e.values())t.push(r),r.kind===`directory`&&await n(r)}d(n,`collect`),await n(e);let r=/* @__PURE__ */ new Map;r.set(`.`,e);for(let n of t){let t=(await e.resolve(n)).join(`/`);r.set(t,n)}return r},`getFsHandles`),se=ee(`AGFzbQEAAAABDANfAGAAAW9gAW8BfwMDAgECBygCE0pzdl9HZXRFcnJvcl9pbXBvcnQAAA5Kc3ZFcnJvcl9DaGVjawABChMCBwD7AQD7GwsJACAA+xr7FAAL`),ce=async function(){if(!(globalThis.navigator&&(/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform===`MacIntel`&&typeof navigator.maxTouchPoints<`u`&&navigator.maxTouchPoints>1)))try{let e=await WebAssembly.compile(se);return await WebAssembly.instantiate(e)}catch(e){if(e instanceof WebAssembly.CompileError)return;throw e}}();async function K(){let e=await ce;if(e)return e.exports;let t=Symbol(`error marker`);return{Jsv_GetError_import:d(()=>t,`Jsv_GetError_import`),JsvError_Check:d(e=>e===t,`JsvError_Check`)}}d(K,`getJsvErrorImport`);function q(e){let t={config:e,runtimeEnv:T},n={noImageDecoding:!0,noAudioDecoding:!0,noWasmDecoding:!1,preRun:de(e),print:e.stdout,printErr:e.stderr,onExit(e){n.exitCode=e},thisProgram:e._sysExecutable,arguments:e.args,API:t,locateFile:d(t=>e.indexURL+t,`locateFile`),instantiateWasm:fe(e.indexURL)};return n}d(q,`createSettings`);function J(e){return function(t){try{t.FS.mkdirTree(e)}catch(t){console.error(`Error occurred while making a home directory '${e}':`),console.error(t),console.error(`Using '/' for a home directory instead`),e=`/`}t.FS.chdir(e)}}d(J,`createHomeDirectory`);function Y(e){return function(t){Object.assign(t.ENV,e)}}d(Y,`setEnvironment`);function X(e){return e?[async t=>{t.addRunDependency(`fsInitHook`);try{await e(t.FS,{sitePackages:t.API.sitePackages})}finally{t.removeRunDependency(`fsInitHook`)}}]:[]}d(X,`callFsInitHook`);function le(e){let t=e.HEAPU32[e._Py_Version>>>2];return[t>>>24&255,t>>>16&255,t>>>8&255]}d(le,`computeVersionTuple`);function ue(e){let t=B(e);return async e=>{e.API.pyVersionTuple=le(e);let[n,r]=e.API.pyVersionTuple;e.FS.mkdirTree(`/lib`),e.API.sitePackages=`/lib/python${n}.${r}/site-packages`,e.FS.mkdirTree(e.API.sitePackages),e.FS.mkdirTree(`/lib/python${n}.${r}/lib-dynload`),e.addRunDependency(`install-stdlib`);try{let i=await t;e.FS.writeFile(`/lib/python${n}${r}.zip`,i)}catch(e){console.error(`Error occurred while installing the standard library:`),console.error(e)}finally{e.removeRunDependency(`install-stdlib`)}}}d(ue,`installStdlib`);function de(e){let t;return t=e.stdLibURL==null?e.indexURL+`python_stdlib.zip`:e.stdLibURL,[ue(t),J(e.env.HOME),Y(e.env),G,...X(e.fsInit)]}d(de,`getFileSystemInitializationFuncs`);function fe(e){if(typeof WasmOffsetConverter<`u`)return;let{binary:t,response:n}=z(e+`pyodide.asm.wasm`),r=K();return function(e,i){return async function(){let{Jsv_GetError_import:a,JsvError_Check:o}=await r;e.env.Jsv_GetError_import=a,e.env.JsvError_Check=o;try{let r;r=n?await WebAssembly.instantiateStreaming(n,e):await WebAssembly.instantiate(await t,e);let{instance:a,module:o}=r;i(a,o)}catch(e){console.warn(`wasm instantiation failed!`),console.warn(e)}}(),{}}}d(fe,`getInstantiateWasmFunc`);var pe=`314.0.7`;function Z(e){return e===void 0||e.endsWith(`/`)?e:e+`/`}d(Z,`withTrailingSlash`);var me=pe;async function he(e={}){if(await j(),e.lockFileContents&&e.lockFileURL)throw Error(`Can't pass both lockFileContents and lockFileURL`);let t=e.indexURL||await U();if(t=Z(P(t)),e.packageBaseUrl=Z(e.packageBaseUrl),e.cdnUrl=Z(e.packageBaseUrl??`https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`),!e.lockFileContents){let n=e.lockFileURL??t+`pyodide-lock.json`;e.lockFileContents=H(n),e.packageBaseUrl??=W(n)}e.indexURL=t,e.packageCacheDir&&=Z(P(e.packageCacheDir));let n={jsglobals:globalThis,stdin:globalThis.prompt?()=>globalThis.prompt():void 0,args:[],env:{},packages:[],packageCacheDir:e.packageBaseUrl,enableRunUntilComplete:!0,checkAPIVersion:!0,BUILD_ID:`990c3b51a9722d62434de2bbc9643732658d488c1b6d467f22c1b6beba80d497`},r=Object.assign(n,e);return r.env.HOME??=`/home/pyodide`,r.env.PYTHONINSPECT??=`1`,r}d(he,`initializeConfiguration`);function ge(e){let t=q(e),n=t.API;return n.lockFilePromise=Promise.resolve(e.lockFileContents),t}d(ge,`createEmscriptenSettings`);async function _e(e){return e.createPyodideModule?e.createPyodideModule:(await ae(`${e.indexURL}pyodide.asm.mjs`)).default}d(_e,`loadWasmScript`);async function Q(e,t){if(!e._loadSnapshot)return;let n=await e._loadSnapshot,r=ArrayBuffer.isView(n)?n:new Uint8Array(n);return t.noInitialRun=!0,t.INITIAL_MEMORY=r.length,r}d(Q,`prepareSnapshot`);async function ve(e,t){let n=await e(t);if(t.exitCode!==void 0)throw new n.ExitStatus(t.exitCode);return n}d(ve,`instantiatePyodideModule`);function ye(e,t){let n=e.API;if(t.pyproxyToStringRepr&&n.setPyProxyToStringMethod(!0),t.convertNullToNone&&n.setCompatNullToNone(!0),t.toJsLiteralMap&&n.setCompatToJsLiteralMap(!0),n.version!==`314.0.7`&&t.checkAPIVersion)throw Error(`Pyodide version does not match: '${me}' <==> '${n.version}'. If you updated the Pyodide version, make sure you also updated the 'indexURL' parameter passed to loadPyodide.`);e.locateFile=e=>{throw e.endsWith(`.so`)?/* @__PURE__ */ Error(`Failed to find dynamic library "${e}"`):/* @__PURE__ */ Error(`Unexpected call to locateFile("${e}")`)}}d(ye,`configureAPI`);function be(e,t,n){let r=e.API,i;return t&&(i=r.restoreSnapshot(t)),r.finalizeBootstrap(i,n._snapshotDeserializer)}d(be,`bootstrapPyodide`);async function xe(e,t){let n=e._api;return n.sys.path.insert(0,``),n._pyodide.set_excepthook(),await n.packageIndexReady,n.initializeStreams(t.stdin,t.stdout,t.stderr),e}d(xe,`finalizeSetup`);async function Se(e={}){let t=await he(e),n=ge(t),r=await _e(t),i=await Q(t,n),a=await ve(r,n);return ye(a,t),await xe(be(a,i,t),t)}d(Se,`loadPyodide`);var Ce=`"""Calculus operations for the solver, run inside Pyodide (Python in the browser).

The TypeScript side calls run_request() with a JSON string and gets a JSON
string back. SymPy does the math, and every answer is checked independently
before it is shown, so a wrong answer is flagged instead of trusted.
"""

import json
import math
import re

import mpmath
import sympy
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

X = sympy.Symbol("x", real=True)

MAX_INPUT_LENGTH = 200

# parse_expr evaluates its input as Python, so only characters that math needs
# are allowed. Without quotes, brackets, or underscores, input cannot reach
# anything in Python except SymPy's math functions.
ALLOWED_CHARACTERS = re.compile(r"[A-Za-z0-9\\s+\\-*/^().,]*")

# Textbook names that SymPy spells differently.
NAMES = {
    "x": X,
    "e": sympy.E,
    "pi": sympy.pi,
    "ln": sympy.log,
    "arcsin": sympy.asin,
    "arccos": sympy.acos,
    "arctan": sympy.atan,
    "abs": sympy.Abs,
}

TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)

# Textbook notation like sin^2(x), which means (sin(x))^2.
FUNCTION_POWER = re.compile(r"\\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|ln|log)\\^(\\d+)\\s*\\(")

# Points where answers are checked. They avoid 0, integers, and common
# singularities such as pi/2 so that most functions are defined at most of them.
CHECK_POINTS = (-2.37, -1.29, -0.53, 0.31, 0.87, 1.67, 2.61)
MIN_CHECK_POINTS = 3
CHECK_PRECISION_DIGITS = 30
CHECK_TOLERANCE = mpmath.mpf("1e-12")

# Expressions larger than this are not passed to sympy.simplify, which can be slow.
MAX_SIMPLIFY_SIZE = 40

GRAPH_X_MIN = -10.0
GRAPH_X_MAX = 10.0
GRAPH_POINT_COUNT = 801


class InputError(Exception):
    """The user's input cannot be used; the message says why and what to do."""


def find_closing_parenthesis(text, open_index):
    depth = 0
    for index in range(open_index, len(text)):
        if text[index] == "(":
            depth += 1
        elif text[index] == ")":
            depth -= 1
            if depth == 0:
                return index
    return None


def rewrite_function_powers(text):
    """Rewrite sin^2(x) as (sin(x))^2, which SymPy can parse."""
    while match := FUNCTION_POWER.search(text):
        open_index = match.end() - 1
        close_index = find_closing_parenthesis(text, open_index)
        if close_index is None:
            break  # Unbalanced parentheses; the parser reports the error.
        name, power = match.group(1), match.group(2)
        argument = text[open_index : close_index + 1]
        text = f"{text[: match.start()]}({name}{argument})^{power}{text[close_index + 1 :]}"
    return text


def parse_function(text):
    text = text.strip()
    if not text:
        raise InputError("Type a function of x, such as x^2 sin(x).")
    if len(text) > MAX_INPUT_LENGTH:
        raise InputError(f"That expression is too long (the limit is {MAX_INPUT_LENGTH} characters).")
    if not ALLOWED_CHARACTERS.fullmatch(text):
        raise InputError("Use only letters, digits, spaces, and + - * / ^ ( ) . ,")
    try:
        function = parse_expr(
            rewrite_function_powers(text),
            local_dict=dict(NAMES),
            transformations=TRANSFORMATIONS,
        )
    except Exception as error:  # The parser raises many error types for bad syntax.
        raise InputError("Couldn't read that expression. Check the parentheses and operators.") from error
    if not isinstance(function, sympy.Expr):
        raise InputError("That isn't a function of x. Try something like x^2 sin(x).")
    other_symbols = function.free_symbols - {X}
    if other_symbols:
        names = ", ".join(sorted(str(symbol) for symbol in other_symbols))
        raise InputError(
            f"Use x as the only variable (found {names}). "
            "For a function such as sine, use parentheses: sin(x)."
        )
    if function.has(sympy.zoo, sympy.nan, sympy.oo, -sympy.oo):
        raise InputError("That expression is undefined, for example because it divides by zero.")
    return function


def to_latex(expression):
    return sympy.latex(expression, ln_notation=True, inv_trig_style="full")


def combine_fractions(expression):
    """Combine fractions when that makes the answer shorter.

    This turns quotient-rule answers like 1/(x+1) - x/(x+1)^2 into 1/(x+1)^2.
    Full simplification is avoided because it rewrites textbook forms, such as
    turning 2 sin(x) cos(x) into sin(2x).
    """
    combined = sympy.together(expression)
    # together() also factors sums with no fractions, like x^2 + 2x(x+1), so
    # only use it when there is a denominator to combine.
    has_denominator = sympy.denom(combined) != 1
    if has_denominator and sympy.count_ops(combined) < sympy.count_ops(expression):
        return combined
    return expression


def real_value(compute):
    """Run compute() and return its value as a real mpf, or None if it is not a finite real number."""
    try:
        value = mpmath.mpmathify(compute())
    except Exception:  # Undefined points raise many error types; all mean "no value here".
        return None
    if isinstance(value, mpmath.mpc):
        if abs(value.imag) > CHECK_TOLERANCE * max(1, abs(value.real)):
            return None
        value = value.real
    if not mpmath.isfinite(value):
        return None
    return value


def compare_at_check_points(expected, actual):
    """Count the check points where expected(x) and actual(x) agree and disagree.

    Points where either side has no real value are skipped.
    """
    agreed = disagreed = 0
    with mpmath.workdps(CHECK_PRECISION_DIGITS):
        for point in CHECK_POINTS:
            expected_value = real_value(lambda: expected(mpmath.mpf(point)))
            actual_value = real_value(lambda: actual(mpmath.mpf(point)))
            if expected_value is None or actual_value is None:
                continue
            scale = max(1, abs(expected_value), abs(actual_value))
            if abs(expected_value - actual_value) <= CHECK_TOLERANCE * scale:
                agreed += 1
            else:
                disagreed += 1
    return agreed, disagreed


def numeric_check(agreed, disagreed, verified_detail, failed_detail):
    if disagreed > 0:
        return {"status": "failed", "detail": failed_detail}
    if agreed >= MIN_CHECK_POINTS:
        return {"status": "verified", "detail": verified_detail.format(count=agreed)}
    return {
        "status": "unchecked",
        "detail": "Couldn't test this answer: the function isn't defined at enough test points.",
    }


def numeric_function(expression):
    return sympy.lambdify(X, expression, modules="mpmath")


def check_derivative(function, derivative):
    as_numeric = numeric_function(function)
    agreed, disagreed = compare_at_check_points(
        lambda point: mpmath.diff(as_numeric, point),
        numeric_function(derivative),
    )
    return numeric_check(
        agreed,
        disagreed,
        "Matches a high-precision numerical derivative at {count} test points.",
        "Doesn't match a numerical derivative. Don't trust this answer.",
    )


def check_antiderivative(function, antiderivative):
    derivative = sympy.diff(antiderivative, X)
    difference = derivative - function
    if sympy.count_ops(difference) <= MAX_SIMPLIFY_SIZE and sympy.simplify(difference) == 0:
        return {
            "status": "verified",
            "detail": "Differentiating the answer gives back your function exactly.",
        }
    agreed, disagreed = compare_at_check_points(numeric_function(function), numeric_function(derivative))
    return numeric_check(
        agreed,
        disagreed,
        "Differentiating the answer matches your function at {count} test points.",
        "Differentiating the answer doesn't give back your function. Don't trust this answer.",
    )


def with_absolute_value_logs(expression):
    """Write ln(u) as ln|u|, the textbook form that also holds where u < 0."""
    return expression.replace(
        lambda part: isinstance(part, sympy.log) and not isinstance(part.args[0], sympy.Abs),
        lambda part: sympy.log(sympy.Abs(part.args[0])),
    )


def undefined_where_function_is_defined(function, antiderivative):
    as_numeric = numeric_function(function)
    antiderivative_numeric = numeric_function(antiderivative)
    with mpmath.workdps(CHECK_PRECISION_DIGITS):
        return any(
            real_value(lambda: as_numeric(mpmath.mpf(point))) is not None
            and real_value(lambda: antiderivative_numeric(mpmath.mpf(point))) is None
            for point in CHECK_POINTS
        )


def sample_for_graph(expression):
    as_numeric = numeric_function(expression)
    values = []
    for index in range(GRAPH_POINT_COUNT):
        point = GRAPH_X_MIN + (GRAPH_X_MAX - GRAPH_X_MIN) * index / (GRAPH_POINT_COUNT - 1)
        value = real_value(lambda: as_numeric(mpmath.mpf(point)))
        number = None if value is None else float(value)
        values.append(number if number is not None and math.isfinite(number) else None)
    return values


def graph_x_values():
    return [
        round(GRAPH_X_MIN + (GRAPH_X_MAX - GRAPH_X_MIN) * index / (GRAPH_POINT_COUNT - 1), 6)
        for index in range(GRAPH_POINT_COUNT)
    ]


def solution(operation, function, equation_latex, result, check):
    return {
        "ok": True,
        "operation": operation,
        "equationLatex": equation_latex,
        "resultLatex": to_latex(result),
        "resultText": str(result),
        "check": check,
        "graph": {
            "x": graph_x_values(),
            "input": sample_for_graph(function),
            "result": sample_for_graph(result),
        },
    }


def differentiate(function):
    derivative = combine_fractions(sympy.diff(function, X))
    equation = rf"\\frac{{d}}{{dx}}\\left[{to_latex(function)}\\right] = {to_latex(derivative)}"
    return solution("differentiate", function, equation, derivative, check_derivative(function, derivative))


def integrate(function):
    antiderivative = sympy.integrate(function, X)
    if antiderivative.has(sympy.Integral):
        raise InputError(
            "SymPy couldn't find an antiderivative for this function. "
            "Some functions have none that can be written with standard functions."
        )
    if antiderivative.has(sympy.log) and undefined_where_function_is_defined(function, antiderivative):
        with_absolute_values = with_absolute_value_logs(antiderivative)
        if check_antiderivative(function, with_absolute_values)["status"] == "verified":
            antiderivative = with_absolute_values
    integral = to_latex(sympy.Integral(function, X))
    equation = f"{integral} = {to_latex(antiderivative)} + C"
    return solution("integrate", function, equation, antiderivative, check_antiderivative(function, antiderivative))


OPERATIONS = {"differentiate": differentiate, "integrate": integrate}


def run_request(request_json):
    """Entry point from TypeScript. Takes and returns JSON strings."""
    request = json.loads(request_json)
    try:
        operation = OPERATIONS.get(request.get("operation"))
        if operation is None:
            raise InputError(f"Unknown operation: {request.get('operation')}")
        response = operation(parse_function(request.get("expression", "")))
    except InputError as error:
        response = {"ok": False, "error": str(error)}
    except Exception as error:  # Report any SymPy failure instead of crashing the worker.
        response = {"ok": False, "error": f"SymPy couldn't finish this calculation ({type(error).__name__})."}
    return json.dumps(response, allow_nan=False)
`;const we=`https://cdn.jsdelivr.net/pyodide/v${me}/full/`;function $(e){self.postMessage(e)}async function Te(){$({type:`progress`,message:`Downloading Python…`});let e=await Se({indexURL:we});$({type:`progress`,message:`Loading SymPy…`}),await e.loadPackage(`sympy`);let t=e.globals.get(`dict`)();return e.runPython(Ce,{globals:t}),t.get(`run_request`)}const Ee=Te();Ee.then(()=>$({type:`ready`}),e=>$({type:`loadFailed`,error:String(e)})),self.onmessage=async e=>{let{id:t,operation:n,expression:r}=e.data,i;try{let e=await Ee;i=JSON.parse(e(JSON.stringify({operation:n,expression:r})))}catch(e){i={ok:!1,error:`The math engine failed: ${String(e)}`}}$({type:`response`,id:t,response:i})};export{o as t};