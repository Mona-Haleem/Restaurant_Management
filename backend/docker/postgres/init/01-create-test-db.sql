-- Runs once, when the container's data volume is first created.
-- tablz_dev (POSTGRES_DB) is created by the image; this adds the integration-test database.
CREATE DATABASE tablz_test;
