<?php
/**
 * The whole backend: sign in with GitHub, and keep one number per level.
 *
 * Six endpoints, no framework, and nothing the game cannot do without. If the
 * config is missing, the database is down or no OAuth app has been registered,
 * every route here still answers and the answer is "nobody is signed in" —
 * which is the state the site was in for its whole life before this existed.
 *
 *   GET  /api/me                    who is signed in, if anybody
 *   GET  /api/auth/github           begin signing in
 *   GET  /api/auth/github/callback  finish, and come back to the game
 *   POST /api/logout                forget the session
 *   GET  /api/progress              every best this account has
 *   POST /api/progress              merge in bests made in the browser
 *
 * No passwords are stored, or ever seen: GitHub does that part. What is kept
 * is an account id from GitHub, a display name, and scores.
 */

declare(strict_types=1);

require __DIR__ . '/lib/boot.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$route = trim(substr($path, strlen('/api')), '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ("$method $route") {
    case 'GET me':
        $u = current_user();
        reply(['user' => $u ? ['name' => $u['name'], 'provider' => $u['provider']] : null]);

    case 'GET auth/github':
        start_github_login();

    case 'GET auth/github/callback':
        finish_github_login();

    case 'POST logout':
        begin_session();
        $_SESSION = [];
        // Both halves: the server's copy and the browser's.
        session_destroy();
        setcookie('tg_session', '', ['expires' => time() - 3600, 'path' => '/',
            'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
        reply(['user' => null]);

    case 'GET progress':
        reply(['bests' => (object) read_progress()]);

    case 'POST progress':
        reply(['bests' => (object) merge_progress()]);
}

reply(['error' => 'no such endpoint'], 404);


/* ---------- signing in ---------- */

function start_github_login(): void
{
    $cfg = config();
    $id = $cfg['github']['client_id'] ?? '';
    // Both halves, not just the id. Half-configured is the dangerous state: the
    // redirect to GitHub works, the player authorises, and they come back to a
    // token exchange that cannot succeed — which spends their consent to reach
    // an error. Not offering sign-in at all is the better failure.
    if ($id === '' || ($cfg['github']['client_secret'] ?? '') === '') {
        reply(['error' => 'sign-in is not configured on this server'], 503);
    }
    begin_session();
    // A one-shot value echoed back by GitHub. Without it, anybody could send a
    // player a callback URL of their choosing and have the site complete a
    // sign-in the player never began.
    $_SESSION['oauth_state'] = bin2hex(random_bytes(16));
    $_SESSION['oauth_return'] = safe_return($_GET['return'] ?? null);
    $url = 'https://github.com/login/oauth/authorize?' . http_build_query([
        'client_id'    => $id,
        'redirect_uri' => origin() . '/api/auth/github/callback',
        // The narrowest scope there is: it reads the public profile and
        // nothing else. No repositories, no email, no write access.
        'scope'        => 'read:user',
        'state'        => $_SESSION['oauth_state'],
    ]);
    header('Location: ' . $url, true, 302);
    exit;
}

function finish_github_login(): void
{
    begin_session();
    $cfg = config();
    $state = $_GET['state'] ?? '';
    $want = $_SESSION['oauth_state'] ?? '';
    unset($_SESSION['oauth_state']);
    if ($want === '' || !hash_equals($want, (string) $state)) {
        reply(['error' => 'that sign-in did not start here'], 400);
    }
    $code = $_GET['code'] ?? '';
    if ($code === '') {
        reply(['error' => 'no code returned'], 400);
    }

    $token = github_post('https://github.com/login/oauth/access_token', [
        'client_id'     => $cfg['github']['client_id'] ?? '',
        'client_secret' => $cfg['github']['client_secret'] ?? '',
        'code'          => $code,
        'redirect_uri'  => origin() . '/api/auth/github/callback',
    ]);
    $access = $token['access_token'] ?? '';
    if ($access === '') {
        reply(['error' => 'GitHub would not exchange that code'], 502);
    }

    $who = github_get('https://api.github.com/user', $access);
    $gid = isset($who['id']) ? (string) $who['id'] : '';
    if ($gid === '') {
        reply(['error' => 'GitHub returned no account'], 502);
    }
    $name = (string) ($who['login'] ?? 'player');

    $pdo = db();
    if (!$pdo) {
        reply(['error' => 'the account store is unavailable'], 503);
    }
    $now = gmdate('Y-m-d H:i:s');
    $pdo->prepare(
        'INSERT INTO users (provider, provider_id, name, created_at, seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), seen_at = VALUES(seen_at)'
    )->execute(['github', $gid, mb_substr($name, 0, 80), $now, $now]);

    $st = $pdo->prepare('SELECT id FROM users WHERE provider = ? AND provider_id = ?');
    $st->execute(['github', $gid]);
    $uid = (int) $st->fetchColumn();

    // A fresh session id, so a session fixed before sign-in is not the one
    // that ends up signed in.
    session_regenerate_id(true);
    $_SESSION['uid'] = $uid;
    $back = safe_return($_SESSION['oauth_return'] ?? null);
    unset($_SESSION['oauth_return']);
    header('Location: ' . $back, true, 302);
    exit;
}

function origin(): string
{
    $host = $_SERVER['HTTP_HOST'] ?? 'theorem.games';
    return 'https://' . $host;
}

function github_post(string $url, array $form): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($form),
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 12,
        CURLOPT_USERAGENT      => 'theorem.games',
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    return is_string($body) ? (json_decode($body, true) ?: []) : [];
}

function github_get(string $url, string $token): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER     => [
            'Accept: application/vnd.github+json',
            'Authorization: Bearer ' . $token,
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 12,
        CURLOPT_USERAGENT      => 'theorem.games',
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    return is_string($body) ? (json_decode($body, true) ?: []) : [];
}


/* ---------- progress ---------- */

function read_progress(): array
{
    $u = current_user();
    if (!$u) {
        return [];
    }
    $st = db()->prepare('SELECT level_key, score, hinted FROM bests WHERE user_id = ?');
    $st->execute([$u['id']]);
    $out = [];
    foreach ($st as $row) {
        $out[$row['level_key']] = [
            'score'  => (int) $row['score'],
            'hinted' => (bool) $row['hinted'],
        ];
    }
    return $out;
}

/**
 * Merge what the browser has into what the account has.
 *
 * Merge, never replace. Signing in on a new machine must not wipe out a record
 * made before there were accounts at all, and signing in on the machine that
 * holds the record must not wipe out the account. Lower is better in every
 * game here — fewest guards, fewest pins, shortest round — so the merge is a
 * minimum, and the returned set is what both sides should now hold.
 */
function merge_progress(): array
{
    $u = current_user();
    if (!$u) {
        reply(['error' => 'not signed in'], 401);
    }
    $raw = file_get_contents('php://input', false, null, 0, 1024 * 512);
    $in = json_decode((string) $raw, true);
    if (!is_array($in) || !isset($in['bests']) || !is_array($in['bests'])) {
        reply(['error' => 'expected {"bests": {...}}'], 400);
    }

    $pdo = db();
    $now = gmdate('Y-m-d H:i:s');
    $st = $pdo->prepare(
        'INSERT INTO bests (user_id, level_key, score, hinted, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           score  = LEAST(score, VALUES(score)),
           hinted = GREATEST(hinted, VALUES(hinted)),
           updated_at = VALUES(updated_at)'
    );
    $written = 0;
    foreach ($in['bests'] as $levelKey => $entry) {
        // Keys come from the page, so they are checked rather than trusted:
        // "<game>.<level>", both made of the characters level ids actually use.
        if (!is_string($levelKey) || !preg_match('/^[a-z0-9-]{1,24}\.[A-Za-z0-9_^-]{1,64}$/', $levelKey)) {
            continue;
        }
        $score = is_array($entry) ? ($entry['score'] ?? null) : null;
        if (!is_int($score) && !(is_string($score) && ctype_digit($score))) {
            continue;
        }
        $score = (int) $score;
        if ($score < 0 || $score > 1000000) {
            continue;
        }
        $hinted = !empty($entry['hinted']) ? 1 : 0;
        $st->execute([$u['id'], $levelKey, $score, $hinted, $now]);
        if (++$written > 5000) {
            break;                      // a bounded amount of work per request
        }
    }
    return read_progress();
}
