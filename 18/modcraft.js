/*
title: '暗网外流', author: '小可乐 v1.0.0'
ext 可选:
{
    "host": "https://modcraft.net",  // 站点域名（镜像可换）
    "timeout": 6000,                  // 请求超时（毫秒）
    "catesSet": "",                   // 分类筛选（&分隔，留空=全部）
    "tabsSet": "网页浏览"             // 播放线路筛选（&分隔）
}
说明：
  modcraft.net 是 JS 动态加载的播放器，详情页静态 HTML 中没有 m3u8/mp4 链接；
  detail() 返回文章链接作为 vod_id，play() 默认走"网页浏览"模式让浏览器内核加载播放器。
  影片 ID 为 7 位数字 /v/{id}/。
*/

// ============================================================
// 一、全局常量与配置区
// ============================================================

// 移动端 Chrome UA：站点对移动 UA 友好
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36';
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
// 二、默认分类配置区（站点顶部导航 + 内容分类）
// ============================================================
const DEFAULT_CLASSES = [
    {type_name: '首页', type_id: 'home'},
    {type_name: '最新上架', type_id: 'c/new'},
    {type_name: '今日热播', type_id: 'c/hot-today'},
    {type_name: '本月热播', type_id: 'c/hot-month'},
    {type_name: '热播总榜', type_id: 'c/hot'},
    {type_name: '大家在看', type_id: 'c/watching'},
    {type_name: '精选推荐', type_id: 'c/score'},
    {type_name: '榜单推荐', type_id: 'rank/rank'},
    {type_name: '高赞排行', type_id: 'c/like'},
    {type_name: '收藏排行', type_id: 'c/favorite'},
    {type_name: '长片热播', type_id: 'c/long-hot'},
    {type_name: '短片快看', type_id: 'c/short-hot'},
    // 内容分类（子分类通过 category 参数过滤）
    {type_name: '国产专区', type_id: 'c/new?category=国产专区'},
    {type_name: '亚洲情色', type_id: 'c/new?category=亚洲情色'},
    {type_name: '无码专区', type_id: 'c/new?category=无码专区'},
    {type_name: '强奸乱伦', type_id: 'c/new?category=强奸乱伦'},
    {type_name: '卡通动画', type_id: 'c/new?category=卡通动画'},
    {type_name: '中文字幕', type_id: 'c/new?category=中文字幕'},
    {type_name: '少女萝莉', type_id: 'c/new?category=少女萝莉'},
    {type_name: '欧美性爱', type_id: 'c/new?category=欧美性爱'},
    {type_name: '日本专区', type_id: 'c/new?category=日本专区'},
    {type_name: '制服诱惑', type_id: 'c/new?category=制服诱惑'},
    {type_name: '三级伦理', type_id: 'c/new?category=三级伦理'},
    {type_name: '日本无码', type_id: 'c/new?category=日本无码'},
    // 热搜
    {type_name: '今日热搜', type_id: 'search?hs=today'},
    {type_name: '本月热搜', type_id: 'search?hs=month'},
    {type_name: '热搜总榜', type_id: 'search?hs=hits'},
    {type_name: '最新搜索', type_id: 'search?hs=latest'},
    // 专题
    {type_name: '专题大全', type_id: 'topic/index'}
];

// ============================================================
// 三、生命周期入口：init 初始化
// ============================================================
async function init(cfg) {
    try {
        HOST = (cfg?.ext?.host?.trim() || 'https://modcraft.net').replace(/\/$/, '');
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

        // 搜索接口：/search?q={wd}&page={pg}（普通搜索）
        let searchUrl = absUrl(`/search?q=${encodeURIComponent(wd || '')}${pg > 1 ? '&page=' + pg : ''}`);
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

        // 标题：og:title > <h1>
        let kname = htmlDecode(
            getMeta(resHtml, 'og:title') ||
            cutStr(resHtml, '<h1', '</h1>', '')
        );
        kname = kname.replace(/\s*[|\-–]\s*暗网外流.*$/i, '').trim() || kname;

        // 封面：og:image > 第一张内容图
        let kpic = htmlDecode(
            getMeta(resHtml, 'og:image') ||
            getMeta(resHtml, 'og:image:secure_url') ||
            extractFirstImg(resHtml)
        );

        // 时长：匹配"时长 MM:SS"或"时长 HH:MM:SS"
        let durationMatch = resHtml.match(/时长\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
        let kremarks = durationMatch ? durationMatch[1] : '';

        // 点赞 / 收藏
        let likeMatch = resHtml.match(/点赞\s*(\d+)/);
        let favMatch = resHtml.match(/收藏\s*(\d+)/);
        let extra = [];
        if (likeMatch) {extra.push(`👍 ${likeMatch[1]}`);}
        if (favMatch) {extra.push(`⭐ ${favMatch[1]}`);}
        if (extra.length) {kremarks = (kremarks ? kremarks + ' • ' : '') + extra.join(' • ');}

        // 描述：og:description > meta description > 标签列表
        let kcontent = htmlDecode(
            getMeta(resHtml, 'og:description') ||
            getMetaByName(resHtml, 'description') ||
            extractTags(resHtml) ||
            kname
        );

        // 标签（来自"标签"区段）
        let tags = extractTags(resHtml) || '';

        // 播放线路：检测页面上的线路数
        let playLines = extractPlayLines(resHtml);
        let ktabs = playLines.length ? playLines.map(l => l.name) : ['网页浏览'];
        let kurls = playLines.length ? playLines.map(l => `${l.name}$${l.url}`) : [`正片$${detailUrl}`];

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
        // 默认走网页解析，让浏览器内核加载 JS 播放器
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
        // 匹配导航中的 /c/{slug} 和 /search?hs={hot} 链接
        const catReg = /<a\b[^>]*href=["'](\/c\/([a-z0-9_-]+))["'][^>]*>([^<]+)<\/a>/gi;
        for (let mt of khtml.matchAll(catReg)) {
            let typeId = `c/${htmlDecode(mt[2]).trim()}`;
            if (seen.has(typeId)) {continue;}
            seen.add(typeId);
            classes.push({type_name: htmlDecode(mt[3]).trim(), type_id: typeId});
        }

        const rankReg = /<a\b[^>]*href=["'](\/rank\/[a-z0-9_-]+)["'][^>]*>([^<]+)<\/a>/gi;
        for (let mt of khtml.matchAll(rankReg)) {
            let typeId = htmlDecode(mt[1]).replace(/^\/|\/$/g, '');
            if (seen.has(typeId)) {continue;}
            seen.add(typeId);
            classes.push({type_name: htmlDecode(mt[2]).trim(), type_id: typeId});
        }
    }

    return classes;
}

// 作用：从列表页 HTML 提取视频卡片
function getVodList(khtml) {
    try {
        if (!khtml) {throw new Error('源码为空');}
        let kvods = [];
        let seen = new Set();

        // 匹配 /v/{7位数字} 链接
        const hrefReg = /<a\b[^>]*href=["'](\/v\/(\d{5,}))["'][^>]*>([\s\S]*?)<\/a>/gi;
        for (let mt of khtml.matchAll(hrefReg)) {
            let kid = absUrl('/v/' + mt[2]);
            if (!kid || seen.has(kid)) {continue;}
            seen.add(kid);

            let inner = htmlDecode(mt[3]).replace(/<[^>]*?>/g, ' ').replace(/\s+/g, ' ').trim();

            // 过滤掉无意义的链接（导航/翻页/广告）
            if (!inner || inner.length < 2) {continue;}
            if (/^(上一页|下一页|首页|末页|跳至|跳转|更多专题|查看总榜|加载更多|\d{1,2}:\d{2})$/i.test(inner)) {
                // 允许时长为唯一内容时跳过
                continue;
            }

            // 时长格式（如 "20:30"）需结合上下文（紧邻 h3 时表示这是该卡片的时长）
            let kremarks = '';
            let kname = inner;

            // 如果是时长，把它作为备注
            if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(inner)) {
                kremarks = inner;
                // 此时无法获取标题，标记为"未命名"
                kname = `影片 ${mt[2]}`;
            } else if (/^月热度|今日播放|累计播放/.test(inner)) {
                // 跳过统计行（避免重复）
                continue;
            } else if (inner.length < 3) {
                continue;
            } else {
                // 截断过长标题
                kname = inner.slice(0, 80);
            }

            kvods.push({
                vod_name: kname,
                vod_pic: '',
                vod_remarks: kremarks,
                vod_id: kid
            });
        }

        // 补一次：抓取所有图片作为缩略图，按出现顺序与 vod 顺序一一对应
        let thumbReg = /<img\b[^>]*(?:data-src|data-original|src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"']*)?)["']/gi;
        let thumbs = [];
        for (let mt of khtml.matchAll(thumbReg)) {
            let src = htmlDecode(mt[1]);
            // 过滤 logo/默认占位
            if (/site-mark|site-logo|brand|default-cover/i.test(src)) {continue;}
            thumbs.push(src);
        }

        for (let i = 0; i < kvods.length && i < thumbs.length; i++) {
            kvods[i].vod_pic = absUrl(thumbs[i]);
        }

        // 兜底：如果没找到任何视频，返回空数组
        if (kvods.length === 0) {return [];}

        // 去重（保留第一个出现）
        let uniq = [];
        let idSeen = new Set();
        for (let v of kvods) {
            if (idSeen.has(v.vod_id)) {continue;}
            idSeen.add(v.vod_id);
            uniq.push(v);
        }
        return uniq;
    } catch (e) {
        console.error('生成视频列表失败:', e.message);
        return [];
    }
}

// 作用：从 HTML 中提取"标签"区域的标签
function extractTags(khtml) {
    try {
        let m = khtml.match(/##\s*标签\s*([\s\S]*?)(?:<h\d|<footer|<\/main|<\/body)/i) ||
                khtml.match(/标签<\/h\d>([\s\S]*?)(?:<h\d|<footer|<\/main|<\/body)/i);
        if (!m) {return '';}
        let block = m[1];
        let tags = [];
        for (let t of block.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)) {
            let tag = htmlDecode(t[1]).trim();
            if (tag && tag.length < 20 && !/^(更多|全部|查看总榜|返回)$/.test(tag)) {
                tags.push(tag);
            }
        }
        return tags.join(' / ');
    } catch (e) {
        return '';
    }
}

// 作用：提取详情页所有有效的 <img> 标签（按非 logo 顺序）
function extractFirstImg(khtml) {
    try {
        let m = khtml.match(/<img\b[^>]*(?:data-src|data-original|src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))(?:\?[^"']*)?["']/i);
        return m ? m[1] : '';
    } catch (e) {
        return '';
    }
}

// 作用：从详情页提取"播放线路"列表
function extractPlayLines(khtml) {
    let lines = [];
    try {
        // 匹配形如 [原线路 · 第1集](url) 或 [自建线路 · 高清线路](url)
        const reg = /\[([^\]]*?(?:线路|原线路|自建|播放)[^\]]*?)\]\((https?:\/\/[^\)]+)\)|<a\b[^>]*href=["'](https?:\/\/[^"']+\/v\/\d+[^"']*)["'][^>]*>([^<]*?(?:线路|原线路|自建|播放)[^<]*)<\/a>/gi;
        for (let mt of khtml.matchAll(reg)) {
            let name = htmlDecode(mt[1] || mt[4] || '').trim();
            let url = htmlDecode(mt[2] || mt[3] || '').trim();
            if (!name || !url) {continue;}
            if (/^(当前线路|播放线路|切换线路)$/i.test(name)) {continue;}
            if (lines.some(l => l.url === url)) {continue;}
            lines.push({name, url});
        }
    } catch (e) {
        // 忽略
    }
    return lines;
}

// ============================================================
// 八、URL 构造与规范化函数
// ============================================================

// 作用：根据分类 ID 和页码构造列表页 URL
// 分类 ID 规则：
//   home              → /
//   c/{slug}          → /c/{slug}?page=N (第二页起)
//   c/{slug}?cat=...  → /c/{slug}?cat=...&page=N (保留子分类)
//   rank/{slug}       → /rank/{slug}?page=N
//   search?hs=...     → /search?hs=...&page=N
//   topic/{id}        → /topic/{id}?page=N
function buildPageUrl(typeId, pg) {
    if (!typeId) {typeId = 'home';}

    // 拆分路径与查询参数
    let [path, queryStr] = typeId.split('?');
    path = path.replace(/^\/|\/$/g, '');
    if (path === 'home' || !path) {
        return absUrl(pg > 1 ? `/?page=${pg}` : '/');
    }

    // 解析已有查询参数
    let params = new URLSearchParams(queryStr || '');
    if (pg > 1) {params.set('page', String(pg));} else {params.delete('page');}
    let qs = params.toString();
    return absUrl(`/${path}${qs ? '?' + qs : ''}`);
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
        // 匹配 /c/xxx?page=N 或 /search?...&page=N
        const regs = [
            /href=["'][^"']*[?&]page=(\d+)/g,
            /href=["'][^"']*\/page\/(\d+)\/?/g
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
