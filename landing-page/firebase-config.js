/**
 * SimHope Firebase 設定
 * CDN script tags 在各 HTML 頁面載入，這裡只做初始化。
 */

const firebaseConfig = {
    apiKey: "AIzaSyDFknAmnkhg1BMq3lczOndvVLuiWCrnZjU",
    authDomain: "simhope-platform.firebaseapp.com",
    projectId: "simhope-platform",
    storageBucket: "simhope-platform.firebasestorage.app",
    messagingSenderId: "612744138082",
    appId: "1:612744138082:web:f2c3315e39b4e4c2cc303b",
    measurementId: "G-J9B1DTP883"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ── Auth helpers ──
const Auth = {
    /** 註冊開發者帳號 */
    async register(email, password, displayName) {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName });
        // 建立 Firestore user doc
        await db.collection('users').doc(cred.user.uid).set({
            email,
            displayName,
            role: 'developer',
            avatarUrl: '',
            bio: '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return cred.user;
    },

    /** 登入 */
    async login(email, password) {
        const cred = await auth.signInWithEmailAndPassword(email, password);
        return cred.user;
    },

    /** 登出 */
    async logout() {
        await auth.signOut();
    },

    /** 取得目前登入的使用者（Promise） */
    getCurrentUser() {
        return new Promise(resolve => {
            const unsub = auth.onAuthStateChanged(user => {
                unsub();
                resolve(user);
            });
        });
    },

    /** 取得使用者的 Firestore profile + role */
    async getUserProfile(uid) {
        const doc = await db.collection('users').doc(uid).get();
        return doc.exists ? { uid, ...doc.data() } : null;
    },

    /** 監聽 auth 狀態 */
    onAuthChange(callback) {
        return auth.onAuthStateChanged(callback);
    }
};

// ── Firestore CRUD for tools / painCards ──
const FireDB = {
    // ── Tools ──
    async getApprovedTools() {
        let isAdmin = false;
        try {
            if (auth.currentUser) {
                const profile = await Auth.getUserProfile(auth.currentUser.uid);
                isAdmin = profile && profile.role === 'admin';
            }
        } catch (e) { }

        let snap;
        if (isAdmin) {
            snap = await db.collection('tools').get();
        } else {
            snap = await db.collection('tools').where('approval', '==', 'approved').get();
        }
        return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    },

    async getToolsByAuthor(uid) {
        const snap = await db.collection('tools').where('authorUid', '==', uid).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
            const ta = a.submittedAt?.toMillis?.() || 0;
            const tb = b.submittedAt?.toMillis?.() || 0;
            return tb - ta;
        });
    },

    async getPendingTools() {
        const snap = await db.collection('tools').where('approval', '==', 'pending').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
            const ta = a.submittedAt?.toMillis?.() || 0;
            const tb = b.submittedAt?.toMillis?.() || 0;
            return tb - ta;
        });
    },

    async getAllTools() {
        const snap = await db.collection('tools').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    },

    async submitTool(toolData, authorUid) {
        const ref = await db.collection('tools').add({
            ...toolData,
            authorUid,
            approval: 'pending',
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
            order: Date.now()
        });
        return ref.id;
    },

    async submitToolDirect(toolData, authorUid) {
        // Admin direct publish — approval = approved
        const ref = await db.collection('tools').add({
            ...toolData,
            authorUid,
            approval: 'approved',
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: authorUid,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            order: Date.now()
        });
        return ref.id;
    },

    async approveTool(toolId, adminUid) {
        await db.collection('tools').doc(toolId).update({
            approval: 'approved',
            approvedBy: adminUid,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    async rejectTool(toolId, adminUid, reason) {
        await db.collection('tools').doc(toolId).update({
            approval: 'rejected',
            approvedBy: adminUid,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectReason: reason || ''
        });
    },

    async updateTool(toolId, data) {
        await db.collection('tools').doc(toolId).update(data);
    },

    async deleteTool(toolId) {
        await db.collection('tools').doc(toolId).delete();
    },

    // ── Pain Cards ──
    async getApprovedPainCards() {
        let isAdmin = false;
        try {
            if (auth.currentUser) {
                const profile = await Auth.getUserProfile(auth.currentUser.uid);
                isAdmin = profile && profile.role === 'admin';
            }
        } catch (e) { }

        let snap;
        if (isAdmin) {
            snap = await db.collection('painCards').get();
        } else {
            snap = await db.collection('painCards').where('approval', '==', 'approved').get();
        }
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async getPainCardsByAuthor(uid) {
        const snap = await db.collection('painCards').where('authorUid', '==', uid).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async getPendingPainCards() {
        const snap = await db.collection('painCards').where('approval', '==', 'pending').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async submitPainCard(cardData, authorUid) {
        const ref = await db.collection('painCards').add({
            ...cardData,
            authorUid,
            approval: 'pending',
            submittedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return ref.id;
    },

    async submitPainCardDirect(cardData, authorUid) {
        const ref = await db.collection('painCards').add({
            ...cardData,
            authorUid,
            approval: 'approved',
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: authorUid,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return ref.id;
    },

    async approvePainCard(cardId, adminUid) {
        await db.collection('painCards').doc(cardId).update({
            approval: 'approved',
            approvedBy: adminUid,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    async rejectPainCard(cardId, adminUid, reason) {
        await db.collection('painCards').doc(cardId).update({
            approval: 'rejected',
            approvedBy: adminUid,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectReason: reason || ''
        });
    },

    async deletePainCard(cardId) {
        await db.collection('painCards').doc(cardId).delete();
    },

    // ── Reviews & Ratings ──
    async addReview(toolId, reviewData) {
        // reviewData: { uid, name, rating, comment, createdAt }
        const ref = await db.collection('tools').doc(toolId).collection('reviews').add({
            ...reviewData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await this.updateToolAverageRating(toolId);
        return ref.id;
    },

    async getReviews(toolId) {
        const snap = await db.collection('tools').doc(toolId).collection('reviews').orderBy('createdAt', 'desc').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async updateToolAverageRating(toolId) {
        const snap = await db.collection('tools').doc(toolId).collection('reviews').get();
        if (snap.empty) {
            await db.collection('tools').doc(toolId).update({ ratingAvg: 0, ratingCount: 0 });
            return;
        }

        let sum = 0;
        snap.docs.forEach(d => {
            sum += d.data().rating || 0;
        });
        const ratingAvg = +(sum / snap.size).toFixed(1);
        await db.collection('tools').doc(toolId).update({ ratingAvg, ratingCount: snap.size });
    },

    // ── Users ──
    async getAllUsers() {
        const snap = await db.collection('users').get();
        return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    },

    async updateUserProfile(uid, data) {
        await db.collection('users').doc(uid).update(data);
    },

    async setUserRole(uid, role) {
        await db.collection('users').doc(uid).update({ role });
    },

    // ── Migration helper ──
    async migrateDefaultData(defaultTools, defaultPainCards, adminUid) {
        const batch = db.batch();
        // 移除「如果已有資料就跳出」的檢查，允許強制覆蓋預設資料

        defaultTools.forEach((t, i) => {
            const ref = db.collection('tools').doc(t.id);
            batch.set(ref, {
                ...t,
                authorUid: adminUid,
                approval: 'approved',
                submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                approvedBy: adminUid,
                approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                order: i
            });
        });

        defaultPainCards.forEach(c => {
            const ref = db.collection('painCards').doc(c.id);
            batch.set(ref, {
                ...c,
                authorUid: adminUid,
                approval: 'approved',
                submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                approvedBy: adminUid,
                approvedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        return true;
    }
};
