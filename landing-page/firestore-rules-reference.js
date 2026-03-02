/**
 * Firestore Security Rules for SimHope Platform
 * 請把以下規則貼到 Firebase Console → Firestore → Rules
 *
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *
 *     // Users: 自己可讀寫，admin 可讀全部
 *     match /users/{userId} {
 *       allow read: if request.auth != null;
 *       allow create: if request.auth != null && request.auth.uid == userId;
 *       allow update: if request.auth != null && (
 *         request.auth.uid == userId ||
 *         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
 *       );
 *     }
 *
 *     // Tools: 公開可讀 approved，開發者可建立，admin 可全部操作
 *     match /tools/{toolId} {
 *       allow read: if true;
 *       allow create: if request.auth != null;
 *       allow update, delete: if request.auth != null && (
 *         resource.data.authorUid == request.auth.uid ||
 *         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
 *       );
 *     }
 *
 *     // Pain Cards: 同 tools
 *     match /painCards/{cardId} {
 *       allow read: if true;
 *       allow create: if request.auth != null;
 *       allow update, delete: if request.auth != null && (
 *         resource.data.authorUid == request.auth.uid ||
 *         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
 *       );
 *     }
 *   }
 * }
 */
