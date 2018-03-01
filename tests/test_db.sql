DROP DATABASE "mudgeconzTest";
CREATE DATABASE "mudgeconzTest";
DROP ROLE IF EXISTS "mudgeconzTest";
CREATE USER "mudgeconzTest" WITH PASSWORD 'test_password';
GRANT ALL PRIVILEGES ON DATABASE "mudgeconzTest" to "mudgeconzTest";

/*

\l - list databases.
\c mudgeconzTest - connect to the test database
\dt - list tables in the database.

*/