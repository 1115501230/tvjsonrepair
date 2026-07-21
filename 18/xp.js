/*
title: '星辰影院', author: '小可乐/v6.1.1'
说明：可以不写ext，也可以写ext，ext支持的参数和格式参数如下
"ext": {
    "host": "xxxx", //站点网址
    "timeout": 6000,  //请求超时，单位毫秒
    "catesSet": "电视剧&电影&综艺",  //指定分类和顺序
    "tabsSet": "土星&下载线1"  //指定线路和顺序
}
XP天堂 国内最新网址: https://xptta6.com
XP天堂 永久域名: https://xpxp618.com

失联后如何找到回家的路👇：
方法1:
加入XP天堂 电报官方群群：https://t.me/XPheaven    
*/

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36';
const DefHeader = {'User-Agent': MOBILE_UA};

// HOST 保存当前站点根地址；KParams 保存全局请求参数和用户 ext 配置。
// TVBox 会先调用 init(cfg)，后续 home/detail/play 等函数都复用这些参数。
var HOST;
var KParams = {
    headers: {'User-Agent': MOBILE_UA},
    timeout: 5000
};

// 初始化入口：读取 tvbox 配置中的 ext，并预先请求首页源码。
// cfg.ext 可传 host、timeout、catesSet、tabsSet；不传时使用脚本默认值。
async function init(cfg) {
    try {
        // 去掉 host 结尾的 /，方便后面拼接 /v、/vs、详情页地址。
        HOST = (cfg.ext?.host?.trim() || 'https://allow.pwifeigh.cc').replace(/\/$/, '');

        // 部分站点会校验 Referer，这里把 Referer 固定为站点根地址。
        KParams.headers['Referer'] = HOST;

        // 用户可通过 ext.timeout 覆盖默认请求超时。
        let parseTimeout = parseInt(cfg.ext?.timeout?.trim(), 10);
        if (parseTimeout > 0) {KParams.timeout = parseTimeout;}

        // catesSet 控制首页分类显示和排序；tabsSet 控制播放线路显示和排序。
        KParams.catesSet = cfg.ext?.catesSet?.trim() || '';
        KParams.tabsSet = cfg.ext?.tabsSet?.trim() || '';

        // 首页源码会被 home() 和 homeVod() 复用，减少重复请求。
        KParams.resHtml = await request(HOST);
    } catch (e) {
        console.error('初始化参数失败：', e.message);
    }
}

// 首页分类入口：TVBox 打开源时调用，用于返回顶部分类和筛选项。
// 新站首页主要是“热门入口 + 标签入口”，所以这里从导航和标签链接中生成分类。
// 返回格式：{ class: [{type_name,type_id}], filters: {分类id: [筛选配置]} }
async function home(filter) {
    try {
        let resHtml = KParams.resHtml;
        if (!resHtml) {throw new Error('源码为空');}

        // 从所有 <a> 里筛出站内列表页：/popular/all/ 和 /tags/数字/hot/。
        // type_id 保存的是路径本身，category() 翻页时会继续按这个路径拼 URL。
        let seen = new Set();
        let classes = cutStr(resHtml, '<a', '</a>', '', false, 0, true).map((it,idx) => {
            let href = cutStr(it, 'href="', '"', '');
            let path = normalizeSitePath(href);
            if (!/^\/(popular\/all|tags\/\d+\/hot)\/?$/.test(path)) {return null;}
            if (seen.has(path)) {return null;}
            seen.add(path);

            let cName = cutStr(it, 'title="', '"', '');
            if (!cName) {cName = cutStr(it, '>', '<', `分类${idx+1}`);}
            cName = cName.replace(/^🔥\s*/, '').trim() || `分类${idx+1}`;
            return {type_name: cName, type_id: path.replace(/^\/|\/$/g, '')};
        }).filter(Boolean);

        // 如果用户在 ext.catesSet 指定了分类，就只保留这些分类并按指定顺序排列。
        if (KParams.catesSet) {classes = ctSet(classes, KParams.catesSet);}
        let filters = {};
        return JSON.stringify({class: classes, filters: filters});
    } catch (e) {
        console.error('获取分类失败：', e.message);
        return JSON.stringify({class: [], filters: {}});
    }
}

// 首页推荐入口：返回首页上的影片列表，TVBox 常用于“推荐/首页”展示。
async function homeVod() {
    try {
        let resHtml = KParams.resHtml;
        let VODS = getVodList(resHtml);
        return JSON.stringify({list: VODS});
    } catch (e) {
        console.error('推荐页获取失败：', e.message);
        return JSON.stringify({list: []});
    }
}

// 分类列表入口：用户进入某个分类、翻页或使用筛选时调用。
// tid 是分类 id，pg 是页码，extend 是 TVBox 传入的筛选参数对象。
async function category(tid, pg, filter, extend) {
    try {
        pg = parseInt(pg, 10), pg = pg > 0 ? pg : 1;
        let fl = extend || {};

        // 按新站 URL 规则拼接列表页：
        // 第 1 页：/tags/3128/hot/；第 2 页：/tags/3128/hot/2/
        let cateUrl = buildPageUrl(fl.cateId || tid, pg);
        let resHtml = await request(cateUrl);
        let VODS = getVodList(resHtml);
        let limit = VODS.length;

        // 从分页链接里取最大页码；取不到时给一个保守页数，避免首页无法翻页。
        let pagecount = getPageCount(resHtml, pg);
        return JSON.stringify({list: VODS, page: pg, pagecount: pagecount, limit: limit, total: limit*pagecount});
    } catch (e) {
        console.error('类别页获取失败：', e.message);
        return JSON.stringify({list: [], page: 1, pagecount: 0, limit: 30, total: 0});
    }
}

// 搜索入口：wd 是关键词，pg 是页码。
// quick 参数表示是否快速搜索，本脚本没有单独使用。
async function search(wd, quick, pg) {
    try {
        pg = parseInt(pg, 10), pg = pg > 0 ? pg : 1;
        let searchUrl = buildPageUrl(`search/${encodeURIComponent(wd)}`, pg);
        let resHtml = await request(searchUrl);
        let VODS = getVodList(resHtml);
        let limit = VODS.length;
        let pagecount = getPageCount(resHtml, pg);
        return JSON.stringify({list: VODS, page: pg, pagecount: pagecount, limit: limit, total: limit*pagecount});
    } catch (e) {
        console.error('搜索页获取失败：', e.message);
        return JSON.stringify({list: [], page: 1, pagecount: 0, limit: 30, total: 0});
    }
}

// 把站内/站外链接统一整理成站内 path。新站页面里有时会出现 canonical 域名，
// 这里统一丢掉域名，只保留路径，后面再用当前 HOST 拼回去。
function normalizeSitePath(href) {
    try {
        if (typeof href !== 'string' || !href.trim()) {return '';}
        let path = href.trim().replace(/^https?:\/\/[^/]+/i, '');
        path = path.replace(/[?#][^]*$/, '');
        if (!path.startsWith('/')) {path = '/' + path;}
        return path.replace(/\/{2,}/g, '/');
    } catch (e) {
        return '';
    }
}

// 把 path 或 URL 转成完整 URL。TVBox 的 detail/play 入口收到的 id 可能是相对路径。
function absUrl(path) {
    if (typeof path !== 'string' || !path.trim()) {return '';}
    path = path.trim();
    if (/^https?:\/\//i.test(path)) {return path;}
    if (path.startsWith('//')) {return 'https:' + path;}
    return `${HOST}/${path.replace(/^\/+/, '')}`;
}

// 新站翻页规则是把页码作为路径的最后一段：/xxx/2/。
function buildPageUrl(typeId, pg) {
    let path = normalizeSitePath(typeId).replace(/^\/|\/$/g, '');
    let pagePath = pg > 1 ? `${path}/${pg}/` : `${path}/`;
    return absUrl(pagePath);
}

// 从 HTML 标签片段里取属性值，例如 getAttr('<img alt="a">', 'alt')。
function getAttr(html, name) {
    try {
        let reg = new RegExp(`${name}=["']([^"']*)["']`, 'i');
        return html.match(reg)?.[1] ?? '';
    } catch (e) {
        return '';
    }
}

// 常见 HTML 实体还原，避免标题中出现 &amp;、&#123; 这类文本。
function htmlDecode(str) {
    return String(str || '')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

// 从分页链接中估算总页数。能找到 /2/、/3/ 这样的分页链接就取最大值。
function getPageCount(khtml, curPg = 1) {
    try {
        let maxPg = Number(curPg) || 1;
        const reg = /href="[^"]*\/(?:hot|all|search\/[^/]+)\/(\d+)\/"/g;
        for (let mt of khtml.matchAll(reg)) {
            let n = Number(mt[1]);
            if (n > maxPg) {maxPg = n;}
        }
        return maxPg;
    } catch (e) {
        return Number(curPg) || 1;
    }
}

// 把秒数格式的 duration 转成 TVBox 列表里常见的 mm:ss。
function secondToTime(sec) {
    sec = Number(sec);
    if (!sec || sec < 0) {return '';}
    let h = Math.floor(sec / 3600);
    let m = Math.floor((sec % 3600) / 60);
    let s = Math.floor(sec % 60);
    let pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// 新站详情页脚本里有 var hlsUrl = "xxx.m3u8?..."; 播放直链从这里取。
function getPlayUrl(khtml) {
    try {
        let hlsUrl = cutStr(khtml, 'var hlsUrl = "', '"', '', false);
        if (hlsUrl) {return hlsUrl;}
        return khtml.match(/https?:\/\/[^"'<\s]+?\.(?:m3u8|mp4)(?:\?[^"'<\s]*)?/i)?.[0] ?? '';
    } catch (e) {
        return '';
    }
}

// 通用影片列表解析：把首页、分类页、搜索页中的 HTML 卡片转成 TVBox 认识的 vod 对象。
function getVodList(khtml) {
    try {
        if (!khtml) {throw new Error('源码为空');}  
        let kvods = [];

        // 新站卡片结构：
        // <div class="video-img-box">...<a href="/videos/xxx/">...<img data-src="封面" alt="标题">
        // 有些卡片用 data-src，有些用 z-image-loader-url；src 往往只是 holder 占位图。
        // 首页会混入广告外链和热门搜索图标，所以限定必须在 video-img-box 卡片内。
        const reg = /<div class="video-img-box[^"]*"[^]*?<a\s+href="(\/videos\/[^"]+\/)"[^>]*>[^]*?<img\b([^>]*)>/g;
        let seen = new Set();
        for (let mt of khtml.matchAll(reg)) {
            let kid = absUrl(mt[1]);
            if (!kid || seen.has(kid)) {continue;}
            seen.add(kid);

            let imgAttrs = mt[2] || '';
            let kname = htmlDecode(getAttr(imgAttrs, 'alt') || '名称');
            let kpic = htmlDecode(getAttr(imgAttrs, 'data-src') || getAttr(imgAttrs, 'z-image-loader-url') || getAttr(imgAttrs, 'data-original') || getAttr(imgAttrs, 'src') || '');
            let cardHtml = khtml.slice(mt.index, mt.index + 1600);
            let kremarks = htmlDecode(cutStr(cardHtml, '<span class="label">', '</span>', ''));
            if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(kremarks)) {kremarks = '';}

            kvods.push({
                vod_name: kname,
                vod_pic: absUrl(kpic),
                vod_remarks: kremarks,
                vod_id: kid
            });
        }
        return kvods;
    } catch (e) {
        console.error(`生成视频列表失败：`, e.message);
        return [];
    }
}

// 详情入口：TVBox 点击某个影片时调用。
// ids 来自 getVodList() 中的 vod_id，这里已经是完整详情页 URL。
async function detail(ids) {
    try {
        let detailUrl = absUrl(ids);
        let resHtml = await request(detailUrl);
        if (!resHtml) {throw new Error('源码为空');}  

        // 新站详情页的关键信息主要在 meta 标签和页面脚本中：
        // og:title/description/image 提供展示信息，var hlsUrl 提供真实播放 m3u8。
        let kname = htmlDecode(cutStr(resHtml, 'property="og:title" content="', '"', '名称'));
        kname = kname.replace(/\s*-\s*高清[^]*$/, '').trim() || '名称';
        let kpic = htmlDecode(cutStr(resHtml, '<video', '>', '', false));
        kpic = htmlDecode(getAttr(kpic, 'data-src') || getAttr(kpic, 'poster') || cutStr(resHtml, 'property="og:image" content="', '"', ''));
        let kremarks = secondToTime(cutStr(resHtml, 'property="video:duration" content="', '"', ''));
        let kcontent = htmlDecode(cutStr(resHtml, 'name="description" content="', '"', kname));
        let playUrl = getPlayUrl(resHtml) || detailUrl;

        // 声音偏小通常是 TVBox 直连 HLS 播放器的表现差异，脚本层无法直接给音频加增益。
        // 默认把“网页播放”放第一条，交给 TVBox 解析/嗅探源站页面；第二条保留 m3u8 直连备用。
        let ktabs = ['网页播放', '直连播放'];
        let kurls = [`正片$${detailUrl}`, `正片$${playUrl}`];

        // 用户可通过 ext.tabsSet 指定只显示哪些线路，以及线路的显示顺序。
        if (KParams.tabsSet) {
            let ktus = ktabs.map((it, idx) => { return {type_name: it, type_value: kurls[idx]} });
            ktus = ctSet(ktus, KParams.tabsSet);
            ktabs = ktus.map(it => it.type_name);
            kurls = ktus.map(it => it.type_value);
        }

        // TVBox 详情对象：字段名基本是约定好的，播放线路和剧集地址是最关键的两项。
        let VOD = {
            vod_id: detailUrl,
            vod_name: kname,
            vod_pic: absUrl(kpic),
            vod_remarks: kremarks,
            type_name: '视频',
            vod_year: '',
            vod_area: '',
            vod_lang: '',
            vod_director: '',
            vod_actor: '',
            vod_content: kcontent,
            vod_play_from: ktabs.join('$$$'),
            vod_play_url: kurls.join('$$$')
        };
        return JSON.stringify({list: [VOD]});
    } catch (e) {
        console.error('详情页获取失败：', e.message);
        return JSON.stringify({list: []});
    }
}

// 播放入口：TVBox 选中某一集时调用。
// flag 是线路名，ids 是 detail() 中每集 $ 后面的地址。
async function play(flag, ids, flags) {
    try {
        let kp = 0, kurl = ids;

        // 网页播放：让 TVBox 解析/嗅探详情页里的播放器资源。
        // 这条线路更接近源站网页播放链路，常用于规避直连播放器的音量/解码差异。
        if (/网页/.test(flag)) {
            return JSON.stringify({jx: 0, parse: 1, url: kurl, header: DefHeader});
        }

        // 如果 detail() 已经传来 m3u8/mp4，直接返回给播放器。
        // 如果传来的是详情页 URL，则再请求一次并提取 hlsUrl。
        if (!/\.(m3u8|mp4)(\?|$)/i.test(kurl)) {
            let resHtml = await request(kurl);
            kurl = getPlayUrl(resHtml) || ids;
            if (!/\.(m3u8|mp4)(\?|$)/i.test(kurl)) {
                // parse: 1 表示需要外部解析；parse: 0 表示 url 可直接播放。
                kp = 1;
            }
        }
        return JSON.stringify({jx: 0, parse: kp, url: kurl, header: DefHeader});
    } catch (e) {
        console.error('播放失败：', e.message);
        return JSON.stringify({jx: 0, parse: 0, url: '', header: {}});
    }
}

// 根据用户配置的名称列表过滤并排序数组。
// setStr 形如 "电视剧&电影&综艺" 或 "土星&下载线1"。
function ctSet(kArr, setStr) {
    try {
        if (!Array.isArray(kArr) || kArr.length === 0 || typeof setStr !== 'string' || !setStr) { throw new Error('第一参数需为非空数组，第二参数需为非空字符串'); }
        const set_arr = [...kArr];
        const arrNames = setStr.split('&');
        const filtered_arr = arrNames.map(item => set_arr.find(it => it.type_name === item)).filter(Boolean);
        return filtered_arr.length? filtered_arr : [set_arr[0]];
    } catch (e) {
        console.error('ctSet 执行异常：', e.message);
        return kArr;
    }
}

// 安全 JSON 解析：解析失败时返回 null，避免异常中断整个播放流程。
function safeParseJSON(jStr){
    try {return JSON.parse(jStr);} catch(e) {return null;}
}

// 字符串截取工具：本脚本的核心解析方法。
// prefix/suffix 是左右边界；defVal 是默认值；clean 控制是否去 HTML 标签和多余空白；
// i 指定取第几个匹配，支持负数倒取；all=true 时返回所有匹配数组。
function cutStr(str, prefix = '', suffix = '', defVal = '', clean = true, i = 0, all = false) {
    try {
        if (typeof str !== 'string') {throw new Error('被截取对象必须为字符串');}

        // cleanStr 用于把 HTML 标签、&nbsp;、换行和多余空白清理成普通文本。
        const cleanStr = cs => String(cs).replace(/<[^>]*?>/g, ' ').replace(/(&nbsp;|[\u0020\u00A0\u3000\s])+/g, ' ').trim().replace(/\s+/g, ' ');

        // esc 先转义正则特殊字符，避免 prefix/suffix 中的 . ? / 等被当成正则语法。
        const esc = s => String(s).replace(/[.*+?${}()|[\]\\/^]/g, '\\$&');

        // 这里把 prefix 中的 £ 替换为 [^]*?，作为“跨行任意字符”的占位通配符。
        let pre = esc(prefix).replace(/£/g, '[^]*?'), end = esc(suffix);
        const regex = new RegExp(`${pre || '^'}([^]*?)${end || '$'}`, 'g');
        const matchIter = str.matchAll(regex);
        if (all) {
            let matchArr = [...matchIter];
            if (!matchArr.length) {return [defVal];}
            return matchArr.map(ela => ela[1] !== undefined ? (clean ? cleanStr(ela[1]) : ela[1]) : defVal);
        }
        const idx = parseInt(i, 10);
        if (isNaN(idx)) {throw new Error('序号必须为整数');}
        let tgResult, matchIdx = 0;
        if (idx >= 0) {
            // 正数索引：从前往后找到第 i 个匹配。
            for (let elt of matchIter) {
                if (matchIdx++ === idx) {
                    tgResult = elt[1];
                    break;
                }
            }
        } else {
            // 负数索引：用环形缓冲保存最后几个匹配，从而支持倒数第 i 个。
            let absI = Math.abs(idx), ringBuf = new Array(absI), ringPtr = 0, ringCnt = 0;
            for (let elt of matchIter) {
                ringBuf[ringPtr] = elt[1];
                ringPtr = (ringPtr + 1) % absI;
                ringCnt = Math.min(ringCnt + 1, absI);
                matchIdx++;
            }
            tgResult = (matchIdx >= absI && ringCnt > 0) ? ringBuf[ringPtr % ringCnt] : undefined;
        }
        return tgResult !== undefined ? (clean ? (cleanStr(tgResult) || defVal) : tgResult) : defVal;
    } catch (e) {
        console.error(`字符串截取错误：`, e.message);
        return all ? ['cutErr'] : 'cutErr';
    }
}

// 请求封装：统一套用 User-Agent、Referer、timeout，并兼容 GET/HEAD 不带 body。
// req() 是 TVBox/脚本运行环境提供的网络请求函数，不是在本文件里定义的。
async function request(reqUrl, options = {}) {
    try {
        if (typeof reqUrl !== 'string' || !reqUrl.trim()) { throw new Error('reqUrl需为字符串且非空'); }
        if (typeof options !== 'object' || Array.isArray(options) || options === null) { throw new Error('options类型需为非null对象'); }
        options.method = options.method?.toUpperCase() || 'GET';
        if (['GET', 'HEAD'].includes(options.method)) {
            delete options.body;
            delete options.data;
            delete options.postType;
        }
        let {headers, timeout, ...restOpts} = options;
        const optObj = {
            headers: (typeof headers === 'object' && !Array.isArray(headers) && headers) ? headers : KParams.headers,
            timeout: parseInt(timeout, 10) > 0 ? parseInt(timeout, 10) : KParams.timeout,
            ...restOpts
        };
        const res = await req(reqUrl, optObj);
        if (options.withHeaders) {
            // 某些场景需要响应头时，可通过 withHeaders 返回 headers + body 的 JSON 字符串。
            const resHeaders = typeof res.headers === 'object' && !Array.isArray(res.headers) && res.headers ? res.headers : {};
            const resWithHeaders = { ...resHeaders, body: res?.content ?? '' };
            return JSON.stringify(resWithHeaders);
        }
        return res?.content ?? '';
    } catch (e) {
        console.error(`${reqUrl}→请求失败：`, e.message);
        return options?.withHeaders ? JSON.stringify({ body: '' }) : '';
    }
}

// TVBox 加载 JS 源时会执行这个导出函数，拿到各个标准入口函数。
// proxy 为 null 表示本脚本不额外提供本地代理接口。
export function __jsEvalReturn() {
    return {
        init,
        home,
        homeVod,
        category,
        search,
        detail,
        play,
        proxy: null
    };
}
