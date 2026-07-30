/*
title: '66aa影院', author: '小可乐 v6.1.1'
ext 可选:
{
    "host": "https://www.66aayy.com",     // 站点域名（可替换为镜像）
    "timeout": 6000,                        // 请求超时时间（毫秒）
    "catesSet": "长片&日本无码&无码破解",   // 首页分类筛选（&分隔）
    "tabsSet": "普通&极速&下载"             // 详情页线路筛选（&分隔）
}
*/

// ============================================================
// 一、全局常量与配置区
// ============================================================

// PC UA：站点对 PC 浏览器返回完整页面
const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 默认请求头（备用，主要请求会携带 Referer）
const DefHeader = {'User-Agent': PC_UA};

// 站点根域名（运行时从 cfg.ext.host 赋值）
var HOST;

// 全局参数对象：集中管理请求头、超时、用户配置和首页缓存
var KParams = {
    headers: {'User-Agent': PC_UA, 'Referer': ''},
    timeout: 5000,
    catesSet: '',
    tabsSet: '',
    resHtml: ''
};

// ============================================================
// 二、默认分类配置区
// ============================================================
// 注：首页"长片"分区下的 7 个子分类（list26/84/22/25/19/28/20）
// 首页"最新国产""动漫"是 JS 内嵌区块，没有独立可分页的 list URL，故不放入分类
const DEFAULT_CLASSES = [
    {type_name: '无码素人', type_id: 'htms/list26'},
    {type_name: '日本无码', type_id: 'htms/list84'},
    {type_name: '无码破解', type_id: 'htms/list22'},
    {type_name: '日韩中字', type_id: 'htms/list25'},
    {type_name: '欧美劲爆', type_id: 'htms/list19'},
    {type_name: '经典三级', type_id: 'htms/list28'},
    {type_name: '3D动漫',   type_id: 'htms/list20'}
];

// ============================================================
// 三、生命周期入口：init 初始化
// ============================================================
async function init(cfg) {
    try {
        HOST = (cfg?.ext?.host?.trim() || 'https://www.66aayy.com').replace(/\/$/, '');
        KParams.headers['Referer'] = HOST;

        let parseTimeout = parseInt(cfg?.ext?.timeout?.trim(), 10);
        if (parseTimeout > 0) {KParams.timeout = parseTimeout;}

        KParams.catesSet = cfg?.ext?.catesSet?.trim() || '';
        KParams.tabsSet = cfg?.ext?.tabsSet?.trim() || '';

        // 预拉取首页 HTML（携带 Referer 模拟从首页进入，便于通过 18+ 校验）
        KParams.resHtml = await request(HOST + '/home.htm');
    } catch (e) {
        console.error('初始化失败:', e.message);
    }
}

// ============================================================
// 四、首页接口：home / homeVod
// ============================================================

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

// ============================================================
// 五、列表接口：category / search
// ============================================================

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

        // 站点搜索接口（兜底）：/index.htm?m=vod-search&wd=xxx
        let searchUrl = `${HOST}/index.htm?m=vod-search&wd=${encodeURIComponent(wd || '')}&page=${pg}`;
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

// ============================================================
// 六、详情与播放：detail / play
// ============================================================

async function detail(ids) {
    try {
        let detailUrl = absUrl(ids);
        let resHtml = await request(detailUrl);
        if (!resHtml) {throw new Error('源码为空');}

        // 标题：<h1>优先，其次 og:title，去掉站点后缀
        let kname = cleanText(cutStr(resHtml, '<h1', '</h1>', ''));
        if (!kname) {kname = htmlDecode(getMeta(resHtml, 'og:title') || '');}
        kname = (kname || '名称').split(/\s*[-_|]\s*/)[0].trim();

        // 封面：og:image → meta[property=image] → 第一张 img
        let kpic = htmlDecode(
            getMeta(resHtml, 'og:image:secure_url') ||
            getMeta(resHtml, 'og:image') ||
            (cutStr(resHtml, '<div class="player', '</div>', '', false).match(/data-src=["']([^"']+)["']/i)?.[1]) ||
            (cutStr(resHtml, '<div class="video', '</div>', '', false).match(/data-src=["']([^"']+)["']/i)?.[1]) ||
            resHtml.match(/<img\b[^>]*?(?:data-src|data-original|src)=["']([^"']+)["']/i)?.[1] ||
            ''
        );

        // 描述：og:description → meta description
        let kcontent = htmlDecode(
            getMeta(resHtml, 'og:description') ||
            getMetaByName(resHtml, 'description') ||
            kname
        );

        // 备注：提取"时长"
        let kremarks = cleanText(cutStr(resHtml, '时长', '</', '')) || '';

        // ===== 解析播放线路 =====
        // 普通 / 极速 线路：同详情页 URL 携带 ?line1=1 或 ?line1=2
        // 下载 线路：外链 mp4
        let ktabs = [];
        let kurls = [];

        let line1 = resHtml.match(/href=["']([^"']*?\?line1=1)["']/i)?.[1];
        let line2 = resHtml.match(/href=["']([^"']*?\?line1=2)["']/i)?.[1];
        let mp4   = resHtml.match(/href=["'](https?:\/\/[^"']+?\.mp4[^"']*?)["']/i)?.[1];

        if (line1) {
            ktabs.push('普通');
            kurls.push(`正片$${absUrl(line1)}`);
        }
        if (line2) {
            ktabs.push('极速');
            kurls.push(`正片$${absUrl(line2)}`);
        }
        if (mp4) {
            ktabs.push('下载');
            kurls.push(`正片$${mp4}`);
        }
        // 兜底：仅网页播放
        if (ktabs.length === 0) {
            ktabs.push('网页播放');
            kurls.push(`正片$${detailUrl}`);
        }

        // 按用户配置筛选
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
        // 下载线路或直链 mp4：直连播放
        if (/下载/.test(flag) || /\.mp4(\?|$)/i.test(kurl)) {
            return JSON.stringify({jx: 0, parse: 0, url: kurl, header: DefHeader});
        }
        // 普通/极速/网页播放：交给浏览器内嵌解析
        return JSON.stringify({jx: 0, parse: 1, url: kurl, header: DefHeader});
    } catch (e) {
        console.error('播放失败:', e.message);
        return JSON.stringify({jx: 0, parse: 0, url: '', header: {}});
    }
}

// ============================================================
// 七、HTML 解析工具函数
// ============================================================

// 合并默认分类 + 首页导航分类
function mergeHomeClasses(khtml) {
    let classes = [...DEFAULT_CLASSES];
    let seen = new Set(classes.map(it => it.type_id));

    if (khtml) {
        // 匹配 /htms/list{N} 导航链接
        const navReg = /<a\b[^>]*href=["'](\/htms\/list\d+)\/?["']?[^>]*>([^<]{1,40})<\/a>/gi;
        for (let mt of khtml.matchAll(navReg)) {
            let typeId = htmlDecode(mt[1]).replace(/^\/+|\/+$/g, '');
            if (!typeId || seen.has(typeId)) {continue;}
            seen.add(typeId);
            let name = htmlDecode(mt[2]).replace(/\s+/g, ' ').trim();
            if (!name || /首页|登录|注册|App|VIP|收藏|历史|关于|联系/.test(name)) {continue;}
            classes.push({type_name: name, type_id: typeId});
        }
    }
    return classes;
}

// 从 HTML 中提取视频列表
// 策略：先找到所有 /htm/play{N}/{ID}.htm 的标题链接（h4/h3/h2/a 内的纯文本），
//       再向「前」回溯 ~3000 字符找最近的一张图 + 画质 + 时长，
//       向「后」回溯 ~500 字符找日期。
function getVodList(khtml) {
    try {
        if (!khtml) {throw new Error('源码为空');}
        let kvods = [];
        let seen = new Set();

        // 仅匹配"含可见文本"的 <a> 链接（避免匹配包裹图片的空链接重复）
        const linkReg = /<a\b[^>]*href=["'](\/htm\/play\d+\/\d+\.htm)["'][^>]*>\s*([^<]{2,}?)\s*<\/a>/gi;
        for (let mt of khtml.matchAll(linkReg)) {
            let href  = mt[1];
            let kname = cleanText(mt[2]);
            if (!kname || kname.length < 2) {continue;}

            let kid = absUrl(htmlDecode(href));
            if (!kid || seen.has(kid)) {continue;}
            seen.add(kid);

            // === 向前回溯：找最近的一张图 + 画质 + 时长 ===
            let pos    = mt.index ?? khtml.indexOf(mt[0]);
            let before = khtml.slice(Math.max(0, pos - 3000), pos);

            // 封面：取最靠近链接的 img（最后一个匹配）
            let imgAll = before.match(/<img\b[^>]*?(?:data-src|data-original|src)=["']([^"']+)["']/gi) || [];
            let kpic   = '';
            if (imgAll.length) {
                let last = imgAll[imgAll.length - 1];
                kpic = last.match(/(?:data-src|data-original|src)=["']([^"']+)["']/i)?.[1] || '';
            }

            // 画质（取最后一个出现）
            let qAll     = before.match(/\b(1080P|720P|4K|2K|HD|高清|超清|标清)\b/gi) || [];
            let quality  = qAll.length ? qAll[qAll.length - 1] : '';

            // 时长（取最后一个 hh:mm:ss 或 mm:ss）
            let dAll     = before.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g) || [];
            let duration = dAll.length ? dAll[dAll.length - 1] : '';

            // === 向后回溯：找日期 ===
            let after = khtml.slice(pos, Math.min(khtml.length, pos + 500));
            let date  = after.match(/(\d{4}年\d{1,2}月\d{1,2}日|\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/)?.[1] || '';

            let kremarks = [quality, duration, date].filter(Boolean).join(' ');

            kvods.push({
                vod_name:    kname,
                vod_pic:     absUrl(kpic),
                vod_remarks: kremarks,
                vod_id:      kid
            });
        }

        return kvods;
    } catch (e) {
        console.error('生成视频列表失败:', e.message);
        return [];
    }
}

// ============================================================
// 八、URL 构造与规范化函数
// ============================================================

// 分类分页 URL：/htms/list{N}/{pg}.htm
function buildPageUrl(typeId, pg) {
    let path = htmlDecode(String(typeId || '')).replace(/^\/+|\/+$/g, '');
    if (!path) {path = 'htms/list26';}

    if (/^htms\/list\d+$/i.test(path)) {
        return absUrl(`${path}/${pg}.htm`);
    }
    // 兜底：query 分页
    return absUrl(pg > 1 ? `${path}?page=${pg}` : path);
}

// 把各种形式的路径补全为完整 URL
function absUrl(path) {
    if (typeof path !== 'string' || !path.trim()) {return '';}
    path = htmlDecode(path.trim());
    if (/^https?:\/\//i.test(path)) {return path;}
    if (path.startsWith('//')) {return 'https:' + path;}
    return `${HOST}/${path.replace(/^\/+/, '')}`;
}

// ============================================================
// 九、HTML 属性 / Meta 提取函数
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

// 估算总页数
function getPageCount(khtml, curPg = 1) {
    try {
        let maxPg = Number(curPg) || 1;
        const regs = [
            /href=["'][^"']*\/htms\/list\d+\/(\d+)\.htm["']/g,
            /href=["'][^"']*[?&]page=(\d+)/g
        ];
        for (let reg of regs) {
            for (let mt of khtml.matchAll(reg)) {
                let n = Number(mt[1]);
                if (n > maxPg) {maxPg = n;}
            }
        }
        return maxPg;
    } catch (e) {return Number(curPg) || 1;}
}

// ============================================================
// 十、辅助工具
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
// 十一、网络请求封装：request
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
// 十二、插件导出入口
// ============================================================
export function __jsEvalReturn() {
    return {
        init, home, homeVod, category, search, detail, play,
        proxy: null
    };
}
