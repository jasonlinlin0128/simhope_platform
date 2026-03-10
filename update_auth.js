const fs = require('fs');

// ==== index.html ====
let indexHtml = fs.readFileSync('landing-page/index.html', 'utf8');

const target1 = `        <a href="auth.html" class="login-btn" id="loginBtn" style="text-decoration:none">🔐 登入</a>
        <button class="logout-btn" id="logoutBtn" onclick="doLogout()">👋 登出</button>`;
const replacement1 = `        <a href="auth.html" class="login-btn" id="loginBtn" style="text-decoration:none">🔐 登入</a>
        <a href="dashboard.html" class="login-btn" id="dashBtn" style="text-decoration:none; display:none;">📊 儀表板</a>
        <button class="logout-btn" id="logoutBtn" onclick="doLogout()" style="display:none;">👋 登出</button>`;

indexHtml = indexHtml.replace(target1, replacement1);
indexHtml = indexHtml.replace(target1.replace(/\r\n/g, '\n'), replacement1);
indexHtml = indexHtml.replace(target1.replace(/\n/g, '\r\n'), replacement1);

const target2 = `    function initChatBot() {
      if (typeof firebase === 'undefined') return;
      loadChatModels();
      initChatResize();
      firebase.auth().onAuthStateChanged(async user => {
        chatUser = user;
        // 判斷是否為管理員展示歷史按鈕
        if (user) {
          try {
            const db = firebase.firestore();
            const profile = await db.collection('users').doc(user.uid).get();
            const role = profile.data()?.role;
            const isAdmin = role === 'admin' || role === 'developer';
            const toggleBtn = document.getElementById('chatSidebarToggle');
            if (toggleBtn) toggleBtn.style.display = isAdmin ? 'inline-flex' : 'none';
          } catch (_) { }
        }
        if (chatOpen) renderChatContent();
      });
    }`;
const replacement2 = `    function initChatBot() {
      if (typeof firebase === 'undefined') return;
      loadChatModels();
      initChatResize();

      const btnLogin = document.getElementById('loginBtn');
      const btnDash = document.getElementById('dashBtn');
      const btnLogout = document.getElementById('logoutBtn');

      firebase.auth().onAuthStateChanged(async user => {
        chatUser = user;

        if (user) {
          if (btnLogin) btnLogin.style.display = 'none';
          if (btnDash) btnDash.style.display = 'inline-block';
          if (btnLogout) btnLogout.style.display = 'inline-block';
        } else {
          if (btnLogin) btnLogin.style.display = 'inline-block';
          if (btnDash) btnDash.style.display = 'none';
          if (btnLogout) btnLogout.style.display = 'none';
        }

        // 判斷是否為管理員展示歷史按鈕
        if (user) {
          try {
            const db = firebase.firestore();
            const profile = await db.collection('users').doc(user.uid).get();
            const role = profile.data()?.role;
            const isAdmin = role === 'admin' || role === 'developer';
            const toggleBtn = document.getElementById('chatSidebarToggle');
            if (toggleBtn) toggleBtn.style.display = isAdmin ? 'inline-flex' : 'none';
          } catch (_) { }
        }
        if (chatOpen) renderChatContent();
      });
    }

    async function doLogout() {
      if (typeof Auth !== 'undefined') {
        await Auth.logout();
        location.reload();
      }
    }`;

indexHtml = indexHtml.replace(target2, replacement2);
indexHtml = indexHtml.replace(target2.replace(/\r\n/g, '\n'), replacement2);
indexHtml = indexHtml.replace(target2.replace(/\n/g, '\r\n'), replacement2);

fs.writeFileSync('landing-page/index.html', indexHtml, 'utf8');

// ==== auth.html ====
let authHtml = fs.readFileSync('landing-page/auth.html', 'utf8');
authHtml = authHtml.replace(/'dashboard\.html'/g, "'index.html'");
authHtml = authHtml.replace(/href="dashboard\.html"/g, 'href="index.html"');
authHtml = authHtml.replace(/Dashboard/g, "儀表板");
fs.writeFileSync('landing-page/auth.html', authHtml, 'utf8');

// ==== dashboard.html ====
let dashHtml = fs.readFileSync('landing-page/dashboard.html', 'utf8');
dashHtml = dashHtml.replace(/<title>Dashboard — SimHope AI 工具中心<\/title>/, '<title>儀表板 — SimHope AI 工具中心</title>');
// Just replace any visible instances of "Dashboard" text
dashHtml = dashHtml.replace(/>Dashboard</g, ">儀表板<");
dashHtml = dashHtml.replace(/回 Dashboard/g, "回儀表板");
dashHtml = dashHtml.replace(/前往 Dashboard/g, "前往儀表板");
dashHtml = dashHtml.replace(/歡迎回到 Dashboard/g, "歡迎回到儀表板");

fs.writeFileSync('landing-page/dashboard.html', dashHtml, 'utf8');

console.log("Done.");
