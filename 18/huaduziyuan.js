/*
title: '花都资源发布页', author: '小可乐 v6.1.1'
说明：hd.huaduziyuan.com 是"发布页"型导航站，真实视频资源在 18 条镜像线路上（被 IDC 屏蔽）。
      本脚本把 18 条线路聚合成"视频"列表，点击后由 TVBox 浏览器打开对应线路。
ext 可选:
{
    "host": "https://b.hdfby.com",             // 发布页入口（可换 b.hdfby.net / .org）
    "timeout": 6000,                            // 请求超时（毫秒）
    "catesSet": "移动高速&电信极速&海外专线",   // 线路分组筛选（&分隔）
    "tabsSet": "网页播放"                       // 播放线路筛选（&分隔）
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
    resHtml: '',
    lines: []     // 缓存：[{name, url, group, index}, ...]
};

// 6 个线路分组（对应 config.js 的 line_1 ~ line_18）
const LINE_GROUPS = [
    {name: '移动高速', start: 1,  end: 3},   // line_1~3
    {name: '移动宽带', start: 4,  end: 6},   // line_4~6
    {name: '电信极速', start: 7,  end: 9},   // line_7~9
    {name: '电信高速', start: 10, end: 12},  // line_10~12
    {name: '海外专线', start: 13, end: 15},  // line_13~15
    {name: '发布地址', start: 16, end: 18}   // line_16~18
];

// ============================================================
// 二、初始化
// ============================================================
async function init(cfg) {
    try {
        // HOST：发布页入口（用户可换成 b.hdfby.net / .org）
        HOST = (cfg?.ext?.host?.trim() || 'https://b.hdfby.com').replace(/\/$/, '');
        KParams.headers['Referer'] = HOST + '/index.html';

        let parseTimeout = parseInt(cfg?.ext?.timeout?.trim(), 10);
        if (parseTimeout > 0) {KParams.timeout = parseTimeout;}

        KParams.catesSet = cfg?.ext?.catesSet?.trim() || '';
        KParams.tabsSet = cfg?.ext?.tabsSet?.trim() || '';

        // 预拉取发布页 HTML（用于提取 logo、帮助链接等）
        KParams.resHtml = await request(HOST + '/index.html');

        // 拉取 config.js 并解析 18 条线路
        KParams.lines = await fetchLines();
    } catch (e) {
        console.error('初始化失败:', e.message);
    }
}

// 拉取 config.js 解析所有线路
async function fetchLines() {
    let lines = [];
    try {
        // config.js 带版本号缓存，强制忽略缓存
        let configUrl = `${HOST}/js/config.js?v=${Date.now()}`;
        let jsContent = await request(configUrl);
        if (!jsContent) {return lines;}

        // 解析 window.line_N = "url"
        const reg = /window\.line_(\d+)\s*=\s*["']([^"']+)["']/g;
        for (let mt of jsContent.matchAll(reg)) {
            let idx = parseInt(mt[1], 10);
            let url = mt[2].trim();
            if (!url) {continue;}

            // 查找分组
            let groupName = '其他';
            for (let g of LINE_GROUPS) {
                if (idx >= g.start && idx <= g.end) {groupName = g.name; break;}
            }

            lines.push({
                index: idx,
                name: `线路${idx} - ${groupName}`,
                url: url,
                group: groupName
            });
        }
    } catch (e) {
        console.error('解析 config.js 失败:', e.message);
    }
    return lines;
}

// ============================================================
// 三、首页接口
// ============================================================

// 返回分类（按线路分组）
async function home(filter) {
    try {
        let classes = LINE_GROUPS.map(g => ({
            type_name: g.name,
            type_id: `group_${g.name}`
        }));
        if (KParams.catesSet) {classes = ctSet(classes, KParams.catesSet);}
        return JSON.stringify({class: classes, filters: {}});
    } catch (e) {
        console.error('获取分类失败:', e.message);
        return JSON.stringify({class: [], filters: {}});
    }
}

// 返回首页推荐（18 条线路作为一个整体列表）
async function homeVod() {
    try {
        let VODS = linesToVods(KParams.lines);
        return JSON.stringify({list: VODS});
    } catch (e) {
        console.error('获取推荐失败:', e.message);
        return JSON.stringify({list: []});
    }
}

// ============================================================
// 四、列表接口
// ============================================================

// 按分组显示该组下的线路
async function category(tid, pg, filter, extend) {
    try {
        pg = parseInt(pg, 10);
        pg = pg > 0 ? pg : 1;

        // 解析分组名（type_id 形如 "group_移动高速"）
        let groupName = '';
        if (tid && tid.startsWith('group_')) {
            groupName = tid.replace(/^group_/, '');
        } else if (extend?.cateId?.startsWith('group_')) {
            groupName = extend.cateId.replace(/^group_/, '');
        } else if (KParams.catesSet && KParams.catesSet.split('&').length === 1) {
            groupName = KParams.catesSet;
        }

        let list = KParams.lines.filter(l => !groupName || l.group === groupName);
        let VODS = linesToVods(list);
        let limit = VODS.length;
        let total = limit;

        return JSON.stringify({list: VODS, page: pg, pagecount: 1, limit, total});
    } catch (e) {
        console.error('获取分类页失败:', e.message);
        return JSON.stringify({list: [], page: 1, pagecount: 0, limit: 30, total: 0});
    }
}

// 搜索：在 18 条线路里按名称/URL 模糊匹配
async function search(wd, quick, pg) {
    try {
        pg = parseInt(pg, 10);
        pg = pg > 0 ? pg : 1;

        let kw = (wd || '').toLowerCase();
        let list = KParams.lines.filter(l =>
            l.name.toLowerCase().includes(kw) ||
            l.url.toLowerCase().includes(kw) ||
            l.group.toLowerCase().includes(kw)
        );
        let VODS = linesToVods(list);
        return JSON.stringify({
            list: VODS, page: pg, pagecount: 1,
            limit: VODS.length, total: VODS.length
        });
    } catch (e) {
        console.error('搜索失败:', e.message);
        return JSON.stringify({list: [], page: 1, pagecount: 0, limit: 30, total: 0});
    }
}

// ============================================================
// 五、详情与播放
// ============================================================

// 详情：返回一个"网页播放"线路，URL 即该线路
async function detail(ids) {
    try {
        let lineUrl = absUrl(ids);
        let line = KParams.lines.find(l => l.url === lineUrl) ||
                   KParams.lines.find(l => lineUrl.includes(l.url));

        // 标题：线路名 / URL host
        let kname = line ? line.name : (htmlDecode(getUrlHost(lineUrl)) || '线路');

        // 封面：发布页 logo
        let kpic = absUrl('/images/logo.png');

        // 描述：线路 URL
        let kcontent = `线路地址：${lineUrl}\n（点击播放将使用 TVBox 内置浏览器打开该线路）`;

        let ktabs = ['网页播放'];
        let kurls = [`正片$${lineUrl}`];

        // 按用户 tabsSet 筛选
        if (KParams.tabsSet) {
            let ktus = ktabs.map((it, idx) => ({type_name: it, type_value: kurls[idx]}));
            ktus = ctSet(ktus, KParams.tabsSet);
            ktabs = ktus.map(it => it.type_name);
            kurls = ktus.map(it => it.type_value);
        }

        let VOD = {
            vod_id: lineUrl,
            vod_name: kname,
            vod_pic: kpic,
            vod_remarks: line ? line.group : '',
            type_name: '线路',
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

// 播放：直接交给浏览器内嵌打开
async function play(flag, ids, flags) {
    try {
        let kurl = htmlDecode(ids);
        return JSON.stringify({jx: 0, parse: 1, url: kurl, header: DefHeader});
    } catch (e) {
        console.error('播放失败:', e.message);
        return JSON.stringify({jx: 0, parse: 0, url: '', header: {}});
    }
}

// ============================================================
// 六、辅助函数
// ============================================================

// 把线路数组转为 VOD 列表
function linesToVods(lines) {
    if (!Array.isArray(lines)) {return [];}
    return lines.map(l => ({
        vod_name: l.name,
        vod_pic: absUrl('/images/logo.png'),
        vod_remarks: l.group,
        vod_id: l.url
    }));
}

// URL → 完整 URL
function absUrl(path) {
    if (typeof path !== 'string' || !path.trim()) {return '';}
    path = htmlDecode(path.trim());
    if (/^https?:\/\//i.test(path)) {return path;}
    if (path.startsWith('//')) {return 'https:' + path;}
    return `${HOST}/${path.replace(/^\/+/, '')}`;
}

// 取 URL 的 host（含协议）
function getUrlHost(u) {
    try {return new URL(u).host;} catch (e) {return '';}
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

// ============================================================
// 七、网络请求封装
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
// 八、插件导出入口
// ============================================================
export function __jsEvalReturn() {
    return {
        init, home, homeVod, category, search, detail, play,
        proxy: null
    };
}
