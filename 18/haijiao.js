/*
title: '海角网', author: '小可乐 v1.0.0'
ext 可选:
{
    "host": "https://actor.iwxytxgk.cc",   // 站点域名（镜像可换）
    "timeout": 6000,                        // 请求超时（毫秒）
    "catesSet": "",                         // 分类筛选（&分隔，留空=全部）
    "tabsSet": "网页浏览"                   // 播放线路筛选（&分隔）
}
说明：
  海角网是图片+文字社区站点，没有 m3u8/mp4 视频源；
  detail() 返回文章链接作为 vod_id，play() 默认走"网页浏览"模式。
*/

// ============================================================
// 一、全局常量与配置区
// ============================================================

// 桌面端 Chrome UA：站点对移动/桌面 UA 行为一致，使用桌面端可获取更完整内容
const MOBILE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DefHeader = {'User-Agent': MOBILE_UA};

var HOST;
var KParams = {
    headers: {'User-Agent': MOBILE_UA, 'Referer': ''},
    timeout: 5000,
    catesSet: '',
    tabsSet: '',
    resHtml: ''
};

// ============================================================
// 二、默认分类配置区（站点顶部导航分类）
// ============================================================
const DEFAULT_CLASSES = [
    {type_name: '海角首页', type_id: 'home'},
    {type_name: '海角热门', type_id: 'order/hot'},
    {type_name: '今日更新', type_id: 'order/today'},
    {type_name: '海角乱伦', type_id: 'category/hjll'},
    {type_name: '海角原创', type_id: 'category/hjyc'},
    {type_name: '海角吃瓜', type_id: 'category/hjcg'},
    {type_name: '海角看片', type_id: 'category/hjkp'},
    {type_name: '海角网黄', type_id: 'category/hjwh'},
    {type_name: '海角探花', type_id: 'category/hjth'},
    {type_name: '绿帽淫妻', type_id: 'category/lmyq'},
    {type_name: '海角动漫', type_id: 'category/hjdm'},
    {type_name: '海角搬运', type_id: 'category/hjby'},
    {type_name: '原创招募', type_id: 'category/yczm'},
    {type_name: '世界杯赛', type_id: 'category/mjmsjb'}
];

// ============================================================
// 三、生命周期入口：init 初始化
// ============================================================
async function init(cfg) {
    try {
        HOST = (cfg?.ext?.host?.trim() || 'https://actor.iwxytxgk.cc').replace(/\/$/, '');
        KParams.headers['Referer'] = HOST;

        let parseTimeout = parseInt(cfg?.ext?.timeout?.trim(), 10);
        if (parseTimeout > 0) {KParams.timeout = parseTimeout;}

        KParams.catesSet = cfg?.ext?.catesSet?.trim() || '';
        KParams.tabsSet = cfg?.ext?.tabsSet?.trim() || '';

        // 预拉取首页 HTML（用于 home() 与 homeVod()）
        KParams.resHtml = await request(HOST + '/');
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

        // 优先使用 extend.cateId，便于外层重定向到 /order/* 等特殊路径
        let cateUrl = buildPageUrl(extend?.cateId || tid, pg);
        let resHtml = await request(cateUrl);
        let VODS = getVodList(resHtml);
        let limit = VODS.length;
        let pagecount = getPageCount(resHtml, pg);

        return JSON.stringify({list: VODS, page: pg, pagecount, limit, total: limit * pagecount});
    } catch (e) {
        console.error('获取分类页失败:', e.message);
        return JSON.stringify({list: [], page: 1, pagecount: 0, limit: 20, total: 0});
    }
}

async function search(wd, quick, pg) {
    try {
        pg = parseInt(pg, 10);
        pg = pg > 0 ? pg : 1;

        // 搜索接口：/?s={wd}（WordPress 风格），仅取综合结果
        let searchUrl = absUrl(`?s=${encodeURIComponent(wd || '')}${pg > 1 ? '&page=' + pg : ''}`);
        let resHtml = await request(searchUrl);
        let VODS = getVodList(resHtml);
        let limit = VODS.length;
        let pagecount = getPageCount(resHtml, pg);

        return JSON.stringify({list: VODS, page: pg, pagecount, limit, total: limit * pagecount});
    } catch (e) {
        console.error('搜索失败:', e.message);
        return JSON.stringify({list: [], page: 1, pagecount: 0, limit: 20, total: 0});
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

        // 标题：og:title > <h1> > og:site_name
        let kname = htmlDecode(
            getMeta(resHtml, 'og:title') ||
            cutStr(resHtml, '<h1', '</h1>', '') ||
            getMeta(resHtml, 'og:site_name') ||
            '海角文章'
        );
        // 清洗标题中可能带有的「| 海角网」后缀
        kname = kname.replace(/\s*[|\-–]\s*海角网.*$/i, '').trim() || kname;

        // 封面：og:image > 第一张正文图 > 头像
        let kpic = htmlDecode(
            getMeta(resHtml, 'og:image') ||
            getMeta(resHtml, 'og:image:secure_url') ||
            getAttr(cutStr(resHtml, '<article', '</article>', '', false), 'data-src') ||
            getAttr(cutStr(resHtml, '<article', '</article>', '', false), 'src')
        );

        // 提取 meta 信息：作者 / 浏览数 / 评论数 / 时间
        let article = cutStr(resHtml, '<article', '</article>', '', false);
        // 作者：rel="author" 链接 / class 含 author 的链接
        let authorMatch = article.match(/<a[^>]*rel=["']author["'][^>]*>([\s\S]*?)<\/a>/i) ||
                          article.match(/<a[^>]*class=["'][^"']*\bauthor\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
        let author = authorMatch ? cleanText(authorMatch[1]) : '';
        // 浏览数
        let viewsMatch = article.match(/(?:post-views|views|view-count|post-count)["'][^>]*>([\s\S]*?)<\//i) ||
                         article.match(/<span[^>]*>(\d+[\s\S]*?(?:浏览|阅读|查看|次|play|view))/i);
        let views = viewsMatch ? cleanText(viewsMatch[1]) : '';
        // 评论数
        let commentsMatch = article.match(/(?:comments-link|post-comments|comment-count)["'][^>]*>([\s\S]*?)<\//i);
        let comments = commentsMatch ? cleanText(commentsMatch[1]) : '';
        // 备注：作者 + 浏览数 + 评论数
        let kremarks = [author, views, comments].filter(Boolean).join(' • ');

        // 描述：og:description > meta description > 正文首段
        let kcontent = htmlDecode(
            getMeta(resHtml, 'og:description') ||
            getMetaByName(resHtml, 'description') ||
            cutStr(article, '<p', '</p>', '', true) ||
            kname
        );
        // 正文段落拼接（最多 8 段，保留图片描述）
        let paragraphs = (article.match(/<p[^>]*>[\s\S]*?<\/p>/g) || [])
            .map(p => cleanText(p))
            .filter(p => p.length > 5)
            .slice(0, 8);
        if (paragraphs.length) {
            kcontent = paragraphs.join('\n');
        }

        // 播放线路：站点无视频源，默认仅"网页浏览"
        let ktabs = ['网页浏览'];
        let kurls = [`正片$${detailUrl}`];

        if (KParams.tabsSet) {
            let ktus = ktabs.map((it, idx) => ({type_name: it, type_value: kurls[idx]}));
            ktus = ctSet(ktus, KParams.tabsSet);
            ktabs = ktus.map(it => it.type_name);
            kurls = ktus.map(it => it.type_value);
        }

        // 分类与标签
        let catMatch = article.match(/<a[^>]*href=["']\/category\/([^"']+)["'][^>]*>([^<]+)<\/a>/);
        let typeName = catMatch ? htmlDecode(catMatch[2]).trim() : '海角';
        let tags = (article.match(/<a[^>]*href=["']\/tag\/[^"']+["'][^>]*>([^<]+)<\/a>/g) || [])
            .map(t => htmlDecode(t.replace(/<[^>]*>/g, '')).trim())
            .filter(Boolean)
            .slice(0, 6)
            .join(' / ');

        let VOD = {
            vod_id: detailUrl,
            vod_name: kname,
            vod_pic: absUrl(kpic),
            vod_remarks: kremarks || tags,
            type_name: typeName,
            vod_year: '',
            vod_area: '',
            vod_lang: '',
            vod_director: '',
            vod_actor: author,
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
        // 始终走网页解析，让浏览器内核渲染文章
        return JSON.stringify({jx: 0, parse: 1, url: kurl, header: DefHeader});
    } catch (e) {
        console.error('播放失败:', e.message);
        return JSON.stringify({jx: 0, parse: 0, url: '', header: {}});
    }
}

// ============================================================
// 七、HTML 解析工具函数
// ============================================================

// 作用：合并默认分类 + 首页抓取到的分类
function mergeHomeClasses(khtml) {
    let classes = [...DEFAULT_CLASSES];
    let seen = new Set(classes.map(it => it.type_id));

    if (khtml) {
        // 匹配导航中的分类链接
        const navReg = /<a\b[^>]*href=["'](\/(?:category|order)\/([a-z0-9_-]+)\/?)["'][^>]*>([^<]*)<\/a>/gi;
        for (let mt of khtml.matchAll(navReg)) {
            let typeId = (htmlDecode(mt[2]) || '').trim();
            if (!typeId || seen.has(typeId)) {continue;}
            seen.add(typeId);

            let name = htmlDecode(mt[3]).trim();
            if (!name) {continue;}
            classes.push({type_name: name, type_id: `${mt[1].includes('/order/') ? 'order' : 'category'}/${typeId}`});
        }
    }

    return classes;
}

// 作用：从列表页 HTML 提取文章卡片
function getVodList(khtml) {
    try {
        if (!khtml) {throw new Error('源码为空');}
        let kvods = [];
        let seen = new Set();

        // 方案 1：基于 <article> 标签（WordPress 标准）
        let articleReg = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
        for (let mt of khtml.matchAll(articleReg)) {
            let card = mt[1];
            let href = card.match(/href=["'](\/archives\/\d+\/?)["']/i)?.[1] || '';
            if (!href) {continue;}

            let kid = absUrl(htmlDecode(href));
            if (!kid || seen.has(kid)) {continue;}
            seen.add(kid);

            // 标题
            let titleHtml = card.match(/<h[1-3][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ||
                            card.match(/<a[^>]*class=["'][^"']*\bpost-title\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || '';
            let kname = cleanText(titleHtml) || cleanText(getAttr(card, 'title') || getAttr(card, 'alt') || '海角文章');

            // 封面：img.src / data-src / data-original / background-image
            let stylePic = card.match(/background-image\s*:\s*url\((["']?)([^"')]+)\1\)/i)?.[2] || '';
            let firstImg = card.match(/<img[^>]*>/i)?.[0] || '';
            let kpic = htmlDecode(
                stylePic ||
                getAttr(firstImg, 'data-src') ||
                getAttr(firstImg, 'data-original') ||
                getAttr(firstImg, 'src')
            );

            // 备注：作者 / 浏览 / 评论 拼接
            let author = cleanText(card.match(/<a[^>]*rel=["']author["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] ||
                                   card.match(/<a[^>]*class=["'][^"']*\bauthor\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
            let views = cleanText(card.match(/(?:post-views|view-count|post-count)["'][^>]*>([\s\S]*?)<\//i)?.[1] || '');
            let comments = cleanText(card.match(/(?:comments-link|comment-count)["'][^>]*>([\s\S]*?)<\//i)?.[1] || '');
            let kremarks = [author, views, comments].filter(Boolean).join(' • ');

            kvods.push({
                vod_name: kname,
                vod_pic: absUrl(kpic),
                vod_remarks: kremarks,
                vod_id: kid
            });
        }

        // 方案 2：若 <article> 方案未拿到数据，兜底用 /archives/ 链接 + 上下文标题提取
        if (kvods.length === 0) {
            const hrefReg = /<a\b[^>]*href=["'](\/archives\/\d+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
            for (let mt of khtml.matchAll(hrefReg)) {
                let kid = absUrl(htmlDecode(mt[1]));
                if (!kid || seen.has(kid)) {continue;}
                seen.add(kid);

                let kname = cleanText(mt[2]) || '海角文章';
                if (kname.length < 2 || /更多|查看|详情|下载|APP|登录|注册|首页/.test(kname)) {continue;}

                kvods.push({
                    vod_name: kname.slice(0, 80),
                    vod_pic: '',
                    vod_remarks: '',
                    vod_id: kid
                });
            }
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

// 作用：根据分类 ID 和页码构造列表页 URL
// 分类 ID 规则：
//   home            →  /                 （首页，分页 /page/N/）
//   order/<name>    →  /order/<name>/    （热门/今日，分页 /order/<name>/page/N/）
//   category/<slug> →  /category/<slug>/ （分类，分页 /category/<slug>/page/N/）
function buildPageUrl(typeId, pg) {
    let path = normalizeSitePath(typeId).replace(/^\/|\/$/g, '');
    if (!path) {path = 'home';}

    // 首页
    if (path === 'home') {
        return absUrl(pg > 1 ? `/page/${pg}/` : '/');
    }

    // 全部使用 /page/N/ 风格分页（兼容 WordPress 与站点自定义）
    return absUrl(pg > 1 ? `/${path}/page/${pg}/` : `/${path}/`);
}

// 作用：从完整 URL 中提取站点相对路径
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

// 作用：把各种形式的路径补全为完整 URL
function absUrl(path) {
    if (typeof path !== 'string' || !path.trim()) {return '';}
    path = htmlDecode(path.trim());
    if (/^https?:\/\//i.test(path)) {return path;}
    if (path.startsWith('//')) {return 'https:' + path;}
    return `${HOST}/${path.replace(/^\/+/, '')}`;
}

// ============================================================
// 九、HTML 属性 / Meta / 分页提取
// ============================================================

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

// 作用：扫描分页器，估算总页数
function getPageCount(khtml, curPg = 1) {
    try {
        let maxPg = Number(curPg) || 1;
        // 匹配 /page/N/、?page=N
        const regs = [
            /href=["'][^"']*\/page\/(\d+)\/?["']/g,
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

// ============================================================
// 十一、网络请求封装：request
// ============================================================
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

// ============================================================
// 十二、插件导出入口
// ============================================================
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
