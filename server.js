const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// تشغيل الملفات الثابتة من المجلد الرئيسي
app.use(express.static(path.join(__dirname)));

// الذاكرة المؤقتة بديلة لـ SQLite لتفادي خطأ Vercel
let tachesInMemory = [];

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// جلب التمارين أو المهام
app.get('/taches', (req, res) => {
    res.json(tachesInMemory);
});

// إضافة مهمة جديدة
app.post('/taches', (req, res) => {
    const { titre, date_tache, email_utilisateur } = req.body;
    
    if (!titre || !date_tache || !email_utilisateur) {
        return res.status(400).json({ error: "Données incomplètes" });
    }

    const nouvelleTache = {
        id: tachesInMemory.length + 1,
        titre: titre,
        date_tache: date_tache,
        email_utilisateur: email_utilisateur,
        email_envoye: 0
    };

    tachesInMemory.push(nouvelleTache);
    res.json(nouvelleTache);
});

// إعدادات Gmail لإرسال الإيميلات
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'gdeentreprise551@gmail.com', 
        pass: 'guztxwqqmykhksxc' 
    }
});

// الروبوت الخاص بالإيميلات يعمل بسلاسة
setInterval(() => {
    const aujourdhui = new Date().toISOString().split('T')[0];

    tachesInMemory.forEach((tache) => {
        if (tache.date_tache <= aujourdhui && tache.email_envoye === 0 && tache.email_utilisateur) {
            const mailOptions = {
                from: 'gdeentreprise551@gmail.com',
                to: tache.email_utilisateur, 
                subject: `🔔 Rappel Task Flow : ${tache.titre}`,
                text: `Bonjour !\n\nC'est le moment de faire votre tâche : "${tache.titre}".\n\nBonne journée !`
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log("Erreur d'envoi :", error);
                } else {
                    console.log(`✉️ Email envoyé avec succès : ${tache.titre}`);
                    tache.email_envoye = 1; // تحديث الحالة في الذاكرة
                }
            });
        }
    });
}, 10000);

app.listen(PORT, () => {
    console.log(`🚀 Serveur Task Flow actif sur Vercel : ${PORT}`);
});