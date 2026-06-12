const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const admin = require('firebase-admin');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// تشغيل وتوجيه الفايلات الثابتة مع إجبار المتصفح يقراهم صحاح
app.use(express.static(path.join(__dirname), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));

// الإتصال بـ Firebase بسحابة آمنة
if (!admin.apps.length) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    
    if (privateKey && !privateKey.includes('\n')) {
        privateKey = privateKey
            .replace(/-----BEGIN PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----\n')
            .replace(/-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----')
            .replace(/\s+/g, (match, offset, string) => {
                if (offset > 25 && offset < string.length - 25) {
                    return '\n';
                }
                return match;
            });
    } else if (privateKey) {
        privateKey = privateKey.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
        })
    });
}
const db = admin.firestore();

// صفحة البداية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// جلب التمارين من Firebase Firestore
app.get('/taches', async (req, res) => {
    try {
        const snapshot = await db.collection('taches').get();
        const taches = [];
        snapshot.forEach(doc => {
            taches.push({ id: doc.id, ...doc.data() });
        });
        res.json(taches);
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de la récupération" });
    }
});

// إضافة مهمة جديدة لـ Firebase Firestore
app.post('/taches', async (req, res) => {
    const { titre, date_tache, email_utilisateur } = req.body;
    if (!titre || !date_tache || !email_utilisateur) {
        return res.status(400).json({ error: "Données incomplètes" });
    }
    const nouvelleTache = {
        titre: titre,
        date_tache: date_tache,
        email_utilisateur: email_utilisateur,
        email_envoye: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    try {
        const docRef = await db.collection('taches').add(nouvelleTache);
        res.json({ id: docRef.id, ...nouvelleTache });
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de l'ajout" });
    }
});

// إعدادات إرسال الإيميل
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS 
    }
});

// هاد الـ Route غيعيط عليها Vercel يصيفط الإيميلات
app.get('/api/cron-check', async (req, res) => {
    const aujourdhui = new Date().toISOString().split('T')[0];
    try {
        const snapshot = await db.collection('taches')
            .where('date_tache', '<=', aujourdhui)
            .where('email_envoye', '==', 0)
            .get();

        if (snapshot.empty) {
            return res.json({ message: "Aucun email à envoyer." });
        }

        let emailsSent = 0;
        for (const doc of snapshot.docs) {
            const tache = doc.data();
            if (tache.email_utilisateur) {
                const mailOptions = {
                    from: process.env.GMAIL_USER,
                    to: tache.email_utilisateur, 
                    subject: `🔔 Rappel Task Flow : ${tache.titre}`,
                    text: `Bonjour !\n\nC'est le moment de faire votre tâche : "${tache.titre}".\n\nBonne journée !`
                };
                await transporter.sendMail(mailOptions);
                await db.collection('taches').doc(doc.id).update({ email_envoye: 1 });
                emailsSent++;
            }
        }
        res.json({ success: true, message: `${emailsSent} email(s) envoyé(s).` });
    } catch (error) {
        res.status(500).json({ error: "Erreur lors du cron" });
    }
});

// تصدير التطبيق لبيئة Vercel Serverless
module.exports = app;

app.listen(PORT, () => {
    console.log(`🚀 Serveur actif : ${PORT}`);
});