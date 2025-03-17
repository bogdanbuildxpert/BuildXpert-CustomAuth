#!/usr/bin/env node

// Load environment variables
require("dotenv").config();

const { Pool } = require("pg");

// Create database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
});

async function checkUsers() {
  try {
    console.log("Connecting to database...");

    // Check if User table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'User'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('The "User" table does not exist in the database.');
      await pool.end();
      return;
    }

    // Get all users
    const result = await pool.query('SELECT id, email, role FROM "User"');

    if (result.rows.length === 0) {
      console.log("No users found in the database.");
      await pool.end();
    } else {
      console.log(`Found ${result.rows.length} users in the database:`);
      result.rows.forEach((user) => {
        console.log(
          `- ID: ${user.id}, Email: ${user.email}, Role: ${user.role}`
        );
      });

      // Ask if user wants to delete all users
      const readline = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      readline.question(
        "Do you want to delete all related data and users? (yes/no): ",
        async (answer) => {
          if (answer.toLowerCase() === "yes") {
            try {
              // Begin transaction
              await pool.query("BEGIN");

              // Delete related data first (in order of dependencies)
              console.log("Deleting related data...");

              // Check and delete from tables that might reference User
              const tables = [
                "Job",
                "Project",
                "Task",
                "Material",
                "Service",
                "Review",
                "Message",
                "Notification",
              ];

              for (const table of tables) {
                try {
                  // Check if table exists
                  const tableExists = await pool.query(`
                    SELECT EXISTS (
                      SELECT FROM information_schema.tables 
                      WHERE table_name = '${table}'
                    );
                  `);

                  if (tableExists.rows[0].exists) {
                    console.log(`Deleting data from ${table}...`);
                    await pool.query(`DELETE FROM "${table}"`);
                  }
                } catch (err) {
                  console.log(
                    `Table ${table} not found or couldn't be cleared: ${err.message}`
                  );
                }
              }

              // Now delete users
              await pool.query('DELETE FROM "User"');

              // Commit transaction
              await pool.query("COMMIT");
              console.log("All users and related data have been deleted.");
            } catch (err) {
              // Rollback on error
              await pool.query("ROLLBACK");
              console.error("Error deleting data:", err);
            }
          } else {
            console.log("No users were deleted.");
          }
          readline.close();
          await pool.end();
        }
      );
    }
  } catch (error) {
    console.error("Error checking users:", error);
    await pool.end();
  }
}

checkUsers();
