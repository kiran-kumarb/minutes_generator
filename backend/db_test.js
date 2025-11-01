require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function testConnection() {
    console.log("Attempting to connect to the database...");
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log("✅ Success! Database connection established.");
        console.log("Current time from DB:", result.rows[0].now);
        client.release();
    } catch (err) {
        console.error("❌ Connection Error. Check your .env credentials and ensure PostgreSQL is running.");
        console.error("--- Detailed DB Error ---");
        console.error(err.message);
        console.error("-------------------------");
    } finally {
        pool.end();
    }
}

testConnection();
