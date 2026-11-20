(() => {
  "use strict";
  const words = {
    guestbook:["留言板"],
    publicHint:["发表后，所有访问者都能看到你的昵称和留言。"],
    recent:["最新留言"],
    refresh:["刷新"],
    older:["查看更多"],
    nickname:["昵称"],
    message:["留言"],
    publish:["发表留言"],
    contact:["联系我"],
    contactHeading:["联系家恩宝贝"],
    back:["← 返回棋盘"],
    privateHint:["建议会私下发给 家恩宝贝。如果希望收到回复，请留下联系方式。"],
    suggestion:["建议内容"],
    sender:["你的称呼（选填）"],
    reply:["联系方式（选填）"],
    send:["发送建议"],
    language:["语言"],
    offlineBoard:["留言板尚未开放。"],
    offlineMail:["建议收件服务尚未开通。"],
    loading:["正在读取留言…"],
    empty:["还没有留言。"],
    loadError:["读取失败，请点「刷新」重试。"],
    sending:["正在发送…"],
    published:["留言已公开发表。"],
    sent:["建议已提交，谢谢你的反馈。"],
    limit:["操作过于频繁，请稍后再试。"],
    sendError:["未能确认提交结果，请检查网络后重试。"],
    invalid:["昵称需为 1～24 个字符，留言需为 1～500 个字符。"],
    required:["请填写建议内容。"],
    forbidden:["当前网址尚未获准发表留言，请从正式站点打开。"]
  };
  const byId = id => document.getElementById(id);
  const config = window.SONAR_SERVICES || {};
  const word = key => words[key][0];
  const notices = new Map();
  function notice(id, key, error = false) {
    notices.set(id,key);
    const element = byId(id);
    element.textContent = key ? word(key) : "";
    element.dataset.error = String(error);
  }
  function translate() {
    document.querySelectorAll("[data-word]").forEach(node => {node.textContent = word(node.dataset.word);});
    for (const [id,key] of notices) byId(id).textContent = key ? word(key) : "";
    document.querySelectorAll("time[datetime]").forEach(node => {
      const date = new Date(node.dateTime);
      node.textContent = new Intl.DateTimeFormat(document.documentElement.lang,{dateStyle:"medium",timeStyle:"short"}).format(date);
    });
  }
  function getGuestbookUrl() {
    if (!config.guestbookUrl) return null;
    try {
      const url = new URL(config.guestbookUrl);
      const local = ["127.0.0.1","localhost","[::1]"].includes(url.hostname);
      if (url.protocol === "https:" || (local && url.protocol === "http:")) return url;
    } catch {}
    return null;
  }
  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),18000);
    try {
      const response = await fetch(url,{...options,signal:controller.signal,credentials:"omit",cache:"no-store"});
      if (!response.ok) {
        const error = new Error("Request failed");
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } finally {clearTimeout(timeout);}
  }
  function startGuestbook() {
    const url = getGuestbookUrl();
    const form = byId("guest-form"), list = byId("public-messages");
    const refresh = byId("refresh-messages"), older = byId("older-messages"), publish = byId("publish-message");
    let cursor = null, busy = false, submission = null;
    function lock(value) {
      busy = value;
      refresh.disabled = older.disabled = publish.disabled = value || !url;
    }
    function drawItem(item) {
      if (!Number.isSafeInteger(item?.id) || typeof item.nickname !== "string" || typeof item.message !== "string" ||
          !Number.isFinite(Date.parse(item.createdAt))) throw new Error("Invalid message");
      const li = document.createElement("li"), meta = document.createElement("div");
      li.dataset.messageId = item.id; meta.className = "message-meta";
      const name = document.createElement("strong"), date = document.createElement("time"), body = document.createElement("p");
      name.textContent = item.nickname; date.dateTime = item.createdAt; body.textContent = item.message;
      meta.append(name,date); li.append(meta,body); return li;
    }
    async function load(append) {
      if (busy || !url) return;
      lock(true); notice("feed-state","loading");
      try {
        const target = new URL(url);
        if (append && cursor) target.searchParams.set("before",String(cursor));
        const data = await request(target);
        if (!Array.isArray(data.messages)) throw new Error("Invalid response");
        const entries = data.messages.map(drawItem);
        if (!append) list.replaceChildren();
        for (const li of entries) if (!list.querySelector('[data-message-id="'+li.dataset.messageId+'"]')) list.append(li);
        cursor = data.nextCursor; older.hidden = !cursor;
        notice("feed-state",list.childElementCount ? "" : "empty");
        translate();
      } catch {notice("feed-state","loadError",true);}
      finally {lock(false);}
    }
    refresh.onclick = () => load(false); older.onclick = () => load(true);
    form.onsubmit = async event => {
      event.preventDefault();
      if (!url || busy) return;
      const nickname = byId("guest-name").value.trim(), message = byId("guest-text").value.trim();
      if (!nickname || [...nickname].length>24 || !message || [...message].length>500) {notice("post-state","invalid",true);return;}
      if (submission?.nickname !== nickname || submission?.message !== message) {
        submission = {nickname,message,submissionId:crypto.randomUUID()};
      }
      lock(true); notice("post-state","sending");
      try {
        const data = await request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(submission)});
        const entry = drawItem(data.message);
        if (!list.querySelector('[data-message-id="'+entry.dataset.messageId+'"]')) list.prepend(entry);
        if (byId("guest-text").value.trim() === message) byId("guest-text").value = "";
        submission = null;
        notice("post-state","published"); notice("feed-state",""); translate();
      } catch (error) {
        const reason = ({400:"invalid",403:"forbidden",429:"limit"})[error.status] || "sendError";
        notice("post-state",reason,true);
      } finally {lock(false);}
    };
    if (url) load(false);
    else {lock(false);notice("feed-state","offlineBoard");}
  }
  function startContact() {
    translate();
    const form = byId("contact-form"), button = byId("send-feedback");
    const id = String(config.formspreeId || "").trim();
    if (!/^[a-zA-Z0-9_-]{5,64}$/.test(id)) {button.disabled=true;notice("contact-state","offlineMail");}
    form.onsubmit = async event => {
      event.preventDefault();
      if (button.disabled) return;
      const payload = new FormData(form);
      const message = String(payload.get("message")).trim();
      if (!message) {notice("contact-state","required",true);return;}
      payload.set("message",message);
      button.disabled = true; notice("contact-state","sending");
      try {
        const data = await request("https://formspree.io/f/"+id,{method:"POST",headers:{Accept:"application/json"},body:payload});
        if (!data || data.ok === false || data.errors?.length) throw new Error("Submission rejected");
        if (byId("suggestion").value.trim() === message) byId("suggestion").value="";
        notice("contact-state","sent");
      } catch(error) {notice("contact-state",error.status===429?"limit":"sendError",true);}
      finally {button.disabled=false;}
    };
  }
  if (byId("guest-form")) {
    translate(); startGuestbook();
  } else if (byId("contact-form")) startContact();
})();
