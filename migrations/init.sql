-- migrations/init.sql

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL, -- 'admin' | 'rh' | 'employe'
  fullname TEXT
);

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  matricule TEXT UNIQUE,
  note TEXT
);

CREATE TABLE IF NOT EXISTS presences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'in' | 'out' | 'badge'
  time TEXT NOT NULL,
  source TEXT, -- 'web' or 'badge'
  metadata TEXT,
  FOREIGN KEY(agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    poste TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    heure TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);
