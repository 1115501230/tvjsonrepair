/*
title: '色虎视频', author: 'Codex'
ext 可选
{
    "host": "https://www.sehu001.vip:9527",
    "timeout": 6000,
    "catesSet": "国产&传媒&日韩&欧美&动漫",
    "tabsSet": "直连播放&下载播放&网页播放"
}
*/

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36';
const DefHeader = {'User-Agent': MOBILE_UA};

const DEFAULT_HOST = 'https://www.sehu001.vip:9527';
const DEFAULT_API_HOST = 'https://www.sehu119.vip:9527';
const DEFAULT_CLASSES = [
    {type_name: '国产', type_id: '1'},
    {type_name: '传媒', type_id: '2'},
    {type_name: '日韩', type_id: '3'},
    {type_name: '解说', type_id: '10'},
    {type_name: '欧美', type_id: '4'},
    {type_name: '动漫', type_id: '5'},
    {type_name: 'AI换脸', type_id: '7'},
    {type_name: '同性', type_id: '8'},
    {type_name: '三级片', type_id: '6'},
    {type_name: '其他', type_id: '40'}
];

const API = {
    appConfig: '/ht/users/v2/appConfig',
    guestLogin: '/ht/users/v2/guestLogin',
    homeH5: '/ht/content/v2/homeH5',
    category: '/ht/content/v2/queryTypeVideosH5',
    detail: '/ht/content/v2/detail',
    search: '/ht/content/v2/search'
};

var HOST = DEFAULT_HOST;
var SITE_HOST = DEFAULT_API_HOST;
var API_HOST = DEFAULT_API_HOST;
var KParams = {
    headers: {'User-Agent': MOBILE_UA},
    timeout: 6000,
    catesSet: '',
    tabsSet: '',
    resHtml: '',
    appConfig: null,
    categories: [],
    token: '',
    deviceId: '',
    deviceType: 'H5-android',
    channelId: '81',
    channelId2: 'www.sehu119.vip:9527',
    brandId: 'sehu',
    signKey: '52S8VB&uiFR^hprd',
    bundleId: 'com.sh01.h523.vid',
    version: '1.0.0',
    userId: 'U11336548'
};

async function init(cfg) {
    try {
        const ext = normalizeExt(cfg?.ext);
        HOST = normalizeHost(ext.host || DEFAULT_HOST);
        SITE_HOST = normalizeHost(ext.siteHost || DEFAULT_API_HOST);
        API_HOST = normalizeHost(ext.apiHost || SITE_HOST);

        const timeout = parseInt(ext.timeout, 10);
        if (timeout > 0) {KParams.timeout = timeout;}

        KParams.catesSet = ext.catesSet?.trim?.() || '';
        KParams.tabsSet = ext.tabsSet?.trim?.() || '';
        KParams.signKey = ext.signKey || KParams.signKey;
        KParams.bundleId = ext.bundleId || KParams.bundleId;
        KParams.version = ext.version || KParams.version;
        KParams.brandId = ext.brandId || KParams.brandId;
        KParams.deviceType = ext.deviceType || KParams.deviceType;
        KParams.deviceId = ext.deviceId || KParams.deviceId || makeDeviceId();

        const firstHtml = await request(HOST, {headers: buildWebHeaders(HOST)});
        const realHost = normalizeHost(ext.siteHost || parseRealHost(firstHtml) || SITE_HOST || HOST);
        SITE_HOST = realHost;
        API_HOST = normalizeHost(ext.apiHost || realHost);
        KParams.channelId2 = hostPart(SITE_HOST);
        updateBaseHeaders();

        KParams.resHtml = /Random Redirect Page/i.test(firstHtml) || realHost !== HOST
            ? await request(SITE_HOST + '/?t=' + Date.now(), {headers: buildWebHeaders(SITE_HOST)})
            : firstHtml;

        parseBootConfig(KParams.resHtml);
        await loadAppConfig();
    } catch (e) {
        console.error('初始化失败:', e.message);
        updateBaseHeaders();
    }
}

async function home(filter) {
    try {
        await ensureConfig();
        let classes = buildHomeClasses();
        if (KParams.catesSet) {classes = ctSet(classes, KParams.catesSet);}
        return JSON.stringify({class: classes, filters: buildFilters(classes)});
    } catch (e) {
        console.error('获取分类失败:', e.message);
        return JSON.stringify({class: DEFAULT_CLASSES, filters: {}});
    }
}

async function homeVod() {
    try {
        await ensureConfig();
        const res = await apiPost(API.homeH5, {showId: 12, pageNo: 0, alreadyShowAdvIds: ''});
        const list = flattenHomeVideos(res?.data).map(vodFromItem).filter(Boolean);
        if (list.length) {return JSON.stringify({list});}
        const cate = JSON.parse(await category(DEFAULT_CLASSES[0].type_id, 1, false, {}));
        return JSON.stringify({list: cate.list || []});
    } catch (e) {
        console.error('获取推荐失败:', e.message);
        return JSON.stringify({list: []});
    }
}

async function category(tid, pg, filter, extend) {
    try {
        await ensureConfig();
        pg = parseInt(pg, 10);
        pg = pg > 0 ? pg : 1;
        extend = extend || {};

        const typeId = String(extend.cateId || tid || DEFAULT_CLASSES[0].type_id);
        const sortType = parseInt(extend.sortType || 0, 10);
        const tag = extend.tag || '';
        const res = await apiPost(API.category, {
            typeId,
            tag,
            sortType: isNaN(sortType) ? 0 : sortType,
            needSmallAdv: 2,
            pageNo: pg - 1,
            alreadyShowAdvIds: ''
        });

        const data = res?.data || {};
        const videos = data.typeVideoList || data.videoList || data.list || [];
        return JSON.stringify({
            page: pg,
            pagecount: parseInt(data.totalPage || data.pageCount || pg, 10) || pg,
            limit: videos.length || 20,
            total: parseInt(data.totalCount || data.total || 0, 10) || 0,
            list: videos.map(vodFromItem).filter(Boolean)
        });
    } catch (e) {
        console.error('获取列表失败:', e.message);
        return JSON.stringify({page: pg || 1, pagecount: 1, limit: 20, total: 0, list: []});
    }
}

async function search(wd, quick, pg) {
    try {
        await ensureConfig();
        pg = parseInt(pg, 10);
        pg = pg > 0 ? pg : 1;
        const res = await apiPost(API.search, {
            keywords: wd || '',
            pageNo: pg - 1,
            pageSize: 13
        });
        const data = res?.data || {};
        const videos = data.searchList || data.videoList || data.list || [];
        return JSON.stringify({
            page: pg,
            pagecount: parseInt(data.totalPage || data.pageCount || pg, 10) || pg,
            limit: 13,
            total: parseInt(data.totalCount || data.total || 0, 10) || 0,
            list: videos.map(vodFromItem).filter(Boolean)
        });
    } catch (e) {
        console.error('搜索失败:', e.message);
        return JSON.stringify({page: pg || 1, pagecount: 1, limit: 13, total: 0, list: []});
    }
}

async function detail(ids) {
    try {
        await ensureConfig();
        const contentId = extractContentId(Array.isArray(ids) ? ids[0] : ids);
        if (!contentId) {return JSON.stringify({list: []});}
        await ensureGuestToken();

        const res = await apiPost(API.detail, {contentId, tryPlayFlag: '0'}, {auth: true});
        const data = res?.data || {};
        const item = data.videoDetail || data.detail || data || {};
        const webUrl = urljoin(SITE_HOST, '/#/detail/' + contentId);

        const froms = [];
        const urls = [];
        if (data.playUrl) {
            froms.push('直连播放');
            urls.push('正片$' + data.playUrl);
        }
        if (data.downUrl && data.downUrl !== data.playUrl) {
            froms.push('下载播放');
            urls.push('正片$' + data.downUrl);
        }
        froms.push('网页播放');
        urls.push('正片$' + webUrl);

        const tabs = applyTabSet(froms, urls);
        const vod = {
            vod_id: String(contentId),
            vod_name: cleanText(item.title || item.name || '视频'),
            vod_pic: absolutizeImage(item.img || item.cover || ''),
            type_name: cleanText(item.vodSub || tagsToText(data.tags) || '视频'),
            vod_year: formatDate(item.onlineTime || item.createTime || item.updateTime || ''),
            vod_area: '',
            vod_remarks: makeRemark(item),
            vod_actor: tagsToText(data.tags),
            vod_director: '',
            vod_content: cleanText(item.description || item.intro || item.title || ''),
            vod_play_from: tabs.froms.join('$$$'),
            vod_play_url: tabs.urls.join('$$$')
        };
        return JSON.stringify({list: [vod]});
    } catch (e) {
        console.error('获取详情失败:', e.message);
        return JSON.stringify({list: []});
    }
}

async function play(flag, ids) {
    try {
        let playUrl = ids || '';
        if (flag && flag.indexOf('网页') > -1) {
            return JSON.stringify({jx: 1, parse: 1, url: playUrl, header: DefHeader});
        }
        if (!/^https?:\/\//i.test(playUrl) || /\/detail\/|#\/detail\//i.test(playUrl)) {
            const contentId = extractContentId(playUrl);
            if (contentId) {
                await ensureGuestToken();
                const res = await apiPost(API.detail, {contentId, tryPlayFlag: '0'}, {auth: true});
                playUrl = res?.data?.playUrl || res?.data?.downUrl || playUrl;
            }
        }
        return JSON.stringify({
            jx: /^https?:\/\//i.test(playUrl) ? 0 : 1,
            parse: /^https?:\/\//i.test(playUrl) ? 0 : 1,
            url: playUrl,
            header: {'User-Agent': MOBILE_UA, Referer: SITE_HOST + '/', Origin: SITE_HOST}
        });
    } catch (e) {
        console.error('播放失败:', e.message);
        return JSON.stringify({jx: 1, parse: 1, url: ids || '', header: DefHeader});
    }
}

async function ensureConfig() {
    if (KParams.categories.length) {return;}
    await loadAppConfig();
}

async function loadAppConfig() {
    try {
        const res = await apiPost(API.appConfig, {}, {noBody: true, auth: false});
        const data = res?.data || {};
        const appConfig = data.appConfig || data.config || data || {};
        const list = appConfig.videoTypeList || data.videoTypeList || [];
        if (Array.isArray(list) && list.length) {
            KParams.appConfig = appConfig;
            KParams.categories = list;
        }
    } catch (e) {
        console.error('读取站点配置失败:', e.message);
    }
}

async function ensureGuestToken() {
    if (KParams.token) {return KParams.token;}
    const res = await apiPost(API.guestLogin, {}, {auth: false});
    const data = res?.data || {};
    KParams.token = data.token || data.accessToken || '';
    return KParams.token;
}

async function apiPost(endpoint, payload = {}, options = {}) {
    const timestamp = String(Date.now());
    const key = getAesKey(timestamp);
    const iv = getAesIv();
    const headers = buildApiHeaders(timestamp, options);
    const reqOptions = {method: 'POST', headers, timeout: KParams.timeout};

    if (!options.noBody) {
        const signed = {...(payload || {})};
        signed.sign = buildSign(endpoint, signed);
        const body = aesEncrypt(JSON.stringify(signed), key, iv);
        reqOptions.body = body;
        reqOptions.data = body;
        reqOptions.postType = 'text';
    }

    const text = await request(urljoin(API_HOST, endpoint), reqOptions);
    let json;
    try {
        json = JSON.parse(text || '{}');
    } catch (e) {
        return {code: -1, msg: '接口返回非 JSON', data: null};
    }

    if (json && json.code === 10000 && typeof json.data === 'string' && json.data) {
        try {
            const decrypted = aesDecrypt(json.data, key, iv);
            json.data = JSON.parse(decrypted);
        } catch (e) {
            json.data = null;
            json.msg = json.msg || '解密失败';
        }
    }
    return json;
}

function buildSign(endpoint, payload) {
    const keys = Object.keys(payload || {}).filter(k => payload[k] !== undefined && payload[k] !== null).sort();
    let raw = '';
    keys.forEach(k => {raw += String(payload[k]);});
    raw += KParams.signKey + endpoint;
    return toMD5(raw).toUpperCase();
}

function getAesKey(timestamp) {
    return (String(timestamp).slice(-6) + KParams.signKey.slice(0, 4) + KParams.bundleId.slice(0, 6)).slice(0, 16);
}

function getAesIv() {
    return (KParams.bundleId.slice(-6) + KParams.signKey.slice(-4) + KParams.deviceId.slice(0, 6)).slice(0, 16);
}

function buildApiHeaders(timestamp, options = {}) {
    const headers = {
        'User-Agent': MOBILE_UA,
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'text/plain',
        Origin: SITE_HOST,
        Referer: SITE_HOST + '/',
        'x-req-info': [
            KParams.channelId,
            KParams.channelId2 || hostPart(SITE_HOST),
            KParams.brandId,
            KParams.deviceId,
            KParams.deviceType,
            KParams.bundleId,
            timestamp,
            KParams.version
        ].join(',')
    };
    if (options.auth !== false && KParams.token) {
        headers['x-token'] = KParams.token;
        headers['x-user-type'] = '2';
    }
    return headers;
}

function buildWebHeaders(host) {
    return {
        'User-Agent': MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: host + '/'
    };
}

function updateBaseHeaders() {
    KParams.headers = {
        'User-Agent': MOBILE_UA,
        Accept: '*/*',
        Referer: SITE_HOST + '/',
        Origin: SITE_HOST
    };
}

function parseBootConfig(html) {
    if (!html) {return;}
    const cid = html.match(/__xyz_cid_\s*=\s*["']?([^;"'\s]+)/i);
    const bid = html.match(/__xyz_bid_\s*=\s*["']([^"']+)/i);
    if (cid) {KParams.channelId = String(cid[1]).replace(/[^\w.-]/g, '') || KParams.channelId;}
    if (bid) {KParams.brandId = bid[1] || KParams.brandId;}
}

function parseRealHost(html) {
    if (!html) {return '';}
    const direct = html.match(/https?:\/\/www\.sehu\d+\.vip:9527/i);
    return direct ? direct[0] : '';
}

function buildHomeClasses() {
    const cats = Array.isArray(KParams.categories) ? KParams.categories : [];
    let classes = cats
        .filter(it => String(it.typePid ?? '0') === '0')
        .map(it => ({type_name: cleanText(it.typeName || it.name || ''), type_id: String(it.typeId || it.id || '')}))
        .filter(it => it.type_name && it.type_id);
    return classes.length ? classes : DEFAULT_CLASSES;
}

function buildFilters(classes) {
    const cats = Array.isArray(KParams.categories) ? KParams.categories : [];
    const filters = {};
    classes.forEach(cls => {
        const tid = String(cls.type_id);
        const top = cats.find(it => String(it.typeId || it.id) === tid) || {};
        const values = [];
        const children = cats.filter(it => String(it.typePid || '') === tid);
        if (children.length) {
            values.push({
                key: 'cateId',
                name: '分类',
                value: [{n: '全部', v: ''}].concat(children.map(it => ({
                    n: cleanText(it.typeName || it.name || ''),
                    v: String(it.typeId || it.id || '')
                })).filter(it => it.n && it.v))
            });
        }
        const tags = splitTags(top.tags || top.tag || top.tagList || '');
        if (tags.length) {
            values.push({key: 'tag', name: '标签', value: [{n: '全部', v: ''}].concat(tags.map(it => ({n: it, v: it})))});
        }
        values.push({
            key: 'sortType',
            name: '排序',
            value: [
                {n: '最近更新', v: '0'},
                {n: '最多播放', v: '1'},
                {n: '最多收藏', v: '2'}
            ]
        });
        filters[tid] = values;
    });
    return filters;
}

function flattenHomeVideos(data) {
    const list = [];
    const sections = data?.contentClassifyList || data?.classifyList || data?.list || [];
    if (Array.isArray(sections)) {
        sections.forEach(section => {
            const videos = section.contentList || section.videoList || section.list || [];
            if (Array.isArray(videos)) {list.push(...videos);}
        });
    }
    return list;
}

function vodFromItem(item) {
    if (!item || (item.contentType !== undefined && String(item.contentType) !== '1')) {return null;}
    const id = item.contentId || item.id || item.videoId;
    if (!id) {return null;}
    const title = cleanText(item.title || item.name || '');
    return {
        vod_id: String(id),
        vod_name: cleanText((item.vodSub ? '[' + item.vodSub + '] ' : '') + title),
        vod_pic: absolutizeImage(item.img || item.cover || item.pic || ''),
        vod_remarks: makeRemark(item)
    };
}

function makeRemark(item) {
    if (!item) {return '';}
    if (String(item.unlockType) === '2') {return 'VIP';}
    if (String(item.unlockType) === '3') {return item.buyPrice ? String(item.buyPrice) + '元宝' : '付费';}
    return durationToTime(item.duration) || cleanText(item.vodSub || item.remark || '');
}

function splitTags(tags) {
    if (Array.isArray(tags)) {
        return tags.map(it => cleanText(it.tagName || it.name || it)).filter(Boolean);
    }
    return String(tags || '').split(/[,，|]/).map(cleanText).filter(Boolean);
}

function tagsToText(tags) {
    return splitTags(tags).join(',');
}

function applyTabSet(froms, urls) {
    if (!KParams.tabsSet) {return {froms, urls};}
    const wanted = KParams.tabsSet.split('&').map(it => it.trim()).filter(Boolean);
    const nextFroms = [];
    const nextUrls = [];
    wanted.forEach(name => {
        const idx = froms.findIndex(it => it === name);
        if (idx > -1) {
            nextFroms.push(froms[idx]);
            nextUrls.push(urls[idx]);
        }
    });
    return nextFroms.length ? {froms: nextFroms, urls: nextUrls} : {froms, urls};
}

function extractContentId(input) {
    const text = String(input || '');
    const route = text.match(/(?:detail\/|contentId=)(\d+)/i);
    if (route) {return route[1];}
    const num = text.match(/\d+/);
    return num ? num[0] : '';
}

function cleanText(str) {
    return String(str || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function durationToTime(duration) {
    const total = parseInt(duration, 10);
    if (!total || total < 0) {return '';}
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
}

function formatDate(value) {
    if (!value) {return '';}
    const text = String(value);
    if (/^\d{10,13}$/.test(text)) {
        const date = new Date(text.length === 10 ? parseInt(text, 10) * 1000 : parseInt(text, 10));
        if (!isNaN(date.getTime())) {return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');}
    }
    return cleanText(text).slice(0, 10);
}

function absolutizeImage(url) {
    if (!url) {return '';}
    if (/^https?:\/\//i.test(url)) {return url;}
    return urljoin(SITE_HOST, url);
}

function normalizeExt(ext) {
    if (!ext) {return {};}
    if (typeof ext === 'string') {
        try {return JSON.parse(ext);} catch (e) {return {host: ext};}
    }
    return ext;
}

function normalizeHost(host) {
    host = String(host || '').trim();
    if (!host) {return '';}
    return host.replace(/\/+$/, '');
}

function hostPart(url) {
    return String(url || '').replace(/^https?:\/\//i, '').split('/')[0];
}

function urljoin(base, path) {
    if (!path) {return base;}
    if (/^https?:\/\//i.test(path)) {return path;}
    return normalizeHost(base) + '/' + String(path).replace(/^\/+/, '');
}

function makeDeviceId() {
    return 'H5-' + randomString(21);
}

function randomString(len) {
    const alphabet = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
    let out = '';
    for (let i = 0; i < len; i++) {
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
}

function ctSet(kArr, setStr) {
    try {
        if (!Array.isArray(kArr) || !kArr.length || !setStr) {return kArr;}
        const names = String(setStr).split('&').map(it => it.trim()).filter(Boolean);
        const filtered = names.map(name => kArr.find(it => it.type_name === name)).filter(Boolean);
        return filtered.length ? filtered : kArr;
    } catch (e) {
        return kArr;
    }
}

async function request(reqUrl, options = {}) {
    try {
        if (typeof reqUrl !== 'string' || !reqUrl.trim()) {throw new Error('reqUrl 不能为空');}
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
        return res?.content ?? '';
    } catch (e) {
        console.error(`${reqUrl} -> 请求失败:`, e.message);
        return '';
    }
}

function aesEncrypt(text, key, iv) {
    const keyBytes = utf8ToBytes(key);
    const ivBytes = utf8ToBytes(iv);
    const schedule = keyExpansion(keyBytes);
    const bytes = zeroPad(utf8ToBytes(text));
    let prev = ivBytes.slice(0, 16);
    const out = [];
    for (let i = 0; i < bytes.length; i += 16) {
        const block = bytes.slice(i, i + 16).map((b, idx) => b ^ prev[idx]);
        const encrypted = encryptBlock(block, schedule);
        out.push(...encrypted);
        prev = encrypted;
    }
    return base64Encode(out);
}

function aesDecrypt(cipherText, key, iv) {
    const keyBytes = utf8ToBytes(key);
    const ivBytes = utf8ToBytes(iv);
    const schedule = keyExpansion(keyBytes);
    const bytes = base64Decode(cipherText);
    let prev = ivBytes.slice(0, 16);
    const out = [];
    for (let i = 0; i < bytes.length; i += 16) {
        const block = bytes.slice(i, i + 16);
        const decrypted = decryptBlock(block, schedule).map((b, idx) => b ^ prev[idx]);
        out.push(...decrypted);
        prev = block;
    }
    while (out.length && out[out.length - 1] === 0) {out.pop();}
    return bytesToUtf8(out);
}

function zeroPad(bytes) {
    const out = bytes.slice();
    const pad = (16 - (out.length % 16)) % 16;
    for (let i = 0; i < pad; i++) {out.push(0);}
    return out;
}

const AES_SBOX = [
    99,124,119,123,242,107,111,197,48,1,103,43,254,215,171,118,
    202,130,201,125,250,89,71,240,173,212,162,175,156,164,114,192,
    183,253,147,38,54,63,247,204,52,165,229,241,113,216,49,21,
    4,199,35,195,24,150,5,154,7,18,128,226,235,39,178,117,
    9,131,44,26,27,110,90,160,82,59,214,179,41,227,47,132,
    83,209,0,237,32,252,177,91,106,203,190,57,74,76,88,207,
    208,239,170,251,67,77,51,133,69,249,2,127,80,60,159,168,
    81,163,64,143,146,157,56,245,188,182,218,33,16,255,243,210,
    205,12,19,236,95,151,68,23,196,167,126,61,100,93,25,115,
    96,129,79,220,34,42,144,136,70,238,184,20,222,94,11,219,
    224,50,58,10,73,6,36,92,194,211,172,98,145,149,228,121,
    231,200,55,109,141,213,78,169,108,86,244,234,101,122,174,8,
    186,120,37,46,28,166,180,198,232,221,116,31,75,189,139,138,
    112,62,181,102,72,3,246,14,97,53,87,185,134,193,29,158,
    225,248,152,17,105,217,142,148,155,30,135,233,206,85,40,223,
    140,161,137,13,191,230,66,104,65,153,45,15,176,84,187,22
];

const AES_INV_SBOX = [
    82,9,106,213,48,54,165,56,191,64,163,158,129,243,215,251,
    124,227,57,130,155,47,255,135,52,142,67,68,196,222,233,203,
    84,123,148,50,166,194,35,61,238,76,149,11,66,250,195,78,
    8,46,161,102,40,217,36,178,118,91,162,73,109,139,209,37,
    114,248,246,100,134,104,152,22,212,164,92,204,93,101,182,146,
    108,112,72,80,253,237,185,218,94,21,70,87,167,141,157,132,
    144,216,171,0,140,188,211,10,247,228,88,5,184,179,69,6,
    208,44,30,143,202,63,15,2,193,175,189,3,1,19,138,107,
    58,145,17,65,79,103,220,234,151,242,207,206,240,180,230,115,
    150,172,116,34,231,173,53,133,226,249,55,232,28,117,223,110,
    71,241,26,113,29,41,197,137,111,183,98,14,170,24,190,27,
    252,86,62,75,198,210,121,32,154,219,192,254,120,205,90,244,
    31,221,168,51,136,7,199,49,177,18,16,89,39,128,236,95,
    96,81,127,169,25,181,74,13,45,229,122,159,147,201,156,239,
    160,224,59,77,174,42,245,176,200,235,187,60,131,83,153,97,
    23,43,4,126,186,119,214,38,225,105,20,99,85,33,12,125
];

function keyExpansion(key) {
    const rcon = [1,2,4,8,16,32,64,128,27,54];
    const expanded = key.slice(0, 16);
    let bytes = 16;
    let rconIdx = 0;
    while (bytes < 176) {
        let temp = expanded.slice(bytes - 4, bytes);
        if (bytes % 16 === 0) {
            temp = [temp[1], temp[2], temp[3], temp[0]].map(b => AES_SBOX[b]);
            temp[0] ^= rcon[rconIdx++];
        }
        for (let i = 0; i < 4; i++) {
            expanded[bytes] = (expanded[bytes - 16] ^ temp[i]) & 255;
            bytes++;
        }
    }
    return expanded;
}

function encryptBlock(block, schedule) {
    const state = block.slice(0, 16);
    addRoundKey(state, schedule, 0);
    for (let round = 1; round < 10; round++) {
        subBytes(state);
        shiftRows(state);
        mixColumns(state);
        addRoundKey(state, schedule, round);
    }
    subBytes(state);
    shiftRows(state);
    addRoundKey(state, schedule, 10);
    return state;
}

function decryptBlock(block, schedule) {
    const state = block.slice(0, 16);
    addRoundKey(state, schedule, 10);
    for (let round = 9; round > 0; round--) {
        invShiftRows(state);
        invSubBytes(state);
        addRoundKey(state, schedule, round);
        invMixColumns(state);
    }
    invShiftRows(state);
    invSubBytes(state);
    addRoundKey(state, schedule, 0);
    return state;
}

function addRoundKey(state, schedule, round) {
    const offset = round * 16;
    for (let i = 0; i < 16; i++) {state[i] ^= schedule[offset + i];}
}

function subBytes(state) {
    for (let i = 0; i < 16; i++) {state[i] = AES_SBOX[state[i]];}
}

function invSubBytes(state) {
    for (let i = 0; i < 16; i++) {state[i] = AES_INV_SBOX[state[i]];}
}

function shiftRows(s) {
    const t = s.slice();
    s[1] = t[5]; s[5] = t[9]; s[9] = t[13]; s[13] = t[1];
    s[2] = t[10]; s[6] = t[14]; s[10] = t[2]; s[14] = t[6];
    s[3] = t[15]; s[7] = t[3]; s[11] = t[7]; s[15] = t[11];
}

function invShiftRows(s) {
    const t = s.slice();
    s[1] = t[13]; s[5] = t[1]; s[9] = t[5]; s[13] = t[9];
    s[2] = t[10]; s[6] = t[14]; s[10] = t[2]; s[14] = t[6];
    s[3] = t[7]; s[7] = t[11]; s[11] = t[15]; s[15] = t[3];
}

function mixColumns(s) {
    for (let c = 0; c < 4; c++) {
        const i = c * 4;
        const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
        s[i] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
        s[i + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
        s[i + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
        s[i + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
    }
}

function invMixColumns(s) {
    for (let c = 0; c < 4; c++) {
        const i = c * 4;
        const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
        s[i] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
        s[i + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
        s[i + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
        s[i + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
    }
}

function gmul(a, b) {
    let p = 0;
    for (let i = 0; i < 8; i++) {
        if (b & 1) {p ^= a;}
        const hi = a & 128;
        a = (a << 1) & 255;
        if (hi) {a ^= 27;}
        b >>= 1;
    }
    return p & 255;
}

function toMD5(str) {
    const bytes = utf8ToBytes(str);
    const originalLength = bytes.length;
    bytes.push(128);
    while ((bytes.length % 64) !== 56) {bytes.push(0);}
    let bitLenLow = (originalLength * 8) >>> 0;
    let bitLenHigh = Math.floor(originalLength / 0x20000000) >>> 0;
    for (let i = 0; i < 4; i++) {bytes.push((bitLenLow >>> (8 * i)) & 255);}
    for (let i = 0; i < 4; i++) {bytes.push((bitLenHigh >>> (8 * i)) & 255);}

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    const s = [
        7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
        5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
        4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
        6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21
    ];
    const k = [];
    for (let i = 0; i < 64; i++) {k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;}

    for (let offset = 0; offset < bytes.length; offset += 64) {
        const m = [];
        for (let i = 0; i < 16; i++) {
            const j = offset + i * 4;
            m[i] = (bytes[j] | (bytes[j + 1] << 8) | (bytes[j + 2] << 16) | (bytes[j + 3] << 24)) >>> 0;
        }
        let a = a0, b = b0, c = c0, d = d0;
        for (let i = 0; i < 64; i++) {
            let f, g;
            if (i < 16) {
                f = (b & c) | ((~b) & d);
                g = i;
            } else if (i < 32) {
                f = (d & b) | ((~d) & c);
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                f = b ^ c ^ d;
                g = (3 * i + 5) % 16;
            } else {
                f = c ^ (b | (~d));
                g = (7 * i) % 16;
            }
            const tmp = d;
            d = c;
            c = b;
            b = add32(b, leftRotate(add32(add32(a, f), add32(k[i], m[g])), s[i]));
            a = tmp;
        }
        a0 = add32(a0, a);
        b0 = add32(b0, b);
        c0 = add32(c0, c);
        d0 = add32(d0, d);
    }
    return wordHex(a0) + wordHex(b0) + wordHex(c0) + wordHex(d0);
}

function add32(a, b) {
    return (a + b) >>> 0;
}

function leftRotate(x, c) {
    return ((x << c) | (x >>> (32 - c))) >>> 0;
}

function wordHex(word) {
    let out = '';
    for (let i = 0; i < 4; i++) {
        out += ((word >>> (8 * i)) & 255).toString(16).padStart(2, '0');
    }
    return out;
}

function utf8ToBytes(str) {
    const bytes = [];
    str = String(str);
    for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
            const next = str.charCodeAt(++i);
            code = 0x10000 + (((code & 0x3ff) << 10) | (next & 0x3ff));
        }
        if (code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0x10000) {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        } else {
            bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
    }
    return bytes;
}

function bytesToUtf8(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length;) {
        const b0 = bytes[i++];
        if (b0 < 0x80) {
            out += String.fromCharCode(b0);
        } else if (b0 < 0xe0) {
            const b1 = bytes[i++];
            out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
        } else if (b0 < 0xf0) {
            const b1 = bytes[i++], b2 = bytes[i++];
            out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
        } else {
            const b1 = bytes[i++], b2 = bytes[i++], b3 = bytes[i++];
            let code = ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
            code -= 0x10000;
            out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
        }
    }
    return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Encode(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
        const n = (b0 << 16) | (b1 << 8) | b2;
        out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
    }
    return out;
}

function base64Decode(str) {
    str = String(str || '').replace(/\s+/g, '');
    const out = [];
    for (let i = 0; i < str.length; i += 4) {
        const c0 = B64.indexOf(str[i]);
        const c1 = B64.indexOf(str[i + 1]);
        const c2 = str[i + 2] === '=' ? -1 : B64.indexOf(str[i + 2]);
        const c3 = str[i + 3] === '=' ? -1 : B64.indexOf(str[i + 3]);
        const n = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
        out.push((n >> 16) & 255);
        if (c2 >= 0) {out.push((n >> 8) & 255);}
        if (c3 >= 0) {out.push(n & 255);}
    }
    return out;
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
