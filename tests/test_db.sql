DROP DATABASE "mudgeconztest";
CREATE DATABASE "mudgeconztest";
DROP ROLE IF EXISTS "mudgeconztest";
CREATE USER "mudgeconztest" WITH PASSWORD 'test_password';
GRANT ALL PRIVILEGES ON DATABASE "mudgeconztest" to "mudgeconztest";

/*

\l - list databases.
\c mudgeconztest - connect to the test database
\dt - list tables in the database.

*/