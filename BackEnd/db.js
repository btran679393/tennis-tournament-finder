require("dotenv").config();

let sql = null;
const shouldUseSql = process.env.DATA_SOURCE === "sql";

if (shouldUseSql) {
  try {
    sql = require("mssql/msnodesqlv8");
  } catch (err) {
    console.warn("SQL Server driver unavailable. Using local JSON fallback.");
  }
}

const connectionString =
  process.env.SQL_SERVER_CONNECTION_STRING ||
  "Driver={ODBC Driver 17 for SQL Server};Server=localhost\\SQLEXPRESS;Database=TennisTournamentDB;Trusted_Connection=yes;TrustServerCertificate=yes;";

const poolPromise = shouldUseSql && sql
  ? new sql.ConnectionPool({ connectionString })
      .connect()
      .then((pool) => {
        console.log("Connected to SQL Server");
        return pool;
      })
      .catch((err) => {
        console.error("SQL connection failed:", err.message);
        return null;
      })
  : Promise.resolve(null);

module.exports = {
  sql,
  poolPromise
};
