"""Windows-only private research storage. No website, cloud or model clients."""
import contextlib
import ctypes as ct
from ctypes import wintypes as wt
import csv
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import subprocess
import time


class ResearchHold(RuntimeError):
    pass


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf8")


def digest(value):
    return hashlib.sha256(value).hexdigest()


class Blob(ct.Structure):
    _fields_ = [("size", wt.DWORD), ("data", ct.POINTER(ct.c_ubyte))]


class WindowsProtection:
    """Current-user DPAPI + protected single-SID DACL, not a sandbox."""
    def __init__(self):
        if os.name != "nt":
            raise ResearchHold("SECURE_STORAGE_UNSUPPORTED_OS")
        self.kernel = ct.WinDLL("kernel32", use_last_error=True)
        self.adv = ct.WinDLL("advapi32", use_last_error=True)
        self.cryptdll = ct.WinDLL("crypt32", use_last_error=True)
        self.kernel.LocalFree.argtypes = [ct.c_void_p]
        self.kernel.LocalFree.restype = ct.c_void_p
        self.adv.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [wt.LPCWSTR, wt.DWORD, ct.POINTER(ct.c_void_p), ct.POINTER(wt.DWORD)]
        self.adv.GetSecurityDescriptorDacl.argtypes = [ct.c_void_p, ct.POINTER(wt.BOOL), ct.POINTER(ct.c_void_p), ct.POINTER(wt.BOOL)]
        self.adv.SetNamedSecurityInfoW.argtypes = [wt.LPWSTR, wt.DWORD, wt.DWORD, ct.c_void_p, ct.c_void_p, ct.c_void_p, ct.c_void_p]
        self.adv.GetNamedSecurityInfoW.argtypes = [wt.LPWSTR, wt.DWORD, wt.DWORD, ct.POINTER(ct.c_void_p), ct.c_void_p, ct.POINTER(ct.c_void_p), ct.c_void_p, ct.POINTER(ct.c_void_p)]
        self.adv.GetSecurityDescriptorControl.argtypes = [ct.c_void_p, ct.POINTER(wt.WORD), ct.POINTER(wt.DWORD)]
        self.adv.GetAce.argtypes = [ct.c_void_p, wt.DWORD, ct.POINTER(ct.c_void_p)]
        self.adv.ConvertSidToStringSidW.argtypes = [ct.c_void_p, ct.POINTER(wt.LPWSTR)]
        self.cryptdll.CryptProtectData.argtypes = [ct.POINTER(Blob), wt.LPCWSTR, ct.POINTER(Blob), ct.c_void_p, ct.c_void_p, wt.DWORD, ct.POINTER(Blob)]
        self.cryptdll.CryptUnprotectData.argtypes = [ct.POINTER(Blob), ct.c_void_p, ct.POINTER(Blob), ct.c_void_p, ct.c_void_p, wt.DWORD, ct.POINTER(Blob)]
        folder = ct.create_unicode_buffer(32768)
        if ct.windll.shell32.SHGetFolderPathW(None, 0x1C, None, 0, folder) != 0:
            raise ResearchHold("LOCAL_APPDATA_UNAVAILABLE")
        self.base = Path(folder.value) / "INSPIRE-Research"
        system = ct.create_unicode_buffer(32768)
        self.kernel.GetSystemDirectoryW(system, len(system))
        result = subprocess.run([str(Path(system.value) / "whoami.exe"), "/user", "/fo", "csv", "/nh"],
                                capture_output=True, text=True, check=True,
                                creationflags=subprocess.CREATE_NO_WINDOW)
        self.sid = next(csv.reader(io.StringIO(result.stdout.strip())))[1]
        if not re.fullmatch(r"S-1-5-21-[0-9-]+", self.sid):
            raise ResearchHold("OWNER_SID_UNAVAILABLE")

    def _sid(self, pointer):
        value = wt.LPWSTR()
        if not self.adv.ConvertSidToStringSidW(pointer, ct.byref(value)):
            raise ResearchHold("ACL_SID_UNREADABLE")
        try:
            return value.value
        finally:
            self.kernel.LocalFree(ct.cast(value, ct.c_void_p))

    def restrict(self, path):
        descriptor = ct.c_void_p()
        sddl = f"D:P(A;OICI;FA;;;{self.sid})"
        if not self.adv.ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, 1, ct.byref(descriptor), None):
            raise ResearchHold("ACL_CREATION_FAILED")
        try:
            present, defaulted, dacl = wt.BOOL(), wt.BOOL(), ct.c_void_p()
            if not self.adv.GetSecurityDescriptorDacl(descriptor, ct.byref(present), ct.byref(dacl), ct.byref(defaulted)):
                raise ResearchHold("ACL_CREATION_FAILED")
            if self.adv.SetNamedSecurityInfoW(str(path), 1, 0x80000004, None, None, dacl, None):
                raise ResearchHold("ACL_RESTRICTION_FAILED")
        finally:
            self.kernel.LocalFree(descriptor)
        self.verify_acl(path, protected=True)

    def verify_acl(self, path, protected=False):
        owner, dacl, descriptor = ct.c_void_p(), ct.c_void_p(), ct.c_void_p()
        if self.adv.GetNamedSecurityInfoW(str(path), 1, 5, ct.byref(owner), None, ct.byref(dacl), None, ct.byref(descriptor)):
            raise ResearchHold("ACL_UNREADABLE")
        try:
            if self._sid(owner) != self.sid or not dacl.value:
                raise ResearchHold("STORAGE_OWNER_CHANGED")
            # ACL header: revision, reserved, size WORD, count WORD, reserved.
            count = ct.c_ushort.from_address(dacl.value + 4).value
            ace = ct.c_void_p()
            if count != 1 or not self.adv.GetAce(dacl, 0, ct.byref(ace)):
                raise ResearchHold("STORAGE_ACL_NOT_PRIVATE")
            kind = ct.c_ubyte.from_address(ace.value).value
            mask = ct.c_uint32.from_address(ace.value + 4).value
            if kind != 0 or mask != 0x1F01FF or self._sid(ace.value + 8) != self.sid:
                raise ResearchHold("STORAGE_ACL_NOT_PRIVATE")
            control, revision = wt.WORD(), wt.DWORD()
            if not self.adv.GetSecurityDescriptorControl(descriptor, ct.byref(control), ct.byref(revision)):
                raise ResearchHold("ACL_UNREADABLE")
            if protected and not control.value & 0x1000:
                raise ResearchHold("STORAGE_ACL_INHERITANCE_ENABLED")
        finally:
            self.kernel.LocalFree(descriptor)

    def safe_path(self, root):
        import winreg
        root = Path(os.path.abspath(root))
        base = Path(os.path.abspath(self.base))
        if root == base or not root.is_relative_to(base):
            raise ResearchHold("STORAGE_OUTSIDE_PRIVATE_LOCAL_BASE")
        if str(root).startswith("\\\\") or self.kernel.GetDriveTypeW(root.anchor) != 3:
            raise ResearchHold("STORAGE_NOT_FIXED_LOCAL_DISK")
        sync = [Path(v) for k, v in os.environ.items() if v and
                (k.lower().startswith("onedrive") or k.lower() in {"dropbox", "googledrive"})]
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\SyncRootManager")
        except FileNotFoundError:
            key = None
        except OSError as error:
            raise ResearchHold("SYNC_REGISTRY_UNREADABLE") from error
        try:
            if key:
                with key:
                    names = [winreg.EnumKey(key, i) for i in range(winreg.QueryInfoKey(key)[0])]
                    for name in names:
                        with winreg.OpenKey(key, name + r"\UserSyncRoots") as users:
                            for j in range(winreg.QueryInfoKey(users)[1]):
                                _, value, _ = winreg.EnumValue(users, j)
                                if isinstance(value, str):
                                    sync.append(Path(value))
        except OSError as error:
            raise ResearchHold("SYNC_REGISTRY_UNREADABLE") from error
        if any(root == p or root.is_relative_to(p) for p in sync):
            raise ResearchHold("STORAGE_IN_SYNC_ROOT")
        for path in [root, *root.parents]:
            if path.exists() and path.stat(follow_symlinks=False).st_file_attributes & 0x1400:
                raise ResearchHold("STORAGE_REPARSE_OR_OFFLINE_PATH")
        return root

    def crypt(self, data, decrypt=False):
        raw = ct.create_string_buffer(data)
        entropy = ct.create_string_buffer(b"INSPIRE-RESEARCH-QUARANTINE-v1")
        source = Blob(len(data), ct.cast(raw, ct.POINTER(ct.c_ubyte)))
        extra = Blob(len(entropy.raw), ct.cast(entropy, ct.POINTER(ct.c_ubyte)))
        result = Blob()
        ok = (self.cryptdll.CryptUnprotectData(ct.byref(source), None, ct.byref(extra), None, None, 1, ct.byref(result))
              if decrypt else self.cryptdll.CryptProtectData(ct.byref(source), "INSPIRE research", ct.byref(extra), None, None, 1, ct.byref(result)))
        if not ok:
            raise ResearchHold("DPAPI_INTEGRITY_OR_USER_HOLD")
        try:
            return ct.string_at(result.data, result.size)
        finally:
            self.kernel.LocalFree(result.data)


class ResearchStore:
    """Sealed durable ledger; DPAPI encrypts every content-bearing record."""
    def __init__(self, root, *, create=False, now=time.time):
        self.protection = WindowsProtection()
        self.root = self.protection.safe_path(root)
        self.now = now
        self.db_path = self.root / "research.sqlite"
        self.anchor_path = self.root / "anchor.dpapi"
        if create:
            if self.root.exists():
                raise ResearchHold("REFUSE_LEDGER_RESET")
            if not self.protection.base.exists():
                self.protection.base.mkdir()
                self.protection.restrict(self.protection.base)
            self.protection.verify_acl(self.protection.base, protected=True)
            self.root.mkdir()
            self.protection.restrict(self.root)
            self.anchor = {"key": secrets.token_hex(32), "id": secrets.token_hex(24), "seq": 0}
            db = self._connect()
            try:
                db.executescript("""
                CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE records (kind TEXT NOT NULL, id TEXT NOT NULL, content BLOB,
                  PRIMARY KEY(kind,id));
                """)
                db.executemany("INSERT INTO meta VALUES (?,?)", [("id", self.anchor["id"]), ("seq", "0"), ("clock", str(int(now())))])
                seal = self._seal(db)
                db.execute("INSERT INTO meta VALUES ('seal',?)", (seal,))
            finally:
                db.close()
            self.anchor["seal"] = seal
            self._anchor_write()
        self._files()
        try:
            self.anchor = json.loads(self.protection.crypt(self.anchor_path.read_bytes(), decrypt=True))
        except (OSError, ValueError) as error:
            raise ResearchHold("LEDGER_ANCHOR_MISSING_OR_INVALID") from error
        with self.transaction() as db:
            self._verify(db)

    @classmethod
    def default_root(cls, name="quarantine-v1"):
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", name):
            raise ResearchHold("INVALID_STORAGE_NAME")
        return WindowsProtection().base / name

    def _files(self):
        self.protection.safe_path(self.root)
        self.protection.verify_acl(self.root, protected=True)
        for p in self.root.iterdir():
            if p.is_dir() or p.stat(follow_symlinks=False).st_file_attributes & 0x1400:
                raise ResearchHold("UNEXPECTED_STORAGE_ENTRY")
            self.protection.verify_acl(p)
        if not self.db_path.is_file() or not self.anchor_path.is_file():
            raise ResearchHold("LEDGER_MISSING_NO_RESET")

    def _connect(self):
        db = sqlite3.connect(str(self.db_path), timeout=10, isolation_level=None)
        db.execute("PRAGMA synchronous=FULL")
        db.execute("PRAGMA journal_mode=DELETE")
        db.execute("PRAGMA secure_delete=ON")
        db.execute("PRAGMA temp_store=MEMORY")
        return db

    def _seal(self, db):
        value = {"meta": db.execute("SELECT key,value FROM meta WHERE key!='seal' ORDER BY key").fetchall(),
                 "records": [(k, i, digest(b) if b is not None else None) for k, i, b in db.execute("SELECT kind,id,content FROM records ORDER BY kind,id")]}
        return hmac.new(bytes.fromhex(self.anchor["key"]), canonical(value), hashlib.sha256).hexdigest()

    def _verify(self, db):
        meta = dict(db.execute("SELECT key,value FROM meta"))
        if (meta.get("id") != self.anchor["id"] or int(meta.get("seq", -1)) != self.anchor["seq"] or
                meta.get("seal") != self.anchor["seal"] or not hmac.compare_digest(self._seal(db), meta["seal"])):
            raise ResearchHold("LEDGER_ROLLBACK_TAMPER_OR_INTERRUPTED_COMMIT")
        if self.now() < float(meta["clock"]) - 2:
            raise ResearchHold("CLOCK_ROLLBACK_HOLD")

    def _anchor_write(self):
        temp = self.root / "anchor.pending"
        with temp.open("wb") as file:
            file.write(self.protection.crypt(canonical(self.anchor)))
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp, self.anchor_path)

    @contextlib.contextmanager
    def transaction(self, write=False):
        import msvcrt
        self._files()
        lock = (self.root / "writer.lock").open("a+b")
        if lock.tell() == 0:
            lock.write(b"0")
            lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
        except OSError as error:
            lock.close()
            raise ResearchHold("STORAGE_LOCK_HOLD") from error
        # Serialize writers across processes before reading the independent anchor.
        db = self._connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            self.anchor = json.loads(self.protection.crypt(self.anchor_path.read_bytes(), decrypt=True))
            self._verify(db)
            yield db
            if write:
                seq = self.anchor["seq"] + 1
                db.execute("UPDATE meta SET value=? WHERE key='seq'", (str(seq),))
                db.execute("UPDATE meta SET value=? WHERE key='clock'", (str(int(self.now())),))
                seal = self._seal(db)
                db.execute("UPDATE meta SET value=? WHERE key='seal'", (seal,))
                db.commit()
                self.anchor.update(seq=seq, seal=seal)
                self._anchor_write()
            else:
                db.commit()
        except (sqlite3.Error, OSError, ValueError) as error:
            db.rollback()
            raise ResearchHold("DURABLE_STORAGE_HOLD") from error
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            lock.close()

    def get(self, db, kind, key, default=None):
        row = db.execute("SELECT content FROM records WHERE kind=? AND id=?", (kind, key)).fetchone()
        if not row or row[0] is None:
            return default
        return json.loads(self.protection.crypt(row[0], decrypt=True))

    def put(self, db, kind, key, value):
        db.execute("INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET content=excluded.content",
                   (kind, key, self.protection.crypt(canonical(value))))

    def purge_record(self, db, kind, key):
        db.execute("UPDATE records SET content=NULL WHERE kind=? AND id=?", (kind, key))
