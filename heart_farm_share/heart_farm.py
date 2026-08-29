"""
============================================================================
 Cookie Run — HEART FARM BOT  (standalone, single-file edition)
============================================================================
 What this does: PartyRun only gives you 5 free tickets a day; extra tickets
 cost 20 hearts each. Friends can each send you 1 heart/day. This script:
   1. creates a batch of disposable "guest" accounts (temporary, anonymous)
   2. has them all send YOUR account a friend request, and accepts them
   3. has them all send YOUR account a heart
   4. collects all those hearts
   5. removes those guest friends again (frees the 300-friend-slot cap)
   6. repeats as many times as needed until you have TARGET_HEARTS hearts
 You never need to do anything with the guest accounts yourself -- this all
 happens automatically, fast (parallel), and leaves your real friend list
 untouched (only guest-looking friends are ever removed).

 REQUIREMENT: heavy guest-account creation gets rate-limited by the game's
 login server if it all comes from one IP address. For anything beyond a
 small TARGET_HEARTS, you'll want a rotating proxy (see PROXY_URL in CONFIG
 and README.md) -- without one this will still work, just slower/less
 reliably once DevPlay starts throttling your IP.

 STANDALONE, single-file version -- no other project files needed. Put
 these 2 files in the same folder and you're set:
   heart_farm.py        (this file)
   _descriptors.bin      (the game's gRPC protocol definitions -- required,
                          do not rename or remove)

 SETUP (one time):
   1. Install Python 3.9+ (https://python.org) if you don't have it.
   2. Open a terminal in this folder and run:
        pip install -r requirements.txt
   3. Edit the CONFIG block below: your own DevPlay email/password, how
      many hearts you want, and (recommended) a rotating proxy URL.
   4. Run:
        python heart_farm.py

 See README.md in this folder for more detail / troubleshooting.
============================================================================
"""

# ===========================  CONFIG — EDIT ME  ============================
MAIN_EMAIL    = "your_email@example.com"     # your DevPlay/Cookie Run login email
MAIN_PASSWORD = "your_password"              # your DevPlay/Cookie Run login password

TARGET_HEARTS = 100            # TOTAL hearts wanted, across as many automatic
                                # sessions as it takes (each session uses up to
                                # 300 minus your current real friend count).

# Rotating proxy for guest-account creation (see README.md "Proxy setup").
# Format: "http://user:pass@host:port/" (a rotating-gateway proxy where every
# request goes out on a different exit IP). Leave "" to disable (no proxy) --
# works for small TARGET_HEARTS but will start failing/slowing down once the
# game's login server rate-limits your IP after a handful of guest creations.
PROXY_URL = ""

WORKERS             = 100      # thread-pool concurrency for creating+friending
                                # guests in parallel (safe to parallelize --
                                # each guest is an independent account)
STREAM_CONCURRENCY  = 2        # workers WITHIN the accept/sendlife steps (these
                                # write to YOUR account, so concurrency is
                                # limited -- 2 is the sweet spot: ~2x throughput
                                # with a reliable retry pass covering the rest)
ACCEPT_RETRIES      = 2
ACCEPT_RETRY_SLEEP  = 0.3
GUEST_RETRIES       = 3        # attempts per guest account. Each retry goes out
                                # through a different proxy exit IP with a fresh
                                # device id, which clears both a dead exit node and
                                # a login server that refused the previous one.
GUEST_RETRY_SLEEP   = 0.4      # pause between those attempts.
CLAIM_BATCH         = 50       # mail seqs per AcceptLife call. The server fails
                                # the WHOLE call if it dislikes one mail in it,
                                # so a smaller batch loses less work to a bisect.
CLAIM_LEAF_RETRIES  = 3        # how many single-mail AcceptLife failures still
                                # get a retry before we take them at their word.
CLEANUP_DECLINE_MAX = 200      # most guest friend requests to decline per session.
                                # An account that has farmed for a while can sit on
                                # 1000+ of them; clearing every one inline would
                                # stall the session behind a long burst of writes,
                                # so the rest wait for the next session or for the
                                # friend-requests page, which does them in bulk.
PRINT_EVERY         = 20       # print a progress line every N guests processed
DRY_RUN             = False    # True = just report the plan, send nothing
# ===========================================================================

import os
import sys
import io
import re
import json
import time
import base64
import random
import string
import struct
import copy
import uuid
import queue
import threading
import traceback
import contextlib
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import grpc
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory, json_format
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
DESC_PATH = os.path.join(HERE, "_descriptors.bin")
GAME_FRIEND_CAP = 300  # game.max_friend_count -- the only real ceiling
_SENTINEL = object()


# ============================================================================
#  PART 1 — DS protocol codec (ChaCha20 + FastLZ + urlsafe-base64)
#  Every DS (login/session) request+response body is encrypted+compressed
#  this way. Pure plumbing -- you don't need to understand it to use the script.
# ============================================================================
_DS_KEY = bytes.fromhex(
    "909d2ab5" "4ab9769c" "a6bb0b4c" "ba7da98d"
    "3f2c42d3" "944b881f" "f8587a62" "b000e97e"
)
_DS_NONCE_BASE = bytes.fromhex("a7935a5977760ed63530acd6")
_DS_ENC_VERSION = 4


def _chacha20(data, cipher_len=None):
    if cipher_len is None:
        cipher_len = len(data)
    L = cipher_len & 0xFF
    nonce12 = bytes((b + L) & 0xFF for b in _DS_NONCE_BASE)
    full_nonce = struct.pack("<I", 0) + nonce12
    c = Cipher(algorithms.ChaCha20(_DS_KEY, full_nonce), mode=None)
    e = c.encryptor()
    return e.update(data) + e.finalize()


def _b64_decode(s):
    # urlsafe-base64 (alphabet A-Za-z0-9-_), the same codec the game uses. The
    # C-accelerated stdlib decoder is byte-for-byte identical to the previous
    # hand-rolled loop: it drops stray non-alphabet chars and we re-pad after
    # stripping the original padding.
    if isinstance(s, str):
        s = s.encode("ascii")
    s = s.rstrip(b"=")
    s += b"=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)


def _b64_encode(data):
    # urlsafe-base64 with padding -- identical output to the old manual encoder,
    # just using the C-accelerated stdlib implementation.
    return base64.urlsafe_b64encode(data).decode("ascii")


_MAX_L2_DISTANCE = 8191


def _fastlz1_decompress(data, maxout):
    ip, n, op = 0, len(data), bytearray()
    ctrl = data[ip] & 31; ip += 1
    loop = True
    while loop:
        if ctrl >= 32:
            length = (ctrl >> 5) - 1
            ofs = (ctrl & 31) << 8
            if length == 7 - 1:
                length += data[ip]; ip += 1
            ofs += data[ip]; ip += 1
            ref = len(op) - ofs - 1
            if len(op) + length + 3 > maxout:
                raise ValueError("output overflow")
            if ref < 0:
                raise ValueError("bad reference")
            if ip < n:
                ctrl = data[ip]; ip += 1
            else:
                loop = False
            for _ in range(length + 3):
                op.append(op[ref]); ref += 1
        else:
            count = ctrl + 1
            if ip + count > n:
                raise ValueError("literal overrun")
            op.extend(data[ip:ip + count]); ip += count
            loop = ip < n
            if loop:
                ctrl = data[ip]; ip += 1
    return bytes(op)


def _fastlz2_decompress(data, maxout):
    ip, n, op = 0, len(data), bytearray()
    ip_bound = n - 2
    ctrl = data[ip] & 31; ip += 1
    while True:
        if ctrl >= 32:
            length = (ctrl >> 5) - 1
            ofs = (ctrl & 31) << 8
            ref = len(op) - ofs - 1
            if length == 7 - 1:
                while True:
                    code = data[ip]; ip += 1
                    length += code
                    if code != 255:
                        break
            code = data[ip]; ip += 1
            ref -= code
            length += 3
            if code == 255 and ofs == (31 << 8):
                ofs = data[ip] << 8; ip += 1
                ofs += data[ip]; ip += 1
                ref = len(op) - ofs - _MAX_L2_DISTANCE - 1
            if ref < 0:
                raise ValueError("bad reference")
            if len(op) + length > maxout:
                raise ValueError("output overflow")
            for _ in range(length):
                op.append(op[ref]); ref += 1
        else:
            count = ctrl + 1
            if ip + count > n:
                raise ValueError("literal overrun")
            op.extend(data[ip:ip + count]); ip += count
        if ip > ip_bound:
            break
        ctrl = data[ip]; ip += 1
    return bytes(op)


def _fastlz_decompress(data, maxout=1 << 24):
    if len(data) == 0:
        return b""
    level = (data[0] >> 5) + 1
    return _fastlz1_decompress(data, maxout) if level == 1 else _fastlz2_decompress(data, maxout)


def _fastlz_compress(data):
    out = bytearray()
    i, n = 0, len(data)
    if n == 0:
        return b""
    while i < n:
        chunk = data[i:i + 32]
        out.append(len(chunk) - 1)
        out.extend(chunk)
        i += len(chunk)
    return bytes(out)


def ds_decode_blob(b64str):
    ct = _b64_decode(b64str)
    S = _chacha20(ct, cipher_len=len(ct))
    at = S.find(b"@")
    if at < 0:
        raise ValueError("no '@' separator in decrypted stream")
    orig_len = int(S[:at])
    plain = _fastlz_decompress(S[at + 1:], maxout=orig_len + 64)
    return plain[:orig_len]


def ds_encode_blob(params):
    if isinstance(params, str):
        params = params.encode("utf-8")
    compressed = _fastlz_compress(params)
    S = str(len(params)).encode("ascii") + b"@" + compressed
    ct = _chacha20(S, cipher_len=len(S))
    return _b64_encode(ct)


def ds_build_request_body(params):
    return "isEncryptedData=%d&data=%s" % (_DS_ENC_VERSION, ds_encode_blob(params))


# ============================================================================
#  PART 2 — App/client identity (static app-level values every real Cookie
#  Run client sends) + a FRESH per-guest device fingerprint generator (random
#  IDs, like a newly-installed app -- called once for the main account and
#  once per guest, so nothing reuses a single fixed identity).
# ============================================================================
AUTH_HOST = "https://account.devplay.com"
HTTP_ENDPOINT = "https://server.live.prod.devsnova.cloud/"
GRPC_ENDPOINT = "gserver.live.prod.devsnova.cloud:443"
APP_HEADERS = {
    "x-bundle-id": "com.devsisters.crg",
    "x-api-key": "SrwOwqNLG7fyi0kYvk03xc1s7eM",
    "x-sdk-version": "0.3.3",
    "x-env": "prod",
    "user-agent": "okhttp/5.3.2",
}


def _env(name, default):
    """Environment override for a client-identity value ("" counts as unset)."""
    return (os.environ.get(name) or "").strip() or default


# The game server refuses any client older than the live build (DS
# responseCode 364, "LOW CLIENT VERSION"), so these have to track whatever
# Cookie Run: Kingdom currently ships. After a game update, set them to the
# version + build code the store lists for com.devsisters.crg -- either edit
# the defaults here or set the CRK_* environment variables, which is what the
# backend deployment uses so a bump needs no code change.
APP_VERSION = _env("CRK_APP_VERSION", "26.8.02")
APP_BUILD = _env("CRK_APP_BUILD", "651")
COMBO_NAME = _env("CRK_COMBO_NAME", "26.6.1_dusrmsdyrhl_crg")
LIVE_INDEX_HASH = _env("CRK_INDEX_HASH", "26e9ec2e5bc49b34877b3d784db97c5c")
_LC_TEMPLATE = {
    "app_build": APP_BUILD,
    "app_version": APP_VERSION,
    "locale_on_game": "en",
    "location_country": "TH",
    "os_name": "android",
    "os_version": "12",
    "store": "playstore",
    "timezone": "Asia/Bangkok",
    "library_version": "0.3.3-rc19",
    "library_name": "DevPlay Cocos SDK",
    "device": {"traits": [], "manufacturer": "Samsung", "model": "SM-S918U", "version": "Android OS 12"},
}

_PROXIES = {"http": PROXY_URL, "https": PROXY_URL} if PROXY_URL else None


def _rand_uuid():
    return str(uuid.uuid4())


def fresh_lc():
    """A fresh device identity -- called once per account (main or guest) so
    nothing reuses one fixed fingerprint across many accounts/runs."""
    lc = copy.deepcopy(_LC_TEMPLATE)
    lc["devsisters_id"] = _rand_uuid()
    lc["anonymous_id"] = _rand_uuid()
    lc["fgs_id"] = _rand_uuid()
    lc["app_installed_id"] = _rand_uuid()
    lc["semi_device_id"] = _rand_uuid().replace("-", "")[:16]
    return lc


def _rand_cable(n=20):
    al = string.ascii_letters + string.digits + "-_"
    return "".join(random.choices(al, k=n))


def _jwt_payload(tok):
    try:
        p = tok.split(".")[1]
        p += "=" * (-len(p) % 4)
        return json.loads(base64.urlsafe_b64decode(p))
    except Exception:
        return {}


def _jwt_exp(tok):
    return _jwt_payload(tok).get("exp", 0)


# ============================================================================
#  PART 3 — gRPC: load the game's protocol definitions (FileDescriptorSet)
#  and build message classes dynamically. No pre-generated *_pb2.py needed.
# ============================================================================
def _build_pool():
    if not os.path.exists(DESC_PATH):
        raise SystemExit("!! _descriptors.bin not found next to heart_farm.py -- "
                          "make sure you copied BOTH files together.")
    fds = descriptor_pb2.FileDescriptorSet()
    fds.ParseFromString(open(DESC_PATH, "rb").read())
    pool = descriptor_pool.DescriptorPool()
    files = {f.name: f for f in fds.file}
    done = set()

    def add(name, stack):
        if name in done or name not in files or name in stack:
            return
        stack.add(name)
        f = files[name]
        for dep in f.dependency:
            add(dep, stack)
        try:
            pool.Add(f)
        except Exception:
            pass
        done.add(name)
        stack.discard(name)

    for n in list(files):
        add(n, set())
    return pool


_POOL = None


def _pool():
    global _POOL
    if _POOL is None:
        _POOL = _build_pool()
    return _POOL


def _msgcls(desc):
    try:
        return message_factory.GetMessageClass(desc)
    except AttributeError:
        return message_factory.MessageFactory(_pool()).GetPrototype(desc)


# ============================================================================
#  PART 4 — low-level DS envelope + HTTP call (shared by main + guest logins)
# ============================================================================
_HTTP = requests.Session()

_LOGIN_ERROR_MESSAGES = {
    40101: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    40102: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    40401: "ไม่พบบัญชีนี้ในระบบ DevPlay",
    42901: "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
}


def _ds_envelope(lc, mid, session, pid, authed=True):
    env = {
        "pid": pid,
        "currentLv": session.get("lv", 0) if authed else 0,
        "socialUidCommon": mid if authed else "NULL",
        "ver": lc["app_version"], "buildVer": lc["app_build"], "cc": "US",
        "ms": _gen_ms(session), "osType": "A", "osVersion": lc["os_version"],
        "timeZone": lc["timezone"], "timeZoneDistance": 25200,
        "marketType": "GOOGLE_PLAY", "carrier": "", "fgsId": lc.get("fgs_id", ""),
        "locale": "en-US", "deviceId": lc.get("semi_device_id", ""),
        "deviceName": lc["device"]["model"], "deviceModel": lc["device"]["model"],
        "cable": _rand_cable(),
    }
    if authed:
        env["sessionKey"] = session.get("session_key", "")
    return env


def _gen_ms(session):
    """`ms` is NOT a timestamp -- it's a memberSeq-derived pseudo-random value
    the real client sends; a wrong value causes a 504 error."""
    try:
        ms_seq = int(session.get("member_seq") or 0)
    except (TypeError, ValueError):
        ms_seq = 0
    ms_seq &= 0xFFFFFFFF
    if ms_seq >= 0x80000000:
        ms_seq -= 0x100000000
    divisor = (ms_seq % 1000) + 3
    return (random.randint(0, 999) + 3) * divisor


def _ds_call(path, params):
    body = ds_build_request_body(json.dumps(params, separators=(",", ":")))
    url = HTTP_ENDPOINT.rstrip("/") + "/" + path.lstrip("/")
    headers = {
        "Host": HTTP_ENDPOINT.split("//", 1)[-1].rstrip("/"),
        "Accept": "*/*", "Accept-Encoding": "gzip",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": APP_HEADERS["user-agent"],
    }
    r = _HTTP.post(url, data=body, headers=headers, timeout=30)
    try:
        obj = json.loads(r.text)
    except Exception:
        raise RuntimeError("เซิร์ฟเวอร์ตอบกลับแบบไม่รู้จัก (%d): %r" % (r.status_code, r.text[:200]))
    data = None
    if obj.get("responseData"):
        try:
            data = json.loads(ds_decode_blob(obj["responseData"]).decode("utf-8"))
        except Exception as e:
            data = {"__decode_error__": str(e)}
    return {"code": obj.get("responseCode"), "message": obj.get("responseMessage"), "data": data}


def _ds_init_error(res, lc):
    """Message for a failed initMember3. Code 364 is the one that shows up
    after every game update -- the server has moved on and rejects the version
    we claim -- so it gets told apart from a generic failure and says exactly
    which value to bump, instead of dumping a raw response nobody can act on."""
    if res.get("code") == 364:
        return (
            "เวอร์ชันเกมที่สคริปต์แจ้งไป (%s build %s) เก่ากว่าที่เซิร์ฟเวอร์รับแล้ว "
            "(LOW CLIENT VERSION) — Cookie Run ออกเวอร์ชันใหม่ ให้ตั้ง CRK_APP_VERSION "
            "และ CRK_APP_BUILD เป็นเวอร์ชัน/build ล่าสุดของแอปบน Google Play "
            "(หรือแก้ APP_VERSION/APP_BUILD ในไฟล์นี้) แล้วรันใหม่"
            % (lc.get("app_version", ""), lc.get("app_build", ""))
        )
    return "เข้าเกมไม่สำเร็จ (initMember3): %s" % json.dumps(res, ensure_ascii=False)[:300]


def _ds_init_member(mid, lc, session):
    """Calls member/initMember3.ds -- required once per account (main or
    guest) before any gRPC call, else the game server returns UNAUTHENTICATED.
    Fills in session["session_key"]/["member_seq"]/["lv"] in place."""
    p = _ds_envelope(lc, mid, session, "member/initMember3.ds", authed=False)
    p.update({
        "mid": mid, "playerId": mid, "agreementSeq": "0", "pushToken": "",
        "accessToken": session["access_token"], "agreement": "40082",
        "mobclixSignature": "", "macAddress": "02:00:00:00:00:00",
    })
    res = _ds_call("member/initMember3.ds", p)
    if res["code"] != 200 or not res["data"]:
        raise RuntimeError(_ds_init_error(res, lc))
    d = res["data"]
    session["session_key"] = d.get("sessionKey")
    session["member_seq"] = d.get("memberSeq")
    session["lv"] = d.get("lv", 0)
    return d


# ============================================================================
#  PART 5 — MainAccount: your real account (email/password login) + gRPC
# ============================================================================
class MainAccount:
    def __init__(self, email, password):
        self.email = email
        self.lc = fresh_lc()
        self.mid = ""
        self.session = {}
        self._login(email, password)
        _ds_init_member(self.mid, self.lc, self.session)
        self.member_seq = self.session["member_seq"]
        self.lv = self.session.get("lv", 0)
        self._md = [
            ("authorization", "Bearer " + self.session["access_token"]), ("player-id", self.mid),
            ("combo-name", COMBO_NAME), ("index-file-hash", LIVE_INDEX_HASH),
            ("version", self.lc.get("app_version", "")),
            ("version.code", str(self.lc.get("app_build", ""))),
            ("os.version", str(self.lc.get("os_version", ""))),
            ("login-platform", "GUEST"), ("market-type", "GOOGLE_PLAY"),
        ]
        # ONE persistent channel reused for every call -- opening a fresh
        # grpc.secure_channel() (TCP+TLS handshake) per call is most of the
        # per-call latency otherwise.
        self._channel = grpc.secure_channel(GRPC_ENDPOINT, grpc.ssl_channel_credentials())
        self._stub_cache = {}
        print("[+] main account ready  mid=%s memberSeq=%s lv=%s" % (self.mid, self.member_seq, self.lv))

    def _login(self, email, password):
        lc = dict(self.lc); lc["devsisters_id"] = ""
        headers = {
            "X-Bundle-Id": APP_HEADERS["x-bundle-id"], "X-API-Key": APP_HEADERS["x-api-key"],
            "Content-Type": "application/json; charset=utf-8", "User-Agent": APP_HEADERS["user-agent"],
        }

        def _post(path, obj):
            data = json.dumps(obj).encode()
            req = urllib.request.Request(AUTH_HOST + "/" + path, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())

        try:
            _post("v4/checkemail", {"email": email, "lc": lc})
            d = _post("v3/login/devsisters", {"email": email, "password": password, "oven_access_token": "", "lc": lc})
        except urllib.error.URLError as e:
            raise RuntimeError("เชื่อมต่อเซิร์ฟเวอร์ DevPlay ไม่ได้: %s" % e)
        tok = d.get("game_access_token")
        if not tok:
            msg = _LOGIN_ERROR_MESSAGES.get(d.get("code"), "เซิร์ฟเวอร์ปฏิเสธการเข้าสู่ระบบ (code %s)" % d.get("code"))
            raise RuntimeError("เข้าสู่ระบบไม่สำเร็จ: %s\n%s" % (msg, json.dumps(d, ensure_ascii=False)[:300]))
        member = d.get("member") or {}
        self.mid = member.get("mid") or self.mid
        self.session["access_token"] = tok

    def _stub(self, service, method):
        key = (service, method)
        stub = self._stub_cache.get(key)
        if stub is None:
            svc = _pool().FindServiceByName(service)
            mth = svc.FindMethodByName(method)
            OutC = _msgcls(mth.output_type)
            stub = (self._channel.unary_unary(
                        "/%s/%s" % (service, method),
                        request_serializer=lambda x: x.SerializeToString(),
                        response_deserializer=OutC.FromString),
                    _msgcls(mth.input_type))
            self._stub_cache[key] = stub
        return stub

    def unary(self, service, method, req=None):
        call, InC = self._stub(service, method)
        r = InC()
        json_format.ParseDict(req or {}, r, ignore_unknown_fields=True)
        try:
            resp = call(r, metadata=self._md, timeout=25)
            return json_format.MessageToDict(resp, preserving_proto_field_name=True)
        except grpc.RpcError as e:
            return {"__error__": True, "code": str(e.code()), "details": e.details()}

    def ds_call(self, path, extra=None):
        p = _ds_envelope(self.lc, self.mid, self.session, path, authed=True)
        p["memberSeq"] = self.member_seq
        p["accessToken"] = self.session["access_token"]
        if extra:
            p.update(extra)
        return _ds_call(path, p)

    def close(self):
        self._channel.close()


# ============================================================================
#  PART 6 — Guest: disposable anonymous account (created via a rotating
#  proxy to avoid the login server's per-IP rate limit) + its own gRPC channel.
#  Fully disk-free -- nothing about a guest is ever written to disk.
# ============================================================================
def create_guest(retries=GUEST_RETRIES):
    """A rotating proxy pool inevitably includes some dead/unreachable exit
    nodes, and the login server also refuses to mint a guest outright through
    some of them -- HTTP 200 carrying a non-20000 code and no token. Both are
    per-attempt problems the next try leaves behind, because it goes out through
    a different exit IP with a fresh device id, so a refusal is retried exactly
    like a dead socket. (Only network errors used to be retried: ANY answer
    broke out of the loop, so a refusal burned the whole guest on its first and
    only exit node -- the one case the retries were written for.) Never lets a
    transient failure propagate; it would kill the whole parallel batch of
    guest creations."""
    headers = {
        "x-bundle-id": APP_HEADERS["x-bundle-id"], "x-api-key": APP_HEADERS["x-api-key"],
        "x-sdk-version": APP_HEADERS["x-sdk-version"], "x-env": APP_HEADERS["x-env"],
        "content-type": "application/json; charset=utf-8", "accept-encoding": "gzip",
        "user-agent": APP_HEADERS["user-agent"],
    }
    last = None
    for attempt in range(retries):
        if attempt:
            time.sleep(GUEST_RETRY_SLEEP)
        # Fresh lc + device id per attempt: if the refusal is pinned to the device
        # rather than the exit IP, replaying the same one just earns the same no.
        lc, device_id = fresh_lc(), _rand_uuid()
        body = {"guest_secret": "", "lc": lc, "device_id": device_id}
        try:
            r = requests.post(AUTH_HOST + "/v3/login", headers=headers, json=body, timeout=25, proxies=_PROXIES)
        except requests.RequestException as e:
            last = {"__error__": True, "network_error": str(e)}
            continue
        try:
            d = r.json()
        except Exception:
            last = {"__error__": True, "status": r.status_code, "raw": r.text[:400]}
            continue
        if d.get("code") != 20000 or not d.get("game_access_token"):
            last = {"__error__": True, "status": r.status_code, "resp": d}
            continue
        member = d.get("member", {})
        return {
            "mid": member.get("mid"), "guest_secret": d.get("guest_secret"),
            "game_access_token": d.get("game_access_token"), "device_id": device_id, "lc": lc,
        }
    if last is None:                       # retries <= 0, nothing was ever tried
        return {"__error__": True, "network_error": "create_guest(retries=%r)" % retries}
    last["attempts"] = retries
    return last


# ---- shared gRPC channel for ALL guests -------------------------------------
# Every guest RPC authenticates via per-call metadata (Guest.md()), so a single
# gRPC channel can serve every guest. Reusing one channel avoids a TCP+TLS
# handshake per guest (up to ~300 per session, created WORKERS-way in parallel)
# -- that handshake was most of each guest's per-call latency. A gRPC channel is
# safe to share across threads and multiplexes concurrent calls, so this changes
# neither concurrency nor behavior, only removes redundant connection setup.
_GUEST_CHANNEL = None
_GUEST_CHANNEL_LOCK = threading.Lock()


def _guest_channel():
    global _GUEST_CHANNEL
    ch = _GUEST_CHANNEL
    if ch is None:
        with _GUEST_CHANNEL_LOCK:
            ch = _GUEST_CHANNEL
            if ch is None:
                ch = grpc.secure_channel(GRPC_ENDPOINT, grpc.ssl_channel_credentials())
                _GUEST_CHANNEL = ch
    return ch


def _close_guest_channel():
    global _GUEST_CHANNEL
    with _GUEST_CHANNEL_LOCK:
        if _GUEST_CHANNEL is not None:
            _GUEST_CHANNEL.close()
            _GUEST_CHANNEL = None


class Guest:
    def __init__(self, rec):
        self.rec = rec
        self.mid = rec["mid"]
        self.lc = rec["lc"]
        self.session = {"access_token": rec["game_access_token"]}
        self._stub_cache = {}

    def token(self):
        tok = self.session.get("access_token", "")
        if tok and _jwt_exp(tok) > time.time() + 120:
            return tok
        headers = {
            "x-bundle-id": APP_HEADERS["x-bundle-id"], "x-api-key": APP_HEADERS["x-api-key"],
            "content-type": "application/json; charset=utf-8", "user-agent": APP_HEADERS["user-agent"],
        }
        body = {"guest_secret": self.rec["guest_secret"], "lc": self.lc, "device_id": self.rec.get("device_id", "")}
        d = requests.post(AUTH_HOST + "/v3/login", headers=headers, json=body, timeout=25).json()
        if not d.get("game_access_token"):
            raise RuntimeError("guest re-login failed: " + json.dumps(d, ensure_ascii=False)[:300])
        self.session["access_token"] = d["game_access_token"]
        return self.session["access_token"]

    def md(self):
        return [
            ("authorization", "Bearer " + self.token()), ("player-id", self.mid),
            ("combo-name", COMBO_NAME), ("index-file-hash", LIVE_INDEX_HASH),
            ("version", self.lc.get("app_version", "")), ("version.code", str(self.lc.get("app_build", ""))),
            ("os.version", str(self.lc.get("os_version", ""))),
            ("login-platform", "GUEST"), ("market-type", "GOOGLE_PLAY"),
        ]

    def ensure_game_member(self):
        if self.session.get("member_seq"):
            return self.session["member_seq"]
        _ds_init_member(self.mid, self.lc, self.session)
        return self.session["member_seq"]

    def _channel(self):
        return _guest_channel()

    def unary(self, service, method, req):
        key = (service, method)
        cached = self._stub_cache.get(key)
        if cached is None:
            svc = _pool().FindServiceByName(service)
            mth = svc.FindMethodByName(method)
            OutC = _msgcls(mth.output_type)
            stub = self._channel().unary_unary(
                "/%s/%s" % (service, method),
                request_serializer=lambda x: x.SerializeToString(),
                response_deserializer=OutC.FromString)
            cached = (stub, _msgcls(mth.input_type))
            self._stub_cache[key] = cached
        stub, InC = cached
        r = InC(); json_format.ParseDict(req or {}, r, ignore_unknown_fields=True)
        try:
            resp = stub(r, metadata=self.md(), timeout=25)
            return json_format.MessageToDict(resp, preserving_proto_field_name=True)
        except grpc.RpcError as e:
            return {"__error__": True, "code": str(e.code()), "details": e.details()}

    def close(self):
        # the gRPC channel is shared across all guests -- do NOT close it here;
        # it is closed once at program end via _close_guest_channel(). Just drop
        # this guest's stub references.
        self._stub_cache.clear()


# ============================================================================
#  PART 7 — the 3-stage farm pipeline
#  STAGE 1 producer      (WORKERS-way parallel)  guest create+friend -> accept_q
#  STAGE 2 accept_stream (STREAM_CONCURRENCY, its own thread)  accept_q -> sendlife_q
#  STAGE 3 sendlife_stream (STREAM_CONCURRENCY, its own thread) sendlife_q -> accepted[]
#  All three run AT THE SAME TIME -- total wall time collapses toward
#  max(creation, accept, sendlife) instead of their sum. See the project this
#  was extracted from for the full live-tested rationale/numbers.
# ============================================================================
def create_and_friend_one(main_mid):
    try:
        rec = create_guest()
        if rec.get("__error__"):
            # Lead with the reason and the attempt count: the payload is long
            # enough that truncation used to cut the answer off mid-field.
            reason = (rec.get("resp") or {}).get("code") or rec.get("network_error") or rec.get("raw") or "?"
            print("  [producer] guest create FAILED [%s] after %s attempt(s): %s"
                  % (str(reason)[:60], rec.get("attempts", 1), json.dumps(rec, ensure_ascii=False)[:180]))
            return None
        g = Guest(rec)
        gseq = g.ensure_game_member()
        r = g.unary("service.api.FriendAPI", "SendFriendRequest",
                    {"common_req": {}, "player_id": main_mid, "source": "FRIEND_REQUEST_SOURCE_MANUAL"})
        if r.get("__error__"):
            print("  [producer] %s SendFriendRequest FAILED: %s" % (g.mid, r))
            return None
        return (g, gseq)
    except Exception as e:
        print("  [producer] guest error: %s" % e)
        return None


def _run_producer(main_mid, to_create, q):
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = [ex.submit(create_and_friend_one, main_mid) for _ in range(to_create)]
        for fut in as_completed(futs):
            q.put(fut.result())
    q.put(_SENTINEL)


def guest_send_life(g, main_member_seq):
    try:
        r = g.unary("service.api.LifeMailAPI", "SendLife", {"common_req": {}, "to_member_seq": main_member_seq})
        return (not r.get("__error__")), r
    except Exception as e:
        return False, {"exception": str(e)}


def _list_friends(main):
    """Live friend list + the incoming requests still waiting for an answer.
    Returns (friends, pending, err); friends is None when the call failed."""
    lf = main.unary("service.api.FriendAPI", "ListFriends", {"common_req": {}})
    if lf.get("__error__"):
        return None, None, lf
    return (lf.get("friends") or []), (lf.get("received_friend_requests") or []), None


def _reserve_friend_slot(room, room_lock):
    """Take one of the remaining slots under the friend cap, or report that there
    are none left. Reserved BEFORE the accept call, never after, so concurrent
    workers cannot overshoot the cap in the gap between checking and accepting."""
    with room_lock:
        if room["left"] <= 0:
            room["blocked"] += 1
            return False
        room["left"] -= 1
        return True


def _release_friend_slot(room, room_lock):
    with room_lock:
        room["left"] += 1


def _accept_friend(main, mid):
    r = None
    for attempt in range(ACCEPT_RETRIES):
        r = main.unary("service.api.FriendAPI", "HandleFriendRequest", {"common_req": {}, "player_id": mid, "accept": True})
        if not r.get("__error__"):
            return True, r
        if attempt < ACCEPT_RETRIES - 1:
            time.sleep(ACCEPT_RETRY_SLEEP)
    return False, r


def _accept_worker(main, in_q, out_q, retry_list, retry_lock, progress, progress_lock, to_create, t0, room, room_lock):
    while True:
        item = in_q.get()
        if item is _SENTINEL:
            in_q.put(_SENTINEL)
            return
        if item is None:
            with progress_lock:
                progress["create_fail"] += 1
                progress["n"] += 1
            continue
        g, gseq = item
        if not _reserve_friend_slot(room, room_lock):
            # no room under the cap -- accepting would just fail server-side, so
            # drop this guest instead of burning retries on a guaranteed refusal.
            with progress_lock:
                progress["n"] += 1
            continue
        r = main.unary("service.api.FriendAPI", "HandleFriendRequest", {"common_req": {}, "player_id": g.mid, "accept": True})
        if not r.get("__error__"):
            out_q.put((g, gseq))
        else:
            _release_friend_slot(room, room_lock)
            with retry_lock:
                retry_list.append((g, gseq))
        with progress_lock:
            progress["n"] += 1
            if progress["n"] % PRINT_EVERY == 0 or progress["n"] == to_create:
                print("    ... [accept] %d/%d  %.1fs elapsed" % (progress["n"], to_create, time.time() - t0))


def _accept_stream(main, in_q, out_q, to_create, stats, stats_lock, friend_room):
    t0 = time.time()
    retry_list, retry_lock = [], threading.Lock()
    progress, progress_lock = {"n": 0, "create_fail": 0}, threading.Lock()
    room, room_lock = {"left": friend_room, "blocked": 0}, threading.Lock()
    threads = [threading.Thread(target=_accept_worker,
                                args=(main, in_q, out_q, retry_list, retry_lock, progress, progress_lock, to_create, t0, room, room_lock))
               for _ in range(STREAM_CONCURRENCY)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    with stats_lock:
        stats["create_fail"] += progress["create_fail"]

    if retry_list:
        # The friend count we started with is only a snapshot, and a failed accept
        # is more often the cap than a hiccup -- a cap does not heal on retry. Ask
        # the server for the live count once before spending ACCEPT_RETRIES on
        # every guest in the list.
        friends, _pending, err = _list_friends(main)
        if friends is not None:
            live_room = max(0, GAME_FRIEND_CAP - len(friends))
            with room_lock:
                room["left"] = live_room
            if live_room <= 0:
                print("    [accept] at the %d-friend cap (%d friends) -- skipping %d retries"
                      % (GAME_FRIEND_CAP, len(friends), len(retry_list)))
                with room_lock:
                    room["blocked"] += len(retry_list)
                retry_list = []
    if retry_list:
        print("    [accept] mop-up: retrying %d failures sequentially ..." % len(retry_list))
        for g, gseq in retry_list:
            if not _reserve_friend_slot(room, room_lock):
                continue
            ok, r = _accept_friend(main, g.mid)
            if ok:
                out_q.put((g, gseq))
            else:
                _release_friend_slot(room, room_lock)
                with stats_lock:
                    stats["accept_fail"] += 1
                print("    %s accept FAILED (after mop-up) -> %s" % (g.mid, json.dumps(r, ensure_ascii=False)[:150]))
    if room["blocked"]:
        with stats_lock:
            stats["accept_cap_blocked"] += room["blocked"]
        print("    [accept] %d guest(s) skipped: no room under the %d-friend cap"
              % (room["blocked"], GAME_FRIEND_CAP))
    out_q.put(_SENTINEL)


def _sendlife_worker(in_q, main_member_seq, accepted, accepted_lock, retry_list, retry_lock, progress, progress_lock, to_create, t0):
    while True:
        item = in_q.get()
        if item is _SENTINEL:
            in_q.put(_SENTINEL)
            return
        g, gseq = item
        success, _ = guest_send_life(g, main_member_seq)
        if success:
            with accepted_lock:
                accepted.append((g, gseq))
        else:
            with retry_lock:
                retry_list.append((g, gseq))
        with progress_lock:
            progress["n"] += 1
            if progress["n"] % PRINT_EVERY == 0 or progress["n"] == to_create:
                print("    ... [sendlife] %d/%d (%d ok)  %.1fs elapsed" % (progress["n"], to_create, len(accepted), time.time() - t0))


def _sendlife_stream(in_q, main_member_seq, accepted, to_create, stats, stats_lock):
    t0 = time.time()
    accepted_lock = threading.Lock()
    retry_list, retry_lock = [], threading.Lock()
    progress, progress_lock = {"n": 0}, threading.Lock()
    threads = [threading.Thread(target=_sendlife_worker,
                                args=(in_q, main_member_seq, accepted, accepted_lock, retry_list, retry_lock, progress, progress_lock, to_create, t0))
               for _ in range(STREAM_CONCURRENCY)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    if retry_list:
        print("    [sendlife] mop-up: retrying %d failures sequentially ..." % len(retry_list))
        for g, gseq in retry_list:
            success, r = guest_send_life(g, main_member_seq)
            if success:
                accepted.append((g, gseq))
            else:
                with stats_lock:
                    stats["sendlife_fail"] += 1
                print("    %s SendLife FAILED (after mop-up) -> %s" % (g.mid, json.dumps(r, ensure_ascii=False)[:150]))


def run_pipeline_from_queue(main, in_q, to_create, friend_room):
    if to_create <= 0:
        return []
    sendlife_q = queue.Queue()
    accepted = []
    stats = {"create_fail": 0, "accept_fail": 0, "accept_cap_blocked": 0, "sendlife_fail": 0}
    stats_lock = threading.Lock()

    accept_t = threading.Thread(target=_accept_stream, args=(main, in_q, sendlife_q, to_create, stats, stats_lock, friend_room))
    sendlife_t = threading.Thread(target=_sendlife_stream, args=(sendlife_q, main.member_seq, accepted, to_create, stats, stats_lock))
    accept_t.start()
    sendlife_t.start()
    accept_t.join()
    sendlife_t.join()

    print("  pipeline done: %d/%d guests fully accepted + sent a heart. (create_fail=%d accept_fail=%d cap_blocked=%d sendlife_fail=%d)"
          % (len(accepted), to_create, stats["create_fail"], stats["accept_fail"],
             stats["accept_cap_blocked"], stats["sendlife_fail"]))
    return accepted


# -------------------------------- CLAIM --------------------------------------
def _accept_life(main, seqs):
    r = main.unary("service.api.LifeMailAPI", "AcceptLife", {"common_req": {}, "mail_seq": seqs})
    return (not r.get("__error__")), r


def _claim_seqs(main, seqs, state):
    """Claim `seqs` in ONE AcceptLife call, halving the batch on failure.

    The server answers the whole call with INTERNAL SERVER ERROR when it dislikes
    a SINGLE mail in it (already collected, expired, sender deleted), so a failed
    batch says nothing about the other seqs it carried. Bisecting isolates the bad
    ones in ~2*log2(n) extra calls instead of degrading the entire remainder to one
    call per mail -- the old fallback, which cost hundreds of sequential round
    trips whenever a single stale mail was in the mailbox."""
    ok, r = _accept_life(main, seqs)
    state["calls"] += 1
    if not ok and len(seqs) == 1 and len(state["bad"]) < CLAIM_LEAF_RETRIES:
        # a lone seq may just have caught a transient 500 -- give it one retry
        # before writing it off. Only worth it while failures are still rare: a
        # mailbox full of stale mail would otherwise pay a retry per seq.
        time.sleep(ACCEPT_RETRY_SLEEP)
        ok, r = _accept_life(main, seqs)
        state["calls"] += 1
    if ok:
        state["ok"] += len(seqs)
        if r.get("life_count") is not None:
            state["life_count"] = r.get("life_count")
        return
    if len(seqs) == 1:
        state["bad"].append((seqs[0], r))
        return
    half = len(seqs) // 2
    _claim_seqs(main, seqs[:half], state)
    _claim_seqs(main, seqs[half:], state)


def claim_hearts(main, guests=None):
    print("\n=== CLAIM ===")
    ml = main.ds_call("game/myMailList.ds")
    mail_list = (ml.get("data") or {}).get("mailList") or []
    print("  mailbox entries: %d" % len(mail_list))

    if guests:
        known_senders = {gseq for _, gseq in guests}
        good = [m.get("seq") for m in mail_list if m.get("seq") and m.get("fromMemberSeq") in known_senders]
        skipped = len(mail_list) - len(good)
    else:
        good, skipped = [m.get("seq") for m in mail_list if m.get("seq")], 0
    print("  claimable this session: %d  (skipping %d unrelated/orphaned)" % (len(good), skipped))
    if not good:
        print("  nothing to collect.")
        return 0

    state = {"ok": 0, "calls": 0, "life_count": None, "bad": []}
    for i in range(0, len(good), CLAIM_BATCH):
        chunk = good[i:i + CLAIM_BATCH]
        before = state["ok"]
        _claim_seqs(main, chunk, state)
        if state["ok"] - before < len(chunk):
            print("  AcceptLife batch %d-%d: %d/%d claimed after bisect"
                  % (i + 1, i + len(chunk), state["ok"] - before, len(chunk)))
    if state["bad"]:
        seq, r = state["bad"][0]
        print("  %d mail(s) rejected on their own (already collected / expired?) e.g. seq=%s -> %s"
              % (len(state["bad"]), seq, json.dumps(r, ensure_ascii=False)[:150]))
    print("  collected %d/%d  (%d AcceptLife call(s))" % (state["ok"], len(good), state["calls"]))
    if state["life_count"] is not None:
        print("  life_count now = %s" % state["life_count"])
    return state["ok"]


def _looks_like_guest(friend):
    return friend.get("level") == 1 and not (friend.get("profile") or {}).get("nickname")


def _decline_stale_requests(main, pending, session_mids):
    """A friend request that was never accepted is NOT a friend, so RemoveFriend
    never touches it: every guest whose accept failed leaves one sitting in the
    account for good, and they pile up run after run. Decline the ones that are
    plainly ours -- anything that looks like a real player is left alone."""
    stale = []
    for fr in pending or []:
        requester = fr.get("requester") or {}
        pid = requester.get("player_id")
        if pid and (pid in session_mids or _looks_like_guest(requester)):
            stale.append(pid)
    if not stale:
        return 0
    backlog = len(stale)
    if backlog > CLEANUP_DECLINE_MAX:
        stale = stale[:CLEANUP_DECLINE_MAX]
        print("  %d/%d pending friend request(s) look like guests -> declining the first %d"
              % (backlog, len(pending or []), len(stale)))
        print("     (the remaining %d wait for the next session, or clear them in bulk"
              " from the friend-requests page)" % (backlog - len(stale)))
    else:
        print("  %d/%d pending friend request(s) look like guests -> declining"
              % (backlog, len(pending or [])))
    if DRY_RUN:
        print("  DRY_RUN -> would decline %d." % len(stale))
        return 0
    declined = 0
    for i, pid in enumerate(stale, 1):
        r = main.unary("service.api.FriendAPI", "HandleFriendRequest",
                       {"common_req": {}, "player_id": pid, "accept": False})
        if r.get("__error__"):
            print("    %s decline FAILED -> %s" % (pid, json.dumps(r, ensure_ascii=False)[:120]))
        else:
            declined += 1
        if i % PRINT_EVERY == 0 and i < len(stale):
            print("    ... [decline] %d/%d" % (i, len(stale)))
    print("  declined %d/%d pending request(s)." % (declined, len(stale)))
    return declined


def cleanup_guests(main, guests):
    print("\n=== CLEANUP: removing guest friends (free slots for next session) ===")
    all_friends, pending, err = _list_friends(main)
    if all_friends is None:
        print("  ListFriends FAILED:", err); return None
    session_mids = {g.mid for g, _ in (guests or [])}
    to_remove = sorted({f["player_id"] for f in all_friends if _looks_like_guest(f)} | session_mids)
    # Count the friends that will actually survive, rather than subtracting the
    # removal list: a session mid that is no longer a friend (its accept failed,
    # or the server dropped it) is in to_remove without being in all_friends, and
    # subtracting would under-report -- which is what makes the next session
    # oversize itself and run into the friend cap.
    dropping = set(to_remove)
    real_count = sum(1 for f in all_friends if f.get("player_id") not in dropping)
    print("  %d total friends, %d look like guests (incl. %d from this session)"
          % (len(all_friends), len(to_remove), len(session_mids)))
    _decline_stale_requests(main, pending, session_mids)
    if not to_remove:
        print("  nothing to remove.")
        return real_count
    if DRY_RUN:
        print("  DRY_RUN -> would remove %d." % len(to_remove))
        return real_count
    r = main.unary("service.api.FriendAPI", "RemoveFriend", {"common_req": {}, "player_ids": to_remove})
    if r.get("__error__"):
        print("  RemoveFriend FAILED:", r)
        return None
    print("  removed %d guest friends." % len(to_remove))
    return real_count


# ------------------------------ SESSION / TARGET -------------------------------
def _fill_from_shared_queue(shared_q, n):
    local_q = queue.Queue()
    got = 0
    ran_dry = False
    for _ in range(n):
        item = shared_q.get()
        if item is _SENTINEL:
            ran_dry = True
            break
        local_q.put(item)
        got += 1
    return local_q, got, ran_dry


def run_session_from_queue(main, session_q, n, friend_room):
    guests = []
    real_count_after = None
    try:
        guests = run_pipeline_from_queue(main, session_q, n, friend_room)
        collected = claim_hearts(main, guests)
        real_count_after = cleanup_guests(main, guests)
        return collected, real_count_after
    finally:
        for g, _ in guests:
            g.close()


def run_until_target(main, target_hearts):
    total = 0
    session_num = 0
    zero_progress_streak = 0
    known_real_count = None

    estimated_total_guests = int(target_hearts * 1.05) + 10
    shared_q = queue.Queue()
    producer_t = threading.Thread(target=_run_producer, args=(main.mid, estimated_total_guests, shared_q), daemon=True)
    producer_t.start()

    while total < target_hearts:
        session_num += 1
        # Always ask the server for the real count. What cleanup_guests returns is
        # a prediction (it assumes every RemoveFriend landed), and when it drifts
        # low we size the session too big and every accept past the cap fails.
        friends, pending, err = _list_friends(main)
        if friends is None:
            current_count = known_real_count if known_real_count is not None else 0
            note = ("  ListFriends FAILED (%s) -- using the estimated count %d"
                    % (json.dumps(err, ensure_ascii=False)[:100], current_count))
        else:
            current_count = len(friends)
            note = ("  %d friend request(s) still pending from earlier runs" % len(pending)) if pending else None
        room = max(0, GAME_FRIEND_CAP - current_count)
        remaining = target_hearts - total
        n = min(room, remaining)
        print("\n########## SESSION %d ##########" % session_num)
        print("  target=%d  collected so far=%d  still need=%d  room=%d(300-%d real friends)  this session=%d"
              % (target_hearts, total, remaining, room, current_count, n))
        if note:
            print(note)
        if n <= 0:
            print("  no room to make progress (300-friend cap full of real friends?) -- stopping.")
            break

        session_q, got, ran_dry = _fill_from_shared_queue(shared_q, n)
        if ran_dry and got < n:
            shortfall = n - got
            print("  shared producer ran dry (%d/%d prefetched) -- topping up %d synchronously ..." % (got, n, shortfall))
            topup_q = queue.Queue()
            _run_producer(main.mid, shortfall, topup_q)
            while True:
                item = topup_q.get()
                if item is _SENTINEL:
                    break
                session_q.put(item)
                got += 1
        elif got >= n:
            print("  %d/%d guests already prefetched (created while the previous session was running)." % (got, n))
        session_q.put(_SENTINEL)

        if DRY_RUN:
            print("  DRY_RUN -> would run a session of %d guests here. Stopping (dry run doesn't loop)." % got)
            break

        collected, known_real_count = run_session_from_queue(main, session_q, got, room)
        total += collected
        print("\n=== SESSION %d done: collected %d/%d this session. TOTAL %d/%d ==="
              % (session_num, collected, got, total, target_hearts))

        if collected == 0:
            zero_progress_streak += 1
            if zero_progress_streak >= 2:
                print("  !! 2 sessions in a row collected 0 hearts -- aborting (check proxy/account state).")
                break
        else:
            zero_progress_streak = 0
    return total


# --------------------------------- main -------------------------------------
def main():
    global MAIN_EMAIL, MAIN_PASSWORD, TARGET_HEARTS, PROXY_URL, _PROXIES

    print("==========================================================")
    print("           Cookie Run - HEART FARM BOT (Interactive)      ")
    print("==========================================================")

    # 1. DevPlay Email & Password
    email_input = input("Enter DevPlay Email [%s]: " % (MAIN_EMAIL if MAIN_EMAIL != "your_email@example.com" else "")).strip()
    if email_input:
        MAIN_EMAIL = email_input
    elif MAIN_EMAIL in ("", "your_email@example.com"):
        MAIN_EMAIL = input("DevPlay Email (Required): ").strip()

    pass_input = input("Enter DevPlay Password: ").strip()
    if pass_input:
        MAIN_PASSWORD = pass_input
    elif MAIN_PASSWORD in ("", "your_password"):
        MAIN_PASSWORD = input("DevPlay Password (Required): ").strip()

    if not MAIN_EMAIL or not MAIN_PASSWORD:
        raise SystemExit("!! Error: DevPlay email and password are required.")

    # 2. Proxy URL
    default_proxy_disp = PROXY_URL if PROXY_URL else "None"
    proxy_input = input("Enter Proxy URL (e.g. http://user:pass@host:port) [Press Enter for %s]: " % default_proxy_disp).strip()
    if proxy_input:
        PROXY_URL = proxy_input
    # if empty, keeps PROXY_URL as is (defaults to empty string / None)

    _PROXIES = {"http": PROXY_URL, "https": PROXY_URL} if PROXY_URL else None

    # 3. Target Hearts
    target_input = input("Enter Target Hearts amount [Default: %d]: " % TARGET_HEARTS).strip()
    if target_input.isdigit():
        TARGET_HEARTS = int(target_input)

    print("\n[+] Starting heart farm session...")
    print("  - Account: %s" % MAIN_EMAIL)
    print("  - Proxy: %s" % (PROXY_URL if PROXY_URL else "None"))
    print("  - Target Hearts: %d" % TARGET_HEARTS)
    print("==========================================================\n")

    print("[1] Logging in to main account ...")
    main_acct = MainAccount(MAIN_EMAIL, MAIN_PASSWORD)

    try:
        total = run_until_target(main_acct, TARGET_HEARTS)
    finally:
        main_acct.close()
        _close_guest_channel()

    print("\nDONE. Collected %d/%d hearts total." % (total, TARGET_HEARTS))


if __name__ == "__main__":
    t0 = time.time()
    try:
        main()
    except SystemExit as e:
        print(e)
    except KeyboardInterrupt:
        print("\nหยุดโดยผู้ใช้ (Ctrl+C)")
    except Exception:
        traceback.print_exc()
    print("total time: %.1fs" % (time.time() - t0))
