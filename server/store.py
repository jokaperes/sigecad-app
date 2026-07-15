"""
Persistencia (SQLite) do servidor central.

Principio de minimizacao: guardamos o token (cifrado) porque o modelo central
precisa poll offline; e guardamos SO HASH das notas, nunca o valor real.

Tabelas:
  users(id, email, consent_at, active)
  tokens(user_id, enc_blob, status, updated_at)   -- status: ok|dead
  snapshots(user_id, key, hash, publicar, updated_at)  -- key = codigo::turma::avaliacao
  turma_members(turma_code, user_id)  -- para fan-out do modelo sentinela (futuro)
"""
import os
import sqlite3
from datetime import datetime, timezone

DB_PATH = os.environ.get(
    "SIGECAD_DB_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.db"),
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    consent_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tokens (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enc_blob TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ok',
    fail_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    hash TEXT NOT NULL,
    publicar INTEGER,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS turma_members (
    turma_code TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (turma_code, user_id)
);
-- snapshot POR TURMA (modelo sentinela): 1 estado por turma, nao por aluno
CREATE TABLE IF NOT EXISTS turma_snapshots (
    turma_code TEXT NOT NULL,
    key TEXT NOT NULL,
    hash TEXT NOT NULL,
    publicar INTEGER,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (turma_code, key)
);
"""


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect():
    parent = os.path.dirname(os.path.abspath(DB_PATH))
    os.makedirs(parent, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=30)
    # SQLite may create the file using a permissive process umask. Tokens are
    # encrypted, but metadata and emails are still private.
    os.chmod(DB_PATH, 0o600)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")   # melhor concorrencia leitura/escrita
    con.execute("PRAGMA busy_timeout = 30000")
    return con


def init_db():
    con = connect()
    con.executescript(SCHEMA)
    token_columns = {row[1] for row in con.execute("PRAGMA table_info(tokens)")}
    if "fail_count" not in token_columns:
        con.execute("ALTER TABLE tokens ADD COLUMN fail_count INTEGER NOT NULL DEFAULT 0")
    con.commit()
    con.close()


def add_user(email, enc_blob):
    """Cria usuario (com consentimento) e guarda o token cifrado. Retorna user_id."""
    con = connect()
    try:
        cur = con.execute(
            "INSERT INTO users(email, consent_at, active) VALUES(?,?,1) "
            "ON CONFLICT(email) DO UPDATE SET active=1, consent_at=excluded.consent_at RETURNING id",
            (email, _now()),
        )
        user_id = cur.fetchone()["id"]
        con.execute(
            "INSERT INTO tokens(user_id, enc_blob, status, updated_at) VALUES(?,?, 'ok', ?) "
            "ON CONFLICT(user_id) DO UPDATE SET enc_blob=excluded.enc_blob, status='ok', "
            "fail_count=0, updated_at=excluded.updated_at",
            (user_id, enc_blob, _now()),
        )
        con.commit()
        return user_id
    finally:
        con.close()


def active_users_with_tokens():
    con = connect()
    try:
        rows = con.execute(
            "SELECT u.id, u.email, t.enc_blob FROM users u "
            "JOIN tokens t ON t.user_id = u.id "
            "WHERE u.active = 1 AND t.status = 'ok'"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        con.close()


def mark_token_dead(user_id):
    con = connect()
    con.execute("UPDATE tokens SET status='dead', updated_at=? WHERE user_id=?", (_now(), user_id))
    con.commit()
    con.close()


def get_snapshot(user_id):
    con = connect()
    try:
        rows = con.execute("SELECT key, hash, publicar FROM snapshots WHERE user_id=?", (user_id,)).fetchall()
        return {r["key"]: {"hash": r["hash"], "publicar": r["publicar"]} for r in rows}
    finally:
        con.close()


def save_snapshot(user_id, snap):
    """Substitui atomicamente o snapshot, removendo chaves que desapareceram."""
    con = connect()
    try:
        now = _now()
        con.execute("DELETE FROM snapshots WHERE user_id=?", (user_id,))
        con.executemany(
            "INSERT INTO snapshots(user_id, key, hash, publicar, updated_at) VALUES(?,?,?,?,?)",
            [(user_id, key, v["hash"], v.get("publicar"), now) for key, v in snap.items()],
        )
        con.commit()
    finally:
        con.close()


def delete_user(email):
    """Direito LGPD: apaga usuario, token e snapshots (cascade)."""
    con = connect()
    con.execute("DELETE FROM users WHERE email=?", (email,))
    con.commit()
    con.close()


# ---- contador de falhas (marca token 'dead' apos N falhas seguidas) ----
def record_failure(user_id, threshold=5):
    con = connect()
    try:
        row = con.execute("SELECT fail_count FROM tokens WHERE user_id=?", (user_id,)).fetchone()
        n = (row["fail_count"] if row else 0) + 1
        status = "dead" if n >= threshold else "ok"
        con.execute("UPDATE tokens SET fail_count=?, status=?, updated_at=? WHERE user_id=?",
                    (n, status, _now(), user_id))
        con.commit()
        return status
    finally:
        con.close()


def record_success(user_id):
    con = connect()
    con.execute("UPDATE tokens SET fail_count=0, status='ok', updated_at=? WHERE user_id=?", (_now(), user_id))
    con.commit()
    con.close()


# ---- membros de turma / modelo sentinela ----
def set_turma_members(user_id, turma_codes):
    """Define em quais turmas o usuario esta (repopula a lista dele)."""
    con = connect()
    try:
        con.execute("DELETE FROM turma_members WHERE user_id=?", (user_id,))
        con.executemany("INSERT OR IGNORE INTO turma_members(turma_code, user_id) VALUES(?,?)",
                        [(tc, user_id) for tc in turma_codes])
        con.commit()
    finally:
        con.close()


def turmas_with_members():
    """{turma_code: [user_id, ...]} de usuarios ativos."""
    con = connect()
    try:
        rows = con.execute(
            "SELECT tm.turma_code, tm.user_id FROM turma_members tm "
            "JOIN users u ON u.id=tm.user_id WHERE u.active=1"
        ).fetchall()
    finally:
        con.close()
    out = {}
    for r in rows:
        out.setdefault(r["turma_code"], []).append(r["user_id"])
    return out


def sentinel_for(turma_code):
    """Um membro da turma com token vivo, pra servir de sentinela. None se nenhum."""
    con = connect()
    try:
        r = con.execute(
            "SELECT t.user_id, t.enc_blob FROM turma_members tm "
            "JOIN tokens t ON t.user_id=tm.user_id "
            "JOIN users u ON u.id=tm.user_id "
            "WHERE tm.turma_code=? AND t.status='ok' AND u.active=1 "
            "ORDER BY t.fail_count ASC LIMIT 1",
            (turma_code,),
        ).fetchone()
        return dict(r) if r else None
    finally:
        con.close()


def turma_member_emails(turma_code):
    con = connect()
    try:
        rows = con.execute(
            "SELECT u.email FROM turma_members tm JOIN users u ON u.id=tm.user_id "
            "WHERE tm.turma_code=? AND u.active=1", (turma_code,)
        ).fetchall()
        return [r["email"] for r in rows]
    finally:
        con.close()


def get_turma_snapshot(turma_code):
    con = connect()
    try:
        rows = con.execute("SELECT key, hash, publicar FROM turma_snapshots WHERE turma_code=?",
                           (turma_code,)).fetchall()
        return {r["key"]: {"hash": r["hash"], "publicar": r["publicar"]} for r in rows}
    finally:
        con.close()


def save_turma_snapshot(turma_code, items):
    con = connect()
    try:
        now = _now()
        con.execute("DELETE FROM turma_snapshots WHERE turma_code=?", (turma_code,))
        con.executemany(
            "INSERT INTO turma_snapshots(turma_code, key, hash, publicar, updated_at) VALUES(?,?,?,?,?)",
            [(turma_code, key, v["hash"], v.get("publicar"), now) for key, v in items.items()],
        )
        con.commit()
    finally:
        con.close()


if __name__ == "__main__":
    init_db()
    print("DB inicializado em", DB_PATH)
