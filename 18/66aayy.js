/*
title: '66aa影院', author: '小可乐 v6.1.1'
ext 可选:
{
    "host": "https://www.66aayy.com",        // 站点域名（可替换为镜像）
    "timeout": 6000,                          // 请求超时时间（毫秒）
    "catesSet": "长片&国产&动漫",            // 首页分类筛选（&分隔）
    "tabsSet": "网页播放"                     // 详情页线路筛选（&分隔）
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
    headers: {'User-Agent': PC_UA, 'Referer': ''},  // 默认请求头
    timeout: 5000,                                  // 默认请求超时
    catesSet: '',                                   // 用户自定义分类筛选
    tabsSet: '',                                    // 用户自定义线路筛选
    resHtml: ''                                     // 首页 HTML 缓存（避免重复请求）
};

// ============================================================
// 二、默认分类配置区
// ============================================================
// 内置分类列表：覆盖「长片」各子分类 + 「国产 / 动漫」首页推荐区
// type_id 为站点路径，程序会自动拼接分页 URL
const DEFAULT_CLASSES = [
    // 长片子分类（/htms/list{ID}/{pg}.htm）
    {type_name: '长片', type_id: 'htms/list26'},     // 无码素人
    {type_name: '日本无码', type_id: 'htms/list84'},
    {type_name: '无码破解', type_id: 'htms/list22'},
    {type_name: '日韩中字', type_id: 'htms/list25'},
    {type_name: '欧美劲爆', type_id: 'htms/list19'},
    {type_name: '经典三级', type_id: 'htms/list28'},
    {type_name: '3D动漫', type_id: 'htms/list20'},
    // 首页推荐区（/htm/play{N}/{pg}.htm）
    {type_name: '最新国产', type_id: 'htm/play1'},
    {type_name: '动漫', type_id: 'htm/play3'}
];

// ============================================================
// 三、生命周期入口：init 初始化
// ============================================================
// 作用：插件加载时调用一次，完成配置解析和首页预拉取
// 参数 cfg：包含 ext（用户自定义配置）等字段
async function init(cfg) {
    try {
        // 解析站点域名（去除末尾斜杠，缺省使用官方域名）
        HOST = (cfg?.ext?.host?.trim() || 'https://www.66aayy.com').replace(/\/$/, '');
        // 设置 Referer 为站点自身，绕过部分防盗链
        KParams.headers['Referer'] = HOST;

        // 解析超时时间（>0 才覆盖默认值）
        let parseTimeout = parseInt(cfg?.ext?.timeout?.trim(), 10);
        if (parseTimeout > 0) {KParams.timeout = parseTimeout;}

        // 读取用户自定义的分类筛选和线路筛选
        KParams.catesSet = cfg?.ext?.catesSet?.trim() || '';
        KParams.tabsSet = cfg?.ext?.tabsSet?.trim() || '';

        // 预拉取首页 HTML 缓存，供 home() 和 homeVod() 复用
        KParams.resHtml = await request(HOST + '/home.htm');
    } catch (e) {
        // 初始化失败不应阻塞插件加载，仅记录日志
        console.error('初始化失败:', e.message);
    }
}

// ============================================================
// 四、首页接口：home / homeVod
// ============================================================

// 作用：返回首页分类列表（侧边栏 / 顶部导航）
// 参数 filter：暂未使用，预留给筛选扩展
async function home(filter) {
    try {
        // 合并默认分类 + 站点首页抓取到的导航分类
        let classes = mergeHomeClasses(KParams.resHtml);
        // 若用户配置了 catesSet，则按配置筛选
        if (KParams.catesSet) {classes = ctSet(classes, KParams.catesSet);}
        return JSON.stringify({class: classes, filters: {}});
    } catch (e) {
        console.error('获取分类失败:', e.message);
        return JSON.stringify({class: [], filters: {}});
    }
}

// 作用：返回首页推荐视频列表
async function homeVod() {
    try {
        // 直接复用 init 时缓存的首页 HTML 解析
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

// 作用：返回分类页视频列表
// 参数 tid：分类 ID（type_id）；pg：页码；filter/extend：扩展参数
async function category(tid, pg, filter, extend) {
    try {
        // 页码兜底（默认 1）
        pg = parseInt(pg, 10);
        pg = pg > 0 ? pg : 1;

        // 构造分页 URL（兼容 extend.cateId 自定义分类）
        let cateUrl = buildPageUrl(extend?.cateId || tid, pg);
        // 请求并解析
        let resHtml = await request(cateUrl);
        let VODS = getVodList(resHtml);
        let limit = VODS.length;
        // 通过分页器推算总页数
        let pagecount = getPageCount(resHtml, pg);

        return JSON.stringify({list: VODS, page: pg, pagecount, limit, total: limit * pagecount});
    } catch (e) {
        console.error('获取分类页失败:', e.message);
        return JSON.stringify({list: [], page: 1, pagecount: 0, limit: 30, total: 0});
    }
}

// 作用：搜索关键词
// 参数 wd：关键词；quick：是否快速搜索；pg：页码
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

// ============================================================
// 六、详情与播放：detail / play
// ============================================================

// 作用：返回视频详情（标题、海报、描述、播放线路等）
// 参数 ids：视频详情页 URL（来自列表的 vod_id）
async function detail(ids) {
    try {
        let detailUrl = absUrl(ids);
        let resHtml = await request(detailUrl);
        if (!resHtml) {throw new Error('源码为空');}

        // 标题：优先 og:title，回退到页面 <h1> / <title>
        let kname = htmlDecode(
            getMeta(resHtml, 'og:title') ||
            cutStr(resHtml, '<h1', '</h1>', '') ||
            getMetaByName(resHtml, 'title') ||
            cutStr(resHtml, '<title', '</title>', '名称')
        );
        // 去掉站点后缀（如 " - 66aa影院"）
        kname = kname.split(/\s*[-_|]\s*/)[0].trim() || kname;

        // 封面：og:image → 首页列表缩略图
        let kpic = htmlDecode(
            getMeta(resHtml, 'og:image:secure_url') ||
            getMeta(resHtml, 'og:image') ||
            cutStr(resHtml, '<img', '/>', '', false).match(/src=["']([^"']+)["']/i)?.[1] ||
            ''
        );

        // 描述：og:description → meta description
        let kcontent = htmlDecode(
            getMeta(resHtml, 'og:description') ||
            getMetaByName(resHtml, 'description') ||
            kname
        );

        // 备注：从详情页提取时长 / 日期
        let kremarks = cutStr(resHtml, '时长', '</', '') || '';

        // 默认线路：网页播放（让播放器内嵌打开）
        let ktabs = ['网页播放'];
        let kurls = [`正片$${detailUrl}`];

        // 根据用户 tabsSet 配置筛选线路
        if (KParams.tabsSet) {
            let ktus = ktabs.map((it, idx) => ({type_name: it, type_value: kurls[idx]}));
            ktus = ctSet(ktus, KParams.tabsSet);
            ktabs = ktus.map(it => it.type_name);
            kurls = ktus.map(it => it.type_value);
        }

        // 组装标准 VOD 对象
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

// 作用：解析播放地址，返回播放器可识别的 jx/parse/url
// 参数 flag：线路名；ids：待播放 URL；flags：所有线路（备用）
async function play(flag, ids, flags) {
    try {
        let kurl = htmlDecode(ids);
        // 网页播放：直接交给内置/外置网页解析器
        if (/网页/.test(flag)) {
            return JSON.stringify({jx: 0, parse: 1, url: kurl, header: DefHeader});
        }
        // 默认交给网页解析
        return JSON.stringify({jx: 0, parse: 1, url: kurl, header: DefHeader});
    } catch (e) {
        console.error('播放失败:', e.message);
        return JSON.stringify({jx: 0, parse: 0, url: '', header: {}});
    }
}

// ============================================================
// 七、HTML 解析工具函数
// ============================================================

// 作用：合并默认分类 + 首页导航中抓取的分类
// 入参 khtml：首页 HTML 字符串
// 思路：先用 DEFAULT_CLASSES 兜底，再正则匹配 <a href="/htms/list..."> / <a href="/htm/play..."> 抓取分类入口
function mergeHomeClasses(khtml) {
    // 复制默认分类（防止修改原数组）
    let classes = [...DEFAULT_CLASSES];
    // 用 type_id 去重，避免与默认分类重复
    let seen = new Set(classes.map(it => it.type_id));

    if (khtml) {
        // 匹配导航区的分类链接：/htms/list{N} 或 /htm/play{N}
        const navReg = /<a\b[^>]*href=["'](\/(?:htms\/list|htm\/play)\d+)\/?["']?[^>]*>([^]*?)<\/a>/gi;
        for (let mt of khtml.matchAll(navReg)) {
            // 归一化路径：去除前导斜杠
            let typeId = htmlDecode(mt[1]).replace(/^\/+/, '').replace(/\/$/, '');
            // 过滤无效或重复
            if (!typeId || seen.has(typeId)) {continue;}
            seen.add(typeId);

            // 提取链接文本作为分类名
            let name = htmlDecode(mt[2]).replace(/\s+/g, ' ').trim();
            // 过滤导航/登录等非分类关键词
            if (!name || /首页|视频|登录|注册|App|VIP|收藏|历史/.test(name)) {continue;}
            classes.push({type_name: name, type_id: typeId});
        }
    }

    return classes;
}

// 作用：从 HTML 中提取视频列表
// 入参 khtml：列表页 HTML
// 思路：按 <a href="/htm/playN/ID.htm"> 切片为卡片，逐一提取链接/标题/封面/时长
function getVodList(khtml) {
    try {
        if (!khtml) {throw new Error('源码为空');}
        let kvods = [];
        let seen = new Set();

        // 匹配视频详情链接区域（标题区 + 元信息区 + 时长）
        // 例：<h4><a href="/htm/play1/245560.htm">标题</a></h4> ... <span>00:12:19</span>
        const cardReg = /<a\b[^>]*href=["'](\/htm\/play\d+\/\d+\.htm)["'][^>]*>([^<]{2,})<\/a>([\s\S]{0,800}?)(?=<a\b[^>]*href=["']\/htm\/play\d+\/|\Z)/gi;
        for (let mt of khtml.matchAll(cardReg)) {
            let href = mt[1];
            // 标题
            let kname = cleanText(mt[2]) || '名称';
            // 元信息块（mt[3] 包含封面、时长、日期等）
            let meta = mt[3] || '';

            // 规范化 ID 并去重
            let kid = absUrl(htmlDecode(href));
            if (!kid || seen.has(kid)) {continue;}
            seen.add(kid);

            // 提取封面：内联 background-image → data-src → data-original → <img src>
            let stylePic = meta.match(/background-image\s*:\s*url\((["']?)([^"')]+)\1\)/i)?.[2] || '';
            let imgSrc = meta.match(/<img\b[^>]*src=["']([^"']+)["']/i)?.[1] || '';
            let kpic = htmlDecode(stylePic || imgSrc);

            // 提取时长（mm:ss 或 hh:mm:ss）
            let duration = meta.match(/(\d{1,2}:\d{2}(?::\d{2})?)/)?.[1] || '';
            // 提取 1080P / 720P 标记
            let quality = meta.match(/\b(1080P|720P|4K|HD)\b/i)?.[1] || '';
            // 提取日期
            let date = meta.match(/(\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2})日?/)?.[1] || '';
            // 合成备注
            let kremarks = [quality, duration, date].filter(Boolean).join(' ');

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

// ============================================================
// 八、URL 构造与规范化函数
// ============================================================

// 作用：根据分类 ID 和页码构造列表页 URL
// 站点分页规则：
//   - /htms/list{N}  →  /htms/list{N}/{pg}.htm
//   - /htm/play{N}   →  /htm/play{N}/{pg}.htm
function buildPageUrl(typeId, pg) {
    // 归一化路径（去斜杠）
    let path = htmlDecode(String(typeId || '')).replace(/^\/+|\/+$/g, '');
    if (!path) {path = 'home.htm';}

    // 首页直接返回
    if (/^home(\.htm)?$/i.test(path)) {
        return absUrl('home.htm');
    }

    // /htms/list{N}  → /htms/list{N}/{pg}.htm
    if (/^htms\/list\d+$/i.test(path)) {
        return absUrl(`${path}/${pg}.htm`);
    }

    // /htm/play{N}  → /htm/play{N}/{pg}.htm
    if (/^htm\/play\d+$/i.test(path)) {
        return absUrl(`${path}/${pg}.htm`);
    }

    // 其他路径：使用 ?page= 兜底
    return absUrl(pg > 1 ? `${path}?page=${pg}` : `${path}`);
}

// 作用：构造搜索页 URL
// 站点搜索接口（兜底）：/search.htm?keyword={wd}[&page={pg}]
function buildSearchUrl(wd, pg) {
    let query = `search.htm?keyword=${encodeURIComponent(wd || '')}`;
    if (pg > 1) {query += `&page=${pg}`;}
    return absUrl(query);
}

// 作用：把各种形式的路径补全为完整 URL
// 已带 http(s):// 直接返回；// 开头的补 https；其他拼接到 HOST 后
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

// 作用：从 HTML 片段中提取指定属性值
// 入参 html：HTML 片段；name：属性名
// 返回：属性值（未找到返回空串）
function getAttr(html, name) {
    try {
        let reg = new RegExp(`${name}=["']([^"']*)["']`, 'i');
        return html.match(reg)?.[1] ?? '';
    } catch (e) {
        return '';
    }
}

// 作用：按 property 提取 <meta> 标签的 content（如 og:title）
function getMeta(khtml, property) {
    return getMetaByKey(khtml, 'property', property);
}

// 作用：按 name 提取 <meta> 标签的 content（如 description）
function getMetaByName(khtml, name) {
    return getMetaByKey(khtml, 'name', name);
}

// 作用：通用 meta 提取器
// 同时支持 "key=val 在前 / content 在后" 和 "content 在前 / key=val 在后" 两种顺序
function getMetaByKey(khtml, key, value) {
    try {
        // 顺序 1：<meta key="value" content="...">
        let reg = new RegExp(`<meta\\b[^>]*${key}=["']${escReg(value)}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i');
        let mt = khtml.match(reg);
        if (mt) {return htmlDecode(mt[1]);}

        // 顺序 2：<meta content="..." key="value">
        reg = new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*${key}=["']${escReg(value)}["'][^>]*>`, 'i');
        return htmlDecode(khtml.match(reg)?.[1] || '');
    } catch (e) {
        return '';
    }
}

// 作用：扫描分页器，估算总页数
// 扫描所有 a[href] 中的 /数字.htm 或 ?page=数字，取最大值
function getPageCount(khtml, curPg = 1) {
    try {
        let maxPg = Number(curPg) || 1;
        const regs = [
            // 路径分页：/htms/list{N}/K.htm 或 /htm/play{N}/K.htm
            /href=["'][^"']*\/(?:htms\/list|htm\/play)\d+\/(\d+)\.htm["']/g,
            // 查询分页：?page=N 或 &page=N
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
// 十、辅助工具：HTML 解码 / 文本清洗 / 正则转义 / 配置筛选 / 字符串截取
// ============================================================

// 作用：HTML 实体反转义
// 支持：&#十进制;、&#x十六进制;、&quot;、&apos;、&#039;、&amp;、&lt;、&gt;
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

// 作用：清洗字符串：去 HTML 标签、合并空白
function cleanText(str) {
    return htmlDecode(str).replace(/<[^>]*?>/g, ' ').replace(/(&nbsp;|[\u0020\u00A0\u3000\s])+/g, ' ').trim();
}

// 作用：正则元字符转义（用于动态拼接正则时）
function escReg(str) {
    return String(str).replace(/[.*+?${}()|[\]\\]/g, '\\$&');
}

// 作用：按用户配置（& 分隔的名称列表）从原数组中筛选/排序
// 入参：kArr：原数组（元素含 type_name）；setStr："名称1&名称2&..."
// 返回：按 setStr 顺序的子集；若全部未匹配则返回首项
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

// 作用：通用字符串截取工具（支持首匹配 / 索引匹配 / 反向匹配 / 全匹配）
// 参数说明：
//   prefix  前缀标记（"拢" 可替代为 [^]*? 贪婪匹配）
//   suffix  后缀标记
//   defVal  兜底值
//   clean   是否清洗 HTML
//   i       序号：>=0 取第 i 个；<0 取倒数 |i| 个
//   all     true 返回所有匹配数组
function cutStr(str, prefix = '', suffix = '', defVal = '', clean = true, i = 0, all = false) {
    try {
        if (typeof str !== 'string') {throw new Error('被截取对象必须为字符串');}
        // 内部清洗函数：去标签 + 合并空白
        const cleanStr = cs => String(cs).replace(/<[^>]*?>/g, ' ').replace(/(&nbsp;|[\u0020\u00A0\u3000\s])+/g, ' ').trim().replace(/\s+/g, ' ');
        // 正则元字符转义
        const esc = s => String(s).replace(/[.*+?${}()|[\]\\/^]/g, '\\$&');
        // "拢" 字符是变体占位符，等价于跨行非贪婪
        let pre = esc(prefix).replace(/拢/g, '[^]*?');
        let end = esc(suffix);
        const regex = new RegExp(`${pre || '^'}([^]*?)${end || '$'}`, 'g');
        const matchIter = str.matchAll(regex);

        // 模式 1：返回所有匹配
        if (all) {
            let matchArr = [...matchIter];
            if (!matchArr.length) {return [defVal];}
            return matchArr.map(ela => ela[1] !== undefined ? (clean ? cleanStr(ela[1]) : ela[1]) : defVal);
        }

        // 模式 2：按索引取单个
        const idx = parseInt(i, 10);
        if (isNaN(idx)) {throw new Error('序号必须为整数');}

        let tgResult;
        let matchIdx = 0;
        if (idx >= 0) {
            // 正向遍历到第 idx 个
            for (let elt of matchIter) {
                if (matchIdx++ === idx) {
                    tgResult = elt[1];
                    break;
                }
            }
        } else {
            // 反向：用环形缓冲区保留最后 |idx| 个
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
// 作用：统一封装 fetch 请求，自动处理 method 规范化、参数合并、超时、响应头透传
// 入参 reqUrl：目标 URL；options：{ method, headers, timeout, body, withHeaders, ... }
async function request(reqUrl, options = {}) {
    try {
        // 参数校验
        if (typeof reqUrl !== 'string' || !reqUrl.trim()) {throw new Error('reqUrl 不能为空');}
        if (typeof options !== 'object' || Array.isArray(options) || options === null) {throw new Error('options 类型错误');}
        // method 标准化为大写
        options.method = options.method?.toUpperCase() || 'GET';
        // GET/HEAD 不允许带 body/data
        if (['GET', 'HEAD'].includes(options.method)) {
            delete options.body;
            delete options.data;
            delete options.postType;
        }
        // 合并 headers / timeout：优先调用方传入，否则用 KParams 默认值
        let {headers, timeout, ...restOpts} = options;
        const optObj = {
            headers: (typeof headers === 'object' && !Array.isArray(headers) && headers) ? headers : KParams.headers,
            timeout: parseInt(timeout, 10) > 0 ? parseInt(timeout, 10) : KParams.timeout,
            ...restOpts
        };
        const res = await req(reqUrl, optObj);
        // withHeaders 模式：返回 headers + body 的 JSON
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
// TV 框架约定的导出函数：返回所有对外暴露的方法
// proxy 留空表示使用默认网络层
export function __jsEvalReturn() {
    return {
        init,        // 初始化
        home,        // 首页分类
        homeVod,     // 首页推荐
        category,    // 分类页
        search,      // 搜索
        detail,      // 详情
        play,        // 播放解析
        proxy: null  // 代理配置（null=使用全局）
    };
}
