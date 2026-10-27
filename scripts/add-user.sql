-- Adds a ChessBuddy account to Azure SQL. Run it in the portal's Query editor (SQL database ->
-- Query editor) or any SQL client, as one batch.
--
-- 1. Make the password's hash locally:  npm run password:hash -- "<the new password>"
-- 2. Put the username and that hash in the two values at the bottom, then run the whole script.
--
-- The first three statements create the schema and the table if they're missing and add the
-- IsVip column to a table made before it existed; they do nothing when all is in place. The
-- account isn't VIP (IsVip = 0), so it can't use Opus. Don't add the owner (kviiilyn37_) here:
-- the server checks the owner's password itself and ignores any row with that name.

IF SCHEMA_ID(N'chessbuddy') IS NULL EXEC(N'CREATE SCHEMA chessbuddy');
IF OBJECT_ID(N'chessbuddy.Users', N'U') IS NULL EXEC(N'CREATE TABLE chessbuddy.Users (
  Id INT IDENTITY(1, 1) PRIMARY KEY,
  Username NVARCHAR(64) NOT NULL UNIQUE,
  PasswordHash NVARCHAR(255) NOT NULL,
  IsVip BIT NOT NULL DEFAULT 0,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
)');
IF COL_LENGTH(N'chessbuddy.Users', N'IsVip') IS NULL EXEC(N'ALTER TABLE chessbuddy.Users ADD IsVip BIT NOT NULL DEFAULT 0');

-- Through sp_executesql, so the IsVip column added above is known when the insert compiles.
EXEC sp_executesql
  N'INSERT INTO chessbuddy.Users (Username, PasswordHash, IsVip) VALUES (@username, @passwordHash, 0)',
  N'@username NVARCHAR(64), @passwordHash NVARCHAR(255)',
  @username = N'<username>',
  @passwordHash = N'<hash from npm run password:hash>';
