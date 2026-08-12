<?php
/**
 * Configuration, database and session, and the rule that the site keeps
 * working when none of them are there.
 *
 * Accounts are an addition, not a foundation. The site was static files and a
 * browser's own storage for its whole life, and it still is: with no config
 * file, no database or no OAuth app registered, every endpoint here answers
 * "not signed in" and the game carries on saving progress locally exactly as
 * before. Nothing on the board depends on this being up.
 *
 * The config lives outside the document root, so it is never served and the
 * deploy that mirrors the site with --delete cannot reach it. It is not in the
 * repository and must not be put there.
 */

declare(strict_types=1);

const CONFIG_PATH = '/home/odionfro/theorem-config.php';

/** The secrets file, or null if it is not there. */
function config(): ?array
{
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    $cache = is_readable(CONFIG_PATH) ? require CONFIG_PATH : null;
    return $cache;
}

/** A database handle, or null if there is no usable configuration.
 *
 *  Failure is a null rather than an exception on purpose. An endpoint that
 *  cannot reach the database should answer as though nobody is signed in,
 *  which leaves the player with their local progress and no error to read.
 */
function db(): ?PDO
{
    static $pdo = false;
    if ($pdo !== false) {
        return $pdo;
    }
    $cfg = config();
    if (!$cfg || empty($cfg['db']['dsn'])) {
        return $pdo = null;
    }
    try {
        $pdo = new PDO($cfg['db']['dsn'], $cfg['db']['user'], $cfg['db']['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (Throwable $e) {
        error_log('theorem.games: database unreachable: ' . $e->getMessage());
        $pdo = null;
    }
    return $pdo;
}

/** Start the session with a cookie that only this site can use. */
function begin_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 365,
        'path'     => '/',
        // Kept off JavaScript entirely: the page never needs to read it, and a
        // cookie script cannot read is one an injected script cannot steal.
        'httponly' => true,
        'secure'   => true,
        // Lax rather than Strict so that arriving back from the OAuth
        // provider's redirect still carries the session; Strict would drop it
        // on exactly that hop and the sign-in would silently fail.
        'samesite' => 'Lax',
    ]);
    session_name('tg_session');
    session_start();
}

/** The signed-in user, or null. */
function current_user(): ?array
{
    begin_session();
    $id = $_SESSION['uid'] ?? null;
    if (!$id || !db()) {
        return null;
    }
    $st = db()->prepare('SELECT id, name, provider FROM users WHERE id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: null;
}

/** Answer with JSON, and never let a proxy or browser keep it. */
function reply(array $body, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

/** Where to send somebody back to after signing in.
 *
 *  Only ever a path on this site. Taking the caller's word for a whole URL is
 *  how an open redirect gets built by accident, and a sign-in link that can be
 *  pointed at another host is a phishing tool wearing this site's name.
 */
function safe_return(?string $to): string
{
    if (!is_string($to) || $to === '' || $to[0] !== '/' || str_starts_with($to, '//')) {
        return '/index.html';
    }
    return $to;
}
