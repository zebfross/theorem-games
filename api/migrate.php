<?php
/**
 * Apply schema.sql. Safe to run as often as you like.
 *
 * Run over SSH, never over the web — it is a command-line script and refuses to
 * do anything if a web server invokes it, because a migration endpoint anybody
 * can reach is a migration endpoint anybody can run.
 *
 *   php api/migrate.php
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/lib/boot.php';

$pdo = db();
if (!$pdo) {
    fwrite(STDERR, "no database configured; nothing to do\n");
    exit(1);
}

$sql = file_get_contents(__DIR__ . '/schema.sql');
foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
    if (str_starts_with($stmt, '--') && !str_contains($stmt, 'CREATE')) {
        continue;
    }
    $pdo->exec($stmt);
}

foreach (['users', 'bests'] as $table) {
    $n = $pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
    echo "  $table: ready, $n rows\n";
}
