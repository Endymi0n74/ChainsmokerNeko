// NOTE: Preserved site DRM bootstrap — mirrors the preload that the obfuscated
// JapScan.DRM.js (DRMProvider.CreateImageLinks) injects into its window. It patches
// a String method so the page's own protected script decodes its embedded `{ax, pi}`
// payload and re-dispatches it as a CustomEvent under the given event name, once the
// reader page is unlocked (JapScan's `#jc-overlay` puzzle gates the decode).
//
// The constant ends with `})('` — callers must append the event name followed by `');`.
// Keep in sync with JapScan.DRM.js if the site changes its DRM bootstrap.
export const DRM_PRELOAD_PART1 = `(function(eventName) {
            (function(D,N){const z={D:0x472,N:'ss2M',a:0x46a,b:'7nA9',f:0x48d,W:'ACIR',j:0x482,i:'i*qm',e:0x46c,p:'sVya',o:0x47e,y:'nupX',X:0x487,k:'Dn61',S:0x479,J:'DD$7',Y:0x46d,L:'JgG3'},n={D:0x2ea};function U(D,N){return P(D-n.D,N);}const a=D();while(!![]){try{const b=parseInt(U(z.D,z.N))/(-0x1ef6+0x1*0xca9+0x124e)+parseInt(U(z.a,z.b))/(-0x4*-0x935+0x25a0+0x1*-0x4a72)+-parseInt(U(z.f,z.W))/(-0x9*0x37b+-0x21*-0x5a+0x1*0x13bc)*(parseInt(U(z.j,z.i))/(0x181e*0x1+-0x1*0x2082+0x868))+parseInt(U(z.e,z.p))/(-0x491*0x4+0x213*-0xf+0x3166)+parseInt(U(z.o,z.y))/(0x151f+0x53b+-0x695*0x4)*(-parseInt(U(z.X,z.k))/(0x28*0xf6+0xce2+0x5b3*-0x9))+-parseInt(U(z.S,z.J))/(0x1a02*-0x1+0xaa7*-0x1+-0x1*-0x24b1)+parseInt(U(z.Y,z.L))/(0xa1f*0x3+0xd67+-0x1*0x2bbb);if(b===N)break;else a['push'](a['shift']());}catch(f){a['push'](a['shift']());}}}(G,0x227a8+-0x7a3b7+0xcc8e8));function conceal(a,b,f){const Q={D:'4cvU',N:0x246,a:')4C$',b:0x212,f:'nupX',W:0x20c,j:')4C$',i:0x22c,e:'OWEH',p:0x22f,o:'AJjP',y:0x23b,E:'vUhd',B:0x245,C:0x22a,F:'Gr7R',V:0x240,c:'sVya',t:0x241,R:'X*aj',r:0x233,O:'Kh1R',I:0x220,T:'Ree9',H:0x230,w:'o1^N',q:0x224,l:'Kh1R',s:0x236,A:'DD$7',v:0x234,h:'v1Qg',K:0x218,G0:0x219},m={D:'McAC',N:0xe6,a:'Mn8A',b:0xe0,f:'2HSt',W:0xe4},L={D:'kzdL',N:0x13c,a:'Mn8A',b:0x138,f:'o1^N',W:0x122,j:'utr[',i:0x14a,e:'ss2M',p:0x126,o:'aT&D',y:0x136,M:'vCG@',m:0x141,Q:'F]Ch',E:0x145,B:'Kgg1',C:0x14c},Y={D:0xed},J={D:0x8e},W={};W[d(Q.D,Q.N)]=function(p,o){return p===o;},W[d(Q.a,Q.b)]=function(p,o){return p+o;},W[d(Q.f,Q.W)]=function(p,o){return p+o;},W[d(Q.j,Q.i)]=d(Q.e,Q.p),W[d(Q.o,Q.y)]=d(Q.E,Q.B),W[d(Q.D,Q.C)]=d(Q.F,Q.V),W[d(Q.c,Q.t)]=d(Q.R,Q.r);const j=W,i=a[b];function d(D,N){return P(N-J.D,D);}function toString(){function g(D,N){return d(D,N- -Y.D);}return j[g(L.D,L.N)](this[g(L.a,L.b)],i[g(L.f,L.W)])?i[g(L.j,L.i)]():j[g(L.e,L.p)](j[g(L.o,L.y)](j[g(L.M,L.m)],this[g(L.Q,L.E)]),j[g(L.B,L.C)]);}Object[d(Q.O,Q.I)](toString,j[d(Q.T,Q.H)],{'value':toString,'writable':![],'enumerable':![]});const e={};e[d(Q.w,Q.q)]=undefined,e[d(Q.l,Q.s)]=![],e[d(Q.A,Q.v)]=![],Object[d(Q.h,Q.K)](toString,j[d(Q.h,Q.G0)],e),a[b]=new Proxy(a[b],{'get'(p,o,y){const M={D:0x158};function Z(D,N){return d(D,N- -M.D);}return j[Z(m.D,m.N)](o,j[Z(m.a,m.b)])?toString:Reflect[Z(m.f,m.W)](p,o);},'apply':f});}function G(){const t=['oG1hf8ow','st0Qm1PvySk6','WPStW7ZdVtBcRHZdMW','bSkowSoTpG','W6L+WOFcH0m','W5O4wJ16WQxdKCoVWRrjW7VcIa','WOLZpXFdRG','W4n7ka','WPJdOCoLWP3cHq','WRZcLG9TW7K','bCk5W7pdU8oaW6ZdV2W','WQVcH09TAb1ubW','qfvvhmki','W5HXes7dO8kSW78','W5zMWOFcHZa','W6FdNISPk0Dclc4twCk3','WQ3cNmo6etRdNSo0mZHbs27cKSopxbXOo8oviq','ECkJcConeW','FSoJix7cS8oOW7i/WRZcUGHEWQi','zLuItSkE','mc3dMvVdQW','W5m7uZT8WQddRCofWRntW7JcUa','dmk1uJW','iqWSwSo0AmkEarKFpvv0','WQnTWPRdLWJdHr0adsRdHSk/W6K','jmk1CYpdNG','W6ZcMmkWfZq','lHNdMgpdJW','AdXjF8oKeHfqqq','WRBdI8oKsfRdTSk3WOWZaSkOuG','dSkXut49ha','WRyKpqzeW4yTx8oOWR9vlY3dQG','WOeRfX1H','lbf3gmoL','lqJdHNNdICkt','WRuzWRbMWQS','WR87x8kxW5PiySoUW5dcT8ocWQBcSG','W6hcH8kxWQzWW4uyjSkiuCodp8oJ','W7SktmkPeSo2WR8','wIOLlLvsxSkTWRbwWQGLW6j+','W4uYa8kXW5/dMNbhlX5QDW','huaDAmkmcbe','bCkcW6pdRNW','fmk1uYWS','gCkSz8oz','W6xdHmkbBmoRWR4XWQ/cOg8z','bYxdTmodEmowW5KlW5xcISoraaO','WRWIW47dNrxcOeNcGCoelmosWQuM','WRHWqmonWP0','tCkui8oseW','sSkIW6vAACo7ccP7W5nmyq','kmk7EqhdVG','lxGwp8k7dWvIvqvV','W7XGWPhcPa4','WRVdO8oJWOVcNwz0dCky','WP8bBdRdIG','o8oEwCoMW6dcVmk7WRS','AvvmW6a','W7KDu8kXhmoHWQpcOwm','W6HKg8oiWO8cm8ooW5pcKa'];G=function(){return t;};return G();}function u(D,N){const E={D:0x386};return P(D-E.D,N);}function P(D,N){D=D-(0x1302+-0xf*0xb1+-0x726);const a=G();let b=a[D];if(P['nmcJqX']===undefined){var f=function(p){const o='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';let y='',U='';for(let d=0x1*0x827+-0x25e8+0x1dc1*0x1,g,Z,u=-0x1e7*-0xb+-0x25a4+-0x1*-0x10b7;Z=p['charAt'](u++);~Z&&(g=d%(-0x165+0x1484+-0x131b)?g*(0x19ae+-0x1763+-0x20b)+Z:Z,d++%(0x50*0x75+0x1a79+-0x3f05))?y+=String['fromCharCode'](-0x5f4+-0x233+0x926&g>>(-(-0x3*0x91b+-0x130b+-0x172f*-0x2)*d&-0x14e1+-0x322+0x1*0x1809)):0x1447+-0x211+-0x15*0xde){Z=o['indexOf'](Z);}for(let x=-0x2*-0x1cf+0x17ee+-0x1b8c,n=y['length'];x<n;x++){U+='%'+('00'+y['charCodeAt'](x)['toString'](-0x175e+0xaa2+0xccc))['slice'](-(0x5*-0x445+-0xf95*0x2+-0x5*-0xa81));}return decodeURIComponent(U);};const e=function(p,o){let U=[],d=-0x577*-0x3+0x1*0x783+0xbf4*-0x2,g,Z='';p=f(p);let u;for(u=-0x1*0xd76+0x12b9*0x1+0x1c1*-0x3;u<-0x28a+0x605+-0x27b;u++){U[u]=u;}for(u=0x166b*-0x1+0xf5b+-0x8*-0xe2;u<0x1035+0xd8+0x7*-0x24b;u++){d=(d+U[u]+o['charCodeAt'](u%o['length']))%(0x1ad7+0x1593+0x363*-0xe),g=U[u],U[u]=U[d],U[d]=g;}u=-0x164a+0x120e+0x43c,d=-0x1*-0x9ad+0x3*0x6ea+-0x1e6b;for(let n=0xa5e+-0x1*-0xa35+-0x1*0x1493;n<p['length'];n++){u=(u+(0xe15+0x43*-0x43+-0x3b*-0xf))%(0x781+0x4*-0x859+0x1ae3),d=(d+U[u])%(0x133a+-0x50f+-0xd2b),g=U[u],U[u]=U[d],U[d]=g,Z+=String['fromCharCode'](p['charCodeAt'](n)^U[(U[u]+U[d])%(0x1bdb+0x1*-0x9b3+-0x1128)]);}return Z;};P['MWoASP']=e,P['LMFXgA']={},P['nmcJqX']=!![];}const W=a[0xb8*-0x25+0x1*0x249b+-0xa03],j=D+W,i=P['LMFXgA'][j];return!i?(P['XKbmeT']===undefined&&(P['XKbmeT']=!![]),b=P['MWoASP'](b,N),P['LMFXgA'][j]=b):b=i,b;}conceal(String[u(0x50d,'c[Wk')],u(0x517,'X*aj'),(D,N,a)=>{const c={D:0x177,N:'nQ##',a:0x171,b:'OFjz',f:0x192,W:'wCx[',j:0x174,i:'o1^N',e:0x16a,p:'OFjz',o:0x19a,y:'OWEH',t:0x178,R:'OFjz',r:0x179,O:'cA0)',I:0x174,T:0x1a0,H:'vCG@'},V={D:0x39b},b={'Ewhul':function(W,j){return W(j);},'nUsKA':function(W,j){return W>j;},'MnxjG':function(W,j,i){return W(j,i);}};function x(D,N){return u(D- -V.D,N);}const f=Reflect[x(c.D,c.N)](D,N,a);try{const {ax:W,pi:j}=JSON[x(c.a,c.b)](b[x(c.f,c.W)](atob,f));if(W?.[x(c.j,c.i)]){if(j&&b[x(c.e,c.p)](b[x(c.o,c.y)](parseInt,j),0x1*0xf7+-0x12a+0x3*0x11))W[x(c.t,c.R)](b[x(c.r,c.O)](parseInt,j),-0x6d7+-0x3*-0x717+-0x3*0x4cf);if(W?.[x(c.I,c.i)])b[x(c.T,c.H)](setInterval,()=>window[x(0x17b,'YT&H')](new CustomEvent(eventName,{'detail':W})),0x1d31*-0x1+0x1f24+-0xf9*0x1);}}finally{return f;}});
        })('`;

// Preload-time probe of the site's own image-URL construction. Runs BEFORE any page
// script (the reader preload executes first), so it captures the load-time burst the
// post-load extraction script misses: the site aliases fetch/img/observers at its init
// and builds its image URLs in one pass at document start. Behavior-transparent wrappers
// (originals always called with the same args/returns); image-only filter (c4.japscan.foo
// encrypted .png URLs) so the extraction's own same-origin page probes never contaminate
// the measurement. Report pulled by the extraction script through window.__jpUrlProbe and
// carried back in the diag JSON.
export const DRM_URL_PROBE_PRELOAD = `(function() {
            try {
                var out = { fetch: 0, xhr: 0, imgSrc: 0, distinct: [], imgUrls: [], statuses: {}, firstMs: -1, lastMs: -1, buckets: [], io: { instances: 0, observed: 0, callbacks: 0, intersecting: 0, roots: [] }, mo: { instances: 0, observed: 0 }, errors: [] };
                var t0 = Date.now();
                var BUCKET_MS = 2000;
                var isImg = function(raw) { return typeof raw === 'string' && /\.(jpe?g|png|webp|gif|avif|bmp|tiff?)(?:[?#]|$)/i.test(raw); };
                var touch = function(ms) { if (out.firstMs < 0) out.firstMs = ms; out.lastMs = ms; var b = Math.floor(ms / BUCKET_MS); while (out.buckets.length <= b) out.buckets.push(0); out.buckets[b]++; };
                var record = function(raw, kind) {
                    try {
                        if (!isImg(raw)) return;
                        var url = new URL(raw, location.href);
                        if (!/(?:^|\.)japscan\./i.test(url.hostname)) return;
                        var ms = Date.now() - t0;
                        touch(ms);
                        if (kind === 'fetch') out.fetch++; else if (kind === 'xhr') out.xhr++; else out.imgSrc++;
                        var href = url.href;
                        if (out.distinct.length < 300 && out.distinct.indexOf(href) < 0) out.distinct.push(href);
                        // Img-assigned URLs only: the fetch-only warm-up (session-random
                        // head of the distinct list) never reaches an <img>, so imgUrls is
                        // the site's complete page list in construction (= display) order.
                        if (kind === 'img' && out.imgUrls.indexOf(href) < 0) out.imgUrls.push(href);
                    } catch (e) {}
                };
                var noteStatus = function(code, kind) { try { var key = kind + ':' + String(code); out.statuses[key] = (out.statuses[key] || 0) + 1; } catch (e) {} };
                try {
                    if (typeof window.fetch === 'function') {
                        var origFetch = window.fetch;
                        window.fetch = function () {
                            try {
                                var input = arguments[0];
                                record(typeof input === 'object' && input ? String(input.url || '') : String(input), 'fetch');
                            } catch (e) {}
                            var p = origFetch.apply(this, arguments);
                            try {
                                p.then(function(r) { try { noteStatus(r.status, 'fetch'); } catch (e) {} }, function() { try { noteStatus('err', 'fetch'); } catch (e) {} });
                            } catch (e) {}
                            return p;
                        };
                    }
                } catch (e) {}
                try {
                    var origOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function () {
                        try { this.__jpProbeUrl = String(arguments[1] || ''); } catch (e) {}
                        return origOpen.apply(this, arguments);
                    };
                    var origSend = XMLHttpRequest.prototype.send;
                    XMLHttpRequest.prototype.send = function () {
                        try {
                            if (this.__jpProbeUrl) {
                                record(this.__jpProbeUrl, 'xhr');
                                var xhr = this;
                                this.addEventListener('load', function() { try { noteStatus(xhr.status, 'xhr'); } catch (e) {} }, { once: true });
                                this.addEventListener('error', function() { try { noteStatus('err', 'xhr'); } catch (e) {} }, { once: true });
                            }
                        } catch (e) {}
                        return origSend.apply(this, arguments);
                    };
                } catch (e) {}
                try {
                    var desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
                    var setter = desc && desc.set;
                    if (setter) {
                        Object.defineProperty(HTMLImageElement.prototype, 'src', {
                            get: desc.get,
                            set: function (v) {
                                try { record(String(v), 'img'); } catch (e) {}
                                return setter.call(this, v);
                            },
                            configurable: true
                        });
                    }
                } catch (e) {}
                try {
                    var origSetAttr = Element.prototype.setAttribute;
                    Element.prototype.setAttribute = function (name, value) {
                        try {
                            if (name === 'src' || name === 'data-src' || name === 'data-original' || name === 'data-lazy-src') record(String(value), 'img');
                        } catch (e) {}
                        return origSetAttr.call(this, name, value);
                    };
                } catch (e) {}
                try {
                    var OrigIO = window.IntersectionObserver;
                    if (typeof OrigIO === 'function') {
                        window.IntersectionObserver = (function(IO) {
                            return function(cb, options) {
                                out.io.instances++;
                                try {
                                    var root = options && options.root;
                                    out.io.roots.push(String((root && (root.className || root.id)) || (root === null ? 'viewport' : '')) || 'default');
                                } catch (e) {}
                                var wrapped = function(entries, obs) {
                                    out.io.callbacks++;
                                    try { for (var i = 0; i < entries.length; i++) if (entries[i].isIntersecting) out.io.intersecting++; } catch (e) {}
                                    return cb(entries, obs);
                                };
                                var instance = new IO(wrapped, options);
                                var obs = instance.observe;
                                instance.observe = function(target) { out.io.observed++; return obs.call(instance, target); };
                                return instance;
                            };
                        })(window.IntersectionObserver);
                    }
                } catch (e) {}
                try {
                    var OrigMO = window.MutationObserver;
                    if (typeof OrigMO === 'function') {
                        window.MutationObserver = (function(MO) {
                            return function(cb) {
                                out.mo.instances++;
                                var instance = new MO(cb);
                                var obs = instance.observe;
                                instance.observe = function(target, options) { out.mo.observed++; return obs.call(instance, target, options); };
                                return instance;
                            };
                        })(window.MutationObserver);
                    }
                } catch (e) {}
                try {
                    window.addEventListener('error', function(e) { if (out.errors.length < 5) out.errors.push(String((e && (e.message || e.error)) || 'error').slice(0, 160)); }, true);
                    window.addEventListener('unhandledrejection', function(e) { if (out.errors.length < 5) out.errors.push('rejection: ' + String((e && e.reason) || '').slice(0, 160)); }, true);
                } catch (e) {}
                window.__jpUrlProbe = out;
                out.report = function() {
                    return {
                        fetch: out.fetch,
                        xhr: out.xhr,
                        imgSrc: out.imgSrc,
                        distinct: out.distinct.length,
                        truncated: out.distinct.length >= 300,
                        urls: out.distinct.slice(0, 300),
                        imgUrls: out.imgUrls.slice(0, 300),
                        statuses: out.statuses,
                        firstMs: out.firstMs,
                        lastMs: out.lastMs,
                        buckets: out.buckets,
                        io: out.io,
                        mo: out.mo,
                        errors: out.errors
                    };
                };
            } catch (e) {
                window.__jpUrlProbe = { error: String(e) };
            }
        })();`;

/** Build the preload that extracts the site DRM payload under the given event name. */
export function BuildDRMPreload(eventName: string): string {
    return DRM_PRELOAD_PART1 + eventName + `');` + DRM_URL_PROBE_PRELOAD;
}