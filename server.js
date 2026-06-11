const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const path = require('path'); // AJOUT CRUCIAL

const app = express();
// التعديل موجود هنا وجاهز للاستضافة أونلاين
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Force le serveur à pointer directement sur ton dossier ListElle
app.use(express.static(path.join(__dirname)));

// Route principale pour charger ton fichier HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// La base de données
const db = new sqlite3.Database('./liste_taches.db', (err) => {
    if (err) console.error(err.message);
    else console.log('Base de données SQLite connectée.');
});

db.run(`CREATE TABLE IF NOT EXISTS taches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    date_tache TEXT NOT NULL,
    email_utilisateur TEXT,
    email_envoye INTEGER DEFAULT 0
)`);

// Configuration Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'gdeentreprise551@gmail.com', 
        pass: 'guztxwqqmykhksxc' 
    }
});

// Route pour récupérer les tâches
app.get('/taches', (req, res) => {
    db.all(`SELECT * FROM taches`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Route pour ajouter une tâche
app.post('/taches', (req, res) => {
    const { titre, date_tache, email_utilisateur } = req.body;
    
    if (!titre || !date_tache || !email_utilisateur) {
        return res.status(400).json({ error: "Données incomplètes" });
    }

    db.run(`INSERT INTO taches (titre, date_tache, email_utilisateur) VALUES (?, ?, ?)`, 
    [titre, date_tache, email_utilisateur], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({ 
            id: this.lastID, 
            titre: titre, 
            date_tache: date_tache, 
            email_utilisateur: email_utilisateur, 
            email_envoye: 0 
        });
    });
});

// Robot de vérification (toutes les 10 secondes)
setInterval(() => {
    const aujourdhui = new Date().toISOString().split('T')[0];

    db.all(`SELECT * FROM taches WHERE date_tache <= ? AND email_envoye = 0`, [aujourdhui], (err, rows) => {
        if (err) return console.error(err.message);

        rows.forEach((tache) => {
            if (!tache.email_utilisateur) return;

            const mailOptions = {
                from: 'gdeentreprise551@gmail.com',
                to: tache.email_utilisateur, 
                subject: `🔔 Rappel ListElle : ${tache.titre}`,
                text: `Bonjour !\n\nC'est le moment de faire votre tâche : "${tache.titre}".\n\nBonne journée avec ListElle !`
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log("Erreur d'envoi :", error);
                } else {
                    console.log(`✉️ Email envoyé avec succès : ${tache.titre}`);
                    db.run(`UPDATE taches SET email_envoye = 1 WHERE id = ?`, [tache.id]);
                }
            });
        });
    });
}, 10000); 

// تشغيل السيرفر ليتماشى مع البيئة المحلية والمنصة السحابية
app.listen(PORT, () => {
    console.log(`🚀 Serveur ListElle actif sur le port: ${PORT}`);
});