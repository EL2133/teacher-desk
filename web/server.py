#!/usr/bin/env python3
"""Serve Teacher Work Platform and the per-user Poe AI helper."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from email.message import EmailMessage
from html.parser import HTMLParser
from http.cookiejar import CookieJar
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from html import unescape
from urllib.parse import quote, unquote, urlencode, urljoin, urlparse

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "5174"))
# Local default is loopback. Render sets RENDER=true and needs 0.0.0.0.
if os.environ.get("HOST"):
    HOST = os.environ["HOST"]
elif os.environ.get("RENDER"):
    HOST = "0.0.0.0"
else:
    HOST = "127.0.0.1"
POE_URL = "https://api.poe.com/v1/chat/completions"
XAI_URL = "https://api.x.ai/v1/chat/completions"
POE_MODELS_URL = "https://api.poe.com/v1/models"
DEFAULT_MODEL = os.environ.get("POE_MODEL", "claude-haiku-4.5")
DEFAULT_XAI_MODEL = os.environ.get("XAI_MODEL", "grok-4.6")
# Empty means any email domain, so teachers outside one school can sign up.
# Set ALLOWED_EMAIL_DOMAINS=school.edu,example.edu to limit it. Subdomains count.
DEFAULT_ALLOWED_EMAIL_DOMAINS = []
_AI_POST_PATHS = {
    "/api/analyze-notice",
    "/api/seat-plan",
    "/api/ai-chat",
    "/api/eclass-check",
    "/api/eclass-analyse",
    "/api/ai-ping",
}
_AI_RATE_LOCK = threading.Lock()
_AI_RATE_HITS: dict[str, list[float]] = {}
_AI_RATE_LIMIT = 20
_AI_RATE_WINDOW = 60.0
STARTER_MODELS = [
    "claude-haiku-4.5",
    "gpt-5.2",
    "gpt-5.4-mini",
    "gemini-3.5-flash-lite",
    "claude-sonnet-4.6",
    "gpt-5.4",
    "grok-4.6",
    "gemini-3.8-flash",
]
_MODELS_CACHE: dict = {"at": 0.0, "payload": None}
ALL_TEACHERS_RE = re.compile(
    r"all\s+teachers|all\s+staff|every\s+teacher|all\s+(?:teachers?\s+)?on\s+duty|"
    r"全體(?:老師|教師|教職員)|所有(?:老師|教師)|各(?:位)?老師|全校(?:老師|教師)|"
    r"全體當值|所有當值|全體值班|全體監考",
    re.I,
)
DUTY_RE = re.compile(r"當值|值班|值日|巡堂|監考|帶隊|工作分配|duty|invigil", re.I)

NOTICE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "document_type": {"type": "string"},
        "events": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": [
                            "inspection",
                            "examDeadline",
                            "deadline",
                            "meeting",
                            "outing",
                            "observation",
                            "duty",
                            "other",
                        ],
                    },
                    "date": {"type": "string"},
                    "posted": {"type": "string"},
                    "time": {"type": "string"},
                    "endDate": {"type": "string"},
                    "endTime": {"type": "string"},
                    "location": {"type": "string"},
                    "people": {"type": "string"},
                    "className": {"type": "string"},
                    "work": {"type": "string"},
                    "source": {"type": "string"},
                    "description": {"type": "string"},
                    "reason": {"type": "string"},
                    "relatedToTeacher": {"type": "boolean"},
                    "matchReason": {"type": "string"},
                },
                "required": [
                    "title",
                    "type",
                    "date",
                    "posted",
                    "time",
                    "endDate",
                    "endTime",
                    "location",
                    "people",
                    "className",
                    "work",
                    "source",
                    "description",
                    "reason",
                    "relatedToTeacher",
                    "matchReason",
                ],
            },
        },
    },
    "required": ["summary", "document_type", "events"],
}

NOTICE_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "notice_extract",
        "strict": True,
        "schema": NOTICE_SCHEMA,
    },
}

DOCUMENT_CHROME = (
    "Ignore school logo, letterhead, 發文編號, stamps, 抄送 and 副本 side columns, "
    "signature footers, and watermarks. Those are page chrome, not the document. "
    "Extract ONLY the structured fields listed below. Never invent a field from the chrome."
)


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip().strip('"').strip("'")


load_env()


def env_ai_key() -> str:
    for name in ("XAI_API_KEY", "POE_API_KEY", "POE_KEY"):
        value = str(os.environ.get(name) or "").strip()
        if value:
            return value
    return ""


def env_poe_key() -> str:
    for name in ("POE_API_KEY", "POE_KEY"):
        value = str(os.environ.get(name) or "").strip()
        if value:
            return value
    return ""


def allowed_email_domains() -> set[str]:
    raw = (os.environ.get("ALLOWED_EMAIL_DOMAINS") or "").strip()
    source = raw.split(",") if raw else list(DEFAULT_ALLOWED_EMAIL_DOMAINS)
    return {part.strip().lower().lstrip("@") for part in source if part.strip()}


def email_domain_ok(email: str) -> bool:
    text = str(email or "").strip().lower()
    if "@" not in text:
        return False
    domain = text.rsplit("@", 1)[-1]
    if not domain or any(ch in domain for ch in " /"):
        return False
    allowed_domains = allowed_email_domains()
    if not allowed_domains:
        return True
    for allowed in allowed_domains:
        if domain == allowed or domain.endswith("." + allowed):
            return True
    return False


def ai_rate_allow(bucket: str) -> bool:
    now = time.time()
    key = str(bucket or "user")
    with _AI_RATE_LOCK:
        hits = [stamp for stamp in _AI_RATE_HITS.get(key, []) if now - stamp < _AI_RATE_WINDOW]
        if len(hits) >= _AI_RATE_LIMIT:
            _AI_RATE_HITS[key] = hits
            return False
        hits.append(now)
        _AI_RATE_HITS[key] = hits
        return True


def is_xai_key(key: str) -> bool:
    return str(key or "").strip().startswith("xai-")


def poe_family(model: str) -> bool:
    m = str(model or "").strip().lower()
    return m.startswith(("gpt-", "claude-", "gemini-"))


def resolve_model(key: str, requested: str) -> str:
    req = str(requested or "").strip()
    xai = is_xai_key(key)
    if xai and not env_poe_key():
        if req.lower().startswith("grok"):
            return req
        return str(os.environ.get("XAI_MODEL") or DEFAULT_XAI_MODEL).strip() or DEFAULT_XAI_MODEL
    if poe_family(req):
        return req
    if xai:
        if req.lower().startswith("grok"):
            return req
        return str(os.environ.get("XAI_MODEL") or DEFAULT_XAI_MODEL).strip() or DEFAULT_XAI_MODEL
    return req or DEFAULT_MODEL


def ai_status_payload() -> dict:
    key = env_ai_key()
    if is_xai_key(key):
        model = str(os.environ.get("XAI_MODEL") or DEFAULT_XAI_MODEL).strip() or DEFAULT_XAI_MODEL
        return {"ready": True, "provider": "xai", "model": model}
    if key:
        return {"ready": True, "provider": "poe", "model": DEFAULT_MODEL}
    return {"ready": False, "provider": "", "model": DEFAULT_MODEL}


def extract_json(text: str) -> dict:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.I)
        raw = re.sub(r"\s*```$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no_json")
    parsed = json.loads(raw[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("bad_json")
    return parsed


def parse_roster_text(text: str) -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    for raw in str(text or "").replace("\r", "").splitlines():
        line = raw.strip().strip("|").strip()
        if not line:
            continue
        if re.search(r"學號|姓名|^name$|^class$|班別|編號|gender|性別", line, re.I) and not re.match(r"^\d", line):
            continue
        parts = [p.strip() for p in re.split(r"[|,，\t]+", line) if p.strip()]
        if len(parts) < 2:
            parts = [p for p in re.split(r"\s+", line) if p]
        if len(parts) < 2:
            continue
        number = re.sub(r"\D", "", parts[0])
        if not number:
            continue
        name = parts[1]
        compact = re.sub(r"\s+", "", name)
        if len(compact) < 2 or re.match(r"^(姓名|name|學號)$", compact, re.I):
            continue
        english_parts: list[str] = []
        gender = ""
        mark = ""
        for piece in parts[2:]:
            token = piece.strip()
            if token in ("男", "M", "m"):
                gender = "M"
            elif token in ("女", "F", "f"):
                gender = "F"
            elif re.search(r"視|vision", token, re.I):
                mark = "vision"
            elif re.search(r"高|tall", token, re.I):
                mark = "tall"
            elif re.search(r"[A-Za-z]", token):
                english_parts.append(token)
        english = " ".join(english_parts)
        key = number.zfill(2)[-2:]
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "number": key,
            "name": name,
            "englishName": english,
            "gender": gender,
            "mark": mark,
        })
    return rows


def extract_students_payload(text: str) -> dict:
    raw = (text or "").strip()
    parsed: dict | None = None
    try:
        parsed = extract_json(raw)
    except (ValueError, json.JSONDecodeError):
        parsed = None
    if isinstance(parsed, dict):
        if isinstance(parsed.get("students"), list):
            return parsed
        for key in ("roster", "list", "rows", "data"):
            if isinstance(parsed.get(key), list):
                return {"className": str(parsed.get("className") or ""), "students": parsed[key]}
        if parsed.get("name") or parsed.get("number"):
            return {"students": [parsed]}
    start = raw.find("[")
    end = raw.rfind("]")
    if start >= 0 and end > start:
        try:
            arr = json.loads(raw[start : end + 1])
            if isinstance(arr, list) and arr:
                return {"students": arr}
        except json.JSONDecodeError:
            pass
    rows = parse_roster_text(raw)
    if rows:
        return {"students": rows}
    return {}


def teacher_names(teacher: dict) -> list[str]:
    teacher = teacher or {}
    names: list[str] = []
    for key in ("chineseName", "nickname", "firstName", "lastName"):
        value = str(teacher.get(key) or "").strip()
        if value:
            names.append(value)
    first = str(teacher.get("firstName") or "").strip()
    last = str(teacher.get("lastName") or "").strip()
    if first and last:
        names.extend([f"{first} {last}", f"{last} {first}"])
    out: list[str] = []
    seen: set[str] = set()
    for name in names:
        key = name.lower()
        if key not in seen:
            seen.add(key)
            out.append(name)
    return out


def event_blob(ev: dict) -> str:
    return " ".join(
        str(ev.get(k) or "")
        for k in ("title", "people", "description", "reason", "location", "className", "type", "matchReason")
    )


def split_terms(value: str) -> list[str]:
    return [p.strip() for p in re.split(r"[,，、;；\n]+", str(value or "")) if p.strip()]


def search_terms(teacher: dict, filters: dict | None) -> list[str]:
    names = teacher_names(teacher)
    filters = filters or {}
    for key in ("chineseName", "englishName", "englishFirst", "englishLast", "nicknameZh", "nicknameEn"):
        value = str(filters.get(key) or "").strip()
        if value:
            names.append(value)
    names.extend(split_terms(str(filters.get("classes") or "")))
    names.extend(split_terms(str(filters.get("others") or "")))
    out: list[str] = []
    seen: set[str] = set()
    for name in names:
        key = name.lower()
        if key not in seen:
            seen.add(key)
            out.append(name)
    return out


HAN_LEVEL = {"一": "1", "二": "2", "三": "3", "四": "4", "五": "5", "六": "6"}
HAN_LETTER = {"甲": "A", "乙": "B", "丙": "C", "丁": "D", "戊": "E", "己": "F", "庚": "G"}
PAGE_SPLIT_RE = re.compile(r"(?=\[第\d+頁\])")
PAGE_NO_RE = re.compile(r"\[第(\d+)頁\]")


def class_variants(raw: str) -> list[str]:
    value = str(raw or "").strip()
    if not value:
        return []
    compact = re.sub(r"\s+", "", value)
    out: list[str] = []
    seen: set[str] = set()
    def add(item: str) -> None:
        text = str(item or "").strip()
        if not text:
            return
        key = text.lower()
        if key in seen:
            return
        seen.add(key)
        out.append(text)
    add(value)
    add(compact)
    m = re.match(r"^中([一二三四五六])([A-Ga-g甲乙丙丁戊己庚])$", compact)
    if m:
        n = HAN_LEVEL[m.group(1)]
        letter = HAN_LETTER.get(m.group(2), m.group(2)).upper()
        add(f"中{m.group(1)}{letter}")
        add(f"中{m.group(1)} {letter}")
        add(f"S{n}{letter}")
        add(f"S.{n}{letter}")
        add(f"S.{n} {letter}")
    s = re.match(r"^S\.?([1-6])([A-Ga-g])$", compact, re.I)
    if s:
        n = s.group(1)
        letter = s.group(2).upper()
        han = ["", "一", "二", "三", "四", "五", "六"][int(n)]
        add(f"中{han}{letter}")
        add(f"中{han} {letter}")
        add(f"S{n}{letter}")
        add(f"S.{n}{letter}")
    return out


def latinish(value: str) -> bool:
    return bool(re.search(r"[A-Za-z]", value or "")) and not re.search(r"[\u4e00-\u9fff]", value or "")


def term_found(hay: str, term: dict) -> bool:
    needle = str(term.get("value") or "")
    if not needle:
        return False
    kind = term.get("kind") or ""
    if kind == "nick" and len(needle) == 1:
        return (
            f"{needle}老師" in hay
            or f"{needle}教師" in hay
            or f"{needle} Sir" in hay
            or f"{needle} sir" in hay
        )
    if latinish(needle) or re.search(r"[0-9]", needle):
        return re.search(
            r"(?i)(?<![A-Za-z0-9])" + re.escape(needle) + r"(?![A-Za-z0-9])",
            hay,
        ) is not None
    return needle in hay if len(needle) > 1 else False


def notice_search_terms(teacher: dict, filters: dict | None, classes: list[str] | None = None) -> list[dict]:
    filters = filters or {}
    out: list[dict] = []
    seen: set[str] = set()

    def add(raw: str, kind: str, weight: int) -> None:
        value = str(raw or "").strip()
        if not value:
            return
        key = f"{kind}:{value.lower()}"
        if key in seen:
            return
        seen.add(key)
        out.append({"value": value, "kind": kind, "weight": weight})

    add(str(filters.get("chineseName") or ""), "name", 5)
    add(str(filters.get("englishName") or ""), "name", 5)
    add(str(filters.get("englishFirst") or ""), "name", 4)
    add(str(filters.get("englishLast") or ""), "name", 4)
    add(str(filters.get("nicknameZh") or ""), "nick", 5)
    add(str(filters.get("nicknameEn") or ""), "name", 4)
    for key in ("chineseName", "nickname"):
        add(str((teacher or {}).get(key) or ""), "name" if key == "chineseName" else "nick", 5)
    en = str(filters.get("englishName") or "").strip()
    if not en:
        first = str(filters.get("englishFirst") or (teacher or {}).get("firstName") or "").strip()
        last = str(filters.get("englishLast") or (teacher or {}).get("lastName") or "").strip()
        en = " ".join(p for p in (first, last) if p)
        if first and last:
            add(f"{first} {last}", "name", 5)
            add(f"{last} {first}", "name", 5)
    if en and re.search(r"[A-Za-z]", en):
        parts = [p for p in re.split(r"[\s,.\-]+", en) if len(p) >= 2]
        if parts:
            add(parts[0], "weak", 2)
            if len(parts) > 1 and len(parts[-1]) >= 4:
                add(parts[-1], "weak", 2)
            for part in parts:
                if len(part) >= 5:
                    add(part, "name", 3)
    class_list = split_terms(str(filters.get("classes") or ""))
    for item in classes or []:
        class_list.append(str(item or "").strip())
    for item in class_list:
        for variant in class_variants(item):
            add(variant, "class", 4)
    for item in split_terms(str(filters.get("others") or "")):
        add(item, "other", 3)
    return out


def split_notice_chunks(text: str) -> list[dict]:
    raw = str(text or "").replace("\r", "")
    pages = PAGE_SPLIT_RE.split(raw) if raw else []
    chunks: list[dict] = []
    for page in pages:
        body = page.strip()
        if not body:
            continue
        hit = PAGE_NO_RE.search(body)
        page_no = int(hit.group(1)) if hit else 0
        if len(body) <= 1800:
            chunks.append({"page": page_no, "text": body})
            continue
        parts = re.split(r"\n(?=# |\n)", body)
        buf = ""
        for part in parts:
            if buf and len(buf) + 1 + len(part) > 1600:
                chunks.append({"page": page_no, "text": buf.strip()})
                buf = part
            else:
                buf = f"{buf}\n{part}" if buf else part
        if buf.strip():
            chunks.append({"page": page_no, "text": buf.strip()})
    if chunks:
        return chunks
    trimmed = raw.strip()
    return [{"page": 0, "text": trimmed}] if trimmed else []


def score_chunk(text: str, terms: list[dict]) -> dict:
    hay = str(text or "")
    score = 0
    hits: list[str] = []
    for term in terms:
        if not term_found(hay, term):
            continue
        score += int(term.get("weight") or 0)
        hits.append(str(term.get("value") or ""))
        value = str(term.get("value") or "")
        if term.get("kind") in ("weak", "name") and latinish(value):
            if (
                f"{value}老師" in hay
                or f"{value}教師" in hay
                or re.search(re.escape(value) + r"\s*(?:Sir|sir)", hay)
            ):
                score += 2
    if ALL_TEACHERS_RE.search(hay):
        score += 6
        hits.append("全體老師")
    if DUTY_RE.search(hay):
        score += 2
    seen: set[str] = set()
    unique: list[str] = []
    for hit in hits:
        key = hit.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(hit)
    return {"score": score, "hits": unique}


def select_notice_passages(
    text: str,
    teacher: dict | None = None,
    filters: dict | None = None,
    classes: list[str] | None = None,
    limit: int = 24000,
) -> dict:
    terms = notice_search_terms(teacher or {}, filters, classes)
    chunks = split_notice_chunks(text)
    ranked = []
    for i, chunk in enumerate(chunks):
        scored = score_chunk(chunk.get("text") or "", terms)
        ranked.append({**chunk, "i": i, **scored})
    pool = [c for c in ranked if c["score"] >= 3]
    if not pool:
        pool = sorted(ranked, key=lambda c: (-c["score"], c["i"]))[:8]
    if ranked and not any(c["i"] == 0 for c in pool) and "[第1頁]" in (ranked[0].get("text") or ""):
        head = dict(ranked[0])
        head["text"] = (head.get("text") or "")[:1400]
        pool = [head] + pool
    pool.sort(key=lambda c: (-c["score"], c["i"]))
    used: list[dict] = []
    n = 0
    for chunk in pool:
        block = str(chunk.get("text") or "").strip()
        if not block:
            continue
        extra = 4 if n else 0
        room = limit - n - extra
        if room < 280:
            continue
        take = block if len(block) <= room else block[:room]
        used.append({**chunk, "text": take})
        n += extra + len(take)
    used.sort(key=lambda c: c["i"])
    out = "\n\n".join(c["text"] for c in used)
    if not out.strip():
        out = str(text or "")[:limit]
    pages = []
    seen_pages: set[int] = set()
    for chunk in used:
        page = int(chunk.get("page") or 0)
        if page and page not in seen_pages:
            seen_pages.add(page)
            pages.append(page)
    hits: list[str] = []
    seen_hits: set[str] = set()
    for chunk in used:
        for hit in chunk.get("hits") or []:
            key = str(hit).lower()
            if key in seen_hits:
                continue
            seen_hits.add(key)
            hits.append(str(hit))
    return {
        "text": out,
        "pages": pages,
        "kept": len(used),
        "total": len(chunks),
        "hits": hits,
    }


def event_is_for_teacher(ev: dict, teacher: dict, source_text: str = "", filters: dict | None = None) -> bool:
    filters = filters or {}
    identity = teacher_names(teacher)
    for key in ("chineseName", "englishName", "englishFirst", "englishLast", "nicknameZh", "nicknameEn"):
        value = str(filters.get(key) or "").strip()
        if value:
            identity.append(value)
    classes = split_terms(str(filters.get("classes") or ""))
    others = split_terms(str(filters.get("others") or ""))
    blob = event_blob(ev)
    hay = f"{blob}\n{(source_text or '')[:24000]}"
    blob_l = blob.lower()
    if ALL_TEACHERS_RE.search(blob) or (
        ALL_TEACHERS_RE.search(hay) and (ev.get("type") == "duty" or DUTY_RE.search(blob))
    ):
        return True
    for name in identity:
        if not name:
            continue
        if len(name) == 1:
            if f"{name}老師" in hay or f"{name}教師" in hay or f"{name} Sir" in hay or f"{name} sir" in hay:
                return True
            continue
        if name.lower() in blob_l or name.lower() in hay.lower():
            return True
    for term in classes + others:
        if term.lower() in blob_l:
            return True
    if ev.get("relatedToTeacher") in (True, "true", 1, "1"):
        return True
    if not identity and not classes and not others:
        return True
    people = str(ev.get("people") or "")
    if re.search(r"老師|教師|teacher", people, re.I) and not ALL_TEACHERS_RE.search(people):
        return False
    if ev.get("type") == "duty" or DUTY_RE.search(blob):
        return False
    return True


def fetch_poe_models() -> dict:
    now = time.time()
    cached = _MODELS_CACHE.get("payload")
    if cached and now - float(_MODELS_CACHE.get("at") or 0) < 12 * 3600:
        return cached
    skip = re.compile(
        r"image|video|tts|music|canvas|imagine|seedance|kling|wan-|nano-banana|gpt-image|reel|voice",
        re.I,
    )
    owners = {"Anthropic", "OpenAI", "Google", "XAI", "xAI"}
    req = urllib.request.Request(POE_MODELS_URL, headers={"User-Agent": "teacher-work"})
    try:
        with urllib.request.urlopen(req, timeout=25, context=ssl.create_default_context()) as resp:
            items = json.loads(resp.read().decode("utf-8")).get("data") or []
    except Exception:
        payload = {"ids": STARTER_MODELS, "starter": DEFAULT_MODEL, "updated": ""}
        return payload
    official = []
    for item in items:
        mid = str(item.get("id") or "")
        if not mid or skip.search(mid):
            continue
        if (item.get("owned_by") or "") not in owners:
            continue
        official.append({"id": mid, "created": item.get("created") or 0})
    official.sort(key=lambda x: x["created"], reverse=True)
    ids: list[str] = []
    for sid in STARTER_MODELS:
        if sid not in ids:
            ids.append(sid)
    for rec in official:
        if rec["id"] not in ids:
            ids.append(rec["id"])
        if len(ids) >= 20:
            break
    if not ids:
        ids = list(STARTER_MODELS)
    starter = next((i for i in STARTER_MODELS if i in ids), ids[0])
    payload = {
        "ids": ids,
        "starter": starter,
        "updated": time.strftime("%Y-%m-%d %H:%M"),
    }
    _MODELS_CACHE["at"] = now
    _MODELS_CACHE["payload"] = payload
    return payload


def call_poe(
    key: str,
    messages: list,
    model: str,
    timeout: int = 90,
    temperature: float = 0.2,
    max_tokens: int | None = None,
    response_format: dict | None = None,
) -> str:
    key = str(key or "").strip()
    if not key:
        raise RuntimeError("missing_key")
    model = resolve_model(key, model)
    if poe_family(model):
        url = POE_URL
        if is_xai_key(key):
            poe = env_poe_key()
            if poe:
                key = poe
    elif is_xai_key(key) or str(model).lower().startswith("grok"):
        url = XAI_URL
    else:
        url = POE_URL
    payload = {
        "model": model,
        "temperature": temperature,
        "messages": messages,
    }
    if max_tokens:
        if url == XAI_URL:
            payload["max_completion_tokens"] = max_tokens
        else:
            payload["max_tokens"] = max_tokens
    if response_format and url == XAI_URL:
        payload["response_format"] = response_format
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")[:400]
        if response_format and err.code == 400 and url == XAI_URL:
            sys.stderr.write("response_format rejected, retry without schema\n")
            return call_poe(key, messages, model, timeout, temperature, max_tokens)
        if err.code in (401, 403):
            raise RuntimeError("bad_key") from err
        if err.code in (402, 429):
            raise RuntimeError("no_credits") from err
        raise RuntimeError(f"poe_http_{err.code}") from err
    except (urllib.error.URLError, TimeoutError) as err:
        raise RuntimeError("poe_timeout") from err
    return (raw.get("choices", [{}])[0].get("message", {}) or {}).get("content") or ""


def iso_day(value) -> str:
    raw = str(value or "").strip()[:10]
    return raw if re.match(r"^\d{4}-\d{2}-\d{2}$", raw) else ""


def parse_any_date(text: str, today: str = "") -> str:
    blob = str(text or "")
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", blob)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.search(r"(\d{1,2})\s*月\s*(\d{1,2})\s*日", blob)
    if m:
        year = (today or "")[:4] or "2026"
        try:
            return f"{int(year):04d}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
        except ValueError:
            return ""
    m = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", blob)
    if m:
        a, b, c = m.group(1), m.group(2), m.group(3)
        if len(c) == 2:
            c = "20" + c
        try:
            left, mid, year = int(a), int(b), int(c)
        except ValueError:
            return ""
        day, month = (left, mid) if left > 12 or mid <= 12 else (mid, left)
        if left <= 12 and mid <= 12:
            day, month = left, mid
        if 1 <= month <= 12 and 1 <= day <= 31:
            return f"{year:04d}-{month:02d}-{day:02d}"
    return ""


def date_in_span(day: str, start: str, end: str) -> bool:
    d = iso_day(day)
    if not d:
        return True
    if start and d < start:
        return False
    if end and d > end:
        return False
    return True


def date_in_window(value, start: str, end: str) -> bool:
    day = iso_day(value)
    if not day or not start or not end:
        return False
    return start <= day <= end


def event_in_window(ev: dict, start: str, end: str) -> bool:
    if not start or not end:
        return True
    posted = iso_day(ev.get("posted"))
    if posted and posted < start:
        return False
    return True


def _loose_date(match, today: str) -> str:
    if match.groupdict().get("ymd"):
        return match.group("ymd")
    if match.groupdict().get("m") and match.groupdict().get("d"):
        year = (today or "")[:4] or "2026"
        try:
            return f"{int(year):04d}-{int(match.group('m')):02d}-{int(match.group('d')):02d}"
        except ValueError:
            return ""
    blob = match.group(0)
    parts = re.split(r"[/-]", blob)
    if len(parts) != 3:
        return ""
    a, b, c = parts
    if len(c) == 2:
        c = "20" + c
    try:
        left, mid, year = int(a), int(b), int(c)
    except ValueError:
        return ""
    if left > 12:
        day, month = left, mid
    elif mid > 12:
        month, day = left, mid
    else:
        day, month = left, mid
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return ""
    return f"{year:04d}-{month:02d}-{day:02d}"


def heuristic_events(text: str, today: str = "") -> list[dict]:
    date_re = re.compile(
        r"(?P<ymd>\d{4}-\d{2}-\d{2})|"
        r"(?P<dmy>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|"
        r"(?P<m>\d{1,2})\s*月\s*(?P<d>\d{1,2})\s*日"
    )
    hint = re.compile(
        r"當值|值班|值日|巡堂|監考|會議|截止|deadline|繳交|查簿|observation|帶隊|工作分配|通告",
        re.I,
    )
    events: list[dict] = []
    seen: set[str] = set()
    for raw in re.split(r"[\n\r]+|\s{3,}", text or ""):
        line = re.sub(r"\s+", " ", raw).strip(" -–|·,，")
        if len(line) < 6 or len(line) > 200:
            continue
        if not hint.search(line):
            continue
        if GENERIC_TITLE_RE.match(line) or re.match(r"^\[(?:學校宣|職員通告|電子通告)", line):
            continue
        dm = date_re.search(line)
        date = _loose_date(dm, today) if dm else (today or "")
        title = date_re.sub("", line).strip(" -–|·,，")[:80] or line[:80]
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        kind = "duty" if DUTY_RE.search(line) else "other"
        if re.search(r"會議|meeting", line, re.I):
            kind = "meeting"
        elif re.search(r"截止|deadline|繳交", line, re.I):
            kind = "deadline"
        events.append({
            "title": title,
            "type": kind,
            "date": date,
            "posted": "",
            "time": "",
            "endDate": "",
            "endTime": "",
            "location": "",
            "people": "",
            "className": "",
            "description": line[:240],
            "reason": "notice-board",
            "relatedToTeacher": True,
            "matchReason": "通告",
        })
        if len(events) >= 20:
            break
    return events


def notice_system_prompt(
    today: str,
    classes: list[str],
    locale: str,
    teacher: dict,
    filters: dict | None,
    from_date: str = "",
    to_date: str = "",
) -> str:
    class_list = "、".join(classes) if classes else "（未提供班別）"
    lang = "Traditional Chinese (Hong Kong)" if locale != "en" else "English"
    terms = " / ".join(search_terms(teacher, filters)) or "(name not given)"
    start = iso_day(from_date)
    end = iso_day(to_date)
    window = (
        f"Date window (Hong Kong, inclusive): {start} to {end}.\n"
        "Prefer notices posted or updated in this window. Still include duties and events those notices announce, even if they happen later.\n"
        if start and end
        else ""
    )
    return f"""You write a briefing so this teacher does not need to open eClass.
The teacher works at their own school.
Today is {today}. This teacher's classes: {class_list}.
Search terms (name, nicknames, classes, extra): {terms}.
Sources are only 學校宣布, 職員通告, and 電子通告系統, including PDF attachments.
{window}Reply in {lang}. JSON only.

Keep an item if it is for THIS teacher: any search term matches, OR 全體老師當值 / all teachers on duty / all staff.
Include every matching announcement, circular, duty, deadline, meeting, exam paper deadline, lesson observation, and class work.
Omit items that only name other teachers.

For EACH kept item fill ALL of these:
- title: the real circular/notice title (e.g. 「中一A 數學查簿」). NEVER use 職員通告 / 學校宣布 / 電子通告系統 as the title.
- work: what the teacher must do (當值、監考、查簿、繳交試卷、會議、帶隊…).
- date, endDate: YYYY-MM-DD or "".
- time, endTime: HH:MM or "".
- location: room / hall / venue.
- className: which class (中一A, S1A…) or empty if whole school.
- people: who else is involved.
- source: 學校宣布 or 職員通告 or 電子通告系統.
- description: a short briefing of the work, class, time, and place. Do not copy letterhead.
- matchReason: which search term matched.
- posted: notice issue date if known.

Types: outing, meeting, deadline, examDeadline, inspection, observation, duty, other.
Keep only title, date, time, endTime, location, work, className, people, and a short description.
{DOCUMENT_CHROME}
Never invent student personal data. If notice text is attached, that text is the source. Use an image only when the page has no useful text layer."""


def collect_images(image, extra=None) -> list[str]:
    out: list[str] = []

    def add(raw) -> None:
        s = str(raw or "").strip()
        if s.startswith("data:image") and s not in out:
            out.append(s)

    add(image)
    if isinstance(extra, list):
        for item in extra:
            add(item)
    else:
        add(extra)
    return out[:3]


def decode_data_url(url: str) -> tuple[str, bytes]:
    raw = str(url or "").strip()
    if not raw.startswith("data:") or "," not in raw:
        return "", b""
    head, payload = raw.split(",", 1)
    mime = head[5:].split(";")[0].strip().lower()
    try:
        return mime, base64.b64decode(payload)
    except Exception:
        return mime, b""


def jpeg_data_url(img, quality: int = 90) -> str:
    from io import BytesIO
    from PIL import Image

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _orientation_score(img) -> tuple[float, float, float]:
    from PIL import Image

    g = img.convert("L")
    w = 160
    h = max(1, int(w * g.height / max(1, g.width)))
    g = g.resize((w, h), Image.BILINEAR)
    pix = g.load()
    rows = []
    for y in range(h):
        ink = sum(1 for x in range(w) if pix[x, y] < 200) / w
        rows.append(ink)
    cols = []
    for x in range(w):
        ink = sum(1 for y in range(h) if pix[x, y] < 200) / h
        cols.append(ink)
    row_diff = sum(abs(rows[i] - rows[i - 1]) for i in range(1, len(rows)))
    col_diff = sum(abs(cols[i] - cols[i - 1]) for i in range(1, len(cols)))
    band = max(1, h // 5)
    top = sum(rows[:band]) / band
    bot = sum(rows[-band:]) / band
    return row_diff, col_diff, top - bot


def upright_pil(img):
    from PIL import Image

    turns = [
        img,
        img.transpose(Image.ROTATE_90),
        img.transpose(Image.ROTATE_180),
        img.transpose(Image.ROTATE_270),
    ]
    best = None
    best_key = None
    for im in turns:
        row, col, topbot = _orientation_score(im)
        lined = 1.0 if row > col * 1.12 else 0.0
        key = (lined, topbot, row)
        if best_key is None or key > best_key:
            best_key = key
            best = im
    return best or img


def upright_image_data_url(url: str) -> str:
    mime, raw = decode_data_url(url)
    if not raw or not mime.startswith("image/"):
        return url
    try:
        from io import BytesIO
        from PIL import Image

        img = Image.open(BytesIO(raw))
        img.load()
        img = upright_pil(img)
        w, h = img.size
        max_px = 2200
        scale = min(1.0, max_px / max(w, h))
        if scale < 1:
            img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
        return jpeg_data_url(img, 90)
    except Exception:
        return url


def render_pdf_images(raw: bytes, max_pages: int = 3, max_px: int = 2200) -> list[str]:
    if not raw or raw[:4] != b"%PDF":
        return []
    try:
        import pypdfium2 as pdfium
    except ImportError:
        return []
    try:
        doc = pdfium.PdfDocument(raw)
        out: list[str] = []
        last = min(len(doc), max(1, max_pages))
        for i in range(last):
            page = doc[i]
            scale = min(2.6, max_px / max(page.get_width() or 1, page.get_height() or 1))
            img = page.render(scale=max(1.2, scale)).to_pil()
            img = upright_pil(img)
            out.append(jpeg_data_url(img, 90))
        return out
    except Exception as err:
        sys.stderr.write("pdf render fail %s\n" % str(err)[:160])
        return []


def prepare_document_images(kind: str, pics: list[str], pdf_url: str = "") -> list[str]:
    mime, raw = decode_data_url(pdf_url)
    max_pages = 2 if kind == "students" else 4 if kind in ("scheme", "timetable") else 3
    if raw[:4] == b"%PDF" or "pdf" in mime:
        rendered = render_pdf_images(raw, max_pages=max_pages)
        if rendered:
            return rendered
    out: list[str] = []
    for pic in pics:
        upright = upright_image_data_url(pic)
        if upright:
            out.append(upright)
    return out


def text_looks_useful(text: str) -> bool:
    compact = re.sub(r"\s+", "", str(text or ""))
    if len(compact) < 30:
        return False
    cjk = len(re.findall(r"[\u4e00-\u9fff]", compact))
    if cjk >= 24:
        return True
    words = re.findall(r"[A-Za-z]{3,}", compact)
    return len(words) >= 8 and len(compact) >= 80


def user_payload(prompt: str, image: str = "", images: list | None = None) -> dict:
    pics = collect_images(image, images)
    if pics:
        content = [{"type": "text", "text": prompt}]
        for url in pics:
            content.append({"type": "image_url", "image_url": {"url": url, "detail": "high"}})
        return {"role": "user", "content": content}
    return {"role": "user", "content": prompt}


def call_notice_ai(
    key: str,
    model: str,
    text: str,
    today: str,
    classes: list[str],
    locale: str,
    teacher: dict,
    filters: dict | None = None,
    image: str = "",
    from_date: str = "",
    to_date: str = "",
    images: list | None = None,
) -> dict:
    start = iso_day(from_date)
    end = iso_day(to_date)
    window = f"{start} 至 {end}" if start and end else ""
    images = collect_images(image, images)
    useful = text_looks_useful(text)
    selected = ""
    if useful:
        picked = select_notice_passages(text, teacher, filters, classes)
        selected = picked.get("text") or text[:24000]
        images = []
    prompt = (
        "Extract every item for THIS teacher. JSON only. "
        "Copy the real circular / calendar title. NEVER use 職員通告 / 學校宣布 / 電子通告系統 as the title. "
        "Fill work, date, time, endTime, location, className, people, and a short description from the notice body. "
        "Do not invent dates, duties, or names that are not in the notice body. "
        + DOCUMENT_CHROME + " "
        + (f"Prefer items in {window}. " if window else "")
    )
    if images:
        prompt += "The page is a scan with no text layer. Read the notice body only, not the letterhead.\n(see attached image)"
        partial = str(text or "").strip()
        if partial and not useful:
            prompt += "\n\nIncomplete extracted text. Use it together with the image:\n" + partial[:24000]
    else:
        prompt += "\n\n" + (selected or (text[:24000] if useful else "") or "(empty)")
    tt_model = model
    if images and is_xai_key(key) and not (poe_family(str(model or "")) and env_poe_key()):
        tt_model = "grok-4-fast"
    try:
        content = call_poe(
            key,
            [
                {
                    "role": "system",
                    "content": notice_system_prompt(today, classes, locale, teacher, filters, start, end),
                },
                user_payload(prompt, images=images),
            ],
            tt_model,
            timeout=120,
            temperature=0.15,
            max_tokens=8192,
            response_format=NOTICE_RESPONSE_FORMAT,
        )
    except RuntimeError as err:
        if images and str(err) in ("poe_timeout", "poe_http_404") and is_xai_key(key) and tt_model != model:
            content = call_poe(
                key,
                [
                    {
                        "role": "system",
                        "content": notice_system_prompt(today, classes, locale, teacher, filters, start, end),
                    },
                    user_payload(prompt, images=images),
                ],
                model,
                timeout=150,
                temperature=0.15,
                max_tokens=8192,
                response_format=NOTICE_RESPONSE_FORMAT,
            )
        else:
            raise
    if not content:
        raise RuntimeError("empty_model_response")
    try:
        parsed = extract_json(content)
    except (ValueError, json.JSONDecodeError) as err:
        raise RuntimeError("model_json_parse") from err
    parsed.setdefault("summary", "")
    parsed.setdefault("document_type", "")
    parsed.setdefault("kind", "notice")
    parsed.setdefault("events", [])
    if not isinstance(parsed["events"], list):
        parsed["events"] = []
    kept = []
    for ev in parsed["events"]:
        if not isinstance(ev, dict):
            continue
        if not event_is_for_teacher(ev, teacher, selected or text, filters):
            continue
        if not event_in_window(ev, start, end):
            continue
        ev.setdefault("relatedToTeacher", True)
        ev.setdefault("matchReason", "")
        kept.append(polish_event_title(ev))
    parsed["events"] = kept
    parsed["fromDate"] = start
    parsed["toDate"] = end
    if not kept and not images and text_looks_useful(selected or text):
        kept = heuristic_events(selected or text, end or today)
        parsed["events"] = kept
        kept = [polish_event_title(e) for e in kept]
        parsed["events"] = kept
        if kept and not parsed.get("summary"):
            parsed["summary"] = f"從通告抽出 {len(kept)} 項活動／當值，請核對後加入。"
    if kept and not parsed["summary"]:
        parsed["summary"] = f"找到 {len(kept)} 項（{window or today}）與這位老師相關的活動／當值。"
    return parsed


def call_extract_ai(
    key: str,
    model: str,
    kind: str,
    text: str,
    image: str,
    today: str,
    locale: str,
    classes: list[str],
    teacher: dict,
    filters: dict | None,
    images: list | None = None,
) -> dict:
    pics = collect_images(image, images)
    if text_looks_useful(text):
        pics = []
    if kind in ("notice", "calendar", ""):
        return call_notice_ai(key, model, text, today, classes, locale, teacher, filters, pics[0] if pics else "", from_date="", to_date="", images=pics)
    lang = "Traditional Chinese (Hong Kong)" if locale != "en" else "English"
    class_list = "、".join(classes) if classes else ""
    if kind == "students":
        system = f"""This is a CLASS REGISTER / 學生名單 / 選修科名單, NOT a school circular and NOT 通告／當值.
Extract every filled student row. {DOCUMENT_CHROME}
Reply in {lang}. JSON only:
{{"summary":"","className":"","students":[{{"number":"01","name":"","englishName":"","gender":"","mark":""}}]}}
Rules:
- className as printed (中一A / 5E / 4EG2). If the sheet is an elective list, use the class in the 班別 column (e.g. 5E).
- number is 班號 / NO. / 學號 as printed (1, 04, 16…). If there is a separate 班號 column, use that, not the left-hand 1,2,3 row index.
- name = Chinese 姓名 as printed. If only English is printed, put it in name.
- englishName = English name column when a separate English name is printed.
- gender M or F only if printed; otherwise "".
- mark empty, or vision, or tall, only if marked.
- Skip blank rows and header rows (姓名, Name, 學號, CLASS, NO.).
- NEVER invent names. If some rows are hard to read, skip those rows and still return the ones you can read.
- NEVER reply as a notice. NEVER use title 無法讀取 or 影像品質不足 instead of a students array.
Known classes: {class_list}."""
        prompt = (
            "Extract every filled student row. JSON only with a students array. Do not output 通告 or 當值. "
            + DOCUMENT_CHROME
        )
        if pics:
            prompt += "\n\nThe page is a scan with no text layer. Read the roster, not the letterhead.\n(see attached image)"
            if str(text or "").strip() and not text_looks_useful(text):
                prompt += "\n\nIncomplete extracted text. Use it together with the image:\n" + str(text).strip()[:24000]
        elif text:
            prompt += "\n\n" + text[:24000]
    elif kind == "scheme":
        system = f"""Extract a Hong Kong teaching scheme / 教學進度 / Scheme of work TABLE.
{DOCUMENT_CHROME}
Reply in {lang}. JSON only:
{{"summary":"","items":[{{"week":1,"topic":"第一課 我的家鄉","periods":6,"notes":"朗讀"}}]}}

Read the columns separately. Do not mix them.

- week / weekEnd: from the Week / 週次 column. Ranges like 1–2, 10–12, 23–24 MUST be week=1 weekEnd=2 (not 1 then 2 as separate invented rows, and not 1,2,3 sequential).
  A single week is week=13 weekEnd=13. JSON numbers, not strings.
- topic (課題): ONLY the Topic / 課題 column (e.g. Reproduction & Pollination, 第一課 我的家鄉).
  NEVER use Section No. (3.1–3.4, AO3, Mixed), school name, year, subject, 教學計劃, Week, Learning objectives, Knowledge, Skill, or Values as topic.
- periods (節數): ONLY a printed lesson-count column. If there is no 節數 column, use 0. NEVER use the week number as 節數.
- notes (備註): Assessment/Classwork or 備註 column only. Empty if blank. Do not dump learning objectives into notes.

Keep holiday rows (Christmas Holiday, Lunar New Year) as topic with that week's range.
Skip header rows. One JSON row per printed data row. Do not invent extra weeks."""
        prompt = (
            "Read the scheme table. "
            "Week column may be a RANGE (1–2, 10–12): output week and weekEnd. "
            "Topic column only for 課題. No 節數 column means periods=0. "
            "JSON only. " + DOCUMENT_CHROME
        )
        if pics:
            prompt += "\n\nThe page is a scan with no text layer. Read the table, not the letterhead.\n(see attached image)"
            if str(text or "").strip() and not text_looks_useful(text):
                prompt += "\n\nIncomplete extracted text. Use it together with the image:\n" + str(text).strip()[:24000]
        elif text:
            prompt += "\n\n" + text[:24000]
    else:
        system = f"""You rebuild a Hong Kong teacher's weekly TIMETABLE so the app can draw it cleanly.
{DOCUMENT_CHROME}

Do the work in this exact order. Do not skip a step.

STEP 1 — separate schedule?
A SEPARATE schedule means that day's BELL / TIMESLOT LIST is different (a different clock column for the whole day).
It does NOT mean different classes on different days (Mon 4EG2 vs Tue 5IAL on the SAME 09:00-09:35 bells is NOT separate).
Typical: 星期五 prints its own clocks (08:00-08:15, 08:15-08:45, …) while Mon–Thu share the left-column clocks (08:00-08:25, 08:25-09:00, …).
Put those weekday numbers in separateDays (Monday=1 … Friday=5). Empty array if every day uses the same bells.

STEP 2 — period structure
- periods: every LEFT-COLUMN time row in order (usually 16–20 rows, 08:00 through ~16:25). This is the Mon–Thu skeleton.
- dayPeriods: only for days in separateDays. That day's own clock list in order. Do not copy the left column onto a separate day.

STEP 3 — lessons
csv teaching rows + at most one break label per 小息/午膳/早會 band.
csv: 星期X,row,HH:MM,HH:MM,class,subject,room
row is the index in THAT day's period list from step 2.

THIS IS A CLOCK-ROW GRID, not 「第1節…第8節」.
- Teaching cells: 4EG2 生物 N604 / 5IAL 生物 N604 / 6IAL 生物 N604. Keep codes EXACTLY (4EG2 not 4E; 5IAL not 5A).
- Copy subject as printed. Empty if none. NEVER write 數學 unless the cell itself says 數學 or Math.
- NEVER invent 08:15-08:55. NEVER stop at 8 rows. Blank = no lesson.
- 小息 / 午膳 / 學習重點整理隨課節 = kind=break (className 小息 or 午膳), not a class.

NO OVERLAP (required):
- On each weekday, intervals must be disjoint. Touching is OK (08:45-09:15 then 09:35-10:05).
- A double period is TWO consecutive non-overlapping ranges, e.g. 08:15-08:45 and 08:45-09:15.
- Never emit two teaching lessons at the same time on the same day.
- Never emit a lesson and 小息/午膳 covering the same minutes.

Reply in {lang}. JSON only:
{{"summary":"","separateDays":[5],"periods":[{{"startTime":"08:00","endTime":"08:25"}}],"dayPeriods":{{"5":[{{"startTime":"08:00","endTime":"08:15"}}]}},"csv":"星期三,3,09:00,09:35,4EG2,生物,N604"}}
Known classes: {class_list}.
Today is {today}."""
        prompt = (
            "Work in 3 steps: "
            "(1) which days have a different TIMESLOT list (not just different classes), "
            "(2) write the main period structure plus any separate-day clocks, "
            "(3) write every lesson with class, subject, room. "
            "No overlapping times on the same weekday. "
            "小息/午膳 as break bars, not classes. Do not default subject to 數學. "
            + DOCUMENT_CHROME
        )
        if pics:
            prompt += "\n\nThe page is a scan with no text layer. Read the grid, not the letterhead.\n(see attached image)"
            if str(text or "").strip() and not text_looks_useful(text):
                prompt += "\n\nIncomplete extracted text. Use it together with the image:\n" + str(text).strip()[:24000]
        elif text:
            prompt += "\n\n" + text[:24000]
        else:
            prompt += "\n\n(see attached image)"
    use_images = pics
    tt_timeout = 120 if kind == "timetable" else 90
    tt_max = 16384 if kind == "timetable" else 8192
    tt_model = model
    if pics and is_xai_key(key) and not (poe_family(str(model or "")) and env_poe_key()):
        tt_model = "grok-4-fast"
    try:
        content = call_poe(
            key,
            [{"role": "system", "content": system}, user_payload(prompt, images=use_images)],
            tt_model,
            timeout=tt_timeout,
            temperature=0.1 if kind in ("timetable", "students", "scheme") else 0.2,
            max_tokens=tt_max,
        )
    except RuntimeError as err:
        if pics and str(err) in ("poe_timeout", "poe_http_404") and is_xai_key(key) and tt_model != model:
            content = call_poe(
                key,
                [{"role": "system", "content": system}, user_payload(prompt, images=use_images)],
                model,
                timeout=150,
                temperature=0.1,
                max_tokens=tt_max,
            )
        else:
            raise
    if not content:
        if kind != "students":
            raise RuntimeError("empty_model_response")
        content = ""
    if kind == "students":
        parsed = extract_students_payload(content)
    else:
        try:
            parsed = extract_json(content)
        except (ValueError, json.JSONDecodeError):
            parsed = {}
    if not isinstance(parsed, dict):
        parsed = {}
    parsed.setdefault("summary", "")
    parsed["kind"] = kind
    if kind == "students":
        parsed = finish_students_parse(parsed)
        if not parsed.get("students") and pics:
            sys.stderr.write("students parse miss first=%s\n" % (content or "")[:400])
            retry_prompt = (
                "This page is a scan of a student name list / 班名單. "
                "Ignore school logo, letterhead, 發文編號, stamps, 抄送/副本 columns, signature footers, and watermarks. "
                "Output JSON only {\"className\":\"\",\"students\":[{\"number\":\"01\",\"name\":\"\"}]}. "
                "Read every roster row you can. Do not invent names from the chrome. "
                "Do not mention 通告, 當值, or image quality.\n\n(see attached image)"
            )
            retry_model = resolve_model(key, model)
            if retry_model == tt_model:
                retry_model = "grok-4.6" if is_xai_key(key) else model
            try:
                content2 = call_poe(
                    key,
                    [{"role": "system", "content": system}, user_payload(retry_prompt, images=use_images)],
                    retry_model,
                    timeout=120,
                    temperature=0.1,
                    max_tokens=tt_max,
                )
                parsed2 = extract_students_payload(content2)
                parsed2["kind"] = "students"
                retry = finish_students_parse(parsed2)
                if retry.get("students"):
                    parsed = retry
            except Exception as err:
                sys.stderr.write("students retry fail %s\n" % str(err)[:120])
    elif kind == "scheme":
        parsed = finish_scheme_parse(parsed)
    else:
        parsed = finish_timetable_parse(parsed, content, text if not pics else "", classes)
    return parsed


def finish_students_parse(parsed: dict) -> dict:
    parsed.setdefault("className", "")
    rows = parsed.get("students") if isinstance(parsed.get("students"), list) else []
    out = []
    seen: set[str] = set()
    for item in rows:
        if isinstance(item, str):
            loose = parse_roster_text(item)
            if not loose:
                continue
            item = loose[0]
        if not isinstance(item, dict):
            continue
        english = str(item.get("englishName") or item.get("english") or "").strip()
        raw_name = str(item.get("name") or item.get("chineseName") or item.get("studentName") or "").strip() or english
        name = re.sub(r"\s+", "", raw_name)
        if not name or len(name) < 2:
            continue
        if re.match(r"^(姓名|name|學號|班別|class|編號|no\.?)$", name, re.I):
            continue
        if re.search(r"無法讀取|影像品質|通告|當值", raw_name):
            continue
        number = re.sub(r"\D", "", str(item.get("number") or item.get("no") or ""))
        if number:
            number = number.zfill(2)[-2:]
        gender_raw = str(item.get("gender") or "").strip()
        if gender_raw in ("男", "M", "m"):
            gender = "M"
        elif gender_raw in ("女", "F", "f"):
            gender = "F"
        else:
            gender = gender_raw.upper()[:1]
            if gender not in ("M", "F"):
                gender = ""
        mark = str(item.get("mark") or "").strip().lower()
        if mark not in ("vision", "tall"):
            mark = ""
        key = number or name
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "number": number,
            "name": raw_name,
            "englishName": english,
            "gender": gender,
            "mark": mark,
        })
    parsed["students"] = out[:40]
    parsed["kind"] = "students"
    if out:
        parsed["summary"] = f"抽出 {len(out)} 名學生。"
    else:
        parsed["summary"] = ""
    return parsed


SCHEME_HEADER_RE = re.compile(
    r"^(週次|周次|week|課題|topic|title|節數|periods?|備註|notes?|教學重點|教學計劃|教學進度|scheme of work|scheme)$",
    re.I,
)
SCHEME_JUNK_RE = re.compile(r"萬鈞|伯裘|書院|學年|學期|上學期|下學期|科主任|教師姓名|班級|班別|封面|目錄|進度表")


def parse_scheme_week(raw) -> tuple[int, int]:
    if isinstance(raw, (int, float)) and 1 <= int(raw) <= 40:
        n = int(raw)
        return n, n
    s = str(raw or "").strip()
    s = re.sub(r"[至~—–－−]", "-", s)
    m = re.fullmatch(r"(\d{1,2})\s*-\s*(\d{1,2})", s)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if 1 <= a <= 40 and a <= b <= 40:
            return a, b
    m = re.fullmatch(r"(\d{1,2})", s)
    if m:
        a = int(m.group(1))
        if 1 <= a <= 40:
            return a, a
    return 0, 0


def parse_scheme_periods(raw) -> int:
    s = str(raw or "").strip()
    if not s or re.search(r"年|月|日|page|頁", s):
        return 0
    m = re.fullmatch(r"(\d{1,2})(?:\s*(?:節|堂|periods?))?", s, re.I)
    if not m:
        return 0
    n = int(m.group(1))
    return n if 1 <= n <= 16 else 0


def is_scheme_topic(topic: str) -> bool:
    t = re.sub(r"\s+", " ", str(topic or "")).strip()
    if len(t) < 2 or len(t) > 48:
        return False
    if SCHEME_HEADER_RE.match(t) or SCHEME_JUNK_RE.search(t):
        return False
    if re.fullmatch(r"(中國語文|英國語文|數學|通識|公民與社會發展)", t):
        return False
    if re.fullmatch(r"[\d\s\-–—/.年月日]+", t):
        return False
    if re.fullmatch(r"第\s*\d+\s*(週|周|week)\s*", t, re.I):
        return False
    if re.fullmatch(r"\d+(\.\d+)?[A-Z]?(?:\s*[-–—]\s*\d+(\.\d+)?[A-Z]?)?", t):
        return False
    if re.fullmatch(r"(AO\d+|Mixed)", t, re.I):
        return False
    if re.search(r"[\u4e00-\u9fff]", t):
        return True
    if re.fullmatch(r"[A-Za-z][A-Za-z0-9 &/:'()+.-]{2,47}", t):
        return True
    return len(t.split()) >= 2


def clean_scheme_notes(raw: str, topic: str) -> str:
    n = re.sub(r"\s+", " ", str(raw or "")).strip()
    if not n or SCHEME_HEADER_RE.match(n) or SCHEME_JUNK_RE.search(n):
        return ""
    if topic and (n == topic or (n in topic and len(n) < 8)):
        return ""
    if re.fullmatch(r"[\d\s\-–—/.]+", n):
        return ""
    return n[:80]


def clean_scheme_item(row: dict, fallback_week: int = 0) -> dict | None:
    topic = re.sub(r"\s+", " ", str(row.get("topic") or row.get("title") or "")).strip()
    topic = re.sub(r"^\d+\s*[\.、．]\s*", "", topic)
    topic = re.sub(r"^第\s*\d+\s*(?:週|周|week)\s*[:：.\s]*", "", topic, flags=re.I)
    periods = parse_scheme_periods(row.get("periods") if row.get("periods") is not None else row.get("lessons"))
    notes = clean_scheme_notes(str(row.get("notes") or row.get("remark") or ""), topic)
    split = re.match(r"^(.*?)(?:\s+|，|,)(\d{1,2})\s*(?:節|堂)\s*(.*)$", topic)
    if split and is_scheme_topic(split.group(1)):
        topic = split.group(1).strip()
        if not periods:
            periods = parse_scheme_periods(split.group(2))
        if not notes:
            notes = clean_scheme_notes(split.group(3), topic)
    if not is_scheme_topic(topic):
        return None
    start, end = parse_scheme_week(row.get("week") if row.get("week") is not None else row.get("weekStart") or row.get("weekNo"))
    extra_end = parse_scheme_week(row.get("weekEnd"))[1] if row.get("weekEnd") not in (None, "") else 0
    if extra_end >= start > 0:
        end = extra_end
    if not (1 <= start <= 40):
        start, end = parse_scheme_week(fallback_week)
    if not (1 <= start <= 40):
        return None
    if end < start:
        end = start
    notes = clean_scheme_notes(str(row.get("notes") or row.get("remark") or row.get("assessment") or ""), topic) or notes
    return {"week": start, "weekEnd": end, "topic": topic[:48], "periods": periods, "notes": notes}


def finish_scheme_parse(parsed: dict) -> dict:
    rows = parsed.get("items") if isinstance(parsed.get("items"), list) else parsed.get("weeks")
    if not isinstance(rows, list):
        rows = []
    out = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        cleaned = clean_scheme_item(item, 0)
        if cleaned:
            out.append(cleaned)
    parsed["items"] = out[:40]
    if out and not parsed.get("summary"):
        parsed["summary"] = f"抽出 {len(out)} 週教學進度。"
    return parsed


def slots_to_csv(slots: list[dict]) -> str:
    days = {1: "星期一", 2: "星期二", 3: "星期三", 4: "星期四", 5: "星期五", 6: "星期六", 7: "星期日"}
    lines = []
    for s in slots:
        wd = days.get(int(s.get("weekday") or 0), str(s.get("weekday") or "星期一"))
        lines.append(
            ",".join([
                wd,
                str(s.get("period") or 1),
                str(s.get("startTime") or ""),
                str(s.get("endTime") or ""),
                str(s.get("className") or ""),
                str(s.get("subject") or ""),
                str(s.get("room") or ""),
            ])
        )
    return "\n".join(lines)


CSV_LINE_RE = re.compile(
    r"^(?:星期|週|周)?[一二三四五六日天1-7]|mon|tue|wed|thu|fri|sat|sun",
    re.I,
)
NAMED_ROOM_RE = re.compile(r"禮堂|操場|體育館|電腦室|音樂室|視藝室|實驗室|活動室|圖書館|多媒體|演講廳")
CLASS_CELL_PY = re.compile(
    r"(中\s*[一二三四五六]\s*[A-G甲乙丙丁戊己]|S\.?\s*[1-6]\s*[A-G]|[1-6]\s*EG\s*\d|[1-6]\s*IAL|[1-6]\s*IA[L1]|[1-6]\s*[A-G]\d?)",
    re.I,
)


def parse_clock_py(raw: str) -> str:
    s = str(raw or "").replace("：", ":").replace(".", ":").replace("；", ":").strip()
    pm = bool(re.search(r"下午|pm", s, re.I))
    am = bool(re.search(r"上午|am", s, re.I))
    m = re.search(r"(\d{1,2})\s*[:時hH點]\s*(\d{2})", s)
    if m:
        hour = int(m.group(1))
        if pm and hour < 12:
            hour += 12
        if am and hour == 12:
            hour = 0
        if hour > 23:
            return ""
        return f"{hour:02d}:{m.group(2)}"
    m = re.match(r"^(\d{1,2})(\d{2})$", s)
    if m and int(m.group(1)) <= 23:
        hour = int(m.group(1))
        if pm and hour < 12:
            hour += 12
        return f"{hour:02d}:{m.group(2)}"
    return ""


def clock_minutes_py(hhmm: str) -> int:
    m = re.match(r"^(\d{1,2}):(\d{2})$", str(hhmm or ""))
    if not m:
        return -1
    return int(m.group(1)) * 60 + int(m.group(2))


def add_clock_minutes_py(hhmm: str, delta: int) -> str:
    t = clock_minutes_py(hhmm)
    if t < 0:
        return ""
    t = max(0, min(23 * 60 + 59, t + delta))
    return f"{t // 60:02d}:{t % 60:02d}"


def extract_csv_from_text(text: str) -> str:
    lines: list[str] = []
    for raw in str(text or "").replace("\\n", "\n").splitlines():
        line = raw.strip().strip("`").replace("，", ",")
        if not line or line.startswith("{") or line.startswith("["):
            continue
        if re.search(r"節數|period|className|班別|startTime|weekday", line, re.I) and not parse_clock_py(line):
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 5:
            continue
        if not (CSV_LINE_RE.search(parts[0]) or parse_weekday_py(parts[0])):
            continue
        if not re.search(r"\d", parts[1] or ""):
            continue
        lines.append(",".join(parts[:7]))
        if len(lines) >= 48:
            break
    return "\n".join(lines)


def csv_blob(value) -> str:
    if isinstance(value, list):
        return "\n".join(str(x).strip() for x in value if str(x).strip())
    return str(value or "").replace("\\n", "\n").strip()


def split_tt_line_py(line: str) -> list[str]:
    t = re.sub(r"^#\s+", "", str(line or "")).strip()
    if not t:
        return []
    if "\t" in t:
        return [p.strip() for p in t.split("\t") if p.strip()]
    if t.count("，") >= 3:
        return [p.strip() for p in t.split("，") if p.strip()]
    if t.count(",") >= 3:
        return [p.strip() for p in t.split(",") if p.strip()]
    if t.count("|") >= 2:
        return [p.strip() for p in t.split("|") if p.strip() and p.strip() != "#"]
    return [p for p in re.split(r"\s{2,}|\s+", t) if p]


def parse_class_cell_py(cell: str) -> dict | None:
    s = re.sub(r"\s+", " ", str(cell or "")).strip()
    if not s or re.match(r"^(空(?:堂)?|備課|—+|-+|nil|free|n/?a|no\s*lesson|\.)$", s, re.I):
        return None
    hit = CLASS_CELL_PY.search(s)
    if not hit:
        hit = re.search(r"\b([1-6]\s*[A-G]|[A-G]\s*[1-6])\b", s, re.I)
    if not hit:
        return None
    class_name = re.sub(r"\s+", "", hit.group(0))
    rest = s.replace(hit.group(0), " ", 1)
    return {
        "className": class_name,
        "room": room_from_cell_py(rest) or room_from_cell_py(s),
        "subject": subject_from_cell_py(s) or "",
    }


def parse_timetable_grid_py(text: str) -> list[dict]:
    lines = []
    for raw in str(text or "").replace("\r", "").splitlines():
        line = re.sub(r"^\[第\d+頁\]\s*", "", raw)
        line = re.sub(r"^#\s+", "", line).strip()
        if line:
            lines.append(line)
    header_parts: list[str] = []
    day_cols: list[tuple[int, int]] = []
    header_at = -1
    for i, line in enumerate(lines):
        parts = split_tt_line_py(line)
        cols = [(j, parse_weekday_py(p)) for j, p in enumerate(parts)]
        cols = [(j, w) for j, w in cols if 1 <= w <= 5]
        if len(cols) >= 3 and len(cols) >= len(day_cols):
            header_parts = parts
            day_cols = cols
            header_at = i
    if header_at < 0 or len(day_cols) < 3:
        return []
    body = lines[header_at + 1 :]
    has_period_nums = False
    for line in body:
        parts = split_tt_line_py(line)
        p0 = re.sub(r"\D", "", parts[0] if parts else "")
        p1 = re.sub(r"\D", "", parts[1] if len(parts) > 1 else "")
        n0 = int(p0) if p0 else 0
        n1 = int(p1) if p1 else 0
        if 1 <= n0 <= 12 or 1 <= n1 <= 12:
            has_period_nums = True
            break
    slots: list[dict] = []
    period = 0
    last_had_class = False
    period_times: dict[int, tuple[str, str]] = {}

    def line_range(line: str):
        m = re.search(r"(\d{1,2}[:.：]\d{2})\s*[-–~至到]\s*(\d{1,2}[:.：]\d{2})", line or "")
        if not m:
            return "", ""
        return parse_clock_py(m.group(1)), parse_clock_py(m.group(2))

    for idx, line in enumerate(body):
        parts = split_tt_line_py(line)
        if len(parts) < 2:
            continue
        start, end = line_range(line)
        if not start:
            start, end = line_range(body[idx + 1] if idx + 1 < len(body) else "")
        if not start and idx:
            start, end = line_range(body[idx - 1])
        p_raw0 = parts[0] if parts else ""
        p_raw1 = parts[1] if len(parts) > 1 else ""
        p_hit = 0
        for raw in (p_raw0, p_raw1):
            m = re.search(r"第?\s*(\d{1,2})\s*節", raw)
            digits = m.group(1) if m else re.sub(r"\D", "", raw)
            n = int(digits) if digits else 0
            if 1 <= n <= 24:
                p_hit = n
                break
        extra = max(0, len(parts) - len(header_parts))
        cells = []
        for j, w in day_cols:
            raw = parts[j + extra] if j + extra < len(parts) else (parts[j] if j < len(parts) else "")
            cells.append((w, raw, parse_class_cell_py(raw)))
        row_has_class = any(c[2] for c in cells)
        room_only = (not row_has_class) and any(
            re.match(r"^\d{3,4}[A-Za-z]?$", c[1] or "") or NAMED_ROOM_RE.search(c[1] or "")
            for c in cells
        )
        if room_only and period:
            for w, raw, _ in cells:
                room = room_from_cell_py(raw)
                if not room:
                    continue
                for s in reversed(slots):
                    if s["weekday"] == w and s["period"] == period and not s.get("room"):
                        s["room"] = room
                        break
            continue
        if p_hit:
            period = p_hit
        elif not row_has_class:
            if start and period:
                period_times[period] = (start, end)
            continue
        elif not has_period_nums:
            if not period:
                period = 1
            elif last_had_class:
                period += 1
        elif not period:
            period = 1
        if period < 1 or period > 24:
            continue
        if start and end:
            period_times[period] = (start, end)
        clock = period_times.get(period) or (start, end)
        for w, _raw, parsed in cells:
            if not parsed:
                continue
            slots.append({
                "weekday": w,
                "period": period,
                "startTime": clock[0] or "",
                "endTime": clock[1] or "",
                "className": parsed["className"],
                "subject": parsed["subject"],
                "room": parsed["room"],
            })
        last_had_class = row_has_class
    return slots


def csv_to_slot_dicts(csv: str) -> list[dict]:
    out: list[dict] = []
    for line in str(csv or "").splitlines():
        line = line.strip().strip("`").replace("，", ",")
        if not line:
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 5:
            continue
        if len(parts) >= 7:
            item = {
                "weekday": parts[0],
                "period": parts[1],
                "startTime": parts[2],
                "endTime": parts[3],
                "className": parts[4],
                "subject": parts[5] or "",
                "room": parts[6],
            }
        elif len(parts) == 6:
            item = {
                "weekday": parts[0],
                "period": parts[1],
                "startTime": parts[2],
                "endTime": parts[3],
                "className": parts[4],
                "subject": "" if re.match(r"^[A-Za-z]?\d{2,4}[A-Za-z]?$", parts[5] or "") else (parts[5] or ""),
                "room": parts[5] if re.match(r"^[A-Za-z]?\d{2,4}[A-Za-z]?$", parts[5] or "") else "",
            }
        elif not parse_clock_py(parts[2] if len(parts) > 2 else ""):
            item = {
                "weekday": parts[0],
                "period": parts[1],
                "startTime": "",
                "endTime": "",
                "className": parts[2],
                "subject": parts[3] if len(parts) > 3 else "",
                "room": parts[4] if len(parts) > 4 else "",
            }
        else:
            continue
        out.append(item)
    return out


def room_from_cell_py(raw: str) -> str:
    s = str(raw or "")
    named = NAMED_ROOM_RE.search(s)
    if named:
        return named.group(0)
    labeled = re.search(r"(?:課室|教室|Rm\.?|Room)\s*([A-Za-z]?\d{2,4}[A-Za-z]?)", s, re.I)
    if labeled:
        return labeled.group(1).upper()
    bare = re.search(r"\b([A-Za-z]?\d{3,4}[A-Za-z]?)\b", s)
    if bare and not re.match(r"^(19|20)\d{2}$", bare.group(1)):
        return bare.group(1).upper()
    return ""


def subject_from_cell_py(raw: str) -> str:
    s = str(raw or "")
    tests = [
        (r"數學|math", "數學"),
        (r"中國語文|中文科?|chinese", "中國語文"),
        (r"英國語文|英文科?|english", "英國語文"),
        (r"公民|通識|csd", "公民與社會發展"),
        (r"物理|physics", "物理"),
        (r"化學|chemistry", "化學"),
        (r"生物|biology", "生物"),
        (r"科學|science", "科學"),
        (r"歷史|history", "歷史"),
        (r"地理|geography", "地理"),
        (r"經濟|econ", "經濟"),
        (r"企業|bafs", "企業、會計與財務概論"),
        (r"資訊及通訊|電腦|ict", "資訊及通訊科技"),
        (r"視藝|visual\s*art", "視覺藝術"),
        (r"音樂|music", "音樂"),
        (r"體育|\bpe\b|physical", "體育"),
        (r"宗教|ethics", "宗教"),
    ]
    for pat, name in tests:
        if re.search(pat, s, re.I):
            return "Mathematics" if name == "數學" and re.search(r"math", s, re.I) and "數學" not in s else name
    return ""


def collect_period_times(slots: list[dict], text: str) -> dict[int, tuple[str, str]]:
    found: dict[int, tuple[str, str]] = {}
    for s in slots:
        try:
            p = int(s.get("period") or 0)
        except (TypeError, ValueError):
            p = 0
        a, b = str(s.get("startTime") or ""), str(s.get("endTime") or "")
        if p and a and b and p not in found:
            found[p] = (a, b)
    for m in re.finditer(
        r"(?:第\s*)?(\d{1,2})\s*節[^0-9]{0,16}(\d{1,2}[:.：時]\d{2})\s*[-–~至到]\s*(\d{1,2}[:.：時]\d{2})",
        text or "",
    ):
        p = int(m.group(1))
        a, b = parse_clock_py(m.group(2)), parse_clock_py(m.group(3))
        if 1 <= p <= 24 and a and b and p not in found:
            found[p] = (a, b)
    if len(found) < 2:
        ranges = re.findall(
            r"(\d{1,2}[:.：時]\d{2})\s*[-–~至到]\s*(\d{1,2}[:.：時]\d{2})",
            text or "",
        )
        n = 1
        for a_raw, b_raw in ranges[:12]:
            if n not in found:
                a, b = parse_clock_py(a_raw), parse_clock_py(b_raw)
                if a and b:
                    found[n] = (a, b)
            n += 1
    if found:
        keys = sorted(found)
        a0, b0 = found[keys[0]]
        dur = clock_minutes_py(b0) - clock_minutes_py(a0)
        if dur <= 0:
            dur = 40
        last = max(keys)
        for p in range(1, last + 1):
            if p in found:
                continue
            prev = found.get(p - 1)
            if not prev:
                continue
            start = add_clock_minutes_py(prev[1], 5)
            t = clock_minutes_py(start)
            if 12 * 60 + 20 <= t < 13 * 60 + 40:
                start = "13:50"
            end = add_clock_minutes_py(start, dur)
            if start and end:
                found[p] = (start, end)
    return found


def intervals_overlap(a0: int, a1: int, b0: int, b1: int) -> bool:
    if a0 < 0 or a1 < 0 or b0 < 0 or b1 < 0:
        return False
    return a0 < b1 and b0 < a1


def slot_rank(s: dict) -> float:
    n = 0.0
    kind = str(s.get("kind") or "")
    name = str(s.get("className") or "")
    if kind != "break" and not re.search(r"小息|午膳|recess|lunch", name):
        n += 4
    if s.get("room"):
        n += 2
    sub = str(s.get("subject") or "")
    if sub and sub != "數學":
        n += 2
    dur = clock_minutes_py(s.get("endTime") or "") - clock_minutes_py(s.get("startTime") or "")
    if dur > 0:
        n += min(dur, 80) / 40.0
    return n


def drop_overlapping_slots(slots: list[dict]) -> list[dict]:
    by_day: dict[int, list] = {}
    leftover: list[dict] = []
    for s in slots or []:
        try:
            wd = int(s.get("weekday") or 0)
        except (TypeError, ValueError):
            wd = 0
        if not wd:
            leftover.append(s)
            continue
        by_day.setdefault(wd, []).append(s)
    out = list(leftover)
    for _wd, group in by_day.items():
        group = sorted(
            group,
            key=lambda s: (
                clock_minutes_py(s.get("startTime") or "") if clock_minutes_py(s.get("startTime") or "") >= 0 else 99 * 60,
                -slot_rank(s),
            ),
        )
        kept: list[dict] = []
        for s in group:
            a0 = clock_minutes_py(s.get("startTime") or "")
            a1 = clock_minutes_py(s.get("endTime") or "")
            hit = next(
                (
                    k
                    for k in kept
                    if intervals_overlap(
                        a0,
                        a1,
                        clock_minutes_py(k.get("startTime") or ""),
                        clock_minutes_py(k.get("endTime") or ""),
                    )
                ),
                None,
            )
            if not hit:
                kept.append(s)
                continue
            same = str(s.get("className") or "") and str(s.get("className")) == str(hit.get("className") or "")
            if same:
                hit_end = clock_minutes_py(hit.get("endTime") or "")
                if hit_end >= 0 and a1 > hit_end:
                    s = dict(s)
                    s["startTime"] = hit.get("endTime")
                    if clock_minutes_py(s.get("startTime") or "") < a1:
                        kept.append(s)
                continue
            if slot_rank(s) > slot_rank(hit):
                kept[kept.index(hit)] = s
        out.extend(kept)
    return out


def merge_slot_lists(*lists: list) -> list[dict]:
    seen: dict[str, dict] = {}
    order: list[str] = []
    for lst in lists:
        for s in lst or []:
            if not isinstance(s, dict):
                continue
            class_name = str(s.get("className") or "").strip()
            weekday = s.get("weekday")
            if not class_name or not weekday:
                continue
            key = f"{weekday}|{s.get('period')}|{re.sub(r'\s+', '', class_name)}"
            if key not in seen:
                seen[key] = dict(s)
                order.append(key)
                continue
            prev = seen[key]
            for field in ("startTime", "endTime", "room"):
                if not prev.get(field) and s.get(field):
                    prev[field] = s[field]
            sub = str(s.get("subject") or "")
            if (not prev.get("subject") or prev.get("subject") == "數學") and sub and sub != "數學":
                prev["subject"] = sub
    return [seen[k] for k in order]


def complete_timetable_slots(slots: list[dict], text: str = "") -> list[dict]:
    clocks = collect_period_times(slots, text)
    out: list[dict] = []
    for s in slots:
        try:
            period = int(s.get("period") or 1)
        except (TypeError, ValueError):
            period = 1
        if period < 1:
            period = 1
        if period > 24:
            continue
        bell = clocks.get(period)
        start = str(s.get("startTime") or "") or (bell[0] if bell else "")
        end = str(s.get("endTime") or "") or (bell[1] if bell else "")
        class_name = str(s.get("className") or "").strip()
        class_name = re.sub(r"61AL", "6IAL", class_name, flags=re.I)
        class_name = re.sub(r"SIAL", "5IAL", class_name, flags=re.I)
        room = str(s.get("room") or "").strip() or room_from_cell_py(f"{class_name} {s.get('room') or ''}")
        room = re.sub(r"NG0?4", "N604", room, flags=re.I)
        subject = str(s.get("subject") or "").strip()
        found = subject_from_cell_py(f"{class_name} {subject} {room}")
        if found:
            subject = found
        elif subject == "數學" and not re.search(r"數學|math", f"{class_name} {s.get('subject') or ''} {room}", re.I):
            subject = ""
        hit = CLASS_CELL_PY.search(class_name)
        if hit:
            class_name = re.sub(r"\s+", "", hit.group(0))
        out.append({
            "weekday": s.get("weekday"),
            "period": period,
            "startTime": start,
            "endTime": end,
            "className": class_name,
            "subject": subject,
            "room": room,
        })
    return drop_overlapping_slots(out)[:80]


def periods_payload(raw, slots: list[dict], blob: str) -> list[dict]:
    clocks: dict[int, tuple[str, str]] = {}
    n = 0
    if isinstance(raw, list):
        for item in raw:
            a = b = ""
            p = 0
            if isinstance(item, str):
                m = re.search(
                    r"(\d{1,2}[:.：]\d{2})\s*[-–~至到]\s*(\d{1,2}[:.：]\d{2})",
                    item,
                )
                if m:
                    a, b = parse_clock_py(m.group(1)), parse_clock_py(m.group(2))
            elif isinstance(item, dict):
                try:
                    p = int(item.get("period") or 0)
                except (TypeError, ValueError):
                    p = 0
                a = parse_clock_py(item.get("startTime") or item.get("start") or "")
                b = parse_clock_py(item.get("endTime") or item.get("end") or "")
            if not (a and b):
                continue
            n += 1
            if p < 1 or p > 24:
                p = n
            clocks[p] = (a, b)
    for p, pair in collect_period_times(slots, blob).items():
        clocks.setdefault(p, pair)
    return [{"period": p, "startTime": a, "endTime": b} for p, (a, b) in sorted(clocks.items())]


def normalize_separate_days(raw) -> list[int]:
    out: list[int] = []
    if isinstance(raw, str):
        raw = re.split(r"[,、\s]+", raw)
    if not isinstance(raw, list):
        return out
    for item in raw:
        wd = parse_weekday_py(item)
        if not wd:
            try:
                wd = int(item)
            except (TypeError, ValueError):
                wd = 0
        if 1 <= wd <= 5 and wd not in out:
            out.append(wd)
    return out


def parse_day_period_sections(blob: str) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    current = ""
    for line in str(blob or "").replace("\r", "").split("\n"):
        raw = line.strip()
        if not raw or len(raw) > 80:
            if len(raw) > 80:
                current = ""
            continue
        head = re.sub(r"^#+\s*", "", raw)
        day_head = re.fullmatch(r"(?:星期|週|周)([一二三四五1-5])時段", head)
        if day_head:
            wd = parse_weekday_py(day_head.group(0))
            if wd:
                current = str(wd)
                out.setdefault(current, [])
            continue
        if re.fullmatch(r"(時段|時間表結構|結構|bells?|periods?|times?)", head, re.I):
            current = ""
            continue
        if re.fullmatch(r"(課堂|課節|slots?|lessons?)", head, re.I):
            current = ""
            continue
        if not current:
            continue
        m = re.search(
            r"(?:^|,|\s)(\d{1,2})?[,.\s]*(\d{1,2}[:.：]\d{2})\s*[,~\-–至到]?\s*(\d{1,2}[:.：]\d{2})",
            raw,
        )
        if not m:
            continue
        a, b = parse_clock_py(m.group(2)), parse_clock_py(m.group(3))
        if a and b:
            out[current].append({"startTime": a, "endTime": b})
    return {k: v for k, v in out.items() if len(v) >= 2}


def day_periods_payload(raw, separate_days: list[int], slots: list[dict], blob: str) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    if isinstance(raw, dict):
        for key, val in raw.items():
            wd = parse_weekday_py(key)
            if not wd:
                try:
                    wd = int(key)
                except (TypeError, ValueError):
                    wd = 0
            if wd < 1 or wd > 5:
                continue
            rows = periods_payload(val if isinstance(val, list) else [], [], "")
            if len(rows) >= 2:
                out[str(wd)] = rows
    for key, rows in parse_day_period_sections(blob).items():
        out.setdefault(key, [{"period": i + 1, "startTime": r["startTime"], "endTime": r["endTime"]} for i, r in enumerate(rows)])
    wanted = set(separate_days) | {int(k) for k in out}
    for wd in wanted:
        if str(wd) in out:
            continue
        times: list[tuple[str, str]] = []
        seen: set[str] = set()
        for s in slots or []:
            try:
                if int(s.get("weekday") or 0) != wd:
                    continue
            except (TypeError, ValueError):
                continue
            a, b = str(s.get("startTime") or ""), str(s.get("endTime") or "")
            if not a or not b:
                continue
            key = f"{a}-{b}"
            if key in seen:
                continue
            seen.add(key)
            times.append((a, b))
        times.sort(key=lambda pair: clock_minutes_py(pair[0]))
        if len(times) >= 2:
            out[str(wd)] = [{"period": i + 1, "startTime": a, "endTime": b} for i, (a, b) in enumerate(times)]
    return out


def finish_timetable_parse(parsed: dict, content: str, text: str, classes: list[str]) -> dict:
    csv = csv_blob(parsed.get("csv"))
    if not csv:
        csv = extract_csv_from_text(content)
    raw_slots = parsed.get("slots")
    extra: list = []
    if isinstance(raw_slots, list):
        for item in raw_slots:
            if isinstance(item, dict) and (item.get("className") or item.get("class") or item.get("cls")):
                extra.append(item)
            elif isinstance(item, str) and item.strip():
                extra.extend(csv_to_slot_dicts(item))
    if not extra:
        fallback = parsed.get("timetable") or parsed.get("lessons") or []
        extra = fallback if isinstance(fallback, list) else []
    json_slots = normalize_timetable_slots(extra, classes)
    csv_slots = normalize_timetable_slots(csv_to_slot_dicts(csv), classes)
    grid_slots = normalize_timetable_slots(parse_timetable_grid_py(text), classes)
    blob = f"{text}\n{content}\n{csv}"
    merged = complete_timetable_slots(merge_slot_lists(json_slots, csv_slots, grid_slots), blob)
    separate = normalize_separate_days(parsed.get("separateDays") or parsed.get("separate_days"))
    day_periods = day_periods_payload(parsed.get("dayPeriods") or parsed.get("day_periods"), separate, merged, blob)
    for key in day_periods:
        try:
            wd = int(key)
        except (TypeError, ValueError):
            continue
        if wd not in separate:
            separate.append(wd)
    parsed["slots"] = merged
    parsed["csv"] = slots_to_csv(merged) if merged else csv

    def _wd(item: dict) -> int:
        try:
            return int(item.get("weekday") or 0)
        except (TypeError, ValueError):
            return parse_weekday_py(item.get("weekday"))

    parsed["periods"] = periods_payload(
        parsed.get("periods"),
        [s for s in merged if _wd(s) not in separate],
        blob,
    )
    parsed["separateDays"] = separate
    parsed["dayPeriods"] = day_periods
    if merged and not parsed.get("summary"):
        parsed["summary"] = f"抽出 {len(merged)} 節課堂。"
    return parsed


def parse_weekday_py(raw) -> int:
    if isinstance(raw, (int, float)) and 1 <= int(raw) <= 7:
        return int(raw)
    s = str(raw or "").strip()
    if re.fullmatch(r"[1-7]", s):
        return int(s)
    tests = [
        (r"mon|星期[一1]|週[一1]|周[一1]", 1),
        (r"tue|星期[二2]|週[二2]|周[二2]", 2),
        (r"wed|星期[三3]|週[三3]|周[三3]", 3),
        (r"thu|星期[四4]|週[四4]|周[四4]", 4),
        (r"fri|星期[五5]|週[五5]|周[五5]", 5),
        (r"sat|星期[六6]|週[六6]|周[六6]", 6),
        (r"sun|星期[日天7]|週[日天7]|周[日天7]", 7),
    ]
    for pat, n in tests:
        if re.search(pat, s, re.I):
            return n
    return 0


def normalize_timetable_slots(raw: list, classes: list[str]) -> list[dict]:
    known = [str(c) for c in (classes or []) if str(c).strip()]
    variants = {}
    for name in known:
        for v in class_variants(name):
            variants[v.replace(" ", "").lower()] = name
    out: list[dict] = []
    seen: dict[str, dict] = {}
    for item in raw[:60]:
        if not isinstance(item, dict):
            continue
        weekday = parse_weekday_py(item.get("weekday") or item.get("day") or item.get("weekDay"))
        period_raw = str(item.get("period") or item.get("p") or "")
        p_hit = re.search(r"第?\s*(\d{1,2})\s*節", period_raw)
        if p_hit:
            period_n = int(p_hit.group(1))
        else:
            digits = re.sub(r"\D", "", period_raw)
            period_n = int(digits) if digits else 1
        if period_n < 1:
            period_n = 1
        if period_n > 24:
            continue
        start = parse_clock_py(item.get("startTime") or item.get("start") or item.get("from") or "")
        end = parse_clock_py(item.get("endTime") or item.get("end") or item.get("to") or "")
        class_name = str(item.get("className") or item.get("class") or item.get("cls") or "").strip()
        blob = " ".join(
            str(item.get(k) or "")
            for k in ("className", "class", "cls", "room", "venue", "subject", "cell", "text")
        )
        if re.search(r"空堂|備課|^\s*[—.\-]+\s*$", class_name):
            continue
        class_hit = CLASS_CELL_PY.search(class_name) or CLASS_CELL_PY.search(blob)
        if class_hit:
            class_name = re.sub(r"\s+", "", class_hit.group(0))
        compact = re.sub(r"\s+", "", class_name).lower()
        if compact in variants:
            class_name = variants[compact]
        subject = str(item.get("subject") or "").strip() or subject_from_cell_py(blob) or ""
        if subject == "數學" and not re.search(r"數學|math", blob, re.I):
            subject = subject_from_cell_py(blob) or ""
        room = str(item.get("room") or item.get("venue") or "").strip() or room_from_cell_py(blob)
        if not weekday or not class_name:
            continue
        key = f"{weekday}|{period_n}|{class_name}"
        prev = seen.get(key)
        row = {
            "weekday": weekday,
            "period": period_n,
            "startTime": start,
            "endTime": end,
            "className": class_name,
            "subject": subject,
            "room": room,
        }
        if prev:
            if not prev.get("startTime") and start:
                prev["startTime"] = start
            if not prev.get("endTime") and end:
                prev["endTime"] = end
            if not prev.get("room") and room:
                prev["room"] = room
            if (not prev.get("subject") or prev.get("subject") == "數學") and subject and subject != "數學":
                prev["subject"] = subject
            continue
        seen[key] = row
        out.append(row)
    return out


CHAT_OPS = (
    "add_event",
    "add_class",
    "update_class",
    "add_student",
    "update_student",
    "add_homework",
    "update_homework",
    "set_homework_status",
    "add_lesson",
    "update_lesson",
    "add_timetable_slot",
    "add_behavior",
    "add_absence",
    "add_scheme_item",
    "assign_seat",
    "shuffle_seats",
    "none",
)


def chat_system_prompt(context: dict, locale: str) -> str:
    teacher = context.get("teacher") or {}
    lang = "Traditional Chinese (Hong Kong)" if locale != "en" else "English"
    classes = context.get("classes") or []
    students = context.get("students") or []
    homework = context.get("homework") or []
    lessons = context.get("lessons") or []
    return f"""You are the in-app assistant for Teacher Work Platform.
Teacher: {teacher.get('chineseName') or ''} {teacher.get('firstName') or ''} {teacher.get('lastName') or ''} (nickname {teacher.get('nickname') or ''}).
Today: {context.get('today')}.
Known classes: {json.dumps(classes, ensure_ascii=False)[:2000]}
Students: {json.dumps(students, ensure_ascii=False)[:4000]}
Homework: {json.dumps(homework, ensure_ascii=False)[:3000]}
Recent lessons: {json.dumps(lessons, ensure_ascii=False)[:2500]}
Seat plans: {json.dumps(context.get('seatPlans') or [], ensure_ascii=False)[:1500]}
Timetable: {json.dumps(context.get('timetable') or [], ensure_ascii=False)[:1500]}

Reply in {lang}. Be helpful, not stubborn.
Return JSON only:
{{"reply":"string","actions":[{{"op":"...","title":"","type":"","date":"","time":"","location":"","people":"","className":"","description":"","missing":"","name":"","year":"","subject":"","number":"","gender":"","studentName":"","homeworkTitle":"","status":"","period":"","topic":"","content":"","homeworkNote":"","weekday":"","startTime":"","endTime":"","room":"","tag":"","kind":"","points":"","action":"","startDate":"","endDate":"","reason":"","week":"","notes":"","row":"","col":"","rows":"","cols":""}}]}}

You CAN operate the whole site. Use actions:
- add_class / update_class (name, year, subject, periods)
- add_student / update_student (className, number, name, gender)
- add_homework / update_homework (className, title, type, assignedDate as date, dueDate in date if you only have due, description). Homework types: essay, worksheet, reading, dictation, recording, project, other.
- set_homework_status (homeworkTitle, studentName or number, className, status: submitted|late|missing|pending|excused)
- add_lesson / update_lesson (className, date, period, topic, content, homeworkNote, status: completed|partial|planned)
- add_event (title, type: inspection|examDeadline|deadline|meeting|outing|observation|duty|other, date, time, location, people, className, description)
- add_timetable_slot (weekday 1-5 Mon-Fri, period, startTime, endTime, className, subject, room)
- add_behavior (studentName, className, tag, kind positive|negative, description)
- add_absence (studentName, className, startDate, endDate, reason)
- add_scheme_item (className, year, week, topic, periods, notes)
- assign_seat (className, studentName, row 1-based, col 1-based)
- shuffle_seats (className)
- none when only chatting

If the teacher assigns homework, ALWAYS emit add_homework so it appears on the Homework page. If they also describe the lesson, emit add_lesson too with homeworkNote.
If a required field is missing (class name when there are several classes, student name, homework title), do NOT guess: set actions to [] and ASK in reply. If there is only one class, you may use it.
If time or place is blank for an event, still add it and mention the gap once in missing.
Dates YYYY-MM-DD, times HH:MM, or empty strings. Unused fields empty strings.
"""


DATA = ROOT / "data"
USERS_PATH = DATA / "users.json"
SESS_PATH = DATA / "sessions.json"

def call_chat_ai(key: str, model: str, messages: list, context: dict, locale: str) -> dict:
    content = call_poe(
        key,
        [{"role": "system", "content": chat_system_prompt(context, locale)}] + messages[-12:],
        model,
    )
    if not content:
        raise RuntimeError("empty_model_response")
    try:
        parsed = extract_json(content)
    except (ValueError, json.JSONDecodeError) as err:
        return {"reply": content[:2000], "actions": []}
    parsed.setdefault("reply", "")
    actions = parsed.get("actions") or []
    if not isinstance(actions, list):
        actions = []
    clean = []
    for act in actions:
        if not isinstance(act, dict):
            continue
        op = str(act.get("op") or "none")
        if op not in CHAT_OPS:
            op = "none"
        act["op"] = op
        clean.append(act)
    parsed["actions"] = clean
    return parsed


def call_seat_ai(key: str, model: str, payload: dict, locale: str) -> dict:
    lang = "Traditional Chinese (Hong Kong)" if locale != "en" else "English"
    students = payload.get("students") if isinstance(payload.get("students"), list) else []
    clean_students = []
    ids: set[str] = set()
    for item in students[:80]:
        if not isinstance(item, dict):
            continue
        sid = str(item.get("id") or "").strip()
        if not sid or sid in ids:
            continue
        ids.add(sid)
        clean_students.append({
            "id": sid,
            "number": str(item.get("number") or "")[:8],
            "name": str(item.get("name") or "")[:40],
            "englishName": str(item.get("englishName") or "")[:40],
            "gender": "F" if str(item.get("gender") or "") == "F" else "M",
            "mark": str(item.get("mark") or "")[:12],
        })
    rows = max(1, min(12, int(payload.get("rows") or 5)))
    cols = max(1, min(10, int(payload.get("cols") or 4)))
    blocked = [str(k) for k in (payload.get("blocked") or []) if re.match(r"^\d+-\d+$", str(k))]
    locked_raw = payload.get("locked") if isinstance(payload.get("locked"), list) else []
    locked = []
    for item in locked_raw[:80]:
        if isinstance(item, dict):
            locked.append({
                "key": str(item.get("key") or ""),
                "studentId": str(item.get("studentId") or ""),
            })
        elif isinstance(item, str):
            locked.append({"key": item, "studentId": ""})
    avoid = []
    for item in payload.get("avoidPairs") or []:
        if isinstance(item, dict):
            avoid.append([str(item.get("a") or ""), str(item.get("b") or "")])
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            avoid.append([str(item[0]), str(item[1])])
    note = str(payload.get("note") or "")[:4000]
    system = f"""You arrange a Hong Kong classroom seating plan.
Reply in {lang}. JSON only:
{{"seats":{{"0-0":"studentId"}},"avoid":[["id","id"]],"front":["id"],"back":["id"],"together":[["id","id"]]}}
Rules:
- Seat keys are row-col, row 0 is nearest the blackboard, col 0 is the teacher's left.
- Grid is {rows} rows by {cols} columns.
- Use each student id at most once. Do not invent ids. You may name students in avoid/front/back/together; they will be mapped to ids.
- Do not seat anyone on blocked seats.
- Keep locked seats unchanged.
- Avoid pairs must not share an orthogonal neighbour (front, back, left, right).
- Honour mix genders, vision-care in front rows, taller students at the back when those flags are on.
- The teacher's free-text note is REQUIRED. Parse every clause:
  sit apart / 不要同坐 / 分開 → avoid
  sit together / 一起 / 旁邊 → together
  front / 前排 / 靠近黑板 → front
  back / 後排 → back
  視力較弱靠近黑板 → every student with mark=vision in front
  高個子後排 → every student with mark=tall in back
- Names in the note may be Chinese, English, given name, or 學號/班號.
seats must cover as many students as possible."""
    user = json.dumps({
        "students": clean_students,
        "rows": rows,
        "cols": cols,
        "blocked": blocked,
        "locked": locked,
        "avoidPairs": avoid,
        "mix": bool(payload.get("mix")),
        "visionFront": bool(payload.get("visionFront")),
        "tallBack": bool(payload.get("tallBack")),
        "mode": str(payload.get("mode") or ""),
        "note": note,
    }, ensure_ascii=False)
    content = call_poe(
        key,
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        model,
        timeout=90,
    )
    if not content:
        raise RuntimeError("empty_model_response")
    try:
        parsed = extract_json(content)
    except (ValueError, json.JSONDecodeError) as err:
        raise RuntimeError("model_json_parse") from err
    raw_seats = parsed.get("seats") if isinstance(parsed.get("seats"), dict) else {}
    seats: dict[str, str] = {}
    used: set[str] = set()

    def resolve_sid(token: str) -> str:
        t = str(token or "").strip()
        if not t:
            return ""
        if t in ids:
            return t
        compact = re.sub(r"\s+", "", t)
        num = re.sub(r"\D", "", t)
        best = ""
        for s in clean_students:
            if t == s["id"]:
                return s["id"]
            if num and num.lstrip("0") == str(s["number"] or "").lstrip("0") and num.lstrip("0"):
                if re.search(r"號|no\.?|學號|班號", t, re.I) or t == s["number"]:
                    return s["id"]
            for n in (s["name"], s["englishName"]):
                if not n:
                    continue
                if t == n or compact == re.sub(r"\s+", "", n):
                    return s["id"]
                if len(compact) >= 2 and compact in re.sub(r"\s+", "", n):
                    best = s["id"]
                if len(n) >= 2 and n in t:
                    return s["id"]
            for w in str(s["englishName"] or "").split():
                if len(w) >= 3 and re.search(rf"(?i)(?:^|[^A-Za-z]){re.escape(w)}(?:[^A-Za-z]|$)", t):
                    best = best or s["id"]
        return best

    for key, sid in raw_seats.items():
        k = str(key)
        if not re.match(r"^\d+-\d+$", k):
            continue
        r, c = k.split("-")
        if int(r) >= rows or int(c) >= cols:
            continue
        if k in blocked:
            continue
        sid_s = resolve_sid(str(sid or "").strip())
        if not sid_s or sid_s not in ids or sid_s in used:
            continue
        seats[k] = sid_s
        used.add(sid_s)

    def id_list(value):
        out = []
        seen: set[str] = set()
        if not isinstance(value, list):
            return out
        for item in value:
            sid = resolve_sid(str(item or "").strip())
            if sid in ids and sid not in seen:
                seen.add(sid)
                out.append(sid)
        return out

    def pair_list(value):
        out = []
        seen: set[str] = set()
        if not isinstance(value, list):
            return out
        for item in value:
            a = b = ""
            if isinstance(item, dict):
                a, b = str(item.get("a") or ""), str(item.get("b") or "")
            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                a, b = str(item[0]), str(item[1])
            a, b = resolve_sid(a), resolve_sid(b)
            if a not in ids or b not in ids or a == b:
                continue
            key = "|".join(sorted((a, b)))
            if key in seen:
                continue
            seen.add(key)
            out.append([a, b])
        return out

    return {
        "seats": seats,
        "avoid": pair_list(parsed.get("avoid")),
        "front": id_list(parsed.get("front")),
        "back": id_list(parsed.get("back")),
        "together": pair_list(parsed.get("together")),
    }


def _read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def _write_json(path: Path, payload) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def hash_secret(value: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", value.encode("utf-8"), salt.encode("utf-8"), 120000)
    return salt, digest.hex()


def check_secret(value: str, salt: str, digest: str) -> bool:
    _, got = hash_secret(value, salt)
    return hmac.compare_digest(got, digest)


def public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "firstName": u.get("firstName") or "",
        "lastName": u.get("lastName") or "",
        "chineseName": u.get("chineseName") or "",
        "nickname": u.get("nickname") or "",
    }


def find_user_by_google(sub: str, email: str) -> dict | None:
    email = email.strip().lower()
    for u in _read_json(USERS_PATH, {"users": []}).get("users", []):
        if sub and u.get("googleSub") == sub:
            return u
        if email and u.get("email") == email:
            return u
    return None


def ticket_secret() -> bytes:
    path = DATA / "ticket-secret.txt"
    DATA.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raw = path.read_bytes().strip()
        if raw:
            return raw
    raw = secrets.token_bytes(32)
    path.write_bytes(raw)
    return raw


def make_google_ticket(sub: str, email: str) -> str:
    payload = json.dumps(
        {"sub": sub, "email": email, "exp": int(time.time()) + 30 * 60},
        separators=(",", ":"),
    ).encode()
    body = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    sig = hmac.new(ticket_secret(), body.encode(), hashlib.sha256).hexdigest()
    return body + "." + sig


def read_google_ticket(token: str) -> dict | None:
    try:
        body, sig = str(token or "").split(".", 1)
    except ValueError:
        return None
    expect = hmac.new(ticket_secret(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expect, sig):
        return None
    padded = body + "=" * (-len(body) % 4)
    try:
        data = json.loads(base64.urlsafe_b64decode(padded))
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict) or float(data.get("exp") or 0) < time.time():
        return None
    if not data.get("sub") or not data.get("email"):
        return None
    return data


def verify_google_credential(credential: str) -> dict:
    client_id = (os.environ.get("GOOGLE_CLIENT_ID") or "").strip()
    credential = str(credential or "").strip()
    if not client_id or not credential:
        raise ValueError("no_google")
    url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + quote(credential, safe="")
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            info = json.loads(res.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError, OSError):
        raise ValueError("bad_google")
    if str(info.get("aud") or "") != client_id:
        raise ValueError("bad_google")
    if str(info.get("email_verified") or "").lower() != "true":
        raise ValueError("email")
    try:
        if int(info.get("exp") or 0) < time.time():
            raise ValueError("bad_google")
    except (TypeError, ValueError):
        raise ValueError("bad_google")
    email = str(info.get("email") or "").strip().lower()
    sub = str(info.get("sub") or "").strip()
    if not email or not sub:
        raise ValueError("bad_google")
    info["email"] = email
    info["sub"] = sub
    return info


def find_user(email: str) -> dict | None:
    email = email.strip().lower()
    for u in _read_json(USERS_PATH, {"users": []}).get("users", []):
        if u.get("email") == email:
            return u
    return None


_USER_LOCK = threading.Lock()
# The free host deletes data/ on every restart. This key seals a copy of the
# account that the browser keeps, so the next login can put it back.
# Prefer ACCOUNT_SEAL_HEX (64 hex chars) when Render has it. The hardcoded
# bytes stay so capsules already in browsers still open. Remove the fallback
# only after every teacher has logged in once under the env seal.
_ACCOUNT_SEAL_FALLBACK = bytes.fromhex("a88813568c307f361fc000334d660a74be526e2675f0bbb7fde5d4b010f058de")


def account_seals() -> list[bytes]:
    seals: list[bytes] = []
    raw = (os.environ.get("ACCOUNT_SEAL_HEX") or "").strip().lower()
    if re.fullmatch(r"[0-9a-f]{64}", raw):
        seals.append(bytes.fromhex(raw))
    if _ACCOUNT_SEAL_FALLBACK not in seals:
        seals.append(_ACCOUNT_SEAL_FALLBACK)
    return seals


def _active_seal() -> bytes:
    return account_seals()[0]
_CAPSULE_FIELDS = (
    "id", "email", "salt", "password_hash",
    "firstName", "lastName", "chineseName", "nickname",
    "googleSub", "recovery_salt", "recovery_hash", "recovery_exp",
)


def save_user(user: dict) -> None:
    with _USER_LOCK:
        db = _read_json(USERS_PATH, {"users": []})
        users = db.get("users") or []
        for i, u in enumerate(users):
            if u.get("id") == user["id"] or u.get("email") == user["email"]:
                users[i] = user
                break
        else:
            users.append(user)
        _write_json(USERS_PATH, {"users": users})


def _seal_stream(seal: bytes, nonce: bytes, size: int) -> bytes:
    out = b""
    counter = 0
    while len(out) < size:
        out += hashlib.sha256(seal + nonce + counter.to_bytes(4, "big")).digest()
        counter += 1
    return out[:size]


def issue_capsule(user: dict) -> str:
    payload = {key: user.get(key) if key != "email" else str(user.get("email") or "").strip().lower() for key in _CAPSULE_FIELDS}
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    nonce = secrets.token_bytes(16)
    seal = _active_seal()
    mask = _seal_stream(seal, nonce, len(raw))
    cipher = bytes(a ^ b for a, b in zip(raw, mask))
    mac = hmac.new(seal, nonce + cipher, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(nonce + mac + cipher).decode().rstrip("=")


def open_capsule(token: str) -> dict | None:
    token = str(token or "").strip()
    if not token or len(token) > 8000:
        return None
    try:
        padded = token + "=" * (-len(token) % 4)
        blob = base64.urlsafe_b64decode(padded.encode())
    except (ValueError, TypeError):
        return None
    if len(blob) < 16 + 32 + 2:
        return None
    nonce, mac, cipher = blob[:16], blob[16:48], blob[48:]
    data = None
    for seal in account_seals():
        expect = hmac.new(seal, nonce + cipher, hashlib.sha256).digest()
        if not hmac.compare_digest(expect, mac):
            continue
        mask = _seal_stream(seal, nonce, len(cipher))
        try:
            data = json.loads(bytes(a ^ b for a, b in zip(cipher, mask)).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None
        break
    if data is None:
        return None
    if not isinstance(data, dict):
        return None
    email = str(data.get("email") or "").strip().lower()
    if not email or not data.get("id") or not data.get("salt") or not data.get("password_hash"):
        return None
    data["email"] = email
    return data


def capsule_from_map(capsules, email: str) -> str:
    if not isinstance(capsules, dict):
        return ""
    want = email.strip().lower()
    for key, value in list(capsules.items())[:30]:
        if str(key).strip().lower() == want:
            return str(value or "")[:8000]
    return ""


def account_for_login(email: str, password: str, capsule: str) -> dict | None:
    """Return the account for this password. If a restart forgot it, restore the sealed copy."""
    user = find_user(email)
    if user:
        if check_secret(password, user.get("salt") or "", user.get("password_hash") or ""):
            return user
        return None
    pending = open_capsule(capsule)
    if not pending or pending.get("email") != email:
        return None
    if not check_secret(password, pending.get("salt") or "", pending.get("password_hash") or ""):
        return None
    save_user(pending)
    return pending


def account_for_google(sub: str, email: str, capsules) -> dict | None:
    """Return the Google account, restoring a sealed copy when the host forgot it."""
    user = find_user_by_google(sub, email)
    if user:
        if user.get("googleSub") != sub:
            user["googleSub"] = sub
            save_user(user)
        return user
    pending = open_capsule(capsule_from_map(capsules, email))
    if not pending or pending.get("email") != email:
        return None
    bound = str(pending.get("googleSub") or "")
    if bound and bound != sub:
        return None
    pending["googleSub"] = sub
    save_user(pending)
    return pending


def new_session(user_id: str) -> str:
    token = secrets.token_urlsafe(24)
    db = _read_json(SESS_PATH, {"sessions": {}})
    sessions = db.get("sessions") or {}
    sessions[token] = {"userId": user_id, "exp": time.time() + 60 * 60 * 24 * 14}
    _write_json(SESS_PATH, {"sessions": sessions})
    return token


def user_from_token(token: str) -> dict | None:
    if not token:
        return None
    db = _read_json(SESS_PATH, {"sessions": {}})
    rec = (db.get("sessions") or {}).get(token)
    if not rec or rec.get("exp", 0) < time.time():
        return None
    for u in _read_json(USERS_PATH, {"users": []}).get("users", []):
        if u.get("id") == rec.get("userId"):
            return u
    return None


def admin_email() -> str:
    load_env()
    return (os.environ.get("ADMIN_EMAIL") or os.environ.get("TD_ADMIN_EMAIL") or os.environ.get("MKPC_ADMIN_EMAIL") or "").strip().lower()


def is_admin_user(user: dict | None) -> bool:
    email = admin_email()
    if not user or not email:
        return False
    return str(user.get("email") or "").strip().lower() == email


def admin_app_html() -> bytes:
    page = (ROOT / "private_admin" / "app.html").read_text(encoding="utf-8")
    script = (ROOT / "private_admin" / "calendar.js").read_text(encoding="utf-8")
    script = script.replace("</script", "<\\/script")
    return page.replace("<!--APP_MODULE-->", script).encode("utf-8")


def client_is_this_pc(host: str) -> bool:
    host = (host or "").strip().lower()
    if host.startswith("::ffff:"):
        host = host[7:]
    return host in {"127.0.0.1", "::1", "localhost"}


def serve_admin_desk_here(client_host: str) -> bool:
    """127.0.0.1 is already this PC only. Show the desk there.
    The login gate stays on Render and for any other address.
    """
    if os.environ.get("RENDER"):
        return False
    return client_is_this_pc(client_host)


def brevo_status() -> dict:
    """Safe check of the Brevo key and sender. No secrets in the result."""
    load_env()
    key = (os.environ.get("BREVO_API_KEY") or "").strip()
    sender = (os.environ.get("BREVO_SENDER") or "").strip().lower()
    if not key:
        return {"ok": False, "error": "no-key"}
    def get(path: str) -> tuple[int, dict]:
        req = urllib.request.Request(
            "https://api.brevo.com/v3" + path,
            headers={"accept": "application/json", "api-key": key},
        )
        try:
            with urllib.request.urlopen(req, timeout=20, context=ssl.create_default_context()) as resp:
                raw = resp.read().decode("utf-8", "replace")
                return resp.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", "replace")[:240]
            return err.code, {"message": detail}
        except urllib.error.URLError as err:
            return 0, {"message": str(err.reason)}
    code, account = get("/account")
    if code != 200:
        return {"ok": False, "error": f"account {code}: {account.get('message', '')[:180]}"}
    relay = account.get("relay") if isinstance(account.get("relay"), dict) else {}
    _, senders = get("/senders")
    verified = None
    rows = senders.get("senders") if isinstance(senders, dict) else None
    if isinstance(rows, list) and sender:
        for row in rows:
            if str(row.get("email") or "").strip().lower() == sender:
                verified = bool(row.get("active"))
                break
        if verified is None:
            verified = False
    return {"ok": True, "relay": bool(relay.get("enabled")), "senderVerified": verified}


def mail_config() -> str:
    load_env()
    key = bool((os.environ.get("BREVO_API_KEY") or "").strip())
    sender = bool((os.environ.get("BREVO_SENDER") or "").strip())
    if key and sender:
        return "brevo"
    if not key and not sender:
        return "off"
    return "no-key" if not key else "no-sender"


_LAST_MAIL_ERROR = ""


def send_brevo_email(to: str, subject: str, body: str) -> bool:
    """Send through Brevo's HTTPS API. Render's free plan blocks SMTP ports."""
    global _LAST_MAIL_ERROR
    load_env()
    key = (os.environ.get("BREVO_API_KEY") or "").strip()
    sender = (os.environ.get("BREVO_SENDER") or "").strip()
    if not key or not sender:
        _LAST_MAIL_ERROR = "config:" + mail_config()
        return False
    sender_name = (os.environ.get("BREVO_SENDER_NAME") or "Teacher Work Platform").strip() or "Teacher Work Platform"
    payload = json.dumps({
        "sender": {"name": sender_name, "email": sender},
        "to": [{"email": to}],
        "subject": subject,
        "textContent": body,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=payload,
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "api-key": key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20, context=ssl.create_default_context()) as resp:
            ok = 200 <= getattr(resp, "status", 201) < 300
            _LAST_MAIL_ERROR = "" if ok else "status"
            return ok
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")[:300]
        _LAST_MAIL_ERROR = f"http {err.code}: {detail}"
        sys.stderr.write(f"brevo error {err.code}: {detail}\n")
        return False
    except urllib.error.URLError as err:
        _LAST_MAIL_ERROR = f"network: {err.reason}"
        sys.stderr.write(f"brevo error: {err.reason}\n")
        return False


def send_recovery_email(to: str, pin: str, name: str) -> bool:
    load_env()
    host = (os.environ.get("SMTP_HOST") or "").strip()
    subject = "老師工作台 登入 PIN"
    body = (
        f"{name or '老師'} 您好，\n\n"
        f"你的老師工作台登入 PIN 是：{pin}\n"
        f"兩小時內有效。可用此 PIN 登入，然後再改密碼。\n\n"
        f"若你沒有申請重設，請忽略此信。\n"
    )
    DATA.mkdir(parents=True, exist_ok=True)
    outbox = DATA / "outbox"
    outbox.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    (outbox / f"{stamp}-{to.replace('@', '_at_')}.txt").write_text(
        f"To: {to}\nSubject: 老師工作台 登入 PIN\n\n{body}", encoding="utf-8"
    )
    if send_brevo_email(to, subject, body):
        return True
    if not host:
        return False
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER") or "noreply@localhost"
    msg["To"] = to
    msg.set_content(body)
    port = int(os.environ.get("SMTP_PORT") or "587")
    user = os.environ.get("SMTP_USER") or ""
    password = os.environ.get("SMTP_PASS") or ""
    with smtplib.SMTP(host, port, timeout=20) as smtp:
        smtp.starttls()
        if user:
            smtp.login(user, password)
        smtp.send_message(msg)
    return True


# School eClass base URL — override with ECLASS_BASE / TD_ECLASS_BASE env for other schools.
ECLASS_BASE = (os.environ.get("ECLASS_BASE") or os.environ.get("TD_ECLASS_BASE") or "https://intranet.mkpc.edu.hk").rstrip("/")
ECLASS_NOTICE_SOURCES = (
    (
        "學校宣布",
        (
            "/home/schoolNews/index.php",
            "/home/schoolnews/index.php",
            "/home/eAdmin/GeneralMgmt/schoolNews/index.php",
        ),
    ),
    (
        "職員通告",
        (
            "/home/eCircular/index.php",
            "/home/eCircular/sign.php",
            "/home/eAdmin/StaffMgmt/eCircular/index.php",
        ),
    ),
    (
        "電子通告系統",
        (
            "/home/eNotice/index.php",
            "/home/eNotice/index.php?clearCoo=1",
            "/home/eNotice/sign.php",
            "/home/eAdmin/StudentMgmt/eNotice/index.php",
        ),
    ),
)


MODULE_NAMES = ("學校宣布", "職員通告", "電子通告系統")
MODULE_TEXT = (
    ("職員通告", re.compile(r"職員通告|eCircular", re.I)),
    ("電子通告系統", re.compile(r"電子通告系統|電子通告|eNotice", re.I)),
    ("學校宣布", re.compile(r"學校宣[佈布告]|校園最新消息|School\s*News", re.I)),
)
ECLASS_DISCOVER_PATHS = (
    "/home/index.php",
    "/home/",
    "/home/home.php",
    "/home/eclass_body.php",
    "/home/body.php",
    "/home/imc_news.php",
)


def eclass_source_label(url: str) -> str:
    low = (url or "").lower()
    if "ecircul" in low:
        return "職員通告"
    if "enotice" in low or "studentmgmt/notice" in low or "studentmgmt/enotice" in low:
        return "電子通告系統"
    if "schoolnews" in low or "school_news" in low or "generalmgmt/schoolnews" in low:
        return "學校宣布"
    return ""


def classify_module_text(text: str) -> str:
    blob = str(text or "")
    for name, pat in MODULE_TEXT:
        if pat.search(blob):
            return name
    return ""


def join_eclass(base: str, href: str) -> str:
    href = unescape(unquote(str(href or ""))).strip().replace("\\/", "/")
    if not href or href.startswith("#"):
        return ""
    low = href.lower()
    if low.startswith(("mailto:", "tel:", "data:", "about:")):
        return ""
    if "logout" in low:
        return ""
    if low.startswith("javascript:"):
        return ""
    base = (base or ECLASS_BASE).split("#")[0]
    path_only = base.split("?")[0]
    last = path_only.rsplit("/", 1)[-1]
    if last and "." not in last and not path_only.endswith("/"):
        base = path_only + "/"
    url = urljoin(base, href.split("#")[0])
    if not url.startswith(ECLASS_BASE + "/"):
        return ""
    if any(url.lower().split("?")[0].endswith(ext) for ext in (".js", ".css", ".png", ".jpg", ".gif", ".ico", ".svg", ".woff")):
        return ""
    return url


def urls_in_js(script: str, base: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in re.findall(r"""['\"]([^'\"]+)['\"]""", script or ""):
        if "/home/" not in raw and ".php" not in raw.lower() and ".pdf" not in raw.lower():
            continue
        url = join_eclass(base, raw)
        if url and url not in seen:
            seen.add(url)
            out.append(url)
    return out


def is_missing_page(code: int, raw: bytes, html: str = "") -> bool:
    if code in (404, 410):
        return True
    if raw[:4] == b"%PDF":
        return False
    blob = (html or decode_html(raw or b"", "")).lower()
    title_m = re.search(r"<title>([^<]+)", blob, re.I)
    title = title_m.group(1) if title_m else ""
    if "404" in title or "not found" in title:
        return True
    head = blob[:2000]
    if "404 not found" in head or "頁面不存在" in head or "找不到網頁" in head or "file not found" in head:
        return True
    return False


def iter_module_links(html: str, base: str) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for m in re.finditer(r"<a\b([^>]*)>(.*?)</a>", html or "", re.I | re.S):
        attrs, inner = m.group(1), m.group(2)
        href_m = re.search(r"href\s*=\s*['\"]([^'\"]+)['\"]", attrs, re.I)
        href = href_m.group(1) if href_m else ""
        click_m = re.search(r"on(?:click)\s*=\s*['\"]([^'\"]+)['\"]", attrs, re.I)
        click = click_m.group(1) if click_m else ""
        title_m = re.search(r"title\s*=\s*['\"]([^'\"]+)['\"]", attrs, re.I)
        title = title_m.group(1) if title_m else ""
        text = re.sub(r"<[^>]+>", " ", inner)
        text = re.sub(r"\s+", " ", text).strip()
        label = classify_module_text(f"{text} {title}") or classify_module_text(click)
        targets = []
        href = unescape(href)
        if href.lower().startswith("javascript"):
            targets.extend(urls_in_js(href, base))
        else:
            joined = join_eclass(base, href)
            if joined:
                targets.append(joined)
        targets.extend(urls_in_js(click, base))
        if not label:
            for t in targets:
                label = eclass_source_label(t)
                if label:
                    break
        if not label:
            continue
        for t in targets:
            if t.startswith(ECLASS_BASE) and "logout" not in t.lower():
                found.append((label, t))
    for src in re.findall(r"<(?:frame|iframe)\b[^>]*\bsrc=['\"]([^'\"]+)", html or "", re.I):
        url = join_eclass(base, src)
        label = eclass_source_label(url)
        if label and url:
            found.append((label, url))
    for url in urls_in_js(html, base):
        label = eclass_source_label(url)
        if label:
            found.append((label, url))
    return found


def decode_html(raw: bytes, content_type: str = "") -> str:
    head = raw[:2500] if raw else b""
    meta = re.search(br"charset\s*=\s*['\"]?\s*([a-zA-Z0-9_-]+)", head, re.I)
    hdr = re.search(r"charset\s*=\s*['\"]?\s*([a-zA-Z0-9_-]+)", content_type or "", re.I)
    cs = (hdr.group(1) if hdr else (meta.group(1).decode("ascii", "ignore") if meta else "")) or "utf-8"
    cs = cs.lower().replace("gb2312", "gbk")
    cs = {"big5-hkscs": "big5", "hkscs": "big5", "iso-8859-1": "utf-8"}.get(cs, cs)
    try:
        return raw.decode(cs, "replace")
    except LookupError:
        return (raw or b"").decode("utf-8", "replace")


def html_to_text(raw: str) -> str:
    text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", raw or "")
    text = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", text)
    text = re.sub(r"(?is)<noscript[^>]*>.*?</noscript>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;|&amp;|&lt;|&gt;|&quot;|&#\d+;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


GENERIC_TITLE_RE = re.compile(
    r"^(學校宣[佈布告]|職員通告|電子通告系統|校園最新消息|eClass(?:\s*通告)?|通告)\s*$",
    re.I,
)
FILE_URL_RE = re.compile(
    r"(?:href|src)\s*=\s*['\"]([^'\"]+\.(?:pdf)(?:\?[^'\"]*)?|[^'\"]*(?:download|getfile|attachment|fileid|get_file)[^'\"]*)['\"]",
    re.I,
)
DETAIL_URL_RE = re.compile(
    r"view|detail|content|noticeid|circularid|newsid|announcement|download|getfile|attachment|fileid|\.pdf|opennotice|shownotice",
    re.I,
)


def _cluster_page_lines(bits: list[dict]) -> list[str]:
    if not bits:
        return []
    bits = sorted(bits, key=lambda b: (-float(b["y"]), float(b["x"])))
    rows: list[dict] = []
    for bit in bits:
        size = float(bit.get("size") or 10)
        row = next((r for r in rows if abs(r["y"] - float(bit["y"])) <= max(3.0, size * 0.35)), None)
        if row:
            row["bits"].append(bit)
            n = len(row["bits"])
            row["y"] = (row["y"] * (n - 1) + float(bit["y"])) / n
            row["size"] = max(row["size"], size)
        else:
            rows.append({"y": float(bit["y"]), "size": size, "bits": [bit]})
    sizes = sorted(r["size"] for r in rows)
    median = sizes[len(sizes) // 2] if sizes else 10.0
    lines: list[str] = []
    for row in rows:
        ordered = sorted(row["bits"], key=lambda b: float(b["x"]))
        line = ""
        prev = None
        for bit in ordered:
            gap = 0.0
            if prev is not None:
                gap = float(bit["x"]) - (float(prev["x"]) + float(prev.get("width") or prev["size"] * len(prev["str"]) * 0.45))
            if not line:
                line = bit["str"]
            elif gap > max(14.0, row["size"] * 1.4):
                line += f" | {bit['str']}"
            elif line.endswith(" ") or str(bit["str"]).startswith(" "):
                line += bit["str"]
            else:
                line += f" {bit['str']}"
            prev = bit
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        heading = row["size"] >= median * 1.22 and 0 < len(line) < 80
        lines.append(f"# {line}" if heading else line)
    return lines


def layout_pdf_page(page) -> str:
    bits: list[dict] = []

    def visitor(text, cm, tm, font_dict, font_size):
        raw = str(text or "").replace("\n", " ").strip()
        if not raw:
            return
        try:
            x = float(tm[4]) if tm is not None and len(tm) > 4 else 0.0
            y = float(tm[5]) if tm is not None and len(tm) > 5 else 0.0
        except (TypeError, ValueError, IndexError):
            x, y = 0.0, 0.0
        try:
            size = abs(float(font_size or 0)) or 10.0
        except (TypeError, ValueError):
            size = 10.0
        bits.append({
            "str": raw,
            "x": x,
            "y": y,
            "size": size,
            "width": size * max(1, len(raw)) * 0.45,
        })

    try:
        page.extract_text(visitor_text=visitor)
    except TypeError:
        bits.clear()
    if bits:
        return "\n".join(_cluster_page_lines(bits))
    try:
        return (page.extract_text(extraction_mode="layout") or "").strip()
    except TypeError:
        return (page.extract_text() or "").strip()


def pdf_extract(raw: bytes) -> str:
    if not raw or raw[:4] != b"%PDF":
        return ""
    try:
        from io import BytesIO
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(raw))
        parts: list[str] = []
        for i, page in enumerate(reader.pages, start=1):
            body = layout_pdf_page(page)
            if not body:
                continue
            heading = ""
            for line in body.splitlines():
                if line.startswith("# "):
                    heading = line[2:].strip()
                    break
            tag = f"[第{i}頁]{(' ' + heading) if heading else ''}"
            parts.append(f"{tag}\n{body}".strip())
        return "\n\n".join(parts).strip()
    except Exception as err:
        sys.stderr.write("eclass pdf extract fail %s\n" % str(err)[:120])
        return ""


def eclass_get(opener, url: str, referer: str = "", timeout: int = 15) -> tuple[str, bytes, str, int]:
    headers = eclass_headers(referer)
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with opener.open(req, timeout=timeout) as resp:
            raw = resp.read()
            ctype = (resp.headers.get("Content-Type") or "").lower()
            return resp.geturl(), raw, ctype, getattr(resp, "status", 200) or 200
    except urllib.error.HTTPError as err:
        raw = err.read() if err.fp else b""
        ctype = (err.headers.get("Content-Type") or "").lower()
        loc = err.headers.get("Location") or ""
        if err.code in (301, 302, 303, 307, 308) and loc:
            return urljoin(url, loc), raw, ctype, err.code
        return url, raw, ctype, err.code


def find_file_urls(base: str, html: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for href in FILE_URL_RE.findall(html or ""):
        url = join_eclass(base, href)
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(url)
    return out


SKIP_NOTICE_TITLE = re.compile(
    r"更多|登出|登入|首頁|設定|下載|download|home|login|logout|^https?://",
    re.I,
)


def extract_list_notices(label: str, base: str, html: str, start: str, end: str, today: str) -> list[dict]:
    found: list[dict] = []
    for tr in re.finditer(r"<tr\b[^>]*>(.*?)</tr>", html or "", re.I | re.S):
        row_html = tr.group(1)
        am = re.search(r"<a\b[^>]*href=['\"]([^'\"]+)['\"][^>]*>(.*?)</a>", row_html, re.I | re.S)
        if not am:
            continue
        title = html_to_text(am.group(2))
        if len(title) < 4 or SKIP_NOTICE_TITLE.search(title) or GENERIC_TITLE_RE.match(title):
            continue
        href = unescape(am.group(1))
        if href.lower().startswith("javascript"):
            js_urls = urls_in_js(href, base)
            url = js_urls[0] if js_urls else ""
        else:
            url = join_eclass(base, href)
        if not url:
            continue
        row_text = html_to_text(row_html)
        date = parse_any_date(row_text, today)
        if not date_in_span(date, start, end):
            continue
        found.append({
            "title": title[:120],
            "date": date,
            "source": label,
            "url": url,
            "text": row_text[:800],
            "hasPdf": False,
        })
    return found


def polish_event_title(ev: dict) -> dict:
    title = str(ev.get("title") or "").strip()
    desc = str(ev.get("description") or "").strip()
    work = str(ev.get("work") or "").strip()
    if not title or GENERIC_TITLE_RE.match(title) or title in ("[職員通告]", "[學校宣布]", "[電子通告系統]"):
        first = re.split(r"[。\n；;]", desc or work)[0].strip()
        first = re.sub(r"^\[(?:學校宣[佈布告]|職員通告|電子通告系統)\]\s*", "", first)
        if first and not GENERIC_TITLE_RE.match(first):
            ev["title"] = first[:80]
    if ev.get("work") and ev.get("description") and str(ev["work"]) not in str(ev["description"]):
        ev["description"] = f"{ev['work']}。{ev['description']}".strip("。")
    ev.setdefault("work", "")
    ev.setdefault("source", "")
    return ev


def cookie_header_from_jar(jar: CookieJar) -> str:
    return "; ".join(f"{c.name}={c.value}" for c in jar if c.name)


def add_cookies_to_jar(jar: CookieJar, header: str) -> None:
    from http.cookiejar import Cookie

    if not header:
        return
    for part in header.split(";"):
        part = part.strip()
        if "=" not in part:
            continue
        name, value = part.split("=", 1)
        name, value = name.strip(), value.strip()
        if not name:
            continue
        from urllib.parse import urlparse as _urlparse
        _eclass_host = _urlparse(ECLASS_BASE).hostname or "intranet.mkpc.edu.hk"
        jar.set_cookie(
            Cookie(
                0, name, value, None, False,
                _eclass_host, True, False,
                "/", True, True, None, True,
                None, None, {},
            )
        )


class _NoFollow(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def eclass_opener_from_jar(jar: CookieJar, follow: bool = True):
    handlers = [
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=ssl.create_default_context()),
    ]
    if not follow:
        handlers.insert(0, _NoFollow())
    return urllib.request.build_opener(*handlers)


def eclass_opener(cookie_header: str = "", follow: bool = True):
    jar = CookieJar()
    add_cookies_to_jar(jar, cookie_header)
    return eclass_opener_from_jar(jar, follow), jar


class _Form1Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.pairs: list[tuple[str, str]] = []
        self._in = False

    def handle_starttag(self, tag: str, attrs) -> None:
        data = {k.lower(): (v or "") for k, v in attrs}
        if tag.lower() == "form":
            form_id = data.get("id") or ""
            action = data.get("action") or ""
            self._in = form_id == "form1" or action.rstrip("/").endswith("login.php")
            return
        if self._in and tag.lower() == "input":
            name = data.get("name")
            if name:
                self.pairs.append((name, data.get("value") or ""))

    def handle_startendtag(self, tag: str, attrs) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "form":
            self._in = False


def parse_login_pairs(html: str) -> list[tuple[str, str]]:
    parser = _Form1Parser()
    try:
        parser.feed(html or "")
    except Exception:
        return []
    return parser.pairs


def eclass_headers(referer: str = "") -> dict:
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,zh;q=0.8,en;q=0.7",
        "Referer": referer or urljoin(ECLASS_BASE, "/templates/index.php"),
        "Origin": ECLASS_BASE,
    }


def eclass_call(opener, url: str, form=None, ajax: bool = False, timeout: int = 20, referer: str = "") -> tuple[str, str, int]:
    headers = eclass_headers(referer)
    if ajax:
        headers["Accept"] = "*/*"
        headers["X-Requested-With"] = "XMLHttpRequest"
    data = None
    if form is not None:
        data = urlencode(form).encode("utf-8")
        headers["Content-Type"] = (
            "application/x-www-form-urlencoded; charset=UTF-8" if ajax else "application/x-www-form-urlencoded"
        )
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if form is not None else "GET")
    try:
        with opener.open(req, timeout=timeout) as resp:
            raw = resp.read()
            body = decode_html(raw, resp.headers.get("Content-Type") or "")
            return resp.geturl(), body, getattr(resp, "status", 200) or 200
    except urllib.error.HTTPError as err:
        loc = err.headers.get("Location") or ""
        raw = err.read() if err.fp else b""
        body = decode_html(raw, err.headers.get("Content-Type") or "")
        if err.code in (301, 302, 303, 307, 308) and loc:
            return urljoin(url, loc), body, err.code
        raise


def is_login_html(body: str) -> bool:
    return "UserLogin" in (body or "") and "login_btn" in (body or "")


def notice_follow_urls(base: str, html: str, prefixes: set[str] | None = None) -> list[str]:
    prefixes = prefixes or set()
    out: list[str] = []
    for _label, url in iter_module_links(html, base):
        out.append(url)
    for src in re.findall(r"<(?:frame|iframe)\b[^>]*\bsrc=['\"]([^'\"]+)", html or "", re.I):
        joined = join_eclass(base, src)
        if joined:
            out.append(joined)
    for href in re.findall(r"href=['\"]([^'\"]+)", html or "", re.I):
        href = unescape(href)
        if href.lower().startswith("javascript"):
            out.extend(urls_in_js(href, base))
            continue
        joined = join_eclass(base, href)
        if joined:
            out.append(joined)
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in out:
        url = item.split("#")[0]
        low = url.lower()
        if url in seen or not url.startswith(ECLASS_BASE):
            continue
        if any(low.endswith(ext) for ext in (".js", ".css", ".png", ".jpg", ".gif", ".ico", ".svg")):
            continue
        if eclass_source_label(url) or any(url.startswith(p) for p in prefixes):
            seen.add(url)
            cleaned.append(url)
    return cleaned


def classify_eclass_login(url: str, body: str) -> str:
    text = body or ""
    loc = url or ""
    blob = f"{loc}\n{text}"
    first = text.lstrip().splitlines()[0].strip() if text.strip() else ""
    if "err=" in loc:
        return "fail"
    if first.startswith("otp_login"):
        return "otp_bad"
    if first.startswith("0,") and "/" in first:
        return "ok"
    if "msg=1" in loc or "/home/" in loc or (urlparse(ECLASS_BASE).hostname or "") + "/home" in loc or "intranet.mkpc.edu.hk/home" in loc:
        return "ok"
    if first.startswith("otp_check") or "check_otp=true" in loc or re.search(r"check_otp\s*=\s*true", blob):
        return "otp"
    otp_cls = re.search(r'id="otp_div"[^>]*class="([^"]*)"', text)
    if otp_cls and "otp-hidden" not in otp_cls.group(1):
        return "otp"
    if "otp-resend-hidden" in text and "otp-hidden" not in (otp_cls.group(1) if otp_cls else "otp-hidden"):
        return "otp"
    return "unknown"


def session_needs_otp(opener, page_html: str = "", page_url: str = "") -> bool:
    if classify_eclass_login(page_url, page_html) == "otp":
        return True
    try:
        _u, script, _c = eclass_call(opener, urljoin(ECLASS_BASE, "/templates/login_script.php"))
    except Exception:
        return False
    return bool(re.search(r"var\s+check_otp\s*=\s*true", script or ""))


def build_login_form(html: str, login: str, password: str, otp: str = "") -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    seen_login = False
    for name, value in parse_login_pairs(html):
        if name == "UserLogin":
            if seen_login:
                continue
            pairs.append((name, login))
            seen_login = True
        elif name == "UserPassword":
            pairs.append((name, password))
        elif name == "OTPPassword":
            pairs.append((name, otp or ""))
        else:
            pairs.append((name, value))
    if not seen_login:
        pairs.append(("UserLogin", login))
    if not any(n == "UserPassword" for n, _ in pairs):
        pairs.append(("UserPassword", password))
    if otp and not any(n == "OTPPassword" for n, _ in pairs):
        pairs.append(("OTPPassword", otp))
    if not any(n == "submit" for n, _ in pairs):
        pairs.append(("submit", "登入"))
    return pairs


def _login_page(opener):
    return eclass_call(opener, urljoin(ECLASS_BASE, "/templates/index.php"))


def _post_password(opener, page: str, login: str, password: str) -> tuple[str, str, int, list]:
    form = build_login_form(page, login, password, "")
    names = ",".join(n for n, _ in form)
    sys.stderr.write("eclass login fields=%s\n" % names)
    if "securetoken" not in names:
        raise RuntimeError("eclass_form")
    url, body, code = eclass_call(opener, urljoin(ECLASS_BASE, "/login.php"), form)
    return url, body, code, form


def _post_otp(jar, page: str, login: str, password: str, otp: str) -> tuple[str, str, int]:
    form = build_login_form(page, login, password, otp)
    ajax = eclass_opener_from_jar(jar, follow=False)
    return eclass_call(ajax, urljoin(ECLASS_BASE, "/login.php"), form, ajax=True)


def _classify_password_result(opener, url: str, body: str) -> str:
    status = classify_eclass_login(url, body)
    if status in ("ok", "fail", "otp", "otp_bad"):
        return status
    if session_needs_otp(opener, body, url):
        return "otp"
    # Wrong password always redirects to err=1. A login page without err= means OTP.
    if "err=" not in (url or "") and ("UserLogin" in (body or "") or "/templates/" in (url or "")):
        return "otp"
    return "fail"


def _scrape_notices(opener, jar, from_date: str = "", to_date: str = "") -> dict:
    home = urljoin(ECLASS_BASE, "/home/index.php")
    start, end = iso_day(from_date), iso_day(to_date)
    login_hits = 0
    discover_html: list[tuple[str, str]] = []
    seen: set[str] = set()
    discover = [urljoin(ECLASS_BASE, p) for p in ECLASS_DISCOVER_PATHS]
    while discover and len(discover_html) < 8:
        url = discover.pop(0).split("#")[0]
        if url in seen:
            continue
        seen.add(url)
        try:
            final, body, code = eclass_call(opener, url, timeout=12, referer=home)
        except Exception as err:
            sys.stderr.write("eclass discover miss %s %s\n" % (url[:80], str(err)[:80]))
            continue
        if is_login_html(body):
            login_hits += 1
            continue
        discover_html.append((final or url, body))
        sys.stderr.write("eclass discover %s http=%s len=%s\n" % ((final or url)[:120], code, len(body)))
        for src in re.findall(r"<(?:frame|iframe)\b[^>]*\bsrc=['\"]([^'\"]+)", body or "", re.I):
            nxt = join_eclass(final or url, src)
            if nxt and nxt not in seen:
                discover.append(nxt)

    module_urls: dict[str, list[str]] = {name: [] for name in MODULE_NAMES}
    prefixes: set[str] = set()
    chunks: list[str] = []
    notice_map: dict[str, dict] = {}

    def upsert_notice(title: str, date: str, source: str, url: str, text: str, has_pdf: bool = False) -> None:
        title = re.sub(r"^\[(?:學校宣[佈布告]|職員通告|電子通告系統)\]\s*", "", (title or "").strip())[:120]
        if not title or GENERIC_TITLE_RE.match(title):
            first = re.split(r"[。\n]", text or "")[0].strip()
            first = re.sub(r"^\[(?:學校宣[佈布告]|職員通告|電子通告系統)\]\s*", "", first)
            if first and not GENERIC_TITLE_RE.match(first):
                title = first[:120]
        if not date_in_span(date, start, end):
            return
        key = url or f"{source}:{title}:{date}"
        rec = notice_map.get(key) or {
            "title": title or "通告",
            "date": date or "",
            "source": source,
            "url": url,
            "text": "",
            "hasPdf": False,
        }
        if title and (not rec.get("title") or GENERIC_TITLE_RE.match(str(rec.get("title") or ""))):
            rec["title"] = title
        if date and not rec.get("date"):
            rec["date"] = date
        if text:
            rec["text"] = (str(rec.get("text") or "") + "\n" + text).strip()[:12000]
        if has_pdf:
            rec["hasPdf"] = True
        rec["source"] = source or rec.get("source") or ""
        rec["url"] = url or rec.get("url") or ""
        notice_map[key] = rec

    def add_module_url(label: str, url: str) -> None:
        if not label or not url:
            return
        cleaned = url.split("#")[0] if url.startswith(ECLASS_BASE + "/") else join_eclass(home, url)
        if not cleaned or "logout" in cleaned.lower():
            return
        if cleaned not in module_urls[label]:
            module_urls[label].append(cleaned)
        prefix = cleaned.split("?")[0]
        last = prefix.rsplit("/", 1)[-1]
        if "." in last:
            prefix = prefix.rsplit("/", 1)[0]
        prefixes.add(prefix.rstrip("/") + "/")

    for final, body in discover_html:
        page_label = eclass_source_label(final) or classify_module_text(html_to_text(body)[:400])
        if page_label == "學校宣布" or "校園最新消息" in body or "學校宣" in body:
            section = html_to_text(body)
            idx = section.find("校園最新消息")
            if idx < 0:
                idx = section.find("學校宣")
            snippet = section[max(0, idx): max(0, idx) + 4000] if idx >= 0 else section[:4000]
            if len(snippet) > 40:
                chunks.append("[學校宣布]\n" + snippet)
                add_module_url("學校宣布", final)
        for label, link in iter_module_links(body, final):
            add_module_url(label, link)

    for label, paths in ECLASS_NOTICE_SOURCES:
        for path in paths:
            add_module_url(label, urljoin(ECLASS_BASE, path))

    for name in MODULE_NAMES:
        sys.stderr.write("eclass module %s urls=%s\n" % (name, len(module_urls[name])))

    queue: list[tuple[str, str]] = []
    queued: set[str] = set()
    for label, urls in module_urls.items():
        for url in urls:
            if url not in queued:
                queued.add(url)
                queue.append((label, url))

    found: set[str] = set()
    pdfs = 0
    while queue and len(seen) < 28 and pdfs < 8:
        label, url = queue.pop(0)
        url = url.split("#")[0]
        if url in seen:
            continue
        seen.add(url)
        url = join_eclass(home, url) or url
        try:
            final, raw, ctype, code = eclass_get(opener, url, referer=home, timeout=15)
        except Exception as err:
            sys.stderr.write("eclass scrape miss %s %s\n" % (url[:80], str(err)[:80]))
            continue
        if is_missing_page(code, raw):
            sys.stderr.write("eclass skip http=%s %s\n" % (code, url[:120]))
            continue
        if raw[:4] == b"%PDF" or "pdf" in ctype:
            if len(raw) > 2_500_000:
                continue
            pdf_text = pdf_extract(raw)
            pdfs += 1
            sys.stderr.write("eclass pdf [%s] %s chars=%s\n" % (label, (final or url)[:100], len(pdf_text)))
            if text_looks_useful(pdf_text):
                chunks.append(f"[{label} PDF]\n{pdf_text[:12000]}")
                found.add(label)
                posted = parse_any_date(pdf_text[:400], end)
                upsert_notice(pdf_text.split("\n")[0][:80], posted, label, final or url, pdf_text, True)
            continue
        page_body = decode_html(raw, ctype)
        if is_login_html(page_body):
            login_hits += 1
            continue
        if is_missing_page(code, raw, page_body):
            sys.stderr.write("eclass skip missing %s\n" % (url[:120],))
            continue
        final_label = eclass_source_label(final or url) or label
        text = html_to_text(page_body)
        heading = ""
        tm = re.search(r"<title>([^<]+)", page_body, re.I)
        if tm:
            heading = html_to_text(tm.group(1))
        if GENERIC_TITLE_RE.match(heading) or "eClass" in heading[:12] or "404" in heading or "not found" in heading.lower():
            heading = ""
        sys.stderr.write("eclass scrape [%s] %s http=%s chars=%s\n" % (final_label, (final or url)[:100], code, len(text)))
        for item in extract_list_notices(final_label, final or url, page_body, start, end, end):
            upsert_notice(item["title"], item.get("date") or "", item["source"], item.get("url") or "", item.get("text") or "")
            href = item.get("url") or ""
            if href and href not in seen and href not in queued:
                queued.add(href)
                queue.insert(0, (final_label, href))
        if len(text) > 40:
            head = f"[{final_label}] {heading}".strip()
            chunks.append(f"{head}\n{text[:8000]}")
            found.add(final_label)
            posted = parse_any_date(text[:500], end)
            upsert_notice(heading, posted, final_label, final or url, text, False)
        if len(seen) < 24:
            extra: list[tuple[int, str, str]] = []
            for nxt in find_file_urls(final or url, page_body):
                extra.append((0, final_label, nxt))
            for nxt in notice_follow_urls(final or url, page_body, prefixes):
                pri = 1 if DETAIL_URL_RE.search(nxt) else 2
                extra.append((pri, eclass_source_label(nxt) or final_label, nxt))
            extra.sort(key=lambda row: row[0])
            for _pri, nxt_label, nxt in extra:
                if nxt not in seen and nxt not in queued:
                    queued.add(nxt)
                    if _pri == 0:
                        queue.insert(0, (nxt_label, nxt))
                    else:
                        queue.append((nxt_label, nxt))

    blob = "\n\n".join(chunks)
    notices = [n for n in notice_map.values() if (n.get("title") or n.get("text"))]
    notices.sort(key=lambda n: (n.get("date") or "9999", n.get("source") or "", n.get("title") or ""))
    sys.stderr.write(
        "eclass scrape total chars=%s pages=%s pdfs=%s notices=%s login_pages=%s found=%s\n"
        % (len(blob), len(seen), pdfs, len(notices), login_hits, ",".join(sorted(found)) or "-")
    )
    return {
        "status": "ok",
        "cookie": cookie_header_from_jar(jar),
        "text": blob[:40000],
        "chars": len(blob),
        "loginPages": login_hits,
        "sources": sorted(found),
        "notices": notices[:40],
    }


def eclass_login_and_fetch(
    login: str,
    password: str,
    otp: str = "",
    cookie: str = "",
    test_only: bool = False,
    from_date: str = "",
    to_date: str = "",
) -> dict:
    opener, jar = eclass_opener(cookie, follow=True)
    try:
        page_url, page, _code = _login_page(opener)
        extra = cookie_header_from_jar(jar)

        if otp:
            if not session_needs_otp(opener, page, page_url):
                url, body, code, _form = _post_password(opener, page, login, password)
                extra = cookie_header_from_jar(jar)
                status = _classify_password_result(opener, url, body)
                sys.stderr.write("eclass login status=%s http=%s url=%s\n" % (status, code, (url or "")[:180]))
                if status == "fail":
                    return {"status": "fail", "cookie": extra, "where": url}
                if status == "ok":
                    if test_only:
                        return {"status": "ok", "cookie": extra, "text": "", "chars": 0}
                    return _scrape_notices(opener, jar, from_date, to_date)
                page_url, page, _code = _login_page(opener)
            url, body, code = _post_otp(jar, page, login, password, otp)
            extra = cookie_header_from_jar(jar)
            status = classify_eclass_login(url, body)
            sys.stderr.write("eclass otp status=%s http=%s url=%s\n" % (status, code, (url or "")[:180]))
            if status == "otp_bad":
                return {"status": "otp_bad", "cookie": extra}
            if status == "otp":
                return {"status": "otp", "cookie": extra}
            if status != "ok":
                return {"status": "otp_bad", "cookie": extra, "where": url}
            if test_only:
                return {"status": "ok", "cookie": extra, "text": "", "chars": 0}
            home = eclass_opener_from_jar(jar, follow=True)
            return _scrape_notices(home, jar, from_date, to_date)

        url, body, code, _form = _post_password(opener, page, login, password)
        extra = cookie_header_from_jar(jar)
        status = _classify_password_result(opener, url, body)
        sys.stderr.write("eclass login status=%s http=%s url=%s\n" % (status, code, (url or "")[:180]))
        if status == "otp":
            return {"status": "otp", "cookie": extra}
        if status != "ok":
            return {"status": "fail", "cookie": extra, "where": url}
        if test_only:
            return {"status": "ok", "cookie": extra, "text": "", "chars": 0}
        return _scrape_notices(opener, jar, from_date, to_date)
    except urllib.error.URLError as err:
        return {"status": "unreachable", "error": str(err.reason if getattr(err, "reason", None) else err)[:180]}
    except RuntimeError as err:
        return {"status": "error", "error": str(err)[:180]}
    except Exception as err:
        return {"status": "error", "error": str(err)[:180]}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def guess_type(self, path):
        low = str(path or "").split("?", 1)[0].lower()
        if low.endswith(".js"):
            return "text/javascript"
        if low.endswith(".css"):
            return "text/css"
        if low.endswith(".html") or low.endswith("/"):
            return "text/html"
        return super().guess_type(path)

    def _cors_origin(self) -> str:
        origin = (self.headers.get("Origin") or "").strip()
        if not origin:
            return ""
        host = origin.split("://", 1)[-1].split("/")[0].split(":")[0].lower()
        if host in ("localhost", "127.0.0.1") or host.endswith(".onrender.com"):
            return origin
        extra = os.environ.get("STATIC_ORIGIN", "").strip().rstrip("/")
        if extra and origin.rstrip("/") == extra:
            return origin
        return ""

    def end_headers(self) -> None:
        origin = self._cors_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Poe-Key, X-Api-Key")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        path = (self.path or "").split("?", 1)[0]
        if path.startswith("/js/") or path in ("/", "/index.html", ""):
            self.send_header("Cache-Control", "no-store")
        elif path.startswith("/css/") or path.startswith("/assets/"):
            self.send_header("Cache-Control", "public, max-age=60")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _poe_key(self, incoming: dict) -> str:
        header = (self.headers.get("X-Poe-Key") or self.headers.get("X-Api-Key") or "").strip()
        if header:
            return header
        body = str((incoming or {}).get("poeKey") or (incoming or {}).get("apiKey") or "").strip()
        if body:
            return body
        # Env key is only a fallback after a gated route has accepted the session.
        if getattr(self, "_ai_authed", False):
            return env_ai_key()
        return ""

    def _poe_model(self, incoming: dict) -> str:
        return str((incoming or {}).get("poeModel") or DEFAULT_MODEL).strip() or DEFAULT_MODEL

    def _json(self, code: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, OSError):
            return

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > 20_000_000:
            raise ValueError("too_large")
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw)

    def _bytes(self, code: int, data: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, OSError):
            return

    def _bearer_user(self) -> dict | None:
        auth = (self.headers.get("Authorization") or "").replace("Bearer ", "", 1).strip()
        return user_from_token(auth)

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        low = path.lower()
        if path == "/data" or path.startswith("/data/") or low.startswith("/private_admin"):
            self._json(404, {"error": "not_found"})
            return
        if low in ("/calendar-admin.html", "/js/calendar-admin.js"):
            self._json(404, {"error": "not_found"})
            return
        if low in ("/admin", "/admin/", "/admin.html"):
            client = self.client_address[0] if self.client_address else ""
            if serve_admin_desk_here(str(client)):
                self._bytes(200, admin_app_html(), "text/html; charset=utf-8")
                return
            page = (ROOT / "admin.html").read_bytes()
            self._bytes(200, page, "text/html; charset=utf-8")
            return
        if low == "/api/admin/app":
            user = self._bearer_user()
            if not user:
                self._json(401, {"error": "auth"})
                return
            if not is_admin_user(user):
                self._json(403, {"error": "admin"})
                return
            self._bytes(200, admin_app_html(), "text/html; charset=utf-8")
            return
        if path == "/api/auth-config":
            self._json(200, {"googleClientId": (os.environ.get("GOOGLE_CLIENT_ID") or "").strip()})
            return
        if path == "/api/mail-status":
            self._json(200, brevo_status())
            return
        if path == "/api/ai-status":
            payload = ai_status_payload()
            payload["mail"] = mail_config()
            self._json(200, payload)
            return
        if path == "/api/poe-models":
            catalog = fetch_poe_models()
            status = ai_status_payload()
            ids = list(catalog.get("ids") or [])
            if status.get("provider") == "xai":
                model = status.get("model") or DEFAULT_XAI_MODEL
                ids = [model] + [i for i in ids if i != model]
                catalog["starter"] = model
            catalog["ids"] = ids
            catalog["hasKey"] = bool(status.get("ready"))
            catalog["provider"] = status.get("provider") or "poe"
            catalog["ready"] = bool(status.get("ready"))
            self._json(200, catalog)
            return
        if path == "/api/me":
            auth = (self.headers.get("Authorization") or "").replace("Bearer ", "").strip()
            user = user_from_token(auth)
            if not user:
                self._json(401, {"error": "auth"})
                return
            self._json(200, {"user": public_user(user)})
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        self._ai_authed = False
        try:
            incoming = self._body()
        except ValueError:
            self._json(413, {"error": "too_large"})
            return
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid_json"})
            return
        if path in _AI_POST_PATHS:
            user = self._bearer_user()
            if not user:
                self._json(401, {"error": "auth"})
                return
            if not ai_rate_allow(str(user.get("id") or "")):
                self._json(429, {"error": "rate"})
                return
            self._ai_authed = True

        if path == "/api/google":
            try:
                info = verify_google_credential(str(incoming.get("credential") or ""))
            except ValueError as err:
                self._json(401, {"error": str(err)})
                return
            user = account_for_google(info["sub"], info["email"], incoming.get("capsules"))
            if user:
                token = new_session(user["id"])
                self._json(200, {"token": token, "user": public_user(user), "capsule": issue_capsule(user)})
                return
            self._json(200, {
                "needsProfile": True,
                "ticket": make_google_ticket(info["sub"], info["email"]),
                "profile": {
                    "email": info["email"],
                    "firstName": str(info.get("given_name") or "").strip(),
                    "lastName": str(info.get("family_name") or "").strip(),
                },
            })
            return

        if path == "/api/google-signup":
            ticket = read_google_ticket(str(incoming.get("ticket") or ""))
            if not ticket:
                self._json(401, {"error": "ticket"})
                return
            email = str(ticket.get("email") or "").strip().lower()
            sub = str(ticket.get("sub") or "").strip()
            first = str(incoming.get("firstName") or "").strip()
            last = str(incoming.get("lastName") or "").strip()
            chinese = str(incoming.get("chineseName") or "").strip()
            nick = str(incoming.get("nickname") or "").strip()
            password = str(incoming.get("password") or "")
            if not first or not last or not chinese:
                self._json(400, {"error": "name"})
                return
            if not nick or " " in nick or len(nick) > 6:
                self._json(400, {"error": "nickname"})
                return
            if password and len(password) < 6:
                self._json(400, {"error": "password"})
                return
            existing = find_user_by_google(sub, email)
            if existing:
                existing["googleSub"] = sub
                save_user(existing)
                token = new_session(existing["id"])
                self._json(200, {"token": token, "user": public_user(existing), "capsule": issue_capsule(existing)})
                return
            if not email_domain_ok(email):
                self._json(400, {"error": "email_domain"})
                return
            if password:
                salt, digest = hash_secret(password)
            else:
                salt, digest = hash_secret(secrets.token_urlsafe(24))
            user = {
                "id": secrets.token_hex(8),
                "email": email,
                "salt": salt,
                "password_hash": digest,
                "firstName": first,
                "lastName": last,
                "chineseName": chinese,
                "nickname": nick,
                "googleSub": sub,
                "recovery_salt": "",
                "recovery_hash": "",
                "recovery_exp": 0,
            }
            save_user(user)
            token = new_session(user["id"])
            self._json(200, {"token": token, "user": public_user(user), "capsule": issue_capsule(user)})
            return

        if path == "/api/signup":
            email = str(incoming.get("email") or "").strip().lower()
            password = str(incoming.get("password") or "")
            first = str(incoming.get("firstName") or "").strip()
            last = str(incoming.get("lastName") or "").strip()
            chinese = str(incoming.get("chineseName") or "").strip()
            nick = str(incoming.get("nickname") or "").strip()
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
                self._json(400, {"error": "email"})
                return
            if not email_domain_ok(email):
                self._json(400, {"error": "email_domain"})
                return
            if len(password) < 6:
                self._json(400, {"error": "password"})
                return
            if not first or not last or not chinese:
                self._json(400, {"error": "name"})
                return
            if not nick or " " in nick or len(nick) > 6:
                self._json(400, {"error": "nickname"})
                return
            if find_user(email):
                self._json(409, {"error": "exists"})
                return
            salt, digest = hash_secret(password)
            user = {
                "id": secrets.token_hex(8),
                "email": email,
                "salt": salt,
                "password_hash": digest,
                "firstName": first,
                "lastName": last,
                "chineseName": chinese,
                "nickname": nick,
                "recovery_salt": "",
                "recovery_hash": "",
                "recovery_exp": 0,
            }
            save_user(user)
            token = new_session(user["id"])
            self._json(200, {"token": token, "user": public_user(user), "capsule": issue_capsule(user)})
            return

        if path == "/api/login":
            email = str(incoming.get("email") or "").strip().lower()
            password = str(incoming.get("password") or "")
            user = account_for_login(email, password, str(incoming.get("capsule") or ""))
            if not user:
                self._json(401, {"error": "login"})
                return
            token = new_session(user["id"])
            self._json(200, {"token": token, "user": public_user(user), "capsule": issue_capsule(user)})
            return

        if path == "/api/login-pin":
            email = str(incoming.get("email") or "").strip().lower()
            pin = str(incoming.get("pin") or "").strip()
            user = find_user(email)
            if (
                not user
                or not pin
                or user.get("recovery_exp", 0) < time.time()
                or not check_secret(pin, user.get("recovery_salt") or "", user.get("recovery_hash") or "")
            ):
                self._json(401, {"error": "pin"})
                return
            token = new_session(user["id"])
            self._json(200, {"token": token, "user": public_user(user), "mustChangePassword": True})
            return

        if path == "/api/change-password":
            auth = (self.headers.get("Authorization") or "").replace("Bearer ", "").strip()
            user = user_from_token(auth)
            if not user:
                self._json(401, {"error": "auth"})
                return
            password = str(incoming.get("password") or "")
            if len(password) < 6:
                self._json(400, {"error": "password"})
                return
            salt, digest = hash_secret(password)
            user["salt"] = salt
            user["password_hash"] = digest
            user["recovery_salt"] = ""
            user["recovery_hash"] = ""
            user["recovery_exp"] = 0
            save_user(user)
            self._json(200, {"ok": True, "user": public_user(user), "capsule": issue_capsule(user)})
            return

        if path == "/api/forgot":
            email = str(incoming.get("email") or "").strip().lower()
            user = find_user(email)
            sent = False
            if user:
                pin = f"{secrets.randbelow(1000000):06d}"
                salt, digest = hash_secret(pin)
                user["recovery_salt"] = salt
                user["recovery_hash"] = digest
                user["recovery_exp"] = time.time() + 2 * 60 * 60
                save_user(user)
                try:
                    sent = send_recovery_email(email, pin, user.get("chineseName") or user.get("firstName") or "")
                except Exception as err:
                    sys.stderr.write(f"mail error: {err}\n")
            self._json(200, {"ok": True, "emailed": bool(sent)})
            return

        if path == "/api/analyze-notice":
            key = self._poe_key(incoming)
            if not key:
                self._json(503, {"error": "missing_key"})
                return
            text = str(incoming.get("text") or "").strip()
            image = str(incoming.get("image") or "").strip()
            extra_images = incoming.get("images") if isinstance(incoming.get("images"), list) else []
            pics = collect_images(image, extra_images)
            today = str(incoming.get("today") or "")
            locale = str(incoming.get("locale") or "zh")
            kind = str(incoming.get("kind") or "notice").strip() or "notice"
            pdf = str(incoming.get("pdf") or "").strip()
            if pdf and not text_looks_useful(text):
                mime, raw = decode_data_url(pdf)
                if raw[:4] == b"%PDF" or "pdf" in mime:
                    extracted = str(pdf_extract(raw) or "").strip()
                    if text_looks_useful(extracted):
                        text = extracted
                    elif extracted and not str(text or "").strip():
                        text = extracted
            if text_looks_useful(text):
                pics = []
            else:
                prepared = prepare_document_images(kind, pics, pdf)
                if prepared:
                    pics = prepared
            if len(text) < 8 and not pics:
                self._json(400, {"error": "empty_text"})
                return
            classes = incoming.get("classes") or []
            if not isinstance(classes, list):
                classes = []
            classes = [str(c) for c in classes][:40]
            teacher = incoming.get("teacher") or {}
            if not isinstance(teacher, dict):
                teacher = {}
            filters = incoming.get("filters") or {}
            if not isinstance(filters, dict):
                filters = {}
            try:
                result = call_extract_ai(
                    key,
                    self._poe_model(incoming),
                    kind,
                    text,
                    pics[0] if pics else "",
                    today,
                    locale,
                    classes,
                    teacher,
                    filters,
                    images=pics,
                )
            except RuntimeError as err:
                code = 503 if str(err) in ("missing_key", "bad_key", "no_credits") else 502
                self._json(code, {"error": str(err)})
                return
            except json.JSONDecodeError:
                self._json(502, {"error": "model_json_parse"})
                return
            self._json(200, result)
            return

        if path == "/api/seat-plan":
            key = self._poe_key(incoming)
            if not key:
                self._json(503, {"error": "missing_key"})
                return
            students = incoming.get("students") if isinstance(incoming.get("students"), list) else []
            if len(students) < 2:
                self._json(400, {"error": "empty"})
                return
            try:
                result = call_seat_ai(key, self._poe_model(incoming), incoming, str(incoming.get("locale") or "zh"))
            except RuntimeError as err:
                code = 503 if str(err) in ("missing_key", "bad_key", "no_credits") else 502
                self._json(code, {"error": str(err)})
                return
            self._json(200, result)
            return

        if path == "/api/ai-chat":
            key = self._poe_key(incoming)
            if not key:
                self._json(503, {"error": "missing_key"})
                return
            messages = incoming.get("messages") or []
            if not isinstance(messages, list) or not messages:
                self._json(400, {"error": "empty"})
                return
            clean = []
            for m in messages[-12:]:
                role = m.get("role") if isinstance(m, dict) else ""
                content = str(m.get("content") or "")[:4000]
                if role in ("user", "assistant") and content:
                    clean.append({"role": role, "content": content})
            locale = str(incoming.get("locale") or "zh")
            context = incoming.get("context") or {}
            if not isinstance(context, dict):
                context = {}
            try:
                result = call_chat_ai(key, self._poe_model(incoming), clean, context, locale)
            except RuntimeError as err:
                code = 503 if str(err) in ("missing_key", "bad_key", "no_credits") else 502
                self._json(code, {"error": str(err)})
                return
            except Exception as err:
                self._json(502, {"error": str(err)[:200]})
                return
            self._json(200, result)
            return

        if path == "/api/eclass-check":
            login = str(incoming.get("login") or "").strip()
            password = str(incoming.get("password") or "")
            otp = str(incoming.get("otp") or "").strip()
            cookie = str(incoming.get("cookie") or "").strip()
            if not login or not password:
                self._json(400, {"error": "eclass_creds"})
                return
            today = str(incoming.get("today") or "")
            from_date = iso_day(incoming.get("fromDate")) or iso_day(today)
            to_date = iso_day(incoming.get("toDate")) or iso_day(today)
            test_only = bool(incoming.get("test"))
            fetched = eclass_login_and_fetch(
                login, password, otp, cookie, test_only=test_only, from_date=from_date, to_date=to_date,
            )
            status = fetched.get("status")
            if status == "otp":
                self._json(200, {"status": "otp", "cookie": fetched.get("cookie") or ""})
                return
            if status == "otp_bad":
                self._json(401, {"error": "eclass_otp", "cookie": fetched.get("cookie") or ""})
                return
            if status == "fail":
                self._json(401, {"error": "eclass_login"})
                return
            if status == "unreachable":
                self._json(502, {"error": "eclass_unreachable"})
                return
            if status != "ok":
                self._json(502, {"error": fetched.get("error") or "eclass_error"})
                return
            if test_only:
                self._json(200, {"status": "ok", "tested": True})
                return
            notices = fetched.get("notices") if isinstance(fetched.get("notices"), list) else []
            sources = fetched.get("sources") if isinstance(fetched.get("sources"), list) else []
            chars = int(fetched.get("chars") or 0)
            self._json(200, {
                "status": "ok",
                "phase": "list",
                "notices": notices,
                "fromDate": from_date,
                "toDate": to_date,
                "chars": chars,
                "scrapeFail": len(notices) == 0 and chars < 40,
                "loginPages": int(fetched.get("loginPages") or 0),
                "sources": sources,
                "cookie": fetched.get("cookie") or "",
            })
            return

        if path == "/api/eclass-analyse":
            notices = incoming.get("notices") if isinstance(incoming.get("notices"), list) else []
            clean_notices = []
            for item in notices[:24]:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title") or "").strip()[:120]
                text = str(item.get("text") or "").strip()[:8000]
                if not title and len(text) < 20:
                    continue
                clean_notices.append({
                    "title": title,
                    "date": str(item.get("date") or "")[:10],
                    "source": str(item.get("source") or "")[:20],
                    "text": text,
                    "hasPdf": bool(item.get("hasPdf")),
                })
            if not clean_notices:
                self._json(400, {"error": "empty"})
                return
            today = str(incoming.get("today") or "")
            from_date = iso_day(incoming.get("fromDate")) or iso_day(today)
            to_date = iso_day(incoming.get("toDate")) or iso_day(today)
            locale = str(incoming.get("locale") or "zh")
            classes = incoming.get("classes") or []
            if not isinstance(classes, list):
                classes = []
            teacher = incoming.get("teacher") if isinstance(incoming.get("teacher"), dict) else {}
            filters = incoming.get("filters") if isinstance(incoming.get("filters"), dict) else {}
            blob_parts = []
            for n in clean_notices:
                blob_parts.append(
                    f"[{n['source'] or '通告'}] {n['title']}\n發出日期：{n['date']}\n{n['text']}"
                )
            text = "\n\n".join(blob_parts)
            key = self._poe_key(incoming)
            if not key:
                events = heuristic_events(text, to_date or today) if text_looks_useful(text) else []
                self._json(200, {
                    "status": "ok",
                    "phase": "analyse",
                    "summary": f"從 {len(clean_notices)} 份通告抽出 {len(events)} 項，請核對。",
                    "events": events,
                    "needKey": True,
                    "fromDate": from_date,
                    "toDate": to_date,
                    "sources": sorted({n["source"] for n in clean_notices if n["source"]}),
                })
                return
            try:
                result = call_notice_ai(
                    key,
                    self._poe_model(incoming),
                    text,
                    today,
                    [str(c) for c in classes][:40],
                    locale,
                    teacher,
                    filters,
                    from_date=from_date,
                    to_date=to_date,
                )
            except Exception as err:
                sys.stderr.write("eclass notice ai error=%s\n" % str(err)[:180])
                events = heuristic_events(text, to_date or today) if text_looks_useful(text) else []
                self._json(200, {
                    "status": "ok",
                    "phase": "analyse",
                    "summary": f"從 {len(clean_notices)} 份通告抽出 {len(events)} 項，請核對。",
                    "events": events,
                    "aiError": str(err)[:80],
                    "fromDate": from_date,
                    "toDate": to_date,
                    "sources": sorted({n["source"] for n in clean_notices if n["source"]}),
                })
                return
            result["status"] = "ok"
            result["phase"] = "analyse"
            result["kind"] = "notice"
            result["fromDate"] = from_date
            result["toDate"] = to_date
            result["sources"] = sorted({n["source"] for n in clean_notices if n["source"]})
            self._json(200, result)
            return

        if path == "/api/ai-ping":
            key = self._poe_key(incoming)
            if not key:
                self._json(503, {"error": "missing_key"})
                return
            try:
                reply = call_poe(
                    key,
                    [{"role": "user", "content": "Reply with the single word OK."}],
                    self._poe_model(incoming),
                    timeout=40,
                )
            except RuntimeError as err:
                code = 503 if str(err) in ("missing_key", "bad_key", "no_credits") else 502
                self._json(code, {"error": str(err)})
                return
            self._json(200, {"ok": True, "reply": (reply or "")[:80]})
            return

        self.send_error(404)


def main() -> None:
    os.chdir(ROOT)
    load_env()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    ready = "on" if env_ai_key() else "off (set XAI_API_KEY in .env or a key in Settings)"
    print(f"Teacher Work Platform  http://{HOST}:{PORT}  (AI key {ready})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
