#!/usr/bin/env python3
"""Generate strong deployment secrets for generic self-hosted environments.

This script only outputs values to stdout and never writes real secrets into
tracked env files by default.
"""

from __future__ import annotations

import argparse
import json
import secrets
import string
from typing import Dict


ALPHABET = string.ascii_letters + string.digits
SYMBOL_ALPHABET = ALPHABET + "-_@#%^+=:,."


def token_urlsafe(length: int = 48) -> str:
    return secrets.token_urlsafe(length)


def random_string(length: int = 32, *, symbols: bool = False) -> str:
    alphabet = SYMBOL_ALPHABET if symbols else ALPHABET
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_bundle(app_name: str) -> Dict[str, str]:
    return {
        "APP_NAME": app_name,
        "APP_ENV": "staging",
        "APP_SECRET": token_urlsafe(48),
        "JWT_SECRET": token_urlsafe(48),
        "SESSION_SECRET": token_urlsafe(48),
        "ENCRYPTION_KEY": token_urlsafe(32),
        "CSRF_SECRET": token_urlsafe(32),
        "INTERNAL_API_TOKEN": token_urlsafe(32),
        "WEBHOOK_SIGNING_SECRET": token_urlsafe(32),
        "DB_PASSWORD": random_string(32, symbols=True),
        "REDIS_PASSWORD": random_string(32, symbols=True),
        "ADMIN_BOOTSTRAP_PASSWORD": random_string(24, symbols=True),
    }


def as_env(data: Dict[str, str]) -> str:
    return "\n".join(f"{key}={value}" for key, value in data.items()) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate generic deployment secrets")
    parser.add_argument("--app-name", default="myapp", help="Application name tag")
    parser.add_argument("--format", choices=["env", "json"], default="env")
    args = parser.parse_args()

    data = generate_bundle(args.app_name)
    if args.format == "json":
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(as_env(data), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
