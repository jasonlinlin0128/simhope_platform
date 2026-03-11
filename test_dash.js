const fs = require('fs');

let dashHtml = fs.readFileSync('landing-page/dashboard.html', 'utf8');

// ==== MODAL FOR EDIT TOOL ====
const cssModal = 
        /* Overlay for Edit Modals */
        .edit-modal-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            z-index: 999;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .edit-modal-overlay.open {
            display: flex;
        }
        .edit-modal {
            background: var(--white);
            border-radius: var(--radius);
            width: 100%;
            max-width: 600px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 24px 64px rgba(0,0,0,0.2);
            animation: modalIn 0.2s ease-out;
        }
        .edit-modal-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .edit-modal-header h3 {
            font-size: 1.2rem;
            font-weight: 800;
            color: var(--text-dark);
        }
        .edit-modal-close {
            background: var(--bg-alt);
            border: none;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1.2rem;
        }
        .edit-modal-body {
            padding: 20px 24px;
            overflow-y: auto;
            flex: 1;
        }
        .edit-modal-footer {
            padding: 16px 24px;
            border-top: 1px solid var(--border);
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            background: var(--bg-main);
        }
        
        /* Versions Row */
        .versions-wrap {
            border: 2px solid var(--border);
            border-radius: var(--radius);
            padding: 12px;
            margin-top: 6px;
        }
        .version-row {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
            align-items: stretch;
        }
        .version-row input {
            flex: 1;
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid var(--border);
            font-size: 0.85rem;
        }
        .version-row button.del-btn {
            background: rgba(239, 68, 68, 0.1);
            color: #DC2626;
            border: none;
            border-radius: 8px;
            padding: 0 12px;
            cursor: pointer;
        }
        .add-version-btn {
            background: var(--bg-alt);
            padding: 6px 14px;
            border-radius: 8px;
            font-size: 0.8rem;
            font-weight: 700;
            border: none;
            cursor: pointer;
        }
;

dashHtml = dashHtml.replace('</style>', cssModal + '\n    </style>');

const modalHtml = 
    <!-- Edit Tool Modal -->
    <div class="edit-modal-overlay" id="editToolModal">
        <form class="edit-modal" id="editToolForm" onsubmit="handleUpdateTool(event)">
            <div class="edit-modal-header">
                <h3>✏️ 編輯工具</h3>
                <button type="button" class="edit-modal-close" onclick="closeEditModal('tool')">×</button>
            </div>
            <div class="edit-modal-body">
                <div class="fg-row">
                    <div class="fg">
                        <label>工具名稱</label>
                        <input type="text" id="et-title" required>
                    </div>
                    <div class="fg">
                        <label>圖示 (Emoji)</label>
                        <input type="text" id="et-icon" required>
                    </div>
                </div>
                <div class="fg">
                    <label>一句話賣點</label>
                    <input type="text" id="et-tagline" required>
                </div>
                <div class="fg">
                    <label>詳細說明</label>
                    <textarea id="et-desc" rows="3" required></textarea>
                </div>
                <div class="fg-row">
                    <div class="fg">
                        <label>所屬部門</label>
                        <select id="et-dept" required>
                            <script>document.write(Object.entries(DB.DEPTS).map(([k, v]) => \<option value="\">\ \</option>\).join(''))</script>
                        </select>
                    </div>
                    <div class="fg">
                        <label>工具類型</label>
                        <select id="et-type" required>
                            <option value="webapp">網頁應用 (WebApp)</option>
                            <option value="desktop">電腦軟體 (Desktop)</option>
                            <option value="prompt">提示詞 (Prompt)</option>
                            <option value="api">API 服務</option>
                            <option value="gpts">GPTs</option>
                        </select>
                    </div>
                </div>
                <div class="fg" id="et-status-container" style="display:none">
                    <label>上架狀態 (管理員專用)</label>
                    <select id="et-status">
                        <option value="live">✅ 正常上架</option>
                        <option value="dev">🚧 開發中</option>
                        <option value="terminated">🔕 已下架</option>
                    </select>
                </div>
                <div class="fg">
                    <label>主要連結 (URL)</label>
                    <input type="url" id="et-url">
                </div>
                <div class="fg">
                    <label>標籤 (用逗號分隔)</label>
                    <input type="text" id="et-tags">
                </div>
                <div class="fg">
                    <label>步驟 (用逗號分隔)</label>
                    <input type="text" id="et-steps">
                </div>
                <div class="fg">
                    <label>歷史版本 (下載連結)</label>
                    <div class="versions-wrap" id="et-versions-wrap"></div>
                    <button type="button" class="add-version-btn" onclick="addVersionRow()">+ 新增版本</button>
                    <div class="hint">若為下載軟體，請填寫版本號、更新說明與下載連結。</div>
                </div>
            </div>
            <div class="edit-modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeEditModal('tool')">取消</button>
                <button type="submit" class="btn btn-primary" id="etSubmit">儲存變更</button>
            </div>
        </form>
    </div>

    <!-- Edit Pain Modal -->
    <div class="edit-modal-overlay" id="editPainModal">
        <form class="edit-modal" id="editPainForm" onsubmit="handleUpdatePain(event)">
            <div class="edit-modal-header">
                <h3>✏️ 編輯痛點卡片</h3>
                <button type="button" class="edit-modal-close" onclick="closeEditModal('pain')">×</button>
            </div>
            <div class="edit-modal-body">
                <div class="fg">
                    <label>相關部門</label>
                    <select id="ep-dept" required>
                        <script>document.write(Object.entries(DB.DEPTS).map(([k, v]) => \<option value="\">\ \</option>\).join(''))</script>
                    </select>
                </div>
                <div class="fg">
                    <label>痛點 (Before)</label>
                    <textarea id="ep-before" rows="3" required></textarea>
                </div>
                <div class="fg">
                    <label>解決方案 (After)</label>
                    <textarea id="ep-after" rows="3" required></textarea>
                </div>
            </div>
            <div class="edit-modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeEditModal('pain')">取消</button>
                <button type="submit" class="btn btn-primary" id="epSubmit">儲存變更</button>
            </div>
        </form>
    </div>
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>;

dashHtml = dashHtml.replace('<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>', modalHtml);


const JS_EDIT_FUNCTIONS = 
        // ── Modals logic ──
        function closeEditModal(type) {
            document.getElementById('edit' + (type==='tool'?'Tool':'Pain') + 'Modal').classList.remove('open');
            editingToolId = null;
            editingPainId = null;
        }

        function addVersionRow(version='', releaseNotes='', fileUrl='') {
            const wrap = document.getElementById('et-versions-wrap');
            const row = document.createElement('div');
            row.className = 'version-row';
            row.innerHTML = \
                <input type="text" placeholder="版本號 (如 v1.0)" value="\" class="v-ver" required style="max-width:100px">
                <input type="text" placeholder="更新說明" value="\" class="v-note">
                <input type="url" placeholder="下載連結URL" value="\" class="v-url" required>
                <button type="button" class="del-btn" onclick="this.parentElement.remove()">×</button>
            \;
            wrap.appendChild(row);
        }

        function getVersionsData() {
            const rows = document.querySelectorAll('#et-versions-wrap .version-row');
            const versions = [];
            rows.forEach(r => {
                versions.push({
                    version: r.querySelector('.v-ver').value.trim(),
                    releaseNotes: r.querySelector('.v-note').value.trim(),
                    fileUrl: r.querySelector('.v-url').value.trim(),
                });
            });
            return versions;
        }

        // ── Edit Handlers ──
        function editTool(id) {
            let t = myTools.find(x => x.id === id) || allToolsAdmin.find(x => x.id === id);
            if (!t) return;
            editingToolId = id;
            document.getElementById('et-title').value = t.title || '';
            document.getElementById('et-icon').value = t.icon || '';
            document.getElementById('et-tagline').value = t.tagline || '';
            document.getElementById('et-desc').value = t.desc || '';
            document.getElementById('et-dept').value = t.dept || Object.keys(DB.DEPTS)[0];
            document.getElementById('et-type').value = t.type || 'webapp';
            if (currentProfile?.role === 'admin') {
                document.getElementById('et-status-container').style.display = 'block';
                document.getElementById('et-status').value = t.status || 'live';
            }
            document.getElementById('et-url').value = t.url || '';
            document.getElementById('et-tags').value = (t.tags || []).join(', ');
            document.getElementById('et-steps').value = (t.steps || []).join(', ');
            
            const vWrap = document.getElementById('et-versions-wrap');
            vWrap.innerHTML = '';
            if (t.versions && t.versions.length) {
                t.versions.forEach(v => addVersionRow(v.version, v.releaseNotes, v.fileUrl));
            }

            document.getElementById('editToolModal').classList.add('open');
        }

        function editPain(id) {
            let c = myPainCards.find(x => x.id === id) || allPainCardsAdmin.find(x => x.id === id);
            if (!c) return;
            editingPainId = id;
            document.getElementById('ep-dept').value = c.dept || Object.keys(DB.DEPTS)[0];
            document.getElementById('ep-before').value = c.before || '';
            document.getElementById('ep-after').value = c.after || '';
            document.getElementById('editPainModal').classList.add('open');
        }

        async function handleUpdateTool(e) {
            e.preventDefault();
            if (!editingToolId) return;
            const btn = document.getElementById('etSubmit');
            btn.disabled = true;
            const isAdmin = currentProfile.role === 'admin';
            const data = {
                title: document.getElementById('et-title').value.trim(),
                icon: document.getElementById('et-icon').value.trim() || '🛠️',
                tagline: document.getElementById('et-tagline').value.trim(),
                desc: document.getElementById('et-desc').value.trim(),
                dept: document.getElementById('et-dept').value,
                type: document.getElementById('et-type').value,
                url: document.getElementById('et-url').value.trim() || '#',
                tags: document.getElementById('et-tags').value.split(',').map(s => s.trim()).filter(Boolean),
                steps: document.getElementById('et-steps').value.split(',').map(s => s.trim()).filter(Boolean),
                versions: getVersionsData()
            };
            if (isAdmin) data.status = document.getElementById('et-status')?.value || 'live';

            try {
                await FireDB.updateTool(editingToolId, data);
                showToast('✅ 工具已更新');
                closeEditModal('tool');
                await initDashboard();
            } catch (err) {
                showToast('❌ 更新失敗：' + err.message);
            } finally {
                btn.disabled = false;
            }
        }

        async function handleUpdatePain(e) {
            e.preventDefault();
            if (!editingPainId) return;
            const btn = document.getElementById('epSubmit');
            btn.disabled = true;
            const isAdmin = currentProfile.role === 'admin';
            const data = {
                dept: document.getElementById('ep-dept').value,
                before: document.getElementById('ep-before').value.trim(),
                after: document.getElementById('ep-after').value.trim()
            };
            try {
                await FireDB.updatePainCard(editingPainId, data);
                showToast('✅ 痛點卡片已更新');
                closeEditModal('pain');
                await initDashboard();
            } catch (err) {
                showToast('❌ 更新失敗：' + err.message);
            } finally {
                btn.disabled = false;
            }
        }
;

const replaceTarget = 
        // ── Edit Handlers ──
        function editTool(id) {
            let t = myTools.find(x => x.id === id) || allToolsAdmin.find(x => x.id === id);
            if (!t) return;
            editingToolId = id;
            document.getElementById('et-title').value = t.title || '';
            document.getElementById('et-icon').value = t.icon || '';
            document.getElementById('et-tagline').value = t.tagline || '';
            document.getElementById('et-desc').value = t.desc || '';
            document.getElementById('et-dept').value = t.dept || Object.keys(DB.DEPTS)[0];
            document.getElementById('et-type').value = t.type || 'webapp';
            if (document.getElementById('et-status')) document.getElementById('et-status').value = t.status || 'live';
            document.getElementById('et-url').value = t.url || '';
            document.getElementById('et-tags').value = (t.tags || []).join(', ');
            document.getElementById('et-steps').value = (t.steps || []).join(', ');
            switchTab('edit-tool');
        }

        function editPain(id) {
            let c = myPainCards.find(x => x.id === id) || allPainCardsAdmin.find(x => x.id === id);
            if (!c) return;
            editingPainId = id;
            document.getElementById('ep-dept').value = c.dept || Object.keys(DB.DEPTS)[0];
            document.getElementById('ep-before').value = c.before || '';
            document.getElementById('ep-after').value = c.after || '';
            switchTab('edit-pain');
        }

        async function handleUpdateTool(e) {
            e.preventDefault();
            if (!editingToolId) return;
            const btn = document.getElementById('etSubmit');
            btn.disabled = true;
            const isAdmin = currentProfile.role === 'admin';
            const data = {
                title: document.getElementById('et-title').value.trim(),
                icon: document.getElementById('et-icon').value.trim() || '🛠️',
                tagline: document.getElementById('et-tagline').value.trim(),
                desc: document.getElementById('et-desc').value.trim(),
                dept: document.getElementById('et-dept').value,
                type: document.getElementById('et-type').value,
                url: document.getElementById('et-url').value.trim() || '#',
                tags: document.getElementById('et-tags').value.split(',').map(s => s.trim()).filter(Boolean),
                steps: document.getElementById('et-steps').value.split(',').map(s => s.trim()).filter(Boolean),
            };
            if (isAdmin) data.status = document.getElementById('et-status')?.value || 'live';

            try {
                await FireDB.updateTool(editingToolId, data);
                showToast('✅ 工具已更新');
                editingToolId = null;
                await initDashboard();
                switchTab(isAdmin ? 'manage-all' : 'my-tools');
            } catch (err) {
                showToast('❌ 更新失敗：' + err.message);
            } finally {
                btn.disabled = false;
            }
        }

        async function handleUpdatePain(e) {
            e.preventDefault();
            if (!editingPainId) return;
            const btn = document.getElementById('epSubmit');
            btn.disabled = true;
            const isAdmin = currentProfile.role === 'admin';
            const data = {
                dept: document.getElementById('ep-dept').value,
                before: document.getElementById('ep-before').value.trim(),
                after: document.getElementById('ep-after').value.trim()
            };
            try {
                await FireDB.updatePainCard(editingPainId, data);
                showToast('✅ 痛點卡片已更新');
                editingPainId = null;
                await initDashboard();
                switchTab(isAdmin ? 'manage-all' : 'my-pain');
            } catch (err) {
                showToast('❌ 更新失敗：' + err.message);
            } finally {
                btn.disabled = false;
            }
        };

dashHtml = dashHtml.replace(replaceTarget, JS_EDIT_FUNCTIONS);
dashHtml = dashHtml.replace(replaceTarget.replace(/\r\n/g, '\n'), JS_EDIT_FUNCTIONS);

fs.writeFileSync('landing-page/dashboard.html', dashHtml, 'utf8');
