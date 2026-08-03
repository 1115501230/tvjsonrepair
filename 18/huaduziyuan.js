/*
title: '花都资源 HD', author: '小可乐 v6.1.1'
说明：maccms10 / stui 模板视频站
       分类列表：/vodtype/{id}.html  与  /vodtype/{id}/index_{pg}.html
       详情页：  /voddetail/{id}.html
       播放页：  /vodplay/{id}-{sid}-{nid}.html
       搜索：    /vodsearch/-------------.html?wd=...&page=...

ext 可选:
{
    "host": "https://hd.huaduziyuan.com",   // 站点域名
    "timeout": 6000,                        // 请求超时（毫秒）
    "catesSet": "中文字幕&无字幕&国产&动漫&欧美",  // 首页分类筛选（&分隔）
    "tabsSet": ""                           // 详情页线路筛选（&分隔，留空=全部）
}
*/

// ============================================================
// 一、全局常量与配置区
// ============================================================

// PC UA：maccms10/stui 模板对移动 UA 可能输出精简版，使用 PC UA 拿到完整结构
const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DefHeader = {'User-Agent': PC_UA};

// 站点根域名（运行时从 cfg.ext.host 赋值）
var HOST;

// 全局参数对象：集中管理请求头、超时、用户配置和首页缓存
var KParams = {
    headers: {'User-Agent': PC_UA, 'Referer': ''},  // 默认请求头
    timeout: 5000,                                   // 默认请求超时
    catesSet: '',                                    // 用户自定义分类筛选
    tabsSet: '',                                     // 用户自定义线路筛选
    resHtml: ''                                      // 首页 HTML 缓存（避免重复请求）
};

// ============================================================
// 二、默认分类配置区
// ============================================================
// 内置分类：覆盖 stui 模板主要板块
// type_id 为 maccms10 的 vodtype 编号
const DEFAULT_CLASSES = [
    {type_name: '中文字幕', type_id: '1'},
    {type_name: '无字幕',   type_id: '2'},
    {type_name: '国产',     type_id: '3'},
    {type_name: '欧美',     type_id: '4'},
    {type_name: '动漫',     type_id: '5'}
];

// ============================================================
// 三、生命周期入口：init 初始化
// ============================================================
// 作用：插件加载时调用一次，完成配置解析和首页预拉取
// 参数 cfg：包含 ext（用户自定义配置）等字段
async function init(cfg) {
    try {
        // 解析站点域名（去除末尾斜杠，缺省使用 hd.huaduziyuan.com）
        HOST = (cfg?.ext?.host?.trim() || 'https://hd.huaduziyuan.com').replace(/\/$/, '');
        // 设置 Referer 为站点自身，绕过部分防盗链
        KParams.headers['Referer'] = HOST + '/';

        // 解析超时时间（>0 才覆盖默认值）
        let parseTimeout = parseInt(cfg?.ext?.timeout?.trim(), 10);
        if (parseTimeout > 0) {KParams.timeout = parseTimeout;}

        // 读取用户自定义的分类筛选和线路筛选
        KParams.catesSet = cfg?.ext?.catesSet?.trim() || '';
        KParams.tabsSet  = cfg?.ext?.tabsSet?.trim()  || '';

        // 预拉取首页 HTML 缓存，供 home() 和 homeVod() 复用
        KParams.resHtml = await request(HOST + '/');
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

        // 构造分页 URL
        let typeId = extend?.cateId || tid;
        let url = buildListUrl(typeId, pg);
        let resHtml = await request(url);
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
// 六、详情与播放：detail / play
// ============================================================

// 作用：返回视频详情（标题、海报、描述、播放线路等）
// 参数 ids：视频详情页 URL（来自列表的 vod_id）
async function detail(ids) {
    try {
        // 规范化 URL
        let detailUrl = absUrl(ids);
        let resHtml = await request(detailUrl);
        if (!resHtml) {throw new Error('源码为空');}

        // 标题：<h1> 优先，<title> 次之
        let kname = cleanText(
            cutStr(resHtml, '<h1', '</h1>', '') ||
            cutStr(resHtml, '<title', '</title>', '名称')
        ).split(/\s*[-_|]\s*/)[0].trim() || '名称';

        // 封面：og:image → stui 缩略图 data-original/src → 第一张大图
        let thumbBlock = cutStr(resHtml, 'stui-vodlist__thumb', '</a>', '', false);
        let kpic = htmlDecode(
            getMeta(resHtml, 'og:image') ||
            (thumbBlock.match(/data-original=["']([^"']+)["']/i)?.[1]) ||
            (thumbBlock.match(/src=["']([^"']+)["']/i)?.[1]) ||
            resHtml.match(/<img\b[^>]*?data-original=["']([^"']+)["']/i)?.[1] ||
            ''
        );

        // 信息块（导演/主演/年份/地区/语言）
        let infoBlock = cutStr(resHtml, 'stui-content__detail', '</div>', '', false);
        let kdirector = htmlDecode(extractInfo(infoBlock, '导演'));
        let kactor    = htmlDecode(extractInfo(infoBlock, '主演'));
        let kyear     = htmlDecode(extractInfo(infoBlock, '年份'));
        let karea     = htmlDecode(extractInfo(infoBlock, '地区'));
        let klang     = htmlDecode(extractInfo(infoBlock, '语言'));

        // 描述：stui 描述块 → og:description → meta description → 标题
        let kcontent = htmlDecode(
            cleanText(cutStr(resHtml, 'detail-sketch', '</span>', '')) ||
            cleanText(cutStr(resHtml, 'stui-content__desc', '</div>', '')) ||
            getMeta(resHtml, 'og:description') ||
            getMetaByName(resHtml, 'description') ||
            kname
        );

        // 播放线路：解析 stui playlist 多线路 tab
        let ktabs = [];
        let kurls = [];
        const playlistReg = /<h[3-4][^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]{1,30})<\/h[3-4]>[\s\S]*?<ul[^>]*class=["'][^"']*playlist[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi;
        for (let mt of resHtml.matchAll(playlistReg)) {
            let tabName = cleanText(mt[1]) || '默认线路';
            let ulHtml = mt[2] || '';
            let eps = [];
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

        // 兜底：未匹配到 tab 时，扫描所有 /vodplay/ 链接
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

        // 兜底兜底：单集视频，直接用详情页作为网页播放
        if (ktabs.length === 0) {
            ktabs.push('网页播放');
            kurls.push(`正片$${detailUrl}`);
        }

        // 备注：集数（基于第一条线路的剧集数）
        let kremarks = (kurls[0] || '').split('$$$').length + '集';

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

// 作用：解析播放地址，返回播放器可识别的 jx/parse/url
// 参数 flag：线路名；ids：待播放 URL；flags：所有线路（备用）
async function play(flag, ids, flags) {
    try {
        let kurl = htmlDecode(ids);

        // 已经是 m3u8/mp4 直链，直接返回
        if (/\.(m3u8|mp4)(\?|$)/i.test(kurl)) {
            return JSON.stringify({jx: 0, parse: 0, url: kurl, header: DefHeader});
        }

        // 抓取播放页提取真实 m3u8/mp4
        let resHtml = await request(kurl);
        if (!resHtml) {throw new Error('播放页为空');}

        let playUrl = extractPlayUrl(resHtml);
        if (playUrl) {
            return JSON.stringify({jx: 0, parse: 0, url: playUrl, header: DefHeader});
        }

        // 找不到直链，交给外部解析器嗅探
        return JSON.stringify({jx: 0, parse: 1, url: kurl, header: DefHeader});
    } catch (e) {
        console.error('播放失败:', e.message);
        return JSON.stringify({jx: 0, parse: 0, url: '', header: {}});
    }
}

// ============================================================
// 七、HTML 解析工具函数
// ============================================================

// 作用：合并默认分类 + 首页导航分类
// 入参 khtml：首页 HTML 字符串
// 思路：用 DEFAULT_CLASSES 兜底，再正则匹配导航中的 /vodtype/N.html 链接
function mergeHomeClasses(khtml) {
    // 复制默认分类（防止修改原数组）
    let classes = [...DEFAULT_CLASSES];
    // 用 type_id 去重，避免与默认分类重复
    let seen = new Set(classes.map(it => it.type_id));

    if (khtml) {
        // 匹配 stui 导航：<a href="/vodtype/N.html">名称</a>
        const navReg = /<a\b[^>]*href=["']\/?vodtype\/(\d+)(?:\.html)?\/?["']?[^>]*>([^<]{1,30})<\/a>/gi;
        for (let mt of khtml.matchAll(navReg)) {
            let typeId = mt[1];
            let name = htmlDecode(mt[2]).replace(/\s+/g, ' ').trim();
            if (!name || seen.has(typeId)) {continue;}
            // 过滤导航/登录等非分类关键词
            if (/首页|留言|发布|关于|联系|帮助|登录|注册|App|VIP|番/.test(name)) {continue;}
            seen.add(typeId);
            classes.push({type_name: name, type_id: typeId});
        }
    }

    return classes;
}

// 作用：从 HTML 中提取视频列表
// 入参 khtml：列表页 HTML
// 思路：直接匹配所有 /voddetail/ID.html 链接，向前回溯找封面与备注
function getVodList(khtml) {
    try {
        if (!khtml) {throw new Error('源码为空');}
        let kvods = [];
        let seen = new Set();

        // 匹配详情页链接 + 链接文本作为标题
        const linkReg = /<a\b[^>]*href=["']\/?voddetail\/(\d+)\.html["'][^>]*>([^<]{2,}?)<\/a>/gi;
        for (let mt of khtml.matchAll(linkReg)) {
            let vodId = mt[1];
            let kname = cleanText(mt[2]);
            if (!kname || kname.length < 2) {continue;}

            // 详情页 URL（用绝对 URL 存到 vod_id）
            let kid = `${HOST}/voddetail/${vodId}.html`;
            if (seen.has(kid)) {continue;}
            seen.add(kid);

            // 向前回溯 1500 字符，找封面与备注
            let pos = mt.index ?? khtml.indexOf(mt[0]);
            let before = khtml.slice(Math.max(0, pos - 1500), pos);

            // 封面：stui 缩略图块内的 data-original / src
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

// 作用：从 stui-content__detail 中提取指定字段（导演/主演/年份等）
// 形如 <p>导演：xxx</p> 或 <span class="text-muted">导演：</span> <span>xxx</span>
function extractInfo(block, key) {
    try {
        if (!block) {return '';}
        // 形如  导演：<...>xxx<...
        let reg = new RegExp(`${escReg(key)}\\s*[:：]\\s*<[^>]*>([^<]{0,200})<`, 'i');
        let m = block.match(reg);
        if (m) {return cleanText(m[1]);}
        // 备选：纯文本  导演：xxx
        reg = new RegExp(`${escReg(key)}\\s*[:：]\\s*([^<\\n]{0,200})`, 'i');
        m = block.match(reg);
        return m ? cleanText(m[1]) : '';
    } catch (e) {
        return '';
    }
}

// 作用：从播放页 HTML 中提取 m3u8/mp4
// 优先级：player_xxxx = {url:"..."} → <source src> → <video src/data-src> → 全文匹配
function extractPlayUrl(khtml) {
    try {
        if (!khtml) {return '';}

        // 1. player_xxxx = {url:"..."} 或 var player_xxxx={url:"..."}
        let m = khtml.match(/(?:var\s+)?player_[a-z0-9_]+\s*=\s*\{[^}]*?url\s*:\s*["']([^"']+)["']/i);
        if (m) {return htmlDecode(m[1]);}

        // 2. <source src="...">
        m = khtml.match(/<source[^>]*?src=["']([^"']+)["']/i);
        if (m) {return htmlDecode(m[1]);}

        // 3. <video src/data-src>
        m = khtml.match(/<video[^>]*?(?:src|data-src)=["']([^"']+)["']/i);
        if (m) {return htmlDecode(m[1]);}

        // 4. 全文匹配 m3u8/mp4 直链
        m = khtml.match(/https?:\/\/[^"'<>\s]+?\.(?:m3u8|mp4)(?:\?[^"'<>\s]*)?/i);
        if (m) {return htmlDecode(m[0]);}

        return '';
    } catch (e) {
        return '';
    }
}

// ============================================================
// 八、URL 构造与规范化函数
// ============================================================

// 作用：根据分类 ID 和页码构造列表页 URL
// maccms10 标准：
//   - 第 1 页：/vodtype/{id}.html
//   - 其他页：/vodtype/{id}/index_{pg}.html
function buildListUrl(typeId, pg) {
    // 仅保留数字，过滤掉非法字符
    let id = String(typeId || '').replace(/[^\d]/g, '');
    if (!id) {id = '1';}
    if (pg <= 1) {return absUrl(`/vodtype/${id}.html`);}
    return absUrl(`/vodtype/${id}/index_${pg}.html`);
}

// 作用：扫描分页器，估算总页数
function getPageCount(khtml, curPg = 1) {
    try {
        let maxPg = Number(curPg) || 1;
        const regs = [
            // maccms10: /vodtype/N/index_K.html 或 /vodsearch/.../index_K.html
            /href=["'][^"']*\/index_(\d+)\.html["']/g,
            // 旧版: /vodtype/N-K.html
            /href=["'][^"']*\/vodtype\/\d+-(\d+)\.html["']/g,
            // 搜索分页: ?page=K
            /href=["'][^"']*[?&]page=(\d+)/g,
            // 纯文本分页: <a>5</a>
            /<a[^>]*>\s*(\d+)\s*<\/a>/g
        ];

        for (let reg of regs) {
            for (let mt of khtml.matchAll(reg)) {
                let n = Number(mt[1]);
                if (n > maxPg && n < 9999) {maxPg = n;}
            }
        }
        return maxPg;
    } catch (e) {
        return Number(curPg) || 1;
    }
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
        if (!html) {return '';}
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
        if (!khtml) {return '';}
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
