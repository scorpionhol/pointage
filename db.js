import knexLib from "knex";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const knex = knexLib({
  client: "sqlite3",
  connection: {
    filename: path.join(__dirname, "data", "mulykap.sqlite3"),
  },
  useNullAsDefault: true,
});

export default knex;
