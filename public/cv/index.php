<?php
/**
 * Optional password gate for /cv.
 *
 * This is the one part of an otherwise fully static Astro site that needs
 * real server-side logic — it only works on PHP-capable hosting (Apache/
 * LiteSpeed + PHP, e.g. typical shared/cPanel hosting). On a static-only
 * host (Netlify, Vercel, GitHub Pages, ...) this file never runs at all,
 * so /cv is simply public — that's an acceptable fallback, not a broken
 * state, but it's worth knowing before you rely on this for anything
 * sensitive.
 *
 * The actual rendered CV lives at ../cv-content/index.html (built by Astro
 * from src/pages/cv-content.astro) and is blocked from direct HTTP access
 * by public/cv-content/.htaccess — this script is the only thing that ever
 * reads it, via a plain filesystem call that .htaccess rules don't affect.
 *
 * The default password below is "changeme" — a working demo credential,
 * not a real secret. Change it before deploying anywhere real: generate a
 * new bcrypt hash, e.g.
 *   php -r "echo password_hash('yournewpassword', PASSWORD_BCRYPT), PHP_EOL;"
 * and replace CV_PASSWORD_HASH below with the output. Never commit the
 * plaintext password itself, only the hash.
 */

const CV_PASSWORD_HASH = '$2b$10$rCObfmKAzFDU5DSdeoBLcumQvN58U0zxziJqw9cc.qGkrWI0vJkNO';
const CONTENT_FILE = __DIR__ . '/../cv-content/index.html';
const GATE_URL = '/cv/';

$isHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $password = $_POST['password'] ?? '';
    if (password_verify($password, CV_PASSWORD_HASH)) {
        session_regenerate_id(true);
        $_SESSION['cv_ok'] = true;
        header('Location: ' . GATE_URL);
        exit;
    }
    // Trivial brute-force deterrent — not a substitute for a strong password.
    sleep(1);
    $error = 'Incorrect password.';
}

if (!empty($_SESSION['cv_ok'])) {
    if (!is_readable(CONTENT_FILE)) {
        http_response_code(500);
        echo 'CV content is unavailable right now.';
        exit;
    }
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store, private');
    readfile(CONTENT_FILE);
    exit;
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>CV — Your Name</title>
<style>
  :root {
    --color-bg: #ffffff;
    --color-text-main: #1a1a1a;
    --color-text-muted: #555555;
    --color-accent: #003366;
    --color-border: #eaeaea;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-bg);
    color: var(--color-text-main);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 1.5rem;
  }
  .gate-card {
    width: 100%;
    max-width: 380px;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 2rem;
  }
  .gate-card h1 {
    font-size: 1.3rem;
    margin: 0 0 0.5rem;
  }
  .gate-card p {
    color: var(--color-text-muted);
    font-size: 0.95rem;
    margin: 0 0 1.5rem;
  }
  .gate-card input[type="password"] {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font-size: 1rem;
    margin-bottom: 1rem;
  }
  .gate-card button {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: none;
    border-radius: 6px;
    background-color: var(--color-accent);
    color: #fff;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }
  .gate-error {
    color: #b91c1c;
    font-size: 0.9rem;
    margin: -0.75rem 0 1rem;
  }
</style>
</head>
<body>
  <div class="gate-card">
    <h1>This CV is password-protected</h1>
    <p>Enter the password you were given to view it.</p>
    <?php if ($error !== ''): ?>
      <p class="gate-error"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></p>
    <?php endif; ?>
    <form method="post" action="<?= htmlspecialchars(GATE_URL, ENT_QUOTES, 'UTF-8') ?>">
      <input type="password" name="password" placeholder="Password" autofocus required />
      <button type="submit">View CV</button>
    </form>
  </div>
</body>
</html>
