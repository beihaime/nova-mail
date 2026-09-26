<template>
  <main class="preview" :class="{ dark }">
    <section class="window" :class="{ 'show-reader': mobileReader }">
      <aside class="sidebar" :class="{ open: mobileMenu }">
        <div class="brand"><img src="@/icons/svg/brand-mark.svg" alt="" /><strong>Nova Mail</strong></div>
        <button class="compose" @click="composing = true"><img src="@/icons/svg/compose.svg" alt="" />Compose</button>
        <nav class="nav-list">
          <button class="selected"><img src="@/icons/svg/inbox.svg" alt="" />Inbox <b>14</b></button>
          <button><img src="@/icons/svg/starred-nav.svg" alt="" />Starred</button>
          <button><img src="@/icons/svg/sent-nav.svg" alt="" />Sent</button>
          <button><img src="@/icons/svg/drafts-nav.svg" alt="" />Drafts <span>3</span></button>
          <button><img src="@/icons/svg/archive-nav.svg" alt="" />Archive</button>
          <button><img src="@/icons/svg/spam-nav.svg" alt="" />Spam</button>
          <button><img src="@/icons/svg/trash-nav.svg" alt="" />Trash</button>
        </nav>
        <div class="folders"><div>Folders <button>＋</button></div><span v-for="folder in ['Personal','Study','Work','Projects','Receipts']" :key="folder"><img src="@/icons/svg/folder-nav.svg" alt="" />{{ folder }}</span></div>
        <div class="storage"><img src="@/icons/svg/status-blue.svg" alt="" /><div><span>2.4 GB / 10 GB</span><i><b /></i><small>Preview mode · no API requests</small></div></div>
      </aside>

      <section class="content-shell">
        <header class="toolbar">
          <button class="mobile-menu" @click="mobileMenu = true"><span>☰</span></button>
          <label class="search"><img src="@/icons/svg/search.svg" alt="" /><input placeholder="Search emails, senders, or keywords…" /></label>
          <div class="toolbar-actions"><button @click="dark = !dark"><img :src="dark ? themeLight : themeDark" alt="Theme" /></button><button><img src="@/icons/svg/settings-top.svg" alt="Settings" /></button><button class="avatar">N</button><span class="account"><b>Nolan⌄</b><small>nolan@beihai.me</small></span></div>
        </header>

        <section class="mail-layout">
          <div class="mail-list">
            <div class="list-tabs"><button class="active">All</button><button>Unread</button><button>Starred</button><button class="filter"><img src="@/icons/svg/filter.svg" alt="" /></button></div>
            <article v-for="mail in mails" :key="mail.sender" class="mail-row" :class="{ active: selected.sender === mail.sender, unread: mail.unread }" @click="selectMail(mail)">
              <span class="check" /><span class="sender-logo" :style="{background: mail.color}">{{ mail.initial }}</span><div><strong>{{ mail.sender }}</strong><p>{{ mail.subject }}</p><small>{{ mail.summary }}</small></div><time>{{ mail.time }}</time><img class="row-star" src="@/icons/svg/star-outline.svg" alt="" />
            </article>
          </div>

          <article class="reader">
            <div class="reader-actions"><button class="back" @click="mobileReader = false">‹</button><span><button><img src="@/icons/svg/archive-nav.svg" alt="" /></button><button><img src="@/icons/svg/delete-action.svg" alt="" /></button><button><img src="@/icons/svg/mail-action.svg" alt="" /></button><button><img src="@/icons/svg/more-action.svg" alt="" /></button></span></div>
            <h1>{{ selected.subject }}</h1><button class="reader-star"><img src="@/icons/svg/star-outline.svg" alt="" /></button>
            <div class="sender-info"><span class="sender-logo" :style="{background: selected.color}">{{ selected.initial }}</span><div><b>{{ selected.sender }}</b> <small>&lt;no-reply@example.com&gt;</small><p>to nolan@beihai.me</p></div><time>{{ selected.time }} (2 hours ago)</time></div>
            <div class="message-card"><div class="message-banner"><img src="@/icons/svg/brand-mark.svg" alt="" /><b>{{ selected.sender }}</b><span>GEFORCE　 RTX　 AI</span></div><div class="message-hero"><strong>Powering<br />What’s Next</strong></div><div class="message-copy"><b>Hi Nolan,</b><p>{{ selected.summary }} This is a static development preview of the Nova Mail reading experience.</p><button>Track Your Order　→</button><hr /><dl><dt>Order Number</dt><dd>#NVDA-20250914-7823</dd><dt>Order Date</dt><dd>Sep 14, 2026</dd><dt>Shipping Method</dt><dd>Express Shipping</dd></dl></div></div>
            <div class="mobile-replies"><button><img src="@/icons/svg/reply.svg" alt="" />Reply</button><button><img src="@/icons/svg/forward.svg" alt="" />Forward</button></div>
          </article>
        </section>
      </section>
      <nav class="mobile-bottom"><button><img src="@/icons/svg/inbox.svg" alt="" />Inbox</button><button @click="mobileMenu = true"><img src="@/icons/svg/folder-nav.svg" alt="" />Folders</button><button class="round" @click="composing = true"><img src="@/icons/svg/compose.svg" alt="" /></button><button><img src="@/icons/svg/user.svg" alt="" />Account</button><button><img src="@/icons/svg/settings-top.svg" alt="" />Settings</button></nav>
    </section>

    <section v-if="composing" class="compose-sheet"><header><button @click="composing = false">Cancel</button><b>New message</b><button class="send" @click="composing = false">Send</button></header><label>To <input value="example@domain.com" /></label><label>Cc/Bcc <input /></label><label>Subject <input value="Hello 👋" /></label><textarea>Hello!\n\nThis is a static Nova Mail UI preview.\n\nBest regards,\nNolan</textarea><footer><img src="@/icons/svg/attachment.svg" alt="" /><img src="@/icons/svg/link.svg" alt="" /><img src="@/icons/svg/more-action.svg" alt="" /></footer></section>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import themeLight from '@/icons/svg/theme-light.svg'
import themeDark from '@/icons/svg/theme-dark.svg'

const dark = ref(false)
const mobileMenu = ref(false)
const mobileReader = ref(false)
const composing = ref(false)
onMounted(() => document.getElementById('loading-first')?.remove())
const mails = [
  { sender: 'NVIDIA', initial: 'N', subject: 'Your order has shipped', summary: 'Good news! Your NVIDIA order has shipped.', time: '10:42', color: '#76b900', unread: true },
  { sender: 'Steam', initial: 'S', subject: 'Thank you for your purchase!', summary: 'Your purchase has been completed.', time: '08:21', color: '#1b4c78', unread: true },
  { sender: 'Discord', initial: 'D', subject: 'New login from a new device', summary: 'We noticed a new login to your account.', time: 'Yesterday', color: '#5865f2' },
  { sender: 'Bilibili', initial: 'B', subject: '您的登录验证码', summary: '您的验证码是：228564，请在 5 分钟内使用。', time: 'Yesterday', color: '#fb7299' },
  { sender: 'GitHub', initial: 'G', subject: '[Security] New sign-in detected', summary: 'A new sign-in to your account was detected.', time: 'Sep 13', color: '#24292f' },
  { sender: 'Cloudflare', initial: 'C', subject: 'Your domain has been updated', summary: 'The DNS records for beihai.me were updated.', time: 'Sep 13', color: '#f38020' },
]
const selected = ref(mails[0])
function selectMail(mail) { selected.value = mail; mobileReader.value = true; mobileMenu.value = false }
</script>

<style scoped>
.preview { min-height: 100vh; padding: 28px; color: #172033; background: radial-gradient(circle at 18% 10%, #e9f3ff, transparent 35%), #d9e4ef; font-family: Inter, "PingFang SC", sans-serif; }
.preview.dark { color: #eef3ff; background: radial-gradient(circle at 18% 10%, #283d61, transparent 35%), #101822; }
.window { min-height: calc(100vh - 56px); max-width: 1500px; margin: auto; display: grid; grid-template-columns: 282px minmax(0, 1fr); overflow: hidden; border: 1px solid rgba(130,145,165,.28); border-radius: 18px; background: #fff; box-shadow: 0 22px 58px rgba(24,49,79,.2); }
.dark .window { background: #111923; border-color: #2a3543; }
.sidebar { padding: 26px 18px 18px; display: flex; flex-direction: column; gap: 18px; background: #f8fbff; border-right: 1px solid #e5eaf2; }.dark .sidebar { background: #101821; border-color: #273241; }
.brand { display: flex; align-items: center; gap: 8px; padding: 0 8px; font-size: 20px; }.brand img { width: 31px; }.brand small { padding: 3px 6px; border-radius: 6px; color: #1678ff; background: #e8f2ff; font-size: 9px; }
button { color: inherit; cursor: pointer; }.compose { min-height: 48px; display: flex; justify-content: center; align-items: center; gap: 10px; border-radius: 12px; color: white; background: #247cff; font-weight: 650; box-shadow: 0 5px 12px #247cff35; }.compose img,.round img { width: 19px; filter: brightness(0) invert(1); }
.nav-list { display: grid; gap: 3px; }.nav-list button { height: 40px; display: flex; align-items: center; gap: 13px; padding: 0 12px; text-align: left; border-radius: 10px; }.nav-list img,.folders img { width: 19px; height: 19px; }.nav-list b { margin-left: auto; padding: 2px 9px; border-radius: 12px; color: white; background: #247cff; }.nav-list span { margin-left: auto; }.nav-list .selected { color: #176def; background: #e7f1ff; }.dark .nav-list .selected { color: #76b6ff; background: #173558; }
.folders { margin-top: 3px; padding-top: 16px; border-top: 1px solid #dfe6ef; color: #536075; }.dark .folders { border-color: #293645; color: #9eafc5; }.folders > div { display: flex; justify-content: space-between; margin: 0 8px 12px; }.folders > div button { font-size: 22px; }.folders span { display: flex; align-items: center; gap: 13px; height: 36px; padding: 0 12px; color: inherit; }.storage { display: flex; gap: 9px; margin-top: auto; padding: 14px 8px 0; border-top: 1px solid #dfe6ef; font-size: 12px; color: #5d6b81; }.storage > img { width: 22px; }.storage div { flex: 1; }.storage span,.storage small { display:block; }.storage i { display:block; height: 7px; margin: 7px 0; overflow:hidden; border-radius:5px; background:#dce5f0; }.storage i b { display:block; width:36%; height:100%; background:#247cff; }
.content-shell { min-width:0; display:grid; grid-template-rows: 76px 1fr; }.toolbar { display:grid; grid-template-columns: minmax(280px, 610px) 1fr; align-items:center; gap:18px; padding:0 28px; border-bottom:1px solid #e6ebf2; }.dark .toolbar { border-color:#283544; }.search { height:46px; display:flex; align-items:center; gap:11px; padding:0 14px; border-radius:13px; background:#f3f6fa; color:#667187; }.dark .search { background:#1b2635; color:#adbad0; }.search img { width:20px; }.search input { flex:1; min-width:0; color:inherit; }.search kbd { padding:3px 7px; border-radius:6px; background:#e7edf5; font-size:12px; }.dark .search kbd { background:#2d3a4d; }.toolbar-actions { display:flex; align-items:center; justify-content:end; gap:16px; }.toolbar-actions button:not(.avatar) { width:32px; height:32px; }.toolbar-actions button img { width:21px; height:21px; }.avatar { width:44px; height:44px; border-radius:50%; color:white; background:#98abd0; font-size:18px; }.account { display:grid; gap:3px; font-size:14px; }.account small { color:#627087; }.mobile-menu { display:none; }
.mail-layout { min-height:0; display:grid; grid-template-columns:minmax(350px,39%) 1fr; }.mail-list { overflow:auto; border-right:1px solid #e5eaf2; }.dark .mail-list { border-color:#283544; }.list-tabs { height:54px; display:flex; gap:25px; align-items:center; padding:0 20px; border-bottom:1px solid #edf0f4; }.dark .list-tabs { border-color:#283544; }.list-tabs button { height:100%; padding:0 4px; color:#667187; }.list-tabs .active { color:#1975f2; border-bottom:2px solid #247cff; font-weight:650; }.list-tabs .filter { margin-left:auto; }.filter img { width:19px; }
.mail-row { position:relative; display:grid; grid-template-columns:20px 42px minmax(0,1fr) auto 20px; align-items:center; gap:10px; min-height:92px; padding:10px 14px; border-bottom:1px solid #edf0f4; cursor:pointer; }.dark .mail-row { border-color:#253140; }.mail-row:hover { background:#f5f9ff; }.dark .mail-row:hover { background:#172433; }.mail-row.active { background:#e8f2ff; }.dark .mail-row.active { background:#16365c; }.mail-row.unread strong,.mail-row.unread p { font-weight:700; }.check { width:17px; height:17px; border:1.5px solid #b7c2d0; border-radius:5px; }.sender-logo { width:42px; height:42px; display:grid; place-items:center; border-radius:50%; color:white; font-weight:800; }.mail-row p { margin:3px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.mail-row small { display:block; overflow:hidden; color:#718099; text-overflow:ellipsis; white-space:nowrap; }.mail-row time { align-self:start; color:#68758b; font-size:12px; }.row-star { width:18px; opacity:.65; }
.reader { position:relative; overflow:auto; padding:18px 30px 34px; }.reader-actions { display:flex; justify-content:space-between; }.reader-actions button,.reader-star { width:35px; height:35px; display:inline-grid; place-items:center; border-radius:8px; }.reader-actions button:hover,.reader-star:hover { background:#eef3f9; }.dark .reader-actions button:hover,.dark .reader-star:hover { background:#243244; }.reader-actions img,.reader-star img { width:20px; }.reader h1 { margin:25px 0 20px; font-size:28px; letter-spacing:-.025em; }.reader-star { position:absolute; top:76px; right:28px; }.sender-info { display:flex; align-items:center; gap:11px; margin-bottom:22px; }.sender-info div { flex:1; }.sender-info small,.sender-info p { color:#68758b; }.sender-info p { margin-top:4px; font-size:13px; }.sender-info time { color:#667187; font-size:12px; }.message-card { overflow:hidden; max-width:700px; border:1px solid #e4eaf2; border-radius:13px; background:#fff; }.dark .message-card { border-color:#2b394a; background:#101821; }.message-banner { height:76px; display:flex; align-items:center; gap:9px; padding:0 26px; color:#e4ecf8; background:#111923; }.message-banner img { width:34px; }.message-banner b { font-size:24px; }.message-banner span { margin-left:auto; font-size:11px; }.message-hero { height:160px; display:flex; align-items:center; padding:0 44px; color:#fff; background:linear-gradient(112deg,#020609,#111d2c 62%,#55657c); }.message-hero strong { font-size:37px; line-height:1.05; }.message-copy { padding:23px 42px; line-height:1.55; }.message-copy p { color:#4a586d; }.dark .message-copy p { color:#bdc9da; }.message-copy > button { margin:8px 0 18px; padding:11px 18px; border-radius:22px; color:white; background:#247cff; font-weight:650; }.message-copy hr { border:0; border-top:1px solid #e2e8f0; }.dark .message-copy hr { border-color:#2b394a; }.message-copy dl { display:grid; grid-template-columns:160px 1fr; gap:6px; color:#516076; font-size:13px; }.dark .message-copy dl { color:#b8c5d8; }.message-copy dd { margin:0; }.mobile-replies,.mobile-bottom { display:none; }.compose-sheet { position:fixed; z-index:4; inset:0; max-width:620px; margin:auto; padding:18px; background:#fff; box-shadow:0 0 0 100vmax #101a2390; }.dark .compose-sheet { background:#101821; }.compose-sheet header { display:flex; align-items:center; justify-content:space-between; padding-bottom:15px; }.compose-sheet header button { color:#247cff; }.compose-sheet .send { padding:7px 15px; border-radius:17px; color:#fff; background:#247cff; }.compose-sheet label { display:flex; gap:12px; padding:13px 0; border-bottom:1px solid #e5eaf2; color:#718099; }.compose-sheet input { flex:1; color:inherit; }.compose-sheet textarea { width:100%; height:calc(100% - 180px); min-height:280px; padding:20px 0; resize:none; color:inherit; line-height:1.6; }.compose-sheet footer { display:flex; gap:22px; border-top:1px solid #e5eaf2; padding-top:14px; }.compose-sheet footer img { width:20px; }
@media(max-width:767px){.preview{padding:0;background:#edf4fc;}.preview.dark{background:#080f18;}.window{min-height:100vh;border:0;border-radius:0;grid-template-columns:1fr;}.sidebar{position:fixed;z-index:3;inset:0 auto 0 0;width:82%;max-width:310px;transform:translateX(-105%);transition:transform .2s;background:#fff;box-shadow:20px 0 50px #0003;}.dark .sidebar{background:#101821;}.sidebar.open{transform:translateX(0);}.content-shell{grid-template-rows:58px 1fr;}.toolbar{grid-template-columns:auto 1fr auto;padding:0 13px;gap:10px;}.mobile-menu{display:block;font-size:20px;}.search{height:36px;padding:0 9px;border-radius:10px;}.search img{width:16px;}.search kbd,.toolbar-actions button:not(:first-child),.account{display:none;}.toolbar-actions{gap:0;}.toolbar-actions .avatar{width:31px;height:31px;font-size:13px;}.mail-layout{display:block;}.mail-list{height:calc(100vh - 124px);border:0;}.list-tabs{height:46px;padding:0 14px;gap:20px;}.mail-row{grid-template-columns:36px minmax(0,1fr) auto 18px;min-height:68px;padding:7px 12px;gap:8px;}.check{display:none;}.sender-logo{width:35px;height:35px;font-size:12px;}.mail-row p{font-size:13px;}.mail-row small{font-size:11px;}.mail-row time{font-size:11px;}.reader{display:none;padding:13px 16px 75px;}.show-reader .mail-list{display:none;}.show-reader .reader{display:block;height:calc(100vh - 58px);}.reader h1{margin:18px 0 17px;font-size:20px;}.reader-star{top:59px;right:14px;}.sender-info{margin-bottom:14px;}.sender-info time{font-size:11px;}.message-banner{height:53px;padding:0 13px;}.message-banner img{width:25px;}.message-banner b{font-size:17px;}.message-banner span{font-size:8px;}.message-hero{height:110px;padding:0 22px;}.message-hero strong{font-size:27px;}.message-copy{padding:14px 20px;font-size:13px;}.message-copy dl{grid-template-columns:1fr 1fr;font-size:11px;}.mobile-replies{position:fixed;z-index:2;left:0;right:0;bottom:0;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:9px 15px;background:#fffffff0;border-top:1px solid #e4eaf2;}.dark .mobile-replies{background:#101821f0;border-color:#2b394a;}.mobile-replies button{height:34px;border:1px solid #dfe6ef;border-radius:10px;font-weight:650;}.dark .mobile-replies button{border-color:#2b394a;}.mobile-replies img{width:16px;margin-right:6px;vertical-align:middle;}.mobile-bottom{position:fixed;z-index:2;display:grid;grid-template-columns:repeat(5,1fr);align-items:end;left:0;right:0;bottom:0;height:66px;padding:5px 8px;background:#fffffff0;border-top:1px solid #e4eaf2;backdrop-filter:blur(16px);}.dark .mobile-bottom{background:#101821ed;border-color:#2b394a;}.mobile-bottom button{display:grid;place-items:center;gap:2px;color:#607089;font-size:9px;}.mobile-bottom img{width:18px;height:18px;}.mobile-bottom .round{width:45px;height:45px;justify-self:center;border-radius:50%;background:#247cff;transform:translateY(-8px);box-shadow:0 5px 13px #247cff55;}.mobile-bottom .round img{width:20px;filter:brightness(0) invert(1);}.show-reader .mobile-bottom{display:none;}.compose-sheet{padding:16px;}.compose-sheet textarea{min-height:400px;}.folders{display:block;}}
.dark .compose-sheet { background: #101821; }

/* Product polish pass: shared spacing, surface and divider tokens. */
.preview {
  --surface: #fbfcfe;
  --surface-muted: #f5f7fa;
  --surface-hover: #f6f9fd;
  --surface-active: #e8f1ff;
  --line: #e4e9f0;
  --line-soft: #edf0f4;
  --muted: #6c788b;
  --accent: #247cff;
}
.preview.dark {
  --surface: #121a25;
  --surface-muted: #192331;
  --surface-hover: #172231;
  --surface-active: #18395f;
  --line: #293646;
  --line-soft: #223041;
  --muted: #a6b2c5;
}
.window { max-width: 1560px; grid-template-columns: 252px minmax(0, 1fr); border-radius: 16px; border-color: var(--line); background: var(--surface); box-shadow: 0 18px 45px rgba(24,49,79,.14); }
.dark .window { border-color: var(--line); }
.sidebar { padding: 20px 14px 14px; gap: 13px; background: var(--surface-muted); border-color: var(--line); }
.brand { padding: 0 7px; font-size: 19px; }.brand img { width: 28px; }
.compose { min-height: 43px; border-radius: 10px; box-shadow: 0 3px 8px #247cff24; }.compose:hover { filter: brightness(.97); }
.nav-list { gap: 1px; }.nav-list button { height: 36px; gap: 11px; padding: 0 10px; border-radius: 8px; font-size: 14px; }.nav-list img,.folders img { width: 18px; height: 18px; }.nav-list .selected { background: var(--surface-active); }.dark .nav-list .selected { background: var(--surface-active); }
.folders { margin-top: 1px; padding-top: 12px; border-color: var(--line); font-size: 13px; color: var(--muted); }.folders > div { margin: 0 7px 7px; }.folders > div button { font-size: 18px; }.folders span { height: 30px; gap: 11px; padding: 0 10px; border-radius: 7px; }.folders span:hover { background: var(--surface-hover); }
.storage { padding: 10px 7px 0; border-color: var(--line); color: var(--muted); font-size: 11px; opacity: .76; }.storage > img { width: 18px; }.storage i { height: 5px; margin: 5px 0; }.storage small { margin-top: 3px; }
.content-shell { grid-template-rows: 64px 1fr; }.toolbar { grid-template-columns: minmax(320px, 570px) 1fr; gap: 20px; padding: 0 22px; border-color: var(--line); }.dark .toolbar { border-color: var(--line); }
.search { height: 38px; padding: 0 7px; gap: 9px; border-radius: 8px; color: var(--muted); background: transparent; border-bottom: 1px solid transparent; }.dark .search { color: var(--muted); background: transparent; }.search:hover,.search:focus-within { background: var(--surface-muted); border-bottom-color: var(--line); }.search img { width: 18px; }.search kbd { padding: 2px 6px; color: var(--muted); background: var(--surface-muted); font-size: 11px; }.dark .search kbd { background: var(--surface-muted); }
.toolbar-actions { gap: 11px; }.toolbar-actions button:not(.avatar) { width: 30px; height: 30px; border-radius: 7px; }.toolbar-actions button:not(.avatar):hover { background: var(--surface-muted); }.toolbar-actions button img { width: 19px; height: 19px; }.avatar { width: 36px; height: 36px; font-size: 15px; }.account { gap: 1px; margin-left: 1px; font-size: 13px; }.account small { color: var(--muted); font-size: 12px; }
.mail-layout { grid-template-columns: minmax(400px, 42%) minmax(0, 1fr); }.mail-list { border-color: var(--line); }.dark .mail-list { border-color: var(--line); }.list-tabs { height: 48px; gap: 22px; padding: 0 17px; border-color: var(--line-soft); }.dark .list-tabs { border-color: var(--line-soft); }.list-tabs button { color: var(--muted); font-size: 13px; }.list-tabs .active { border-width: 2px; }
.mail-row { grid-template-columns: 18px 38px minmax(0,1fr) 52px 18px; min-height: 78px; gap: 9px; padding: 8px 13px; border-color: var(--line-soft); }.dark .mail-row { border-color: var(--line-soft); }.mail-row:hover { background: var(--surface-hover); }.dark .mail-row:hover { background: var(--surface-hover); }.mail-row.active { background: var(--surface-active); box-shadow: inset 3px 0 0 var(--accent); }.dark .mail-row.active { background: var(--surface-active); }.mail-row.unread::before { content: ''; position: absolute; left: 5px; width: 4px; height: 4px; border-radius: 50%; background: var(--accent); }.mail-row.unread strong { color: inherit; font-weight: 720; }.mail-row.unread p { font-weight: 650; }.check { width: 15px; height: 15px; border-radius: 4px; border-color: #bdc7d4; }.sender-logo { width: 38px; height: 38px; font-size: 13px; }.mail-row strong { font-size: 13px; }.mail-row p { margin:2px 0; font-size: 13px; }.mail-row small { color: var(--muted); font-size: 12px; }.mail-row time { padding-top: 2px; color: var(--muted); font-size: 11px; text-align: right; }.row-star { width: 16px; opacity: .52; }.mail-row:hover .row-star { opacity: .82; }
.reader { padding: 14px 22px 26px; }.reader-actions button,.reader-star { width: 32px; height: 32px; border-radius: 7px; }.reader-actions img,.reader-star img { width: 18px; }.reader h1 { max-width: calc(100% - 42px); margin: 20px 0 16px; font-size: 26px; }.reader-star { top: 66px; right: 20px; }.sender-info { max-width: 900px; gap: 10px; margin-bottom: 16px; }.sender-info time,.sender-info small,.sender-info p { color: var(--muted); }.message-card { width: 100%; max-width: 940px; border-radius: 10px; border-color: var(--line); background: transparent; }.dark .message-card { border-color: var(--line); background: transparent; }.message-banner { height: 62px; padding: 0 20px; }.message-banner img { width: 29px; }.message-banner b { font-size: 21px; }.message-hero { height: 138px; padding: 0 34px; }.message-hero strong { font-size: 32px; }.message-copy { padding: 20px 34px 24px; }.message-copy p { max-width: 720px; color: var(--muted); }.dark .message-copy p { color: var(--muted); }.message-copy > button { margin: 6px 0 16px; padding: 9px 15px; border-radius: 9px; }.message-copy dl { grid-template-columns: 140px 1fr; color: var(--muted); }.dark .message-copy dl { color: var(--muted); }

@media (max-width: 1120px) and (min-width: 768px) {
  .window { grid-template-columns: 228px minmax(0,1fr); }.mail-layout { grid-template-columns: minmax(350px, 44%) minmax(0,1fr); }.account { display: none; }.toolbar { grid-template-columns: minmax(250px, 1fr) auto; }
}

@media (max-width: 767px) {
  .window { min-height: 100vh; grid-template-columns: 1fr; border-radius: 0; }.sidebar { padding: 20px 14px 14px; }.content-shell { grid-template-rows: 58px 1fr; }.toolbar { grid-template-columns: auto 1fr auto; padding: 0 13px; }.search { height: 36px; }.mail-layout { display: block; }.mail-list { height: calc(100vh - 124px); }.mail-row { grid-template-columns: 36px minmax(0,1fr) auto 18px; min-height: 68px; padding: 7px 12px; }.mail-row.unread::before { left: 4px; }.sender-logo { width: 35px; height: 35px; }.show-reader .reader { height: calc(100vh - 58px); }.reader { padding: 13px 16px 75px; }.reader h1 { font-size: 20px; }.reader-star { top: 59px; right: 14px; }.message-card { max-width: none; }.message-banner { height: 53px; padding: 0 13px; }.message-hero { height: 110px; padding: 0 22px; }.message-copy { padding: 14px 20px; }.message-copy dl { grid-template-columns: 1fr 1fr; }
}

.dark .nav-list img,
.dark .folders img,
.dark .toolbar-actions button:not(.avatar) img,
.dark .search img,
.dark .filter img,
.dark .row-star,
.dark .reader-actions img,
.dark .reader-star img,
.dark .mobile-bottom button:not(.round) img,
.dark .mobile-replies img,
.dark .compose-sheet footer img { filter: brightness(0) invert(1); opacity: .86; }
</style>
