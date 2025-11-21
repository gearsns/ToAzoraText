(async function () {
    const BaseNovelListNarouTopUrl = "https://ncode.syosetu.com";
    const BaseNovelListNarou18TopUrl = "https://novel18.syosetu.com";
    if (document.location.origin !== BaseNovelListNarouTopUrl
        && document.location.origin !== BaseNovelListNarou18TopUrl
    ) {
        return;
    }
    const TopUrl = document.location.origin;
    const TOPFOLDERNAME = 'CacheNovels';
    const toAozora = text => {
        text = text.replace(/[\r\n]+/g, "")
            .replace(/<br.*?>/ig, "\n")
            .replace(/\n?<\/p>/ig, "\n")
            .replaceAll('《', '≪').replaceAll('》', '≫')
            .replace(/<ruby>(.+?)<\/ruby>/ig, (_, p1) => {
                const ruby_text_arr = [...p1.matchAll(/<rt>(.*?)<\/rt>/ig)].map(m => m[1]);
                const ruby_base = p1.replace(/<[^>]+>.*?<\/[^>]+>/g, "").replace(/<.+?>/g, "");
                return (ruby_text_arr.length === 0)
                    ? ruby_base
                    : `｜${ruby_base}《${ruby_text_arr.join("")}》`;
            })
            .replace(/<b>(.+?)<\/b>/ig, "［＃太字］$1［＃太字終わり］")
            .replace(/<i>(.+?)<\/i>/ig, "［＃斜体］$1［＃斜体終わり］")
            .replace(/<s>(.+?)<\/s>/ig, "［＃取消線］$1［＃取消線終わり］")
            .replace(/<em class="emphasisDots">(.+?)<\/em>/g, "［＃傍点］$1［＃傍点終わり］")
            .replace(/<.+?>/g, "");
        const ENTITIES = { quot: '"', amp: "&", nbsp: " ", lt: "<", gt: ">", copy: "(c)", "#39": "'" };
        for (const [key, value] of Object.entries(ENTITIES)) {
            text = text.replaceAll(`&${key};`, value);
        }
        return text;
    }
    const writeAozraText = async (outputFileHandle, bodyDirHandle, toc) => {
        const writable = await outputFileHandle.createWritable();
        await writable.write(`${toc.title}\n`);
        await writable.write(`${toc.author}\n`);
        await writable.write(`\n［＃区切り線］\n${toc.story}\n［＃区切り線］\n\n`);
        let chapter = "";
        for (const item of toc.subtitles) {
            if (fetchAbortController?.signal.aborted){
                writable.close();
                throw "cancel";
            }
            try {
                const json = await readJosnFile(bodyDirHandle, `${item.index}.json`);
                if (item.chapter && item.chapter !== chapter) {
                    await writable.write(`［＃改ページ］\n［＃ページの左右中央］\n［＃ここから柱］${toc.title} ［＃ここで柱終わり］\n［＃３字下げ］［＃大見出し］${item.chapter}［＃大見出し終わり］\n［＃改ページ］\n`);
                }
                if (item.subtitle) {
                    await writable.write(`\n［＃改ページ］\n\n［＃３字下げ］［＃中見出し］${item.subtitle}［＃中見出し終わり］\n\n`);
                }
                chapter = item.chapter;
                if (json?.body){
                    await writable.write(json.body);
                }
            } catch { }
        }
        writable.close();
    }
    //
    const sleep = time => new Promise((resolve) => setTimeout(resolve, time));
    // subtitles取得
    const getSubtitles = doc => {
        const subtitles = [];
        let chapter = "";
        for (const elSublist of doc.querySelectorAll(".p-eplist > .p-eplist__sublist, .p-eplist > .p-eplist__chapter-title")) {
            if (elSublist.classList.contains("p-eplist__sublist")) {
                const item = {};
                // サブタイトルとリンク取得
                const elSubtitle = elSublist.querySelector(".p-eplist__subtitle");
                if (elSubtitle) {
                    item.subtitle = elSubtitle.textContent.trim();
                    item.href = elSubtitle.href.replace(/https:\/\/.*\.syosetu\.com/, "");
                    item.index = item.href.replace(/\/.*\/(.*)\//, "$1");
                }
                // 作成日と更新日取得
                const elCreateDate = elSublist.querySelector(".p-eplist__update");
                if (elCreateDate) {
                    const elUpdateDate = elCreateDate.querySelector("span");
                    if (elUpdateDate) {
                        item.subupdate = elUpdateDate.title.replace(/ 改稿/, "");
                    }
                    item.subdate = elCreateDate.textContent.trim().split(/\n/)[0];
                }
                item.chapter = chapter; // 現在の章情報を追加
                subtitles.push(item);
            } else {
                chapter = elSublist.textContent.trim(); // 章タイトルを更新
            }
        }
        return subtitles;
    };
    let fetchAbortController = null;
    const isAbortError = error => error === "cancel" || error?.name === "AbortError";
    const fetchDocument = async url => {
        clearErrorMessage();
        const options = { credentials: 'include' };
        if (fetchAbortController){
            options.signal = fetchAbortController.signal;
        }
        const html = await fetch(url, options)
            .then(res => res.text())
            .catch(error => {throw error});
        const parser = new DOMParser();
        return parser.parseFromString(html, "text/html");
    };
    const cancellableSleep = async i => {
        for(; i>=0; --i){
            if (fetchAbortController?.signal.aborted){
                throw "cancel";
            }
            showLoading(`待機中 ${i}`);
            await sleep(1000);
        }
    }
    // TOC作成
    const createToc = async (basedir, ncode) => {
        const infoDocument = await fetchDocument(`${basedir}/novelview/infotop/ncode/${ncode}`);
        const param = {};
        let key = "";
        for(const el of infoDocument.querySelectorAll(".p-infotop-data__title, .p-infotop-data__value")){
            if (el.classList.contains("p-infotop-data__title")){
                key = el.textContent.trim();
            } else {
                param[key] = el.textContent.trim();
            }
        }
        const url = `${basedir}/${ncode}`;
        const topDocument = await fetchDocument(url);
        const toc = {
            title: topDocument.querySelector(".p-novel__title")?.textContent ?? "",
            author: param["作者名"],
            toc_url: url,
            story: param["あらすじ"],
            subtitles: getSubtitles(topDocument)
        };
        // 最終ページ取得
        const lastPageElement = topDocument.querySelector(".c-pager__item--last");
        if (lastPageElement) {
            const lastPage = lastPageElement ? parseInt(lastPageElement.href.match(/\?p=(\d+)/)?.[1] || "1", 10) : 1;
            // 2ページ目以降を取得
            for (let page = 2; page <= lastPage; page++) {
                await sleep(100);
                const pageDocument = await fetchDocument(`${url}/?p=${page}`);
                toc.subtitles.push(...getSubtitles(pageDocument));
            }
        } else if (toc.subtitles.length === 0) {
            const novelBodyElement = topDocument.querySelector(".p-novel__body")
            if (novelBodyElement){
                toc.subtitles.push({
                    subtitle: "",
                    href: `/${ncode}`,
                    subdate: param["掲載日"],
                    subupdate: param["最終更新日"]||param["最新掲載日"]||param["最終掲載日"],
                    index: 1,
                });
            }
        }
        return toc;
    };
    const getEpisodeData = async (basedir, item) => {
        // 追加ページを取得
        const url = `${basedir}${item.href}`;
        const doc = await fetchDocument(url);
        const extractText = name => {
            const arr = [];
            for (const el of doc.getElementsByClassName(name)) {
                arr.push(el.outerHTML);
                el.parentNode.removeChild(el);
            }
            return arr.join("");
        }
        const introduction = extractText("p-novel__text--preface");
        const postscript = extractText("p-novel__text--afterword");
        const removeItems = doc.querySelectorAll(".p-novel__subtitle-chapter, .p-novel__subtitle-episode");
        for (const removeItem of removeItems) {
            removeItem.parentNode.removeChild(removeItem);
        }
        const body = [...doc.querySelectorAll(".p-novel__body")].map(el => el.outerHTML).join("");
        return { url: url, body: body, introduction: introduction, postscript: postscript };
    }
    const readJosnFile = async (dirHandle, filename) => {
        try {
            const fileHandle = await dirHandle.getFileHandle(filename, { create: false });
            const file = await fileHandle.getFile();
            const text = await file.text();
            return JSON.parse(text);
        } catch {}
        return null
    }
    const writeJsonFile = async (dirHandle, filename, item) => {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(item));
        await writable.close();
    }
    const writeEpisodeFiles = async (basedir, bodyDirHandle, toc) => {
        let download = false;
        let count = 0;
        for (const item of toc.subtitles) {
            try {
                const fileHandle = await bodyDirHandle.getFileHandle(`${item.index}.json`, { create: false });
                const file = await fileHandle.getFile();
                const fileDate = new Date(file.lastModified);
                const episodeDate = new Date((item.subupdate || item.subdate || "").replace(/([0-9]{4}).+?([0-9]{2}).*?([0-9]{2}).+?([0-9]{2}).+([0-9]{2}).*$/, "$1/$2/$3 $4:$5"));
                if (episodeDate < fileDate) {
                    console.log(`Skip:${item.index}:${item.subtitle}`);
                    continue;
                }
            } catch { }
            showLoading(`${item.index}:${item.subtitle}`);
            if (fetchAbortController?.signal.aborted){
                throw "cancel";
            }
            await sleep(500);
            const page = await getEpisodeData(basedir, item);
            item.body = toAozora(page.body);
            item.postscript = toAozora(page.postscript);
            await writeJsonFile(bodyDirHandle, `${item.index}.json`, item);
            download = true;
            ++count;
            if (count >= 10) {
                console.log(`Sleep`);
                await cancellableSleep(5);
                count = 0;
            }
        }
        return download;
    }
    const getTopDirectoryHandle = async (create = true) => {
        const root = await navigator.storage.getDirectory();
        try {
            return await root.getDirectoryHandle(TOPFOLDERNAME, { create: create });
        } catch {}
        return null;
    }
    const downloadNovel = async (toc, ncode) => {
        const dirHandle = await getTopDirectoryHandle();
        const novelDirHandle = await dirHandle.getDirectoryHandle(ncode, { create: true });
        const bodyDirHandle = await novelDirHandle.getDirectoryHandle("本文", { create: true });
        await writeJsonFile(novelDirHandle, 'title.json', { title: toc.title, author: toc.author, page: toc.subtitles.length });
        if (fetchAbortController?.signal.aborted){
            throw "cancel";
        }
        if (await writeEpisodeFiles(TopUrl, bodyDirHandle, toc)){
            showLoading(`${toc.title}:テキストファイル作成中…`);
            const fileHandle = await novelDirHandle.getFileHandle(`${ncode}.txt`, { create: true });
            await writeAozraText(fileHandle, bodyDirHandle, toc);
        }
        showLoading(`${toc.title}:完了`);
    }
    //
    if (!document.getElementById("NovelListHost")) {
        const elNovelListHost = document.createElement("div");
        elNovelListHost.id = "NovelListHost";
        document.body.appendChild(elNovelListHost);
    }
    const elNovelListHost = document.getElementById("NovelListHost");
    if (!elNovelListHost.shadowRoot){
        elNovelListHost.attachShadow({mode: "open"});
    }
    const shadow = elNovelListHost.shadowRoot;
    shadow.innerHTML = `
        <div id="container" class="NovelListBox">
            <div id="Main" class="NovelListInnerBox">
                <div class="MainInnerBox">
                    <button id="Close">×</button><h1>Narou to Aozora Text</h1>
                    <hr>
                    <button id="AddNovel">Add</button>
                    <button id="UpdateNovel">Update</button>
                    <button id="RemoveNovel">Remove</button>
                    <button id="ListRefresh">Refresh</button>
                    <p id="NovelError"></p>
                    <table>
                        <thead><tr><th><input type="checkbox" id="ListBulkSelect"><label for="ListBulkSelect">更新</label><th>ncode<th>ページ<th>タイトル<th>作者名</thead>
                        <tbody id="NovelListData"></tbody>
                    </table>
                </div>
            </div>
            <div id="NovelAddModal" class="NovelListBox">
                <div class="NovelListInnerBox">
                    <p>ncodeを入力してください:</p>
                    <p id="AddError"></p>
                    <input type="text" id="NcodeInput" />
                    <button id="SubmitNcode">登録</button>
                    <button id="CancelNcode">キャンセル</button>
                </div>
            </div>
            <div id="NovelRemoveModal" class="NovelListBox">
                <div class="NovelListInnerBox">
                    <p>選択した小説を削除しますか？</p>
                    <button id="SubmitRemove">はい</button>
                    <button id="CancelRemove">いいえ</button>
                </div>
            </div>
            <div id="Loading" class="NovelListBox">
                <div class="NovelListInnerBox">
                    <p id="LoadingText">処理中</p>
                    <div class="spinner"></div>
                </div>
            </div>
        </div>
    `;
    const style = document.createElement('style');
    style.textContent = `
        table, input {
            margin: 2px; border: 1px solid gray; padding: 2px;
        }
        #Main {
            width: 100%; height: 100%;
        }
        #Close {
            z-index: 9999;
            position: fixed;
            top: 25px; left: 25px;
            width: 20px; height: 20px;
            background-color: white;
            border-color: white;
            color: white;
        }
        #Close::before, #Close::after {
            content: "";
            position: absolute;
            top: 50%; left: 50%;
            width: 3px; height: 15px;
            background: #888;
        }
        #Close::before {
            transform: translate(-50%,-50%) rotate(45deg);
        }
        #Close::after {
            transform: translate(-50%,-50%) rotate(-45deg);
        }
        .NovelListBox {
            z-index: 100; 
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            padding: 0; margin: 0;
            background: #00000030;
        }
        .NovelListInnerBox {
            position: fixed;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            padding: 20px;
            background: #fff;
            border: 1px solid #ccc;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        #LoadingText {
            white-space: pre-wrap;
        }
        .MainInnerBox {
            position: relative;
            width: calc(100% - 40px); height: calc(100% - 40px);
            padding: 20px;
            overflow: auto;
        }
        h1 {
            color: #777;
            display: inline;
            margin: 0;
        }
        button {
            background-color: #5cb85c;
            border-color: #4cae4c;
            color: white;
            border: 1px solid transparent;
            border-radius: 0.2rem;
            padding: 0.2rem 0.5rem;
            line-height: 1rem;
            margin-right: 0;
        }
        #AddNovel {
            background-color: #337ab7;
            border-color: #2e6da4;
        }
        #RemoveNovel {
            background-color: #d9534f;
            border-color: #d43f3a;
        }
        #ListRefresh {
            background-color: #5bc0de;
            border-color: #46b8da;
        }
        #NovelAddModal, #NovelRemoveModal, #Loading {
            display: none;
        }
        #NovelError, #AddError {
            color: red;
        }
        .NovelListBox table {
            border-collapse: collapse;
            color: #333;
            border-color: #dad3c8;
        }
        .NovelListBox thead {
            background-color: #605555;
            color: #ddd0cc;
        }
        .NovelListBox tbody tr {
            background-color: #f8f3e5;
        }
        .NovelListBox tbody tr:nth-child(even) {
            background-color: #fffcef;
        }
        .NovelListBox th {
            white-space: nowrap;
        }
        .NovelListBox th,.NovelListBox td {
            border: solid 1px; 
            border-color: #dad3c8;
            padding: 10px;
        }
        .NovelListBox td:nth-child(n+5):nth-child(-n+6) {
            min-width: 15rem;
        }
        a, a:visited {
            color: #03c;
            text-decoration: none;
        }
        .NovelListUpdateInfo {
            background-color: #1f883d;
            border-color: transparent;
            color: white;
            border-radius: 0.3rem;
            padding-left: 0.3rem; padding-right: 0.3rem;
            display: none;
        }
        #Loading .NovelListInnerBox {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        }
        .spinner {
            width: 30px; height: 30px;
            border-radius: 50%;
            border: 3px solid #FFF;
            border-left-color: #1082ce; 
            animation: spinner-rotation 1s linear infinite;
        }
        @keyframes spinner-rotation {
            0% { transform: rotate(0); }
            100% { transform: rotate(360deg); }
        }
    `;
    shadow.appendChild(style);
    document.documentElement.style.overflowY = "hidden";
    const elNovelListBaseStyle = document.getElementById("NovelListBaseStyle");
    if (elNovelListBaseStyle){
        elNovelListBaseStyle.parentNode.removeChild(elNovelListBaseStyle);
    }
    const baseStyle = document.createElement('style');
    baseStyle.id = "NovelListBaseStyle";
    baseStyle.textContent = `
    ins, #geniee_overlay_outer, .c-ad {
        display: none !important;
    }
    `;
    document.head.appendChild(baseStyle);
    //
    const NovelList = [];
    const rebuildNovelList = async _ => {
        clearErrorMessage();
        NovelList.length = 0;
        const dirHandle = await getTopDirectoryHandle(false);
        if (!dirHandle){
            return;
        }
        for await (const value of dirHandle.values()) {
            if (value.kind === 'directory'){
                const json = await readJosnFile(value, "title.json");
                if (json){
                    NovelList.push({
                        id: value.name,
                        ncode: value.name,
                        page: json.page ?? 1,
                        title: json.title,
                        author: json.author
                    })
                }
            }
        }
        NovelList.sort((a,b) => a.id.localeCompare(b.id));
    }
    const saveFileAs = async el => {
        const ncode = el.textContent;
        const dirHandle = await getTopDirectoryHandle();
        const novelDirHandle = await dirHandle.getDirectoryHandle(ncode, { create: true });
        const fileHandle = await novelDirHandle.getFileHandle(`${ncode}.txt`, { create: false });
        const file = await fileHandle.getFile();
        const a = el.cloneNode();
        const url = URL.createObjectURL(file);
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    const refreshNovelList = async _ => {
        showLoading("小説の一覧を取得しています...");
        await rebuildNovelList();
        const elNovelListData = shadow.getElementById("NovelListData");
        elNovelListData.innerHTML = NovelList.map(item =>
            `<tr class="NovelListItem" ncode="${item.ncode}" page="${item.page}" title="${escapeHtml(item.title)}">
                <td><input type="checkbox" class="NovelListNcode" value="${item.ncode}" id="NovelListItem_${item.id}">
                <label for="NovelListItem_${item.id}"><span class="NovelListUpdateInfo"></span><label>
                <td><a class="NovelDownload" download="[${escapeHtml(item.author)}]${escapeHtml(item.title)}.txt">${item.ncode}</a>
                <td>${item.page}
                <td><a href='https://ncode.syosetu.com/${item.ncode}/'>${escapeHtml(item.title)}</a>
                <td>${escapeHtml(item.author)}`
        ).join("");
        for(const el of elNovelListData.querySelectorAll(".NovelDownload")){
            el.addEventListener("click", async e => {
                e.preventDefault();
                try {
                    await saveFileAs(el);
                } catch(err) {
                    console.log(err)
                }
            });
        }
        hideLoading();
    }
    //
    const ESCAPECHAR = { '&': '&amp;', "'": '&#x27;', '`': '&#x60;', '"': '&quot;', '<': '&lt;', '>': '&gt;', }
    const escapeHtml = text => text.replace(/[&'`"<>]/g, match => ESCAPECHAR[match]);
    const clearErrorMessage = _ => setErrorMessage("");
    const setErrorMessage = text => shadow.getElementById("NovelError").textContent = text;
    const showLoading = text => {
        if (elLoading.style.display === "none"){
            elLoading.style.display = "block";
            fetchAbortController = new AbortController();
        }
        elLoadingText.textContent = text;
    }
    const hideLoading = _ => {
        cancelLoading();
        elLoading.style.display = "none";
        fetchAbortController = null;
    }
    const cancelLoading = _ => {
        try {
            fetchAbortController?.abort("cancel")
        } catch{}
    }
    shadow.querySelector("#Loading .spinner").addEventListener("dblclick", cancelLoading);
    const elLoading = shadow.getElementById("Loading");
    const elLoadingText = shadow.getElementById("LoadingText");
    // 閉じる処理
    const elModalNovelList = shadow.getElementById("container");
    shadow.getElementById("Close").addEventListener("click", e => {
        elModalNovelList.style.display = "none";
        document.documentElement.style.overflowY = "auto";
    });
    // buttons
    // Add
    const elModalAdd = shadow.getElementById("NovelAddModal");
    const elInput = shadow.getElementById("NcodeInput");
    const elError = shadow.getElementById("AddError");
    shadow.getElementById("AddNovel").addEventListener("click", _ => {
        elModalAdd.style.display = "block"; // Show Modal
        elError.textContent = "";
        const match = document.location.href.match(/https:\/\/.*?\.syosetu\.com\/(?<ncode>n[0-9A-Za-z]+)/);
        if (match) {
            elInput.value = match.groups.ncode;
        }
        elInput.focus();
    });
    elModalAdd.addEventListener("click", e => {
        if (e.target === elModalAdd) {
            elModalAdd.style.display = "none";
        }
    });
    shadow.getElementById("CancelNcode").addEventListener("click", _ => elModalAdd.style.display = "none");
    shadow.getElementById("SubmitNcode").addEventListener("click", async _ => {
        const ncode = elInput.value.trim();
        if (!ncode || ncode.length === 0) {
            elError.textContent = `ncodeが入力されていません。`;
            return;
        } else if (NovelList.some(e => e.ncode === ncode)) {
            elError.textContent = `${ncode}は既に登録されています。`;
            return;
        }
        showLoading(`小説[${ncode}]を登録中...`);
        try {
            const toc = await createToc(TopUrl, ncode);
            await cancellableSleep(5);
            await downloadNovel(toc, ncode);
            hideLoading();
            elModalAdd.style.display = "none";
            await refreshNovelList();
        } catch(error) {
            hideLoading();
            elError.textContent = isAbortError(error)
                ? `処理を中断しました。`
                : `${ncode}の登録中にエラーが発生しました。${error}`;
        }
    });
    // Update
    shadow.getElementById("UpdateNovel").addEventListener("click", async _ => {
        clearErrorMessage();
        const cond = shadow.querySelector(".NovelListNcode:checked")
        ? ".NovelListItem:has(.NovelListNcode:checked)"
        : ".NovelListItem";
        try {
            for(const item of shadow.querySelectorAll(cond)){
                showLoading(`${item.getAttribute("title")}\n情報を取得しています...`);
                const ncode = item.getAttribute("ncode");
                const foundItem = NovelList.find(e => e.ncode === ncode);
                const elUpdate = item.querySelector(".NovelListUpdateInfo");
                elUpdate.textContent = "";
                if (foundItem) {
                    const toc = await createToc(TopUrl, ncode);
                    foundItem.newToc = toc;
                    const addPage = toc.subtitles.length - foundItem.page;
                    if (addPage > 0) {
                        elUpdate.textContent = toc.subtitles.length;
                        elUpdate.style.display = "inline-block";
                    }
                    await cancellableSleep(5);
                    await downloadNovel(toc, ncode);
                }
            };
        } catch(error){
            setErrorMessage(isAbortError(error)
                ? `処理を中断しました。`
                : `エラーが発生しました。`);
        }
        hideLoading();
    });
    // Remove
    const elModelRemove = shadow.getElementById("NovelRemoveModal");
    shadow.getElementById("RemoveNovel").addEventListener("click", _ => {
        clearErrorMessage();
        if (shadow.querySelector(".NovelListNcode:checked")) {
            elModelRemove.style.display = "block";
        } else {
            setErrorMessage(`削除する小説を選択してください。`);
        }
    });
    elModelRemove.addEventListener("click", e => {
        if (e.target === elModelRemove) {
            elModelRemove.style.display = "none";
        }
    });
    shadow.getElementById("CancelRemove").addEventListener("click", _ => elModelRemove.style.display = "none");
    shadow.getElementById("SubmitRemove").addEventListener("click", async _ => {
        clearErrorMessage();
        showLoading(`一覧から小説を削除しています...`);
        elModelRemove.style.display = "none";
        const dirHandle = await getTopDirectoryHandle();
        for (const item of shadow.querySelectorAll(".NovelListNcode:checked")) {
            const ncode = item.value;
            const foundItem = NovelList.find(e => e.ncode === ncode);
            try {
                showLoading(`${foundItem.title}\n一覧から小説を削除しています...`);
                await dirHandle.removeEntry(ncode, { recursive: true });
            } catch {
                hideLoading();
                setErrorMessage(`${ncode}の削除中にエラーが発生しました。`);
                return;
            }
        };
        try {
            const root = await navigator.storage.getDirectory();
            await root.removeEntry(TOPFOLDERNAME, { recursive: false });
        } catch { }
        hideLoading();
        setErrorMessage(`小説を削除しました。`);
        refreshNovelList();
    });
    // Refresh
    shadow.getElementById("ListRefresh").addEventListener("click", refreshNovelList);
    //
    const elListBulkSelect = shadow.getElementById("ListBulkSelect");
    elListBulkSelect.addEventListener("click", _ => {
        shadow.querySelectorAll(".NovelListItem").forEach(item => {
            const elUpdate = item.querySelector(".NovelListNcode");
            elUpdate.checked = elListBulkSelect.checked;
        });
    });
    refreshNovelList();
})();
