const fs = require('fs');
let fbConf = fs.readFileSync('landing-page/firebase-config.js', 'utf8');

const target1 =     async getApprovedTools() {
        const snap = await db.collection('tools').where('approval', '==', 'approved').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    },;

const replacement1 =     async getApprovedTools() {
        // Here we can check if the current user is admin to return all tools.
        let isAdmin = false;
        if(auth.currentUser) {
            const profile = await this.getUserProfile(auth.currentUser.uid);
            isAdmin = profile?.role === 'admin';
        }
        let snap;
        if (isAdmin) {
            snap = await db.collection('tools').get();
        } else {
            snap = await db.collection('tools').where('approval', '==', 'approved').get();
        }
        return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    },;

fbConf = fbConf.replace(target1, replacement1);
fbConf = fbConf.replace(target1.replace(/\r\n/g, '\n'), replacement1);


const target2 =     async getApprovedPainCards() {
        const snap = await db.collection('painCards').where('approval', '==', 'approved').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },;

const replacement2 =     async getApprovedPainCards() {
        let isAdmin = false;
        if(auth.currentUser) {
            const profile = await this.getUserProfile(auth.currentUser.uid);
            isAdmin = profile?.role === 'admin';
        }
        let snap;
        if (isAdmin) {
            snap = await db.collection('painCards').get();
        } else {
            snap = await db.collection('painCards').where('approval', '==', 'approved').get();
        }
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },;

fbConf = fbConf.replace(target2, replacement2);
fbConf = fbConf.replace(target2.replace(/\r\n/g, '\n'), replacement2);

const reviewFunctions = 
    // ¢w¢w Reviews & Ratings ¢w¢w
    async addReview(toolId, reviewData) {
        // reviewData: { uid, name, rating, comment, createdAt }
        const ref = await db.collection('tools').doc(toolId).collection('reviews').add({
            ...reviewData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Recalculate average rating
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
    },;

const target3 =     async deletePainCard(cardId) {
        await db.collection('painCards').doc(cardId).delete();
    },;

fbConf = fbConf.replace(target3, target3 + "\n" + reviewFunctions);
fbConf = fbConf.replace(target3.replace(/\r\n/g, '\n'), target3 + "\n" + reviewFunctions);

fs.writeFileSync('landing-page/firebase-config.js', fbConf, 'utf8');
console.log("Updated firebase-config.js");
