-- Accounts, and the one number per level that is worth keeping.
--
-- Small on purpose. A player's whole record is a best score and a "was this
-- helped" flag for each level they have finished, so even somebody who
-- completes all 1300-odd levels is a few tens of kilobytes. Nothing here needs
-- to grow into a schema.
--
-- Applied by tools/migrate.php, which is safe to run repeatedly.

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider      VARCHAR(16)  NOT NULL,
  provider_id   VARCHAR(64)  NOT NULL,
  name          VARCHAR(80)  NOT NULL,
  created_at    DATETIME     NOT NULL,
  seen_at       DATETIME     NOT NULL,
  PRIMARY KEY (id),
  -- One row per account at the provider. Signing in again finds this row
  -- rather than making another.
  UNIQUE KEY provider_account (provider, provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bests (
  user_id    INT UNSIGNED NOT NULL,
  -- "<game>.<level>", the same name the browser has always used, so a record
  -- made before signing in and one made after are the same key.
  level_key  VARCHAR(96)  NOT NULL,
  score      INT          NOT NULL,
  -- Set when a level was ever finished with a hint. Sticky, because that is
  -- what the browser has always done — the engine sets the mark and never
  -- clears it, so a level can carry both a mark and a later unaided score. The
  -- merge keeps it sticky too, or a player could launder the mark away by
  -- signing in from a browser that had never seen the level.
  hinted     TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at DATETIME     NOT NULL,
  PRIMARY KEY (user_id, level_key),
  CONSTRAINT bests_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
