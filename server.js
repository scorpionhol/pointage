
import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* =============================
   CONFIGURATION DATABASE
============================= */
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'data', 'mulykap.sqlite3'));

/* =============================
   MIDDLEWARES
============================= */

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "Public")));

app.use(session({
    secret: "mulykap-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 2 * 60 * 60 * 1000 } // 2h
}));

/* =============================
   CREATION DES TABLES
============================= */

// Initialisation de la base de données
function initDB() {
    try {
        // Vérifier si la table agents existe
        const agentsTable = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='agents'
        `).get();
        
        if (!agentsTable) {
            // Créer la table agents
            db.exec(`
                CREATE TABLE agents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    note TEXT NOT NULL,
                    matricule TEXT UNIQUE
                )
            `);
    } else {
            // Vérifier si la colonne matricule existe
            const tableInfo = db.pragma('table_info(agents)');
            const hasMatricule = tableInfo.some(col => col.name === 'matricule');
        if (!hasMatricule) {
                db.exec('ALTER TABLE agents ADD COLUMN matricule TEXT UNIQUE');
            }
        }

        // Vérifier si la table historique existe
        const historiqueTable = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='historique'
        `).get();
        
        if (!historiqueTable) {
            db.exec(`
                CREATE TABLE historique (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_id INTEGER,
                    date TEXT NOT NULL,
                    heure TEXT NOT NULL,
                    FOREIGN KEY (agent_id) REFERENCES agents(id)
                )
            `);
    }

        // Vérifier si la table presences existe
        const presencesTable = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='presences'
        `).get();
        
        if (!presencesTable) {
            db.exec(`
                CREATE TABLE presences (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_id INTEGER,
                    type TEXT,
                    time TEXT,
                    source TEXT,
                    metadata TEXT,
                    FOREIGN KEY (agent_id) REFERENCES agents(id)
                )
            `);
        }
    } catch (err) {
        console.error("Erreur lors de l'initialisation de la base de données:", err);
    }
}
initDB();

/* =============================
   AUTH MIDDLEWARE
============================= */

// Middleware d'authentification
function isAuth(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    next();
}

/* =============================
   ROUTES
============================= */


// Page d'accueil publique avec carousel
app.get("/", (req, res) => {
    res.render("index", { pageTitle: "Mulykap - Accueil" });
});

// Page d'accueil alternative si index.ejs ne fonctionne pas
app.get("/home", (req, res) => {
    res.render("index", { pageTitle: "Mulykap - Accueil" });
});


// Page de connexion
app.get("/login", (req, res) => {
    res.render("login", { pageTitle: "Connexion", error: null });
});


// Traitement de la connexion
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    // À remplacer par une vraie vérification en base !
    if (username === "admin" && password === "1234") {
        req.session.user = { username };
        return res.redirect("/dashboard");
    }
    res.render("login", { pageTitle: "Connexion", error: "Identifiants invalides." });
});


// Déconnexion
app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
});


// Dashboard (accès direct avec authentification)
app.get("/dashboard", isAuth, (req, res) => {
    try {
        const agents = db.prepare(`
            SELECT id, name as nom, note as poste, matricule 
            FROM agents
        `).all();
        res.render("dashboard", { pageTitle: "Dashboard", agents });
    } catch (err) {
        res.status(500).send("Erreur serveur : " + err.message);
    }
});


// Liste des agents
app.get("/agents", isAuth, (req, res) => {
    try {
        const agents = db.prepare(`
            SELECT id, name as nom, note as poste, matricule 
            FROM agents
        `).all();
        res.render("agents", { pageTitle: "Agents", agents });
    } catch (err) {
        res.status(500).send("Erreur serveur : " + err.message);
    }
});


// Ajout d'un agent

app.post("/agents", isAuth, (req, res) => {
    const { nom, poste, matricule } = req.body;
    if (!nom || !poste) {
        return res.status(400).send("Nom et poste requis.");
    }
    try {
        const insert = db.prepare(`
            INSERT INTO agents (name, note, matricule) 
            VALUES (?, ?, ?)
        `);
        insert.run(nom, poste, matricule || null);
        res.redirect("/agents");
    } catch (err) {
        res.status(500).send("Erreur serveur : " + err.message);
    }
});


// Suppression d'un agent
app.post("/agents/:id/delete", isAuth, (req, res) => {
    const agentId = req.params.id;
    try {
        // On supprime d'abord l'historique lié, puis l'agent
        const deleteHistorique = db.prepare('DELETE FROM historique WHERE agent_id = ?');
        const deletePresences = db.prepare('DELETE FROM presences WHERE agent_id = ?');
        const deleteAgent = db.prepare('DELETE FROM agents WHERE id = ?');
        
        deleteHistorique.run(agentId);
        deletePresences.run(agentId);
        deleteAgent.run(agentId);
        res.redirect("/agents");
    } catch (err) {
        res.status(500).send("Erreur serveur : " + err.message);
    }
});


// Pointage rapide d'un agent depuis le dashboard
app.get("/pointage/:id", isAuth, (req, res) => {
    const agentId = req.params.id;
    const now = new Date();
    const isoTime = now.toISOString();

    try {
        const insert = db.prepare(`
            INSERT INTO presences (agent_id, type, time, source, metadata) 
            VALUES (?, ?, ?, ?, ?)
        `);
        insert.run(agentId, "pointage", isoTime, "dashboard", null);
        res.redirect("/dashboard");
    } catch (err) {
        res.status(500).send("Erreur serveur : " + err.message);
    }
});


// Historique des pointages basé sur la table presences
app.get("/historique", isAuth, (req, res) => {
    try {
        const q = req.query.q ? req.query.q.trim() : '';
        let historique;
        if (q) {
            historique = db.prepare(`
                SELECT presences.time, presences.type, agents.name as nom
                FROM presences
                LEFT JOIN agents ON agents.id = presences.agent_id
                WHERE agents.name LIKE ?
                ORDER BY presences.time DESC
            `).all(`%${q}%`);
        } else {
            historique = db.prepare(`
                SELECT presences.time, presences.type, agents.name as nom
                FROM presences
                LEFT JOIN agents ON agents.id = presences.agent_id
                ORDER BY presences.time DESC
            `).all();
        }

        // Ajout des règles d'heure fixe et calculs
        const ARRIVEE_FIXE = "08:15";
        const SORTIE_FIXE = "17:00";
        // On regroupe les pointages par agent et date
        const byAgentDate = {};
        historique.forEach(h => {
            const d = new Date(h.time);
            const dateStr = d.toISOString().slice(0, 10);
            const key = h.nom + "_" + dateStr;
            if (!byAgentDate[key]) byAgentDate[key] = { arrivee: null, depart: null, nom: h.nom, date: dateStr };
            if (h.type === "arrivee") {
                if (!byAgentDate[key].arrivee || d < new Date(byAgentDate[key].arrivee)) byAgentDate[key].arrivee = h.time;
            }
            if (h.type === "depart") {
                if (!byAgentDate[key].depart || d > new Date(byAgentDate[key].depart)) byAgentDate[key].depart = h.time;
            }
        });
        // On prépare les données pour la vue
        const historiqueAffiche = Object.values(byAgentDate).map(h => {
            let arriveeRetard = false, arriveeStr = null, depStr = null, heuresSup = null;
            if (h.arrivee) {
                const t = new Date(h.arrivee);
                arriveeStr = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                // Vérifie le retard
                const [hFixe, mFixe] = ARRIVEE_FIXE.split(":").map(Number);
                if (t.getHours() > hFixe || (t.getHours() === hFixe && t.getMinutes() > mFixe)) arriveeRetard = true;
            }
            if (h.depart) {
                const t = new Date(h.depart);
                depStr = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                // Heures supp
                const [hFixe, mFixe] = SORTIE_FIXE.split(":").map(Number);
                if (t.getHours() > hFixe || (t.getHours() === hFixe && t.getMinutes() > mFixe)) {
                    const depMinutes = t.getHours() * 60 + t.getMinutes();
                    const sortieMinutes = hFixe * 60 + mFixe;
                    const diff = depMinutes - sortieMinutes;
                    heuresSup = `${Math.floor(diff/60)}h${(diff%60).toString().padStart(2,'0')}`;
                }
            }
            return {
                nom: h.nom,
                date: h.date,
                arrivee: arriveeStr,
                arriveeRetard,
                depart: depStr,
                heuresSup
            };
        });
        res.render("historique", { pageTitle: "Historique", historique: historiqueAffiche, q });
    } catch (err) {
        res.status(500).send("Erreur serveur : " + err.message);
    }
});


// =============================
//  BADGEUSE VIRTUELLE (WEB)
// =============================

// Formulaire de badgeuse virtuelle
app.get("/badgeuse", isAuth, (req, res) => {
    const { message, error } = req.query;
    res.render("badgeuse", {
        pageTitle: "Badgeuse virtuelle",
        message,
        error
    });
});

// Soumission de pointage depuis la badgeuse virtuelle
app.post("/badgeuse", isAuth, (req, res) => {
    try {
        const { badge, type } = req.body; // badge = code / matricule ou ID

        if (!badge) {
            return res.redirect("/badgeuse?error=Code+badge+obligatoire");
        }

        // On cherche l’agent par son matricule (code de badge)
        let agent = db.prepare('SELECT * FROM agents WHERE matricule = ?').get(badge);
        if (!agent) {
            // Si pas trouvé par matricule, essayer par ID
            const badgeId = parseInt(badge);
            if (!isNaN(badgeId)) {
                agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(badgeId);
            }
        }
        if (!agent) {
            return res.redirect("/badgeuse?error=Aucun+agent+trouve+pour+ce+badge");
        }

        const now = new Date().toISOString();

        const insert = db.prepare(`
            INSERT INTO presences (agent_id, type, time, source, metadata) 
            VALUES (?, ?, ?, ?, ?)
        `);
        insert.run(agent.id, type || "badge", now, "badgeuse_virtuelle", null);

        return res.redirect("/badgeuse?message=Pointage+enregistre+pour+" + encodeURIComponent(agent.name));
    } catch (err) {
        return res.redirect("/badgeuse?error=" + encodeURIComponent("Erreur serveur : " + err.message));
    }
});


// =============================
//  API POUR BADGEUSE PHYSIQUE
// =============================

app.post("/api/pointage", (req, res) => {
    try {
        const { badge, type } = req.body;

        if (!badge) {
            return res.status(400).json({ error: "Code badge manquant" });
        }

        // On cherche l'agent par son matricule ou par son ID
        let agent = db.prepare('SELECT * FROM agents WHERE matricule = ?').get(badge);
        if (!agent) {
            // Si pas trouvé par matricule, essayer par ID
            const badgeId = parseInt(badge);
            if (!isNaN(badgeId)) {
                agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(badgeId);
            }
        }
        if (!agent) {
            return res.status(404).json({ error: "Agent inconnu pour ce badge" });
        }

        const now = new Date().toISOString();

        const insert = db.prepare(`
            INSERT INTO presences (agent_id, type, time, source, metadata) 
            VALUES (?, ?, ?, ?, ?)
        `);
        insert.run(agent.id, type || "badge", now, "badgeuse_api", null);

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).send("Page non trouvée");
});

// Lancement du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 MULYKAP Pointage lancé sur http://localhost:${PORT}`);
});
