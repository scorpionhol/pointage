
import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import knexLib from "knex";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* =============================
   CONFIGURATION DATABASE
============================= */
const knex = knexLib({
    client: "sqlite3",
    connection: {
        filename: path.join(__dirname, "data", "mulykap.sqlite3")
    },
    useNullAsDefault: true
});

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
async function initDB() {
    const hasAgents = await knex.schema.hasTable("agents");
    if (!hasAgents) {
        await knex.schema.createTable("agents", table => {
            table.increments("id").primary();
            // Schéma standardisé : colonnes name / note en base
            table.string("name").notNullable();
            table.string("note").notNullable();
            table.string("matricule").unique(); // Matricule pour la badgeuse
        });
    } else {
        // Vérifier si la colonne matricule existe, sinon l'ajouter
        const hasMatricule = await knex.schema.hasColumn("agents", "matricule");
        if (!hasMatricule) {
            await knex.schema.alterTable("agents", table => {
                table.string("matricule").unique();
            });
        }
    }

    const hasHistorique = await knex.schema.hasTable("historique");
    if (!hasHistorique) {
        await knex.schema.createTable("historique", table => {
            table.increments("id").primary();
            table.integer("agent_id").unsigned().references("id").inTable("agents");
            table.string("date").notNullable();
            table.string("heure").notNullable();
        });
    }

    // Table presences (pointage détaillé) si elle n'existe pas déjà
    const hasPresences = await knex.schema.hasTable("presences");
    if (!hasPresences) {
        await knex.schema.createTable("presences", table => {
            table.increments("id").primary();
            table.integer("agent_id").unsigned().references("id").inTable("agents");
            table.string("type");      // arrivée, départ, etc.
            table.string("time");      // date/heure complète
            table.string("source");    // ex: dashboard, manuel...
            table.string("metadata");  // infos complémentaires éventuelles
        });
    }
}
initDB().catch(console.error);

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
app.get("/dashboard", isAuth, async (req, res) => {
    try {
        const agents = await knex("agents")
            .select("id", "name as nom", "note as poste", "matricule");
        res.render("dashboard", { pageTitle: "Dashboard", agents });
    } catch (err) {
        res.status(500).send("Erreur serveur : " + err.message);
    }
});


// Liste des agents
app.get("/agents", isAuth, async (req, res) => {
    try {
        const agents = await knex("agents")
            .select("id", "name as nom", "note as poste", "matricule");
        res.render("agents", { pageTitle: "Agents", agents });
    } catch (err) {
        res.status(500).send("Erreur serveur : " + err.message);
    }
});


// Ajout d'un agent

app.post("/agents", isAuth, async (req, res) => {
    const { nom, poste, matricule } = req.body;
    if (!nom || !poste) {
        return res.status(400).send("Nom et poste requis.");
    }
    try {
        // En base : name/note, mais on garde nom/poste dans le formulaire
        const agentData = { name: nom, note: poste };
        if (matricule) {
            agentData.matricule = matricule;
        }
        await knex("agents").insert(agentData);
        res.redirect("/agents");
    } catch (err) {
        res.status(500).send("Erreur serveur : " + err.message);
    }
});


// Suppression d'un agent
app.post("/agents/:id/delete", isAuth, async (req, res) => {
    const agentId = req.params.id;
    try {
        // On supprime d'abord l'historique lié, puis l'agent
        await knex("historique").where({ agent_id: agentId }).del();
        await knex("agents").where({ id: agentId }).del();
        res.redirect("/agents");
    } catch (err) {
        res.status(500).send("Erreur serveur : " + err.message);
    }
});


// Pointage rapide d'un agent depuis le dashboard
app.get("/pointage/:id", isAuth, async (req, res) => {
    const agentId = req.params.id;
    const now = new Date();
    const isoTime = now.toISOString();

    try {
        await knex("presences").insert({
            agent_id: agentId,
            type: "pointage",
            time: isoTime,
            source: "dashboard",
            metadata: null
        });
        res.redirect("/dashboard");
    } catch (err) {
        res.status(500).send("Erreur serveur : " + err.message);
    }
});


// Historique des pointages basé sur la table presences
app.get("/historique", isAuth, async (req, res) => {
    try {
        const historique = await knex("presences")
            .leftJoin("agents", "agents.id", "presences.agent_id")
            .select(
                "presences.time",
                "presences.type",
                "agents.name as nom"
            )
            .orderBy("presences.time", "desc");

        res.render("historique", { pageTitle: "Historique", historique });
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
app.post("/badgeuse", isAuth, async (req, res) => {
    try {
        const { badge, type } = req.body; // badge = code / matricule ou ID

        if (!badge) {
            return res.redirect("/badgeuse?error=Code+badge+obligatoire");
        }

        // On cherche l’agent par son matricule (code de badge)
        let agent = await knex("agents").where({ matricule: badge }).first();
        if (!agent) {
            // Si pas trouvé par matricule, essayer par ID
            const badgeId = parseInt(badge);
            if (!isNaN(badgeId)) {
                agent = await knex("agents").where({ id: badgeId }).first();
            }
        }
        if (!agent) {
            return res.redirect("/badgeuse?error=Aucun+agent+trouve+pour+ce+badge");
        }

        const now = new Date().toISOString();

        await knex("presences").insert({
            agent_id: agent.id,
            type: type || "badge",
            time: now,
            source: "badgeuse_virtuelle",
            metadata: null
        });

        return res.redirect("/badgeuse?message=Pointage+enregistre+pour+" + encodeURIComponent(agent.name));
    } catch (err) {
        return res.redirect("/badgeuse?error=" + encodeURIComponent("Erreur serveur : " + err.message));
    }
});


// =============================
//  API POUR BADGEUSE PHYSIQUE
// =============================

app.post("/api/pointage", async (req, res) => {
    try {
        const { badge, type } = req.body;

        if (!badge) {
            return res.status(400).json({ error: "Code badge manquant" });
        }

        // On cherche l'agent par son matricule ou par son ID
        let agent = await knex("agents").where({ matricule: badge }).first();
        if (!agent) {
            // Si pas trouvé par matricule, essayer par ID
            const badgeId = parseInt(badge);
            if (!isNaN(badgeId)) {
                agent = await knex("agents").where({ id: badgeId }).first();
            }
        }
        if (!agent) {
            return res.status(404).json({ error: "Agent inconnu pour ce badge" });
        }

        const now = new Date().toISOString();

        await knex("presences").insert({
            agent_id: agent.id,
            type: type || "badge",
            time: now,
            source: "badgeuse_api",
            metadata: null
        });

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
