require("dotenv").config();

const sql = require("mssql/msnodesqlv8");

const config = {
  connectionString:
    "Driver={ODBC Driver 17 for SQL Server};Server=localhost\\SQLEXPRESS;Database=TennisTournamentDB;Trusted_Connection=yes;TrustServerCertificate=yes;"
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then((pool) => {
    console.log("Connected to SQL Server");
    return pool;
  })
  .catch((err) => {
    console.error("SQL connection failed:", err);
  });

module.exports = {
  sql,
  poolPromise
};