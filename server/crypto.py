"""
Criptografia envelope para os tokens UFGDNET em repouso.

Modelo:
  - KEK (Key Encryption Key): chave mestra de 32 bytes, vinda do ambiente
    (MASTER_KEY, base64). Em producao -> KMS/Secrets Manager (trocar so a
    funcao _wrap_dek/_unwrap_dek por chamada ao KMS).
  - DEK (Data Encryption Key): chave aleatoria por token. Cifra o token com
    AES-256-GCM. A DEK e' guardada cifrada pela KEK.
  - No banco guardamos: nonce_dek, dek_cifrada, nonce_token, token_cifrado.
    Sem a KEK, nada disso e' reversivel.

O token so aparece em claro na RAM, no instante do poll. Nunca logar.
"""
import os
import base64
import binascii
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def generate_master_key() -> str:
    """Gera uma KEK nova (base64). Rode 1x e guarde em MASTER_KEY (fora do repo)."""
    return base64.b64encode(AESGCM.generate_key(bit_length=256)).decode()


VERSION = "v1"


def _load_kek(env="MASTER_KEY", required=True) -> bytes:
    b64 = os.environ.get(env)
    if not b64:
        if required:
            raise RuntimeError(
                "MASTER_KEY ausente. Gere com: python crypto.py --genkey"
            )
        return None
    try:
        kek = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise RuntimeError(f"{env} deve ser base64 válido.") from exc
    if len(kek) != 32:
        raise RuntimeError(f"{env} deve ter 32 bytes (256 bits) em base64.")
    return kek


def encrypt_token(plaintext: str) -> str:
    """token em claro -> blob 'v1|...' seguro para guardar no banco."""
    kek = _load_kek()
    dek = AESGCM.generate_key(bit_length=256)
    n_tok = os.urandom(12)
    ct_tok = AESGCM(dek).encrypt(n_tok, plaintext.encode(), None)
    n_dek = os.urandom(12)
    ct_dek = AESGCM(kek).encrypt(n_dek, dek, None)
    parts = [base64.b64encode(x).decode() for x in (n_dek, ct_dek, n_tok, ct_tok)]
    return VERSION + "|" + "|".join(parts)


def decrypt_token(blob: str) -> str:
    """
    blob do banco -> token em claro (usar so em memoria, nunca logar/persistir).
    Suporta rotacao: tenta MASTER_KEY e, se falhar, MASTER_KEY_PREV (chave antiga).
    """
    ver, _, rest = blob.partition("|")
    if ver != VERSION:
        raise RuntimeError(f"versao de blob desconhecida: {ver!r}")
    parts = rest.split("|")
    if len(parts) != 4:
        raise RuntimeError("blob cifrado malformado")
    try:
        n_dek, ct_dek, n_tok, ct_tok = (
            base64.b64decode(p, validate=True) for p in parts
        )
    except (binascii.Error, ValueError) as exc:
        raise RuntimeError("blob cifrado malformado") from exc
    last_err = None
    for kek in (_load_kek(), _load_kek("MASTER_KEY_PREV", required=False)):
        if kek is None:
            continue
        try:
            dek = AESGCM(kek).decrypt(n_dek, ct_dek, None)
            return AESGCM(dek).decrypt(n_tok, ct_tok, None).decode()
        except Exception as e:  # chave errada -> tenta a proxima
            last_err = e
    raise RuntimeError("falha ao decifrar; verifique a MASTER_KEY") from last_err


if __name__ == "__main__":
    # smoke test / gerar chave
    import sys
    if "--genkey" in sys.argv:
        print(generate_master_key())
    else:
        os.environ.setdefault("MASTER_KEY", generate_master_key())
        blob = encrypt_token("UFGDNET=exemplo-123")
        assert decrypt_token(blob) == "UFGDNET=exemplo-123"
        print("crypto OK — round-trip bateu. blob:", blob[:40], "...")
