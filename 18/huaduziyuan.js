/*
title: '花都资源', author: '小可乐 v6.1.1'
说明：maccms10 / stui 模板视频站，分类 /vodtype/{id}.html，搜索 /vodsearch/-------------.html?wd=
ext 可选:
{
    "host": "https://hd.huaduziyuan.com",      // 站点域名
    "timeout": 6000,                            // 请求超时（毫秒）
    "catesSet": "中文字幕&无字幕&国产&动漫&欧美",
    "tabsSet": ""                               // 线路筛选（留空=全部）
}
*/

// ============================================================
// 一、全局常量与配置区
// ============================================================

const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DefHeader = {'User-Agent': PC_UA};

var HOST;
var KParams = {
    headers: {'User-Agent': PC_UA, 'Referer': ''},
    timeout: 5000,
    catesSet: '',
    tabsSet: '',
    resHtml: ''
};

// 默认分类（与 stui 导航栏一致）
const DEFAULT_CLASSES = [
    {type_name: '中文字幕', type_id: '1'},
    {type_name: '无字幕',   type_id: '2'},
    {type_name: '国产',     type_id: '3'},
    {type_name: '欧美',     type_id: '4'},
    {type_name: '动漫',     type_id: '5'}
];

// ============================================================
// 二、初始化
// ============================================================
async function init(cfg) {
    try {
        HOST = (cfg?.ext?.host?.trim() || 'https://hd.huaduziyuan.com').replace(/\/$/, '');
        KParams.headers['Referer'] = HOST + '/';

        let parseTimeout = parseInt(cfg?.ext?.timeout?.trim(), 10);
        if (parseTimeout > 0) {KParams.timeout = parseTimeout;}

        KParams.catesSet = cfg?.ext?.catesSet?.trim() || '';
        KParams.tabsSet  = cfg?.ext?.tabsSet?.trim() || '';

        KParams.resHtml = await request(HOST + '/');
    } catch (e) {
        console.error('初始化失败:', e.message);
    }
}

// ============================================================
// 三、首页接口：home / homeVod
// ============================================================

// 分类：优先从 stui 导航动态解析，回退到默认分类
async function home(filter) {
    try {
        let classes = mergeHomeClasses(KParams.resHtml);
        if (KParams.catesSet) {classes = ctSet(classes, KParams.catesSet);}
        return JSON.stringify({class: classes, filters: {}});
    } catch (e) {
        console.error('获取分类失败:', e.message);
        return JSON.stringify({class: [], filters: {}});
    }
}

// 首页推荐：解析 stui 视频列表
async function homeVod() {
    try {
        let VODS = getVodList(KParams.resHtml);
        return JSON.stringify({list: VODS});
    } catch (e) {
        console.error('获取推荐失败:', e.message);
        return JSON.stringify({list: []});
    }
}

// ============================================================
// 四、列表接口：category / search
// ============================================================

async function category(tid, pg, filter, extend) {
    try {
        pg = parseInt(pg, 10);
        pg = pg > 0 ? pg : 1;

        let typeId = extend?.cateId || tid;
        let url = buildListUrl(typeId, pg);
        let resHtml = await request(url);
        let VODS = getVodList(resHtml);
        let limit = VODS.length;
        let pagecount = getPageCount(resHtml, pg);

        return JSON.stringify({list: VODS, page: pg, pagecount, limit, total: limit * pagecount});
    } catch (e) {
        console.error('获取分类页失败:', e.message);
        return JSON.stringify({list: [], page: 1, pagecount: 0, limit: 30, total: 0});
    }
}

async function search(wd, quick, pg) {
    try {
        pg = parseInt(pg, 10);
        pg = pg > 0 ? pg : 1;

        // maccms10 标准搜索 URL
        let url = `${HOST}/vodsearch/-------------.html?wd=${encodeURIComponent(wd || '')}`;
        if (pg > 1) {url += `&page=${pg}`;}

        let resHtml = await request(url);
        let VODS = getVodList(resHtml);
        let limit = VODS.length;
        let pagecount = getPageCount(resHtml, pg);

        return JSON.stringify({list: VODS, page: pg, pagecount, limit, total: limit * pagecount});
    } catch (e) {
        console.error('搜索失败:', e.message);
        return JSON.stringify({list: [], page: 1, pagecount: 0, limit: 30, total: 0});
    }
}

// ============================================================
// 五、详情与播放：detail / play
// ============================================================

async function detail(ids) {
    try {
        let detailUrl = absUrl(ids);
        let resHtml = await request(detailUrl);
        if (!resHtml) {throw new Error('源码为空');}

        // 标题：<h1 class="title"> 优先，其次 <title>
        let kname = cleanText(
            cutStr(resHtml, '<h1', '</h1>', '') ||
            cutStr(resHtml, '<title', '</title>', '名称')
        ).split(/\s*[-_|]\s*/)[0].trim() || '名称';

        // 封面：og:image → stui 封面 data-original/src → 第一张大图
        let kpic = htmlDecode(
            getMeta(resHtml, 'og:image') ||
            (cutStr(resHtml, 'class="stui-vodlist__thumb"', '</a>', '', false).match(/data-original=["']([^"']+)["']/i)?.[1]) ||
            (cutStr(resHtml, 'class="stui-vodlist__thumb"', '</a>', '', false).match(/src=["']([^"']+)["']/i)?.[1]) ||
            resHtml.match(/<img\b[^>]*?data-original=["']([^"']+)["']/i)?.[1] ||
            ''
        );

        // 信息块：导演 / 主演 / 分类 / 年份 / 更新
        let infoBlock = cutStr(resHtml, 'class="stui-content__detail"', '</div>', '', false);
        let kdirector = htmlDecode(extractInfo(infoBlock, '导演'));
        let kactor    = htmlDecode(extractInfo(infoBlock, '主演'));
        let kyear     = htmlDecode(extractInfo(infoBlock, '年份'));
        let karea     = htmlDecode(extractInfo(infoBlock, '地区'));
        let klang     = htmlDecode(extractInfo(infoBlock, '语言'));

        // 描述：detail-sketch / stui-content__desc / og:description
        let kcontent = htmlDecode(
            cleanText(cutStr(resHtml, 'class="detail-sketch"', '</span>', '')) ||
            cleanText(cutStr(resHtml, 'class="stui-content__desc"', '</div>', '')) ||
            getMeta(resHtml, 'og:description') ||
            getMetaByName(resHtml, 'description') ||
            kname
        );

        // 播放线路：解析 stui-content__playlist 多个线路 tab
        // 每个线路下有多集，每集是 /vodplay/{id}-{sid}-{nid}.html
        let ktabs = [];
        let kurls = [];

        // 匹配线路 tab：<h3 class="title">线路名</h3> ... <ul> ... <a href="/vodplay/X-Y-Z.html">第N集</a>
        // 用正则一次性匹配所有线路组
        const playlistReg = /<h[3-4][^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]{1,30})<\/h[3-4]>[\s\S]*?<ul[^>]*class=["'][^"']*playlist[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi;
        for (let mt of resHtml.matchAll(playlistReg)) {
            let tabName = cleanText(mt[1]) || '默认线路';
            let ulHtml = mt[2] || '';
            let eps = [];
            // 提取每集链接
            const epReg = /<a\b[^>]*href=["']([^"']*?\/vodplay\/\d+-\d+-\d+\.html)["'][^>]*>([^<]+)<\/a>/gi;
            for (let em of ulHtml.matchAll(epReg)) {
                let epUrl = absUrl(em[1]);
                let epName = cleanText(em[2]) || '正片';
                eps.push(`${epName}$${epUrl}`);
            }
            if (eps.length > 0) {
                ktabs.push(tabName);
                kurls.push(eps.join('$$$'));
            }
        }

        // 兜底：如果没匹配到线路 tab，尝试简单匹配所有 /vodplay/ 链接
        if (ktabs.length === 0) {
            const epReg = /<a\b[^>]*href=["']([^"']*?\/vodplay\/\d+-\d+-\d+\.html)["'][^>]*>([^<]+)<\/a>/gi;
            let eps = [];
            for (let em of resHtml.matchAll(epReg)) {
                let epUrl = absUrl(em[1]);
                let epName = cleanText(em[2]) || '正片';
                eps.push(`${epName}$${epUrl}`);
            }
            if (eps.length > 0) {
                ktabs.push('默认线路');
                kurls.push(eps.join('$$$'));
            }
        }

        // 兜底兜底：单集视频（详情页直接是播放页），用详情页 URL 作为「网页播放」
        if (ktabs.length === 0) {
            ktabs.push('网页播放');
            kurls.push(`正片$${detailUrl}`);
        }

        // 备注：集数 / 时长
        let kremarks = (kurls[0] || '').split('$$$').length + '集';

        // 按用户 tabsSet 筛选
        if (KParams.tabsSet) {
            let ktus = ktabs.map((it, idx) => ({type_name: it, type_value: kurls[idx]}));
            ktus = ctSet(ktus, KParams.tabsSet);
            ktabs = ktus.map(it => it.type_name);
            kurls = ktus.map(it => it.type_value);
        }

        let VOD = {
            vod_id: detailUrl,
            vod_name: kname,
            vod_pic: absUrl(kpic),
            vod_remarks: kremarks,
            type_name: '视频',
            vod_year: kyear,
            vod_area: karea,
            vod_lang: klang,
            vod_director: kdirector,
            vod_actor: kactor,
            vod_content: kcontent,
            vod_play_from: ktabs.join('$$$'),
            vod_play_url: kurls.join('$$$')
        };
        return JSON.stringify({list: [VOD]});
    } catch (e) {
        console.error('详情失败:', e.message);
        return JSON.stringify({list: []});
    }
}

// 解析播放页，提取 m3u8/mp4
async function play(flag, ids, flags) {
    try {
        let kurl = htmlDecode(ids);

        // 如果已经是直链，直接返回
        if (/\.(m3u8|mp4)(\?|$)/i.test(kurl)) {
            return JSON.stringify({jx: 0, parse: 0, url: kurl, header: DefHeader});
        }

        // 抓取播放页提取 m3u8
        let resHtml = await request(kurl);
        if (!resHtml) {throw new Error('播放页为空');}

        let playUrl = extractPlayUrl(resHtml);
        if (playUrl) {
            return JSON.stringify({jx: 0, parse: 0, url: playUrl, header: DefHeader});
        }

        // 找不到 m3u8，回退到浏览器内嵌
        return JSON.stringify({jx: 0, parse: 1, url: kurl, header: DefHeader});
    } catch (e) {
        console.error('播放失败:', e.message);
        return JSON.stringify({jx: 0, parse: 0, url: '', header: {}});
    }
}

// ============================================================
// 六、HTML 解析工具
// ============================================================

// 合并默认分类 + 首页导航分类
function mergeHomeClasses(khtml) {
    let classes = [...DEFAULT_CLASSES];
    let seen = new Set(classes.map(it => it.type_id));

    if (khtml) {
        // stui 导航：<a href="/vodtype/N.html">名称</a>
        const navReg = /<a\b[^>]*href=["']\/?vodtype\/(\d+)(?:\.html)?\/?["']?[^>]*>([^<]{1,30})<\/a>/gi;
        for (let mt of khtml.matchAll(navReg)) {
            let typeId = mt[1];
            let name = htmlDecode(mt[2]).replace(/\s+/g, ' ').trim();
            if (!name || seen.has(typeId)) {continue;}
            if (/首页|留言|发布|关于|联系|帮助|登录|注册/.test(name)) {continue;}
            seen.add(typeId);
            classes.push({type_name: name, type_id: typeId});
        }
    }
    return classes;
}

// 提取 stui 视频列表
// 卡片结构：<a class="stui-vodlist__thumb" href="/voddetail/ID.html"><img data-original="..." /></a>
//          <h3 class="title"><a href="/voddetail/ID.html">title</a></h3>
//          <p class="text text-overflow">remarks</p>
function getVodList(khtml) {
    try {
        if (!khtml) {throw new Error('源码为空');}
        let kvods = [];
        let seen = new Set();

        // 用 splitCards 切分 stui-vodlist 块
        const cards = khtml.split(/<li class="(?:active\s+)?(?:stui-vodlist__item|)[\s\S]*?(?=<li class="(?:active\s+)?stui-vodlist|$)/gi);
        // 上面 split 可能不准确，改用更稳的方式：找所有 voddetail 链接

        // 模式 1：直接匹配 detail 链接，文本作为标题
        const linkReg = /<a\b[^>]*href=["']\/?voddetail\/(\d+)\.html["'][^>]*>([^<]{2,}?)<\/a>/gi;
        for (let mt of khtml.matchAll(linkReg)) {
            let vodId = mt[1];
            let kname = cleanText(mt[2]);
            if (!kname || kname.length < 2) {continue;}

            let kid = `${HOST}/voddetail/${vodId}.html`;
            if (seen.has(kid)) {continue;}
            seen.add(kid);

            // 找位置，向前回溯找封面
            let pos = mt.index ?? khtml.indexOf(mt[0]);
            let before = khtml.slice(Math.max(0, pos - 1500), pos);

            // 封面：stui-vodlist__thumb 块内的 data-original / src
            let kpic = before.match(/<a\b[^>]*class=["'][^"']*stui-vodlist__thumb[^"']*["'][^>]*>[\s\S]*?<(?:img|source)[^>]*?(?:data-original|data-src|src)=["']([^"']+)["']/i)?.[1] || '';

            // 备注：更新至 / 第N集 / 日期
            let kremarks = cleanText(
                before.match(/<p\b[^>]*class=["'][^"']*text[^"']*["'][^>]*>([^<]{1,80})<\/p>/i)?.[1] || ''
            );

            kvods.push({
                vod_name: kname,
                vod_pic: absUrl(kpic),
                vod_remarks: kremarks,
                vod_id: kid
            });
        }

        return kvods;
    } catch (e) {
        console.error('生成视频列表失败:', e.message);
        return [];
    }
}

// 提取 stui-content__detail 中的字段（导演/主演/年份等）
function extractInfo(block, key) {
    try {
        // 形如 <p>导演：xxx</p> 或 <span class="text-muted">导演：</span> <span>xxx</span>
        let reg = new RegExp(`${escReg(key)}\\s*[:：]\\s*<[^>]*>([^<]{0,200})<`, 'i');
        let m = block.match(reg);
        if (m) {return cleanText(m[1]);}
        // 备选：纯文本
        reg = new RegExp(`${escReg(key)}\\s*[:：]\\s*([^<\\n]{0,200})`, 'i');
        m = block.match(reg);
        return m ? cleanText(m[1]) : '';
    } catch (e) {return '';}
}

// 提取播放页中的 m3u8/mp4
// 优先级：player_xxxx = {url:"..."} > <source src> > <video src> > 全文匹配
function extractPlayUrl(khtml) {
    try {
        // 1. player_xxxx = {url:"..."}  或  var player_xxxx={url:"..."}
        let m = khtml.match(/(?:var\s+)?player_[a-z0-9_]+\s*=\s*\{[^}]*?url\s*:\s*["']([^"']+)["']/i);
        if (m) {return htmlDecode(m[1]);}

        // 2. <source src="...">
        m = khtml.match(/<source[^>]*?src=["']([^"']+)["']/i);
        if (m) {return htmlDecode(m[1]);}

        // 3. <video src="..."> 或 data-src
        m = khtml.match(/<video[^>]*?(?:src|data-src)=["']([^"']+)["']/i);
        if (m) {return htmlDecode(m[1]);}

        // 4. 全文匹配 m3u8/mp4 直链
        m = khtml.match(/https?:\/\/[^"'<>'\s]+?\.(?:m3u8|mp4)(?:\?[^"'<>'\s]*)?/i);
        if (m) {return htmlDecode(m[0]);}

        return '';
    } catch (e) {return '';}
}

// ============================================================
// 七、URL 构造与规范化
// ============================================================

// 列表分页 URL（maccms10 标准）
// 首页：/vodtype/{id}.html
// 其他页：/vodtype/{id}/index_{pg}.html （maccms10 默认）
function buildListUrl(typeId, pg) {
    typeId = String(typeId || '').replace(/[^\d]/g, '');
    if (!typeId) {typeId = '1';}
    if (pg <= 1) {return absUrl(`/vodtype/${typeId}.html`);}
    return absUrl(`/vodtype/${typeId}/index_${pg}.html`);
}

// 估算总页数（扫描分页器）
function getPageCount(khtml, curPg = 1) {
    try {
        let maxPg = Number(curPg) || 1;
        const regs = [
            // maccms10: /vodtype/N/index_K.html 或 /vodsearch/.../index_K.html
            /href=["'][^"']*\/index_(\d+)\.html["']/g,
            // 旧版: /vodtype/N-K.html
            /href=["'][^"']*\/vodtype\/\d+-(\d+)\.html["']/g,
            // search 分页: ?page=K
            /href=["'][^"']*[?&]page=(\d+)/g,
            // 文本分页: <a>5</a>
            /<a[^>]*>\s*(\d+)\s*<\/a>/g
        ];
        for (let reg of regs) {
            for (let mt of khtml.matchAll(reg)) {
                let n = Number(mt[1]);
                if (n > maxPg && n < 9999) {maxPg = n;}
            }
        }
        return maxPg;
    } catch (e) {return Number(curPg) || 1;}
}

function absUrl(path) {
    if (typeof path !== 'string' || !path.trim()) {return '';}
    path = htmlDecode(path.trim());
    if (/^https?:\/\//i.test(path)) {return path;}
    if (path.startsWith('//')) {return 'https:' + path;}
    return `${HOST}/${path.replace(/^\/+/, '')}`;
}

// ============================================================
// 八、HTML 属性 / Meta
// ============================================================

function getAttr(html, name) {
    try {
        let reg = new RegExp(`${name}=["']([^"']*)["']`, 'i');
        return html.match(reg)?.[1] ?? '';
    } catch (e) {return '';}
}

function getMeta(khtml, property) {
    return getMetaByKey(khtml, 'property', property);
}

function getMetaByName(khtml, name) {
    return getMetaByKey(khtml, 'name', name);
}

function getMetaByKey(khtml, key, value) {
    try {
        let reg = new RegExp(`<meta\\b[^>]*${key}=["']${escReg(value)}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i');
        let mt = khtml.match(reg);
        if (mt) {return htmlDecode(mt[1]);}
        reg = new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*${key}=["']${escReg(value)}["'][^>]*>`, 'i');
        return htmlDecode(khtml.match(reg)?.[1] || '');
    } catch (e) {return '';}
}

// ============================================================
// 九、辅助工具
// ============================================================

function htmlDecode(str) {
    return String(str || '')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

function cleanText(str) {
    return htmlDecode(str).replace(/<[^>]*?>/g, ' ').replace(/(&nbsp;|[\u0020\u00A0\u3000\s])+/g, ' ').trim();
}

function escReg(str) {
    return String(str).replace(/[.*+?${}()|[\]\\]/g, '\\$&');
}

function ctSet(kArr, setStr) {
    try {
        if (!Array.isArray(kArr) || kArr.length === 0 || typeof setStr !== 'string' || !setStr) {
            throw new Error('参数错误');
        }
        const setArr = [...kArr];
        const arrNames = setStr.split('&');
        const filteredArr = arrNames.map(item => setArr.find(it => it.type_name === item)).filter(Boolean);
        return filteredArr.length ? filteredArr : [setArr[0]];
    } catch (e) {
        console.error('ctSet 执行异常:', e.message);
        return kArr;
    }
}

function cutStr(str, prefix = '', suffix = '', defVal = '', clean = true, i = 0, all = false) {
    try {
        if (typeof str !== 'string') {throw new Error('被截取对象必须为字符串');}
        const cleanStr = cs => String(cs).replace(/<[^>]*?>/g, ' ').replace(/(&nbsp;|[\u0020\u00A0\u3000\s])+/g, ' ').trim().replace(/\s+/g, ' ');
        const esc = s => String(s).replace(/[.*+?${}()|[\]\\/^]/g, '\\$&');
        let pre = esc(prefix).replace(/拢/g, '[^]*?');
        let end = esc(suffix);
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
            for (let elt of matchIter) {
                if (matchIdx++ === idx) {tgResult = elt[1]; break;}
            }
        } else {
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
        console.error('字符串截取错误:', e.message);
        return all ? ['cutErr'] : 'cutErr';
    }
}

// ============================================================
// 十、网络请求封装
// ============================================================
async function request(reqUrl, options = {}) {
    try {
        if (typeof reqUrl !== 'string' || !reqUrl.trim()) {throw new Error('reqUrl 不能为空');}
        if (typeof options !== 'object' || Array.isArray(options) || options === null) {throw new Error('options 类型错误');}
        options.method = options.method?.toUpperCase() || 'GET';
        if (['GET', 'HEAD'].includes(options.method)) {
            delete options.body; delete options.data; delete options.postType;
        }
        let {headers, timeout, ...restOpts} = options;
        const optObj = {
            headers: (typeof headers === 'object' && !Array.isArray(headers) && headers) ? headers : KParams.headers,
            timeout: parseInt(timeout, 10) > 0 ? parseInt(timeout, 10) : KParams.timeout,
            ...restOpts
        };
        const res = await req(reqUrl, optObj);
        if (options.withHeaders) {
            const resHeaders = typeof res.headers === 'object' && !Array.isArray(res.headers) && res.headers ? res.headers : {};
            return JSON.stringify({...resHeaders, body: res?.content ?? ''});
        }
        return res?.content ?? '';
    } catch (e) {
        console.error(`${reqUrl} -> 请求失败:`, e.message);
        return options?.withHeaders ? JSON.stringify({body: ''}) : '';
    }
}

// ============================================================
// 十一、插件导出入口
// ============================================================
export function __jsEvalReturn() {
    return {
        init, home, homeVod, category, search, detail, play,
        proxy: null
    };
}
