/*
title: '九色视频', author: '小可乐 v6.1.1'
ext 可选:
{
    "host": "https://jiuse.me",
    "timeout": 6000,
    "catesSet": "91最新&蝌蚪最新&精品视频",
    "tabsSet": "直连播放&网页播放"
}
官方群https://t.me/jiuseY
发布页https://d2.dizhi955.com/
*/

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36';
const DefHeader = {'User-Agent': MOBILE_UA};

var HOST;
var KParams = {
    headers: {'User-Agent': MOBILE_UA},
    timeout: 5000,
    catesSet: '',
    tabsSet: '',
    resHtml: ''
};

const DEFAULT_CLASSES = [
    {type_name: '91最新', type_id: 'video/category/latest'},
    {type_name: '91高清', type_id: 'video/category/hd'},
    {type_name: '91收藏', type_id: 'video/category/recent-favorite'},
    {type_name: '91热门', type_id: 'video/category/hot-list'},
    {type_name: '91评分', type_id: 'video/category/recent-rating'},
    {type_name: '91原创', type_id: 'video/category/ori'},
    {type_name: '91长片', type_id: 'video/category/long-list'},
    {type_name: '蝌蚪最新', type_id: 'videos/latest-updates'},
    {type_name: '蝌蚪评分', type_id: 'videos/top-rated'},
    {type_name: '蝌蚪热门', type_id: 'videos/most-popular'},
    {type_name: '经典三级', type_id: 'videos/categories/chinese'},
    {type_name: '欧美', type_id: 'videos/categories/europe-america'},
    {type_name: '日本韩国', type_id: 'videos/categories/japan-korea'},
    {type_name: '无码', type_id: 'videos/categories/unpixelated'},
    {type_name: '精品视频', type_id: 'vod'},
    {type_name: '精品原创', type_id: 'vod/%E5%8E%9F%E5%88%9B'},
    {type_name: '精品转发', type_id: 'vod/%E8%BD%AC%E5%8F%91'},
    {type_name: '精品赞助', type_id: 'vod/%E8%B5%9E%E5%8A%A9'}
];

async function init(cfg) {
    try {
        HOST = (cfg?.ext?.host?.trim() || 'https://jiuse.me').replace(/\/$/, '');
        KParams.headers['Referer'] = HOST;

        let parseTimeout = parseInt(cfg?.ext?.timeout?.trim(), 10);
        if (parseTimeout > 0) {KParams.timeout = parseTimeout;}

        KParams.catesSet = cfg?.ext?.catesSet?.trim() || '';
        KParams.tabsSet = cfg?.ext?.tabsSet?.trim() || '';
        KParams.resHtml = await request(HOST);
    } catch (e) {
        console.error('初始化失败:', e.message);
    }
}

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

async function homeVod() {
    try {
        let VODS = getVodList(KParams.resHtml);
        return JSON.stringify({list: VODS});
    } catch (e) {
        console.error('获取推荐失败:', e.message);
        return JSON.stringify({list: []});
    }
}

async function category(tid, pg, filter, extend) {
    try {
        pg = parseInt(pg, 10);
        pg = pg > 0 ? pg : 1;

        let cateUrl = buildPageUrl(extend?.cateId || tid, pg);
        let resHtml = await request(cateUrl);
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

        let searchUrl = buildSearchUrl(wd, pg);
        let resHtml = await request(searchUrl);
        let VODS = getVodList(resHtml);
        let limit = VODS.length;
        let pagecount = getPageCount(resHtml, pg);

        return JSON.stringify({list: VODS, page: pg, pagecount, limit, total: limit * pagecount});
    } catch (e) {
        console.error('搜索失败:', e.message);
        return JSON.stringify({list: [], page: 1, pagecount: 0, limit: 30, total: 0});
    }
}

async function detail(ids) {
    try {
        let detailUrl = normalizePlayableUrl(absUrl(ids));
        let resHtml = await request(detailUrl);
        if (!resHtml) {throw new Error('源码为空');}

        let videoTag = cutStr(resHtml, '<video', '</video>', '', false);
        let kname = htmlDecode(getMeta(resHtml, 'og:title') || cutStr(resHtml, '<h4', '</h4>', '名称'));
        let kpic = htmlDecode(getAttr(videoTag, 'data-poster') || getAttr(videoTag, 'poster') || getMeta(resHtml, 'og:image:secure_url') || getMeta(resHtml, 'og:image'));
        let duration = getMeta(resHtml, 'video:duration');
        let kremarks = /^\d{1,2}:\d{2}(?::\d{2})?$/.test(duration) ? duration : secondToTime(duration);
        let kcontent = htmlDecode(getMeta(resHtml, 'og:description') || getMetaByName(resHtml, 'description') || kname);
        let playUrl = getPlayUrl(resHtml);

        let ktabs = ['网页播放'];
        let kurls = [`正片$${detailUrl}`];
        if (playUrl) {
            ktabs.unshift('直连播放');
            kurls.unshift(`正片$${playUrl}`);
        }

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
        console.error('详情失败:', e.message);
        return JSON.stringify({list: []});
    }
}

async function play(flag, ids, flags) {
    try {
        let kurl = htmlDecode(ids);
        let parse = 0;

        if (/网页/.test(flag)) {
            return JSON.stringify({jx: 0, parse: 1, url: kurl, header: DefHeader});
        }

        if (!/\.(m3u8|mp4)(\?|$)/i.test(kurl)) {
            let resHtml = await request(normalizePlayableUrl(absUrl(kurl)));
            kurl = getPlayUrl(resHtml) || kurl;
            parse = /\.(m3u8|mp4)(\?|$)/i.test(kurl) ? 0 : 1;
        }

        return JSON.stringify({jx: 0, parse, url: kurl, header: DefHeader});
    } catch (e) {
        console.error('播放失败:', e.message);
        return JSON.stringify({jx: 0, parse: 0, url: '', header: {}});
    }
}

function mergeHomeClasses(khtml) {
    let classes = [...DEFAULT_CLASSES];
    let seen = new Set(classes.map(it => it.type_id));

    if (khtml) {
        const navReg = /<a\b[^>]*href=["'](\/(?:video\/category|videos\/categories|videos\/(?:latest-updates|top-rated|most-popular)|vod)(?:[^"']*)?)["'][^>]*>([^]*?)<\/a>/g;
        for (let mt of khtml.matchAll(navReg)) {
            let typeId = normalizeSitePath(htmlDecode(mt[1])).replace(/^\/|\/$/g, '').replace(/\/1$/, '');
            if (!typeId || seen.has(typeId) || /\/view/.test(typeId)) {continue;}
            seen.add(typeId);

            let name = htmlDecode(mt[2]).replace(/\s+/g, ' ').trim();
            if (!name || /首页|视频|论坛|登录|注册|App|VIP|番/.test(name)) {continue;}
            classes.push({type_name: name, type_id: typeId});
        }
    }

    return classes;
}

function getVodList(khtml) {
    try {
        if (!khtml) {throw new Error('源码为空');}
        let kvods = [];
        let seen = new Set();
        let cards = splitCards(khtml, '<div class="video-elem');

        for (let card of cards) {
            let href = card.match(/href=["'](\/(?:video\/view(?:hd)?|videos\/view|vod\/view(?:hd)?)[^"']*)["']/i)?.[1] || '';
            if (!href) {continue;}

            let kid = normalizePlayableUrl(absUrl(htmlDecode(href)));
            if (!kid || seen.has(kid)) {continue;}
            seen.add(kid);

            let titleHtml = card.match(/<a\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([^]*?)<\/a>/i)?.[1] || '';
            let kname = cleanText(titleHtml || getAttr(card, 'title') || getAttr(card, 'alt') || '名称');
            let stylePic = card.match(/background-image\s*:\s*url\((["']?)([^"')]+)\1\)/i)?.[2] || '';
            let kpic = htmlDecode(stylePic || getAttr(card, 'data-src') || getAttr(card, 'data-original') || getAttr(card, 'src'));
            let kremarks = htmlDecode(card.match(/<small\b[^>]*class=["'][^"']*\blayer\b[^"']*["'][^>]*>([^<]*)/i)?.[1] || '');

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

function splitCards(khtml, marker) {
    let cards = [];
    let pos = 0;
    while (true) {
        let start = khtml.indexOf(marker, pos);
        if (start < 0) {break;}
        let next = khtml.indexOf(marker, start + marker.length);
        cards.push(khtml.slice(start, next > -1 ? next : start + 4000));
        pos = next > -1 ? next : khtml.length;
    }
    return cards;
}

function buildPageUrl(typeId, pg) {
    let path = normalizeSitePath(typeId).replace(/^\/|\/$/g, '').replace(/\/1$/, '');
    if (!path) {path = 'video/category/latest';}

    if (/^vod(?:\/|$)/i.test(path)) {
        return absUrl(pg > 1 ? `${path}?page=${pg}` : path);
    }

    if (/^videos\//i.test(path)) {
        return absUrl(`${path}/${pg}`);
    }

    return absUrl(pg > 1 ? `${path}/${pg}` : path);
}

function buildSearchUrl(wd, pg) {
    let query = `search?keywords=${encodeURIComponent(wd || '')}`;
    if (pg > 1) {query += `&page=${pg}`;}
    return absUrl(query);
}

function normalizePlayableUrl(url) {
    if (!url) {return '';}
    return url
        .replace(/\/video\/viewhd\//i, '/video/view/')
        .replace(/\/vod\/viewhd\//i, '/vod/view/');
}

function normalizeSitePath(href) {
    try {
        if (typeof href !== 'string' || !href.trim()) {return '';}
        let path = href.trim().replace(/^https?:\/\/[^/]+/i, '');
        path = path.replace(/&amp;/g, '&').replace(/[?#][^]*$/, '');
        if (!path.startsWith('/')) {path = '/' + path;}
        return path.replace(/\/{2,}/g, '/');
    } catch (e) {
        return '';
    }
}

function absUrl(path) {
    if (typeof path !== 'string' || !path.trim()) {return '';}
    path = htmlDecode(path.trim());
    if (/^https?:\/\//i.test(path)) {return path;}
    if (path.startsWith('//')) {return 'https:' + path;}
    return `${HOST}/${path.replace(/^\/+/, '')}`;
}

function getAttr(html, name) {
    try {
        let reg = new RegExp(`${name}=["']([^"']*)["']`, 'i');
        return html.match(reg)?.[1] ?? '';
    } catch (e) {
        return '';
    }
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
    } catch (e) {
        return '';
    }
}

function getPlayUrl(khtml) {
    try {
        let videoTag = cutStr(khtml, '<video', '</video>', '', false);
        let dataSrc = getAttr(videoTag, 'data-src') || getAttr(videoTag, 'src');
        if (dataSrc) {return htmlDecode(dataSrc);}

        let sourceTag = cutStr(khtml, '<source', '>', '', false);
        let sourceSrc = getAttr(sourceTag, 'src');
        if (sourceSrc) {return htmlDecode(sourceSrc);}

        let direct = khtml.match(/https?:\/\/[^"'<\s]+?\.(?:m3u8|mp4)(?:\?[^"'<\s]*)?/i)?.[0] || '';
        return htmlDecode(direct);
    } catch (e) {
        return '';
    }
}

function getPageCount(khtml, curPg = 1) {
    try {
        let maxPg = Number(curPg) || 1;
        const regs = [
            /href=["'][^"']*\/(?:video\/category\/[^"'?]+|videos\/(?:categories\/[^"'?]+|latest-updates|top-rated|most-popular))\/(\d+)["']/g,
            /href=["'][^"']*[?&]page=(\d+)/g
        ];

        for (let reg of regs) {
            for (let mt of khtml.matchAll(reg)) {
                let n = Number(mt[1]);
                if (n > maxPg) {maxPg = n;}
            }
        }
        return maxPg;
    } catch (e) {
        return Number(curPg) || 1;
    }
}

function secondToTime(sec) {
    sec = Number(sec);
    if (!sec || sec < 0) {return '';}
    let h = Math.floor(sec / 3600);
    let m = Math.floor((sec % 3600) / 60);
    let s = Math.floor(sec % 60);
    let pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

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

        let tgResult;
        let matchIdx = 0;
        if (idx >= 0) {
            for (let elt of matchIter) {
                if (matchIdx++ === idx) {
                    tgResult = elt[1];
                    break;
                }
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

async function request(reqUrl, options = {}) {
    try {
        if (typeof reqUrl !== 'string' || !reqUrl.trim()) {throw new Error('reqUrl 不能为空');}
        if (typeof options !== 'object' || Array.isArray(options) || options === null) {throw new Error('options 类型错误');}
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
            const resHeaders = typeof res.headers === 'object' && !Array.isArray(res.headers) && res.headers ? res.headers : {};
            return JSON.stringify({...resHeaders, body: res?.content ?? ''});
        }
        return res?.content ?? '';
    } catch (e) {
        console.error(`${reqUrl} -> 请求失败:`, e.message);
        return options?.withHeaders ? JSON.stringify({body: ''}) : '';
    }
}

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
